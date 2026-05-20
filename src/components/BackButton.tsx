"use client";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronLeft } from "lucide-react";

// `fallbackHref` is used when there is no real previous page in history
// (e.g. the user opened the detail page directly via a shared URL).
// In normal flows we just call `router.back()` so the user returns to the
// exact same page (with filter/tab state preserved by browser history).
export function BackButton({
  label,
  chevron,
  fallbackHref,
}: {
  label: string;
  chevron?: boolean;
  fallbackHref?: string;
}) {
  const router = useRouter();
  const Icon = chevron ? ChevronLeft : ArrowLeft;
  function handleBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else if (fallbackHref) {
      router.push(fallbackHref);
    } else {
      router.back();
    }
  }
  return (
    <button
      onClick={handleBack}
      className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600"
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
