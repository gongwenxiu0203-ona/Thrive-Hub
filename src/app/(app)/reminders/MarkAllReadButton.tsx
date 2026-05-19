"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";
import { markAllRead } from "@/actions/reminders";

export function MarkAllReadButton({ count }: { count: number }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      className="btn-secondary"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await markAllRead();
          router.refresh();
        })
      }
    >
      <CheckCheck className="h-4 w-4" />
      全部已读（{count}）
    </button>
  );
}
