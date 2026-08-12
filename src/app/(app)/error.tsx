"use client";

import { useEffect, useMemo } from "react";
import { clientUnknownError } from "@/lib/clientError";

export default function AppErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const code = useMemo(
    () => error.digest || `PAGE-${Date.now().toString(36).toUpperCase()}`,
    [error.digest],
  );
  useEffect(() => {
    console.error(`[page-error] ${code}`, error);
  }, [code, error]);
  return (
    <div className="mx-auto max-w-xl rounded-xl border border-rose-200 bg-white p-8 text-center shadow-sm">
      <h1 className="text-lg font-semibold text-slate-900">页面加载失败</h1>
      <p className="mt-3 text-sm text-rose-700">{clientUnknownError(code)}</p>
      <button type="button" className="btn-primary mt-6" onClick={reset}>重新加载</button>
    </div>
  );
}
