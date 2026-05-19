"use client";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronLeft } from "lucide-react";

export function BackButton({ label, chevron }: { label: string; chevron?: boolean }) {
  const router = useRouter();
  const Icon = chevron ? ChevronLeft : ArrowLeft;
  return (
    <button
      onClick={() => router.back()}
      className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600"
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
