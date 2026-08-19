"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { clientUnknownError, readApiError } from "@/lib/clientError";

export function EmailSendButton({
  endpoint,
  label,
  payload,
  className = "",
}: {
  endpoint: string;
  label: string;
  payload?: Record<string, unknown>;
  className?: string;
}) {
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  async function send() {
    setSending(true);
    setMessage("");
    setFailed(false);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload ?? {}),
      });
      if (!response.ok) {
        setFailed(true);
        setMessage(await readApiError(response, "邮件发送失败，请稍后重试"));
        return;
      }
      setMessage("邮件已发送");
    } catch (error) {
      console.error("[email-send-button]", error);
      setFailed(true);
      setMessage(clientUnknownError());
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={`inline-flex flex-col items-start gap-1 ${className}`.trim()}>
      <Button size="sm" loading={sending} onClick={() => void send()}>
        <Mail className="h-3.5 w-3.5" />
        {label}
      </Button>
      {message ? (
        <span className={`max-w-72 text-[11px] ${failed ? "text-red-600" : "text-emerald-600"}`}>
          {message}
        </span>
      ) : null}
    </div>
  );
}
