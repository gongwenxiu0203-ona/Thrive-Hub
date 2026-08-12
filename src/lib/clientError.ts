export type ApiErrorBody = { error?: unknown; code?: unknown };

function clientCode(): string {
  const stamp = Date.now().toString(36).toUpperCase();
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `CLIENT-${stamp}-${suffix}`;
}

export function clientUnknownError(code = clientCode()): string {
  return `操作失败，错误代码：${code}，请联系管理员`;
}

export async function readApiError(
  response: Response,
  fallback?: string,
): Promise<string> {
  const body = await response.json().catch(() => null) as ApiErrorBody | null;
  if (typeof body?.error === "string" && body.error.trim()) return body.error.trim();
  if (typeof body?.code === "string" && body.code.trim()) {
    return clientUnknownError(body.code.trim());
  }
  return fallback?.trim() || clientUnknownError();
}

export function errorMessage(error: unknown, fallback?: string): string {
  if (error instanceof Error) {
    const message = error.message.trim();
    if (/错误代码：(?:ERR|CLIENT|PAGE|GLOBAL)-/i.test(message)) return message;
  }
  return fallback?.trim() || clientUnknownError();
}
