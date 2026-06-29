"use server";

import { revalidatePath } from "next/cache";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { REVIEWER_EMAIL } from "@/lib/contractReviewer";
import {
  SNAPSHOT_FIELD_KEY,
  collectContractFieldSnapshot,
  getReviewDecisionFields,
} from "@/lib/contractFieldSnapshot";
import { appendDocxComment } from "@/lib/docxComment";

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };

/** Resolve the (single) reviewer userId from REVIEWER_EMAIL. Falls back to
 *  contract.reviewerId, then null. */
async function resolveReviewerId(contractId: string): Promise<string | null> {
  const u = await prisma.user.findUnique({
    where: { email: REVIEWER_EMAIL },
    select: { id: true },
  });
  if (u) return u.id;
  const c = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { reviewerId: true },
  });
  return c?.reviewerId ?? null;
}

/** Internal: open a new ContractReview round for a contract. Increments round
 *  number from the last review on that contract. Called by submit / resubmit.
 *
 *  Concurrency: round 的"读 last + 写 (last+1)"不是原子的。两次并发提交可能
 *  撞 @@unique([contractId, round])。这里捕获唯一冲突并重试最多 3 次，每次
 *  重新读 last。如果仍然失败说明真的有持续冲突，返回错误让上层重试或提醒。 */
export async function openReviewRound(contractId: string): Promise<Result<{ reviewId: string; round: number }>> {
  const reviewerId = await resolveReviewerId(contractId);
  if (!reviewerId) return { ok: false, error: `未找到审核人账号（${REVIEWER_EMAIL}）` };

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const last = await prisma.contractReview.findFirst({
      where: { contractId },
      orderBy: { round: "desc" },
      select: { round: true },
    });
    const round = (last?.round ?? 0) + 1;
    try {
      const review = await prisma.contractReview.create({
        data: { contractId, round, reviewerId, status: "PENDING" },
        select: { id: true },
      });
      return await finishOpenRound(review.id, round, contractId);
    } catch (e) {
      // P2002 = Prisma unique constraint failure
      const code = (e as { code?: string }).code;
      if (code === "P2002") {
        lastError = e;
        continue;
      }
      throw e;
    }
  }
  console.warn("[openReviewRound] gave up after 3 retries:", lastError);
  return { ok: false, error: "提交审核失败（轮次号冲突，请稍后重试）" };
}

/** 收尾：写快照 + 返回。抽出来给 openReviewRound 重试逻辑用。 */
async function finishOpenRound(
  reviewId: string,
  round: number,
  contractId: string,
): Promise<Result<{ reviewId: string; round: number }>> {

  // 快照当前合同字段，存为该轮的特殊 comment（fieldKey=__SNAPSHOT__）。
  // 用于第二轮开始后的「本轮变动」对比，UI 渲染时会过滤掉这条。
  try {
    const snapshot = await collectContractFieldSnapshot(contractId);
    await prisma.contractReviewComment.create({
      data: {
        reviewId,
        fieldKey: SNAPSHOT_FIELD_KEY,
        comment: JSON.stringify(snapshot),
      },
    });
  } catch (e) {
    // 快照失败不阻塞审核流程
    console.warn("[openReviewRound] snapshot failed:", e);
  }

  return { ok: true, data: { reviewId, round } };
}

/** Approve the current PENDING review and move contract to SIGNING. */
export async function approveCurrentReview(contractId: string): Promise<Result> {
  const session = await requireSession();
  const current = await prisma.contractReview.findFirst({
    where: { contractId, status: "PENDING" },
    orderBy: { round: "desc" },
    select: {
      id: true,
      reviewerId: true,
      contract: { select: { commissionType: true } },
      comments: {
        where: { fieldKey: { not: SNAPSHOT_FIELD_KEY } },
        select: { fieldKey: true, decision: true },
      },
    },
  });
  if (!current) return { ok: false, error: "没有待审核的轮次" };
  if (current.reviewerId !== session.userId && session.role !== "ADMIN") {
    return { ok: false, error: "无权审核：仅指定审核人或管理员可操作" };
  }

  const decisions = new Map(current.comments.map((c) => [c.fieldKey, c.decision]));
  const reviewFields = getReviewDecisionFields(current.contract.commissionType);
  const rejectedField = reviewFields.find((f) => decisions.get(f.key) === "REJECTED");
  if (rejectedField) {
    return { ok: false, error: `字段「${rejectedField.label}」已驳回，不能整单通过` };
  }
  const missingApprovedFields = reviewFields.filter((f) => decisions.get(f.key) !== "APPROVED");

  await prisma.$transaction([
    ...missingApprovedFields.map((field) =>
      prisma.contractReviewComment.upsert({
        where: { reviewId_fieldKey: { reviewId: current.id, fieldKey: field.key } },
        create: { reviewId: current.id, fieldKey: field.key, comment: "", decision: "APPROVED" },
        update: { decision: "APPROVED" },
      }),
    ),
    prisma.contractReview.update({
      where: { id: current.id },
      data: { status: "APPROVED" },
    }),
    prisma.contract.update({
      where: { id: contractId },
      data: { status: "SIGNING" },
    }),
  ]);

  revalidatePath(`/contracts/${contractId}`);
  revalidatePath("/contracts/reviews");
  revalidatePath("/contracts");
  return { ok: true };
}

/** Reject the current PENDING review and move contract to REJECTED. */
export async function rejectCurrentReview(contractId: string): Promise<Result> {
  const session = await requireSession();
  const current = await prisma.contractReview.findFirst({
    where: { contractId, status: "PENDING" },
    orderBy: { round: "desc" },
    select: {
      id: true,
      reviewerId: true,
      contract: { select: { commissionType: true } },
      comments: {
        where: { fieldKey: { not: SNAPSHOT_FIELD_KEY } },
        select: { fieldKey: true, comment: true, decision: true },
      },
    },
  });
  if (!current) return { ok: false, error: "没有待审核的轮次" };
  if (current.reviewerId !== session.userId && session.role !== "ADMIN") {
    return { ok: false, error: "无权审核：仅指定审核人或管理员可操作" };
  }

  const rejectedComments = current.comments.filter((comment) => comment.decision === "REJECTED");
  if (rejectedComments.length === 0) {
    return { ok: false, error: "请先选择至少一个驳回字段，并填写审核意见后再退回" };
  }
  const missingComment = rejectedComments.find((comment) => !comment.comment.trim());
  if (missingComment) {
    const labelMap = new Map(
      getReviewDecisionFields(current.contract.commissionType).map((field) => [field.key, field.label]),
    );
    return {
      ok: false,
      error: `字段「${labelMap.get(missingComment.fieldKey) ?? missingComment.fieldKey}」已选择驳回，请填写审核意见`,
    };
  }

  await prisma.$transaction([
    prisma.contractReview.update({
      where: { id: current.id },
      data: { status: "REJECTED" },
    }),
    prisma.contract.update({
      where: { id: contractId },
      data: { status: "REJECTED" },
    }),
  ]);

  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { contractNo: true, ownerId: true, createdById: true, hasSourceAnnotations: true },
  });
  const targetId = contract?.ownerId ?? contract?.createdById ?? null;
  if (targetId) {
    await prisma.reminder.create({
      data: {
        title: `合同审核退回：${contract?.contractNo ?? contractId}`,
        content: contract?.hasSourceAnnotations
          ? "合同审核已退回，原文中有批注待查看，请根据字段意见和原文批注修改后重新提交。"
          : "合同审核已退回，请根据字段意见修改后重新提交。",
        remindDate: new Date(),
        type: "REVIEW",
        targetId,
        createdById: session.userId,
      },
    });
  }

  revalidatePath(`/contracts/${contractId}`);
  revalidatePath("/contracts/reviews");
  revalidatePath("/contracts");
  return { ok: true };
}

/** Add or update a per-field comment under a review round. Upsert keyed by
 *  (reviewId, fieldKey). */
export async function upsertFieldComment(
  reviewId: string,
  fieldKey: string,
  comment: string,
  annotationId: string | null = null,
  decision: "PENDING" | "APPROVED" | "REJECTED" = "PENDING",
): Promise<Result<{ id: string }>> {
  const session = await requireSession();
  const review = await prisma.contractReview.findUnique({
    where: { id: reviewId },
    select: { reviewerId: true, status: true },
  });
  if (!review) return { ok: false, error: "审核轮次不存在" };
  if (review.status !== "PENDING") return { ok: false, error: "该审核轮次已结束，无法修改意见" };
  if (review.reviewerId !== session.userId && session.role !== "ADMIN") {
    return { ok: false, error: "无权填写审核意见" };
  }

  // 借助 @@unique([reviewId, fieldKey]) 做原子 upsert，避免并发下双写。
  const saved = await prisma.contractReviewComment.upsert({
    where: { reviewId_fieldKey: { reviewId, fieldKey } },
    create: { reviewId, fieldKey, comment, annotationId, decision },
    update: { comment, annotationId, decision },
    select: { id: true },
  });

  return { ok: true, data: { id: saved.id } };
}

/** Remove a per-field comment under a review round. */
export async function deleteFieldComment(commentId: string): Promise<Result> {
  const session = await requireSession();
  const row = await prisma.contractReviewComment.findUnique({
    where: { id: commentId },
    select: { review: { select: { reviewerId: true, status: true } } },
  });
  if (!row) return { ok: false, error: "意见不存在" };
  if (row.review.status !== "PENDING") return { ok: false, error: "该审核轮次已结束，无法删除意见" };
  if (row.review.reviewerId !== session.userId && session.role !== "ADMIN") {
    return { ok: false, error: "无权删除审核意见" };
  }
  await prisma.contractReviewComment.delete({ where: { id: commentId } });
  return { ok: true };
}

/** Add an annotation against the latest version of a contract. When the
 *  latest version is a .docx, the comment is also written into a copy of the
 *  file as a Word `<w:comment>` so the reviewer can hand it to the submitter
 *  and they can see it natively in Word/WPS. PDFs fall through to system-only
 *  text annotation (no file rewrite). */
export async function addAnnotation(
  contractId: string,
  content: string,
): Promise<Result<{ id: string }>> {
  const session = await requireSession();
  if (!content.trim()) return { ok: false, error: "批注内容不能为空" };

  const latestVersion = await prisma.contractVersion.findFirst({
    where: { contractId },
    orderBy: { versionNo: "desc" },
    select: { id: true, fileUrl: true, fileType: true },
  });
  if (!latestVersion) return { ok: false, error: "合同尚无版本，无法批注" };

  const current = await prisma.contractReview.findFirst({
    where: { contractId, status: "PENDING" },
    select: { reviewerId: true },
  });
  if (!current) return { ok: false, error: "没有待审核的轮次" };
  if (current.reviewerId !== session.userId && session.role !== "ADMIN") {
    return { ok: false, error: "无权添加批注" };
  }

  // 仅当最新版本是 DOCX 时，把批注真实写入文件。文件存到 private/ 目录，
  // 必须通过 /api/contracts/annotation-download/[id] 鉴权下载。
  let annotatedFileUrl: string | null = null;
  if (latestVersion.fileType === "docx") {
    try {
      const srcAbs = path.join(process.cwd(), "public", latestVersion.fileUrl.replace(/^\//, ""));
      const buf = await fs.readFile(srcAbs);
      const author = session.email || session.name || "审核人";
      const initials = (author.slice(0, 1) || "审").toUpperCase();
      const { buffer } = await appendDocxComment(buf, {
        author,
        initials,
        text: content.trim(),
      });
      const outName = `${contractId}-annotated-${Date.now()}.docx`;
      const OUT_DIR = path.join(process.cwd(), "private", "contract-annotations");
      await fs.mkdir(OUT_DIR, { recursive: true });
      await fs.writeFile(path.join(OUT_DIR, outName), buffer);
      // 存相对路径；UI 通过 /api/contracts/annotation-download/[id] 鉴权下载
      annotatedFileUrl = `/contract-annotations/${outName}`;
    } catch (e) {
      // 写文件失败不阻塞 — UI 内仍会显示文本批注
      console.warn("[addAnnotation] DOCX comment write failed:", e);
    }
  }

  const ann = await prisma.contractAnnotation.create({
    data: {
      contractId,
      versionId: latestVersion.id,
      content: content.trim(),
      fileUrl: annotatedFileUrl,
    },
    select: { id: true },
  });
  await prisma.contract.update({
    where: { id: contractId },
    data: { hasSourceAnnotations: true },
  });
  revalidatePath(`/contracts/${contractId}`);
  return { ok: true, data: { id: ann.id } };
}
