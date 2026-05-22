"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { User, Mail, Shield, Bell, CheckCircle2, Lock, Eye, EyeOff } from "lucide-react";

interface Props {
  id: string;
  name: string;
  email: string;
  role: string;
  feishuAuth: boolean;
  googleAuth: boolean;
  emailAuth: boolean;
}

export function SettingsClient({ id, name, email, role, feishuAuth, googleAuth, emailAuth }: Props) {
  const [displayName, setDisplayName] = useState(name);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSaved, setPwSaved] = useState(false);
  const [pwPending, startPwTransition] = useTransition();

  function saveName() {
    if (!displayName.trim() || displayName === name) return;
    startTransition(async () => {
      await fetch(`/api/settings/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: displayName.trim() }),
      });
      setSaved(true);
      setTimeout(() => { setSaved(false); router.refresh(); }, 2000);
    });
  }

  function changePassword() {
    setPwError("");
    startPwTransition(async () => {
      const res = await fetch("/api/settings/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      if (res.ok) {
        setPwSaved(true);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setTimeout(() => setPwSaved(false), 3000);
      } else {
        const d = await res.json();
        setPwError(d.error ?? "修改失败，请重试");
      }
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">账号设置</h1>
        <p className="mt-1 text-sm text-slate-500">管理你的个人信息和应用授权</p>
      </div>

      {/* Profile card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <User className="h-4 w-4 text-brand-500" />
          <h2 className="text-sm font-semibold text-slate-700">基本信息</h2>
        </div>
        <div>
          <label className="label text-xs">显示名称</label>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="输入显示名称"
            />
            <button
              onClick={saveName}
              disabled={pending || !displayName.trim() || displayName === name}
              className="btn-primary text-sm px-4 disabled:opacity-50"
            >
              {saved ? <span className="flex items-center gap-1"><CheckCircle2 className="h-4 w-4" />已保存</span> : "保存"}
            </button>
          </div>
        </div>
        <div>
          <label className="label text-xs">注册邮箱</label>
          <input className="input bg-slate-50 text-slate-500 cursor-not-allowed" value={email} readOnly />
          <p className="mt-1 text-[11px] text-slate-400">邮箱地址不可修改</p>
        </div>
        <div>
          <label className="label text-xs">用户角色</label>
          <input className="input bg-slate-50 text-slate-500 cursor-not-allowed" value={role} readOnly />
          <p className="mt-1 text-[11px] text-slate-400">角色由管理员分配，不可自行修改</p>
        </div>
      </div>

      {/* Security card — change password */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <Lock className="h-4 w-4 text-brand-500" />
          <h2 className="text-sm font-semibold text-slate-700">安全设置</h2>
        </div>

        {pwSaved && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            密码已修改成功
          </div>
        )}

        <div>
          <label className="label text-xs">当前密码</label>
          <div className="relative">
            <input
              type={showCurrent ? "text" : "password"}
              className="input pr-10"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              placeholder="输入当前密码"
              autoComplete="current-password"
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              onClick={() => setShowCurrent(v => !v)}
              tabIndex={-1}
            >
              {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="label text-xs">新密码</label>
          <div className="relative">
            <input
              type={showNew ? "text" : "password"}
              className="input pr-10"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="至少 6 位字符"
              autoComplete="new-password"
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              onClick={() => setShowNew(v => !v)}
              tabIndex={-1}
            >
              {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="label text-xs">确认新密码</label>
          <div className="relative">
            <input
              type={showConfirm ? "text" : "password"}
              className="input pr-10"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="再次输入新密码"
              autoComplete="new-password"
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              onClick={() => setShowConfirm(v => !v)}
              tabIndex={-1}
            >
              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {pwError && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{pwError}</p>
        )}

        <button
          type="button"
          onClick={changePassword}
          disabled={pwPending || !currentPassword || !newPassword || !confirmPassword}
          className="btn-primary text-sm disabled:opacity-50"
        >
          {pwPending ? "修改中…" : "修改密码"}
        </button>
      </div>

      {/* Authorizations card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="h-4 w-4 text-brand-500" />
          <h2 className="text-sm font-semibold text-slate-700">外部授权</h2>
        </div>
        {[
          { key: "emailAuth", label: "邮件接收授权", desc: "授权应用发送系统邮件至你的邮箱", icon: Mail, current: emailAuth },
          { key: "googleAuth", label: "Google 日历同步", desc: "授权同步任务截止日期到 Google 日历", icon: Bell, current: googleAuth },
          { key: "feishuAuth", label: "飞书日历同步", desc: "授权同步任务截止日期到飞书日历", icon: Bell, current: feishuAuth },
        ].map(({ key, label, desc, icon: Icon, current }) => (
          <div key={key} className="flex items-center justify-between rounded-xl border border-slate-100 p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
                <Icon className="h-4 w-4 text-slate-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700">{label}</p>
                <p className="text-xs text-slate-400">{desc}</p>
              </div>
            </div>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${current ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
              {current ? "已授权" : "未授权"}
            </span>
          </div>
        ))}
        <p className="text-[11px] text-slate-400">如需修改授权状态，请联系管理员</p>
      </div>
    </div>
  );
}
