"use server";

import { revalidatePath } from "next/cache";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { REVIEWER_EMAIL } from "@/lib/contractReviewer";
import { SNAPSHOT_FIELD_KEY, collectContractFieldSnapshot } from "@/lib/contractFieldSnapshot";
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
 *  number from the last review on that contract. Called by submit / resubmit. */
export async function openReviewRound(contractId: string): Promise<Result<{ reviewId: string; round: number }>> {
  const reviewerId = await resolveReviewerId(contractId);
  if (!reviewerId) return { ok: false, error: `未找到审核人账号（${REVIEWER_EMAIL}）` };

  const last = await prisma.contractReview.findFirst({
    where: { contractId },
    orderBy: { round: "desc" },
    select: { round: true },
  });
  const round = (last?.round ?? 0) + 1;

  const review = await prisma.contractReview.create({
    data: { contractId, round, reviewerId, status: "PENDING" },
    select: { id: true },
  });

  // 快照当前合同字段，存为该轮的特殊 comment（fieldKey=__SNAPSHOT__）。
  // 用于第二轮开始后的「本轮变动」对比，UI 渲染时会过滤掉这条。
  try {
    const snapshot = await collectContractFieldSnapshot(contractId);
    await prisma.contractReviewComment.create({
      data: {
        reviewId: review.id,
        fieldKey: SNAPSHOT_FIELD_KEY,
        comment: JSON.stringify(snapshot),
      },
    });
  } catch (e) {
    // 快照失败不阻塞审核流程
    console.warn("[openReviewRound] snapshot failed:", e);
  }

  return { ok: true, data: { reviewId: review.id, round } };
}

/** Approve the current PENDING review and move contract to SIGNING. */
export async function approveCurrentReview(contractId: string): Promise<Result> {
  const session = await requireSession();
  const current = await prisma.contractReview.findFirst({
    where: { contractId, status: "PENDING" },
    orderBy: { round: "desc" },
    select: { id: true, reviewerId: true },
  });
  if (!current) return { ok: false, error: "没有待审核的轮次" };
  if (current.reviewerId !== session.userId && session.role !== "ADMIN") {
    return { ok: false, error: "无权审核：仅指定审核人或管理员可操作" };
  }

  await prisma.$transaction([
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
    select: { id: true, reviewerId: true },
  });
  if (!current) return { ok: false, error: "没有待审核的轮次" };
  if (current.reviewerId !== session.userId && session.role !== "ADMIN") {
    return { ok: false, error: "无权审核：仅指定审核人或管理员可操作" };
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

  const existing = await prisma.contractReviewComment.findFirst({
    where: { reviewId, fieldKey },
    select: { id: true },
  });

  const saved = existing
    ? await prisma.contractReviewComment.update({
        where: { id: existing.id },
        data: { comment, annotationId },
        select: { id: true },
      })
    : await prisma.contractReviewComment.create({
        data: { reviewId, fieldKey, comment, annotationId },
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

  // 仅当最新版本是 DOCX 时，把批注真实写入文件
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
      const OUT_DIR = path.join(process.cwd(), "public", "contracts-generated");
      await fs.mkdir(OUT_DIR, { recursive: true });
      await fs.writeFile(path.join(OUT_DIR, outName), buffer);
      annotatedFileUrl = `/contracts-generated/${outName}`;
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
  revalidatePath(`/contracts/${contractId}`);
  return { ok: true, data: { id: ann.id } };
}
