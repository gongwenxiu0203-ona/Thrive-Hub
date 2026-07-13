import { prisma } from "@/lib/prisma";

type AuditInput = {
  actorId?: string | null;
  action: string;
  module: string;
  targetType: string;
  targetId?: string | null;
  targetLabel?: string | null;
  summary: string;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
  status?: string;
};

function json(value: unknown) {
  return value === undefined ? null : JSON.stringify(value);
}

export async function writeAdminAudit(input: AuditInput) {
  try {
    await prisma.adminAuditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: input.action,
        module: input.module,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        targetLabel: input.targetLabel ?? null,
        summary: input.summary,
        beforeJson: json(input.before),
        afterJson: json(input.after),
        metadataJson: json(input.metadata),
        status: input.status ?? "SUCCESS",
      },
    });
  } catch (error) {
    console.error("Unable to write admin audit log", error);
  }
}

export async function writeApiAccessLog(input: {
  actorId?: string | null;
  method: string;
  route: string;
  operation: string;
  statusCode: number;
  startedAt: number;
  errorSummary?: string | null;
}) {
  try {
    await prisma.apiAccessLog.create({
      data: {
        actorId: input.actorId ?? null,
        method: input.method,
        route: input.route,
        operation: input.operation,
        statusCode: input.statusCode,
        durationMs: Date.now() - input.startedAt,
        outcome: input.statusCode >= 400 ? "ERROR" : "SUCCESS",
        errorSummary: input.errorSummary ?? null,
      },
    });
  } catch (error) {
    console.error("Unable to write API access log", error);
  }
}
