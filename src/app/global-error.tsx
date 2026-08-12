"use client";

import { useEffect, useMemo } from "react";
import { clientUnknownError } from "@/lib/clientError";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const code = useMemo(() => error.digest || `GLOBAL-${Date.now().toString(36).toUpperCase()}`, [error.digest]);
  useEffect(() => { console.error(`[global-error] ${code}`, error); }, [code, error]);
  return (
    <html lang="zh-CN"><body>
      <main style={{ maxWidth: 640, margin: "15vh auto", padding: 32, fontFamily: "sans-serif", textAlign: "center" }}>
        <h1>系统暂时无法加载</h1>
        <p>{clientUnknownError(code)}</p>
        <button type="button" onClick={reset}>重新加载</button>
      </main>
    </body></html>
  );
}
