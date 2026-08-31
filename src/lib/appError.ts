import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { recordSystemError } from "./systemErrorLog";
import { sanitizeTechnicalDetails } from "./systemErrorCatalog";

export type ErrorPayload = {
  error: string;
  code?: string;
  traceCode?: string;
};

export class AppError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code?: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function createErrorCode(prefix = "ERR"): string {
  const stamp = Date.now().toString(36).toUpperCase();
  const suffix = randomBytes(3).toString("hex").toUpperCase();
  return `${prefix}-${stamp}-${suffix}`;
}

export function unknownErrorMessage(code: string): string {
  return `操作失败，错误代码：${code}，请联系管理员`;
}

export function normalizeError(
  error: unknown,
  context: string,
  fallbackStatus = 500,
): { payload: ErrorPayload; status: number; cause?: unknown } {
  if (error instanceof AppError) {
    const traceCode = createErrorCode();
    recordSystemError(error, context, traceCode, error.status);
    return {
      payload: { error: error.message, ...(error.code ? { code: error.code } : {}), traceCode },
      status: error.status,
    };
  }
  const code = createErrorCode();
  recordSystemError(error, context, code, fallbackStatus);
  console.error(`[system-error] ${code}`, sanitizeTechnicalDetails(error));
  return {
    payload: { error: unknownErrorMessage(code), code },
    status: fallbackStatus,
    cause: error,
  };
}

export function errorResponse(
  error: unknown,
  context: string,
  fallbackStatus = 500,
): NextResponse<ErrorPayload> {
  const normalized = normalizeError(error, context, fallbackStatus);
  const traceCode = normalized.payload.traceCode ?? normalized.payload.code;
  return NextResponse.json(normalized.payload, {
    status: normalized.status,
    headers: traceCode
      ? { "X-Error-Code": traceCode }
      : undefined,
  });
}

export function actionError(
  error: unknown,
  context: string,
): { ok: false; error: string; code: string; traceCode?: string } {
  const { payload } = normalizeError(error, context);
  return { ok: false, error: payload.error, code: payload.code ?? "BUSINESS_ERROR", ...(payload.traceCode ? { traceCode: payload.traceCode } : {}) };
}
