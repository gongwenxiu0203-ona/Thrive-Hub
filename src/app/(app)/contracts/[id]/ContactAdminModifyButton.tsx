"use client";

import { ShieldAlert } from "lucide-react";

export function ContactAdminModifyButton() {
  return (
    <button
      type="button"
      className="btn-secondary flex items-center gap-1.5 text-sm"
      onClick={() => window.alert("已签署完成的合同仅管理员可以修改，请联系管理员处理。")}
    >
      <ShieldAlert className="h-4 w-4" /> 联系管理员修改
    </button>
  );
}
