import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

export type ErrorPayload = {
  error: string;
  code?: string;
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
    return {
      payload: { error: error.message, ...(error.code ? { code: error.code } : {}) },
      status: error.status,
    };
  }
  const code = createErrorCode();
  console.error(`[${context}] ${code}`, error);
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
  return NextResponse.json(normalized.payload, {
    status: normalized.status,
    headers: normalized.payload.code
      ? { "X-Error-Code": normalized.payload.code }
      : undefined,
  });
}

export function actionError(
  error: unknown,
  context: string,
): { ok: false; error: string; code: string } {
  if (error instanceof AppError) {
    return { ok: false, error: error.message, code: error.code ?? "BUSINESS_ERROR" };
  }
  const code = createErrorCode();
  console.error(`[${context}] ${code}`, error);
  return { ok: false, error: unknownErrorMessage(code), code };
}
