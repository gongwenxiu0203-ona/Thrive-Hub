"use client";

import { useState } from "react";

export const PROJECT_PROMO_PLATFORM_OPTIONS = [
  "亚马逊（Amazon）",
  "独立站（DTC）",
  "沃尔玛（Walmart）",
] as const;

export const PROJECT_TARGET_SITE_OPTIONS = [
  "美国站",
  "加拿大",
  "欧洲站",
  "德国站",
  "英国站",
  "法国站",
  "西班牙",
  "意大利",
  "荷兰",
  "澳洲",
  "日本",
] as const;

export function composeIntegratedProjectName(
  customerName: string,
  promoPlatforms: string[],
  targetSites: string[],
) {
  return [
    customerName.trim(),
    promoPlatforms.join("、"),
    targetSites.join("、"),
  ].filter(Boolean).join(" · ");
}

export function ProjectMultiSelect({
  label,
  value,
  options,
  placeholder,
  customPlaceholder = "请输入其他选项",
  onChange,
}: {
  label: string;
  value: string[];
  options: readonly string[];
  placeholder: string;
  customPlaceholder?: string;
  onChange: (value: string[]) => void;
}) {
  const [customValue, setCustomValue] = useState("");
  const customSelected = value.filter((item) => !options.includes(item));

  function toggle(option: string) {
    onChange(
      value.includes(option)
        ? value.filter((item) => item !== option)
        : [...value, option],
    );
  }

  function addCustomValue() {
    const next = customValue.trim();
    if (!next || value.includes(next)) return;
    onChange([...value, next]);
    setCustomValue("");
  }

  return (
    <div>
      <label className="label">{label}</label>
      <details className="group relative">
        <summary className="input flex cursor-pointer list-none items-center justify-between gap-2">
          <span className={value.length ? "truncate text-slate-700" : "text-slate-400"}>
            {value.length ? value.join("、") : placeholder}
          </span>
          <span className="shrink-0 text-xs text-slate-400 transition-transform group-open:rotate-180">▼</span>
        </summary>
        <div className="absolute z-40 mt-1 w-full min-w-64 space-y-2 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
          <div className="max-h-56 space-y-1 overflow-y-auto">
            {options.map((option) => (
              <label key={option} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={value.includes(option)}
                  onChange={() => toggle(option)}
                />
                <span>{option}</span>
              </label>
            ))}
            {customSelected.map((option) => (
              <label key={option} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50">
                <input type="checkbox" checked onChange={() => toggle(option)} />
                <span>{option}（手动新增）</span>
              </label>
            ))}
          </div>
          <div className="border-t border-slate-100 pt-2">
            <div className="mb-1 text-xs font-medium text-slate-500">其他（手动新增）</div>
            <div className="flex gap-2">
              <input
                className="input min-w-0 flex-1"
                value={customValue}
                onChange={(event) => setCustomValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addCustomValue();
                  }
                }}
                placeholder={customPlaceholder}
              />
              <button
                type="button"
                className="btn-secondary shrink-0 text-sm"
                onClick={addCustomValue}
                disabled={!customValue.trim()}
              >
                添加
              </button>
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
