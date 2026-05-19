"use client";

import { useState, useTransition } from "react";
import { Copy, Check, Link } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils";

type UserRecord = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  brandName: string | null;
  uniqueCode: string | null;
  createdAt: string;
};

function InviteButton() {
  const [copied, setCopied] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const url = typeof window !== "undefined" ? `${window.location.origin}/register` : "/register";

  function copy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <>
      <button type="button" className="btn-outline flex items-center gap-1.5 text-sm" onClick={() => setShowModal(true)}>
        <Link className="h-4 w-4" />邀请注册
      </button>
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card w-full max-w-md p-6">
            <h2 className="mb-1 text-base font-semibold text-slate-900">邀请注册链接</h2>
            <p className="mb-4 text-xs text-slate-500">将以下链接发送给需要注册的人员</p>
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="flex-1 truncate text-sm text-slate-700">{url}</span>
              <button type="button" onClick={copy} className="shrink-0 rounded p-1 hover:bg-slate-200">
                {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4 text-slate-500" />}
              </button>
            </div>
            {copied && <p className="mt-2 text-xs text-emerald-600">已复制到剪贴板</p>}
            <div className="mt-4 flex justify-end">
              <button type="button" className="btn-secondary text-sm" onClick={() => setShowModal(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "管理员",
  USER: "内部员工",
  LYNQ_STAFF: "LYNQ内部员工",
  BRAND: "品牌方",
  CHANNEL: "渠道商",
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "审核中",
  APPROVED: "已通过",
  REJECTED: "已拒绝",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  APPROVED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-rose-100 text-rose-700",
};

const ROLE_COLORS: Record<string, string> = {
  ADMIN: "bg-purple-100 text-purple-700",
  USER: "bg-slate-100 text-slate-700",
  LYNQ_STAFF: "bg-blue-100 text-blue-700",
  BRAND: "bg-orange-100 text-orange-700",
  CHANNEL: "bg-teal-100 text-teal-700",
};

export function AdminClient({ initialUsers }: { initialUsers: UserRecord[] }) {
  const [users, setUsers] = useState<UserRecord[]>(initialUsers);
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editBrandName, setEditBrandName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("ADMIN");
  const [newBrandName, setNewBrandName] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const pendingUsers = users.filter((u) => u.status === "PENDING");
  const displayed = tab === "pending" ? pendingUsers : users;

  async function refreshUsers() {
    const res = await fetch("/api/admin/users");
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users);
    }
  }

  function startEdit(u: UserRecord) {
    setEditingId(u.id);
    setEditRole(u.role);
    setEditStatus(u.status);
    setEditBrandName(u.brandName ?? "");
    setError("");
  }

  function saveEdit(id: string) {
    startTransition(async () => {
      setError("");
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: editRole,
          status: editStatus,
          brandName: editBrandName || null,
        }),
      });
      if (res.ok) {
        setEditingId(null);
        await refreshUsers();
      } else {
        const d = await res.json();
        setError(d.error ?? "保存失败");
      }
    });
  }

  function approve(id: string) {
    startTransition(async () => {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "APPROVED" }),
      });
      if (res.ok) await refreshUsers();
    });
  }

  function reject(id: string) {
    startTransition(async () => {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "REJECTED" }),
      });
      if (res.ok) await refreshUsers();
    });
  }

  function deleteUser(id: string) {
    if (!confirm("确认删除此用户？")) return;
    startTransition(async () => {
      const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
      if (res.ok) await refreshUsers();
      else {
        const d = await res.json();
        setError(d.error ?? "删除失败");
      }
    });
  }

  function createAdmin() {
    startTransition(async () => {
      setError("");
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          email: newEmail,
          password: newPassword,
          role: newRole,
          brandName: newBrandName || null,
        }),
      });
      if (res.ok) {
        setShowCreate(false);
        setNewName("");
        setNewEmail("");
        setNewPassword("");
        setNewRole("ADMIN");
        setNewBrandName("");
        await refreshUsers();
      } else {
        const d = await res.json();
        setError(d.error ?? "创建失败");
      }
    });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="管理员面板"
        description="用户管理、注册审核与权限配置"
        actions={
          <>
            <InviteButton />
            <button
              type="button"
              className="btn-primary"
              onClick={() => setShowCreate(true)}
            >
              + 新增管理员
            </button>
          </>
        }
      />

      {/* Create admin modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card w-full max-w-md p-6">
            <h2 className="mb-4 text-lg font-semibold">新增用户</h2>
            <div className="space-y-3">
              <div>
                <label className="label">姓名</label>
                <input
                  className="input"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="姓名"
                />
              </div>
              <div>
                <label className="label">邮箱</label>
                <input
                  className="input"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="email@example.com"
                />
              </div>
              <div>
                <label className="label">密码</label>
                <input
                  className="input"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="至少 6 位"
                />
              </div>
              <div>
                <label className="label">角色</label>
                <select
                  className="input"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                >
                  <option value="ADMIN">管理员</option>
                  <option value="LYNQ_STAFF">LYNQ内部员工</option>
                  <option value="BRAND">品牌方</option>
                  <option value="CHANNEL">渠道商</option>
                </select>
              </div>
              {newRole === "BRAND" && (
                <div>
                  <label className="label">品牌名称</label>
                  <input
                    className="input"
                    value={newBrandName}
                    onChange={(e) => setNewBrandName(e.target.value)}
                    placeholder="品牌名称"
                  />
                </div>
              )}
            </div>
            {error && (
              <p className="mt-2 text-sm text-rose-600">{error}</p>
            )}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="btn-primary flex-1"
                onClick={createAdmin}
                disabled={pending}
              >
                {pending ? "创建中…" : "创建"}
              </button>
              <button
                type="button"
                className="btn-secondary flex-1"
                onClick={() => setShowCreate(false)}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setTab("pending")}
          className={`rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${
            tab === "pending"
              ? "border-b-2 border-brand-600 text-brand-700"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          待审核
          {pendingUsers.length > 0 && (
            <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-xs text-white">
              {pendingUsers.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setTab("all")}
          className={`rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${
            tab === "all"
              ? "border-b-2 border-brand-600 text-brand-700"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          全部用户 ({users.length})
        </button>
      </div>

      {error && !showCreate && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
          {error}
        </p>
      )}

      {displayed.length === 0 ? (
        <div className="card p-8 text-center text-slate-400">
          {tab === "pending" ? "暂无待审核用户" : "暂无用户"}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data w-full text-sm">
              <thead>
                <tr>
                  <th>姓名</th>
                  <th>邮箱</th>
                  <th>角色</th>
                  <th>状态</th>
                  <th>品牌名称</th>
                  <th>用户编码</th>
                  <th>注册时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((u) => (
                  <tr key={u.id}>
                    <td className="font-medium">{u.name}</td>
                    <td className="text-slate-500">{u.email}</td>
                    <td>
                      {editingId === u.id ? (
                        <select
                          className="input text-xs"
                          value={editRole}
                          onChange={(e) => setEditRole(e.target.value)}
                        >
                          <option value="ADMIN">管理员</option>
                          <option value="LYNQ_STAFF">LYNQ内部员工</option>
                          <option value="BRAND">品牌方</option>
                          <option value="CHANNEL">渠道商</option>
                        </select>
                      ) : (
                        <Badge className={ROLE_COLORS[u.role] ?? "bg-slate-100 text-slate-700"}>
                          {ROLE_LABELS[u.role] ?? u.role}
                        </Badge>
                      )}
                    </td>
                    <td>
                      {editingId === u.id ? (
                        <select
                          className="input text-xs"
                          value={editStatus}
                          onChange={(e) => setEditStatus(e.target.value)}
                        >
                          <option value="PENDING">审核中</option>
                          <option value="APPROVED">已通过</option>
                          <option value="REJECTED">已拒绝</option>
                        </select>
                      ) : (
                        <Badge className={STATUS_COLORS[u.status] ?? "bg-slate-100 text-slate-700"}>
                          {STATUS_LABELS[u.status] ?? u.status}
                        </Badge>
                      )}
                    </td>
                    <td>
                      {editingId === u.id ? (
                        <input
                          className="input text-xs"
                          value={editBrandName}
                          onChange={(e) => setEditBrandName(e.target.value)}
                          placeholder="品牌名称（可选）"
                        />
                      ) : (
                        <span className="text-slate-500">{u.brandName ?? "—"}</span>
                      )}
                    </td>
                    <td>
                      {u.uniqueCode ? (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">{u.uniqueCode}</span>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="text-slate-400 text-xs">{formatDate(u.createdAt)}</td>
                    <td>
                      <div className="flex items-center gap-1">
                        {editingId === u.id ? (
                          <>
                            <button
                              type="button"
                              className="btn-primary btn-sm text-xs"
                              onClick={() => saveEdit(u.id)}
                              disabled={pending}
                            >
                              保存
                            </button>
                            <button
                              type="button"
                              className="btn-secondary btn-sm text-xs"
                              onClick={() => setEditingId(null)}
                            >
                              取消
                            </button>
                          </>
                        ) : (
                          <>
                            {tab === "pending" && (
                              <>
                                <button
                                  type="button"
                                  className="rounded px-2 py-1 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 transition-colors"
                                  onClick={() => approve(u.id)}
                                  disabled={pending}
                                >
                                  批准
                                </button>
                                <button
                                  type="button"
                                  className="rounded px-2 py-1 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 transition-colors"
                                  onClick={() => reject(u.id)}
                                  disabled={pending}
                                >
                                  拒绝
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              className="btn-secondary btn-sm text-xs"
                              onClick={() => startEdit(u)}
                            >
                              编辑
                            </button>
                            <button
                              type="button"
                              className="rounded px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 transition-colors"
                              onClick={() => deleteUser(u.id)}
                              disabled={pending}
                            >
                              删除
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
