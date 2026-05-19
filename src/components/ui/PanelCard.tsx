"use client";

import { useEffect, useState } from "react";
import { Download, Maximize2, X } from "lucide-react";
import { buildSheet } from "@/lib/excel";

type Row = Record<string, string | number>;

export function PanelCard({
  title,
  subtitle,
  exportRows,
  exportName,
  children,
  height = "h-[320px]",
  className = "",
}: {
  title: string;
  subtitle?: string;
  exportRows?: Row[];
  exportName?: string;
  children: React.ReactNode;
  height?: string;
  className?: string;
}) {
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    if (!zoomed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoomed(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [zoomed]);

  function handleExport() {
    if (!exportRows) return;
    const buffer = buildSheet(exportRows, title.slice(0, 30));
    const blob = new Blob([new Uint8Array(buffer)], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportName ?? title}-${Date.now()}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <section className={`card flex flex-col p-4 ${className}`}>
        <header className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-slate-800">
              {title}
            </h3>
            {subtitle && (
              <p className="text-xs text-slate-400">{subtitle}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {exportRows && exportRows.length > 0 && (
              <button
                type="button"
                onClick={handleExport}
                title="导出数据"
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <Download className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setZoomed(true)}
              title="放大"
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>
        </header>
        <div className={height + " w-full"}>{children}</div>
      </section>

      {zoomed && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 p-6"
          onMouseDown={() => setZoomed(false)}
        >
          <div
            className="card flex h-full w-full flex-col p-5"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <header className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  {title}
                </h3>
                {subtitle && (
                  <p className="text-xs text-slate-400">{subtitle}</p>
                )}
              </div>
              <div className="flex gap-1">
                {exportRows && exportRows.length > 0 && (
                  <button
                    type="button"
                    onClick={handleExport}
                    className="btn-secondary btn-sm"
                  >
                    <Download className="h-3.5 w-3.5" /> 导出
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setZoomed(false)}
                  className="rounded p-1 text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </header>
            <div className="flex-1 overflow-auto">{children}</div>
          </div>
        </div>
      )}
    </>
  );
}
