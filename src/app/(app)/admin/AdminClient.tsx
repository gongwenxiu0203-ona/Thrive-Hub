"use client";

import { useState, useTransition } from "react";
import { Copy, Check, Link } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { formatDate } from "@/lib/utils";
import { PermissionsPanel } from "./PermissionsPanel";
import {
  AdminOverviewPanel,
  ApiAccessPanel,
  AuditLogPanel,
  DataQualityPanel,
  type AdminOverview,
  type ApiAccessLogRow,
  type AuditLogRow,
  type DataQualityIssue,
} from "./AdminObservabilityPanels";

type UserRecord = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  brandName: string | null;
  uniqueCode: string | null;
  inviter: { id: string; name: string; email: string } | null;
  createdAt: string;
};

type TransferImpact = {
  key: string;
  label: string;
  count: number;
};

type TransferPreview = {
  user: Pick<UserRecord, "id" | "name" | "email" | "role" | "status">;
  impacts: TransferImpact[];
  total: number;
  requiresChannelRecipient: boolean;
};

async function readApiResponse(response: Response) {
  const content = await response.text();
  try {
    return content ? JSON.parse(content) : {};
  } catch {
    return { error: `请求失败（HTTP ${response.status}）` };
  }
}

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
  BRAND: "bg-orange-100 text-orange-700",
  CHANNEL: "bg-teal-100 text-teal-700",
};

type AdminTab = "overview" | "pending" | "all" | "permissions" | "quality" | "audit" | "api";

export function AdminClient({
  initialUsers,
  overview,
  qualityIssues,
  auditLogs,
  apiLogs,
}: {
  initialUsers: UserRecord[];
  overview: AdminOverview;
  qualityIssues: DataQualityIssue[];
  auditLogs: AuditLogRow[];
  apiLogs: ApiAccessLogRow[];
}) {
  const [users, setUsers] = useState<UserRecord[]>(initialUsers);
  const [tab, setTab] = useState<AdminTab>("overview");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editBrandName, setEditBrandName] = useState("");
  const [editNewPassword, setEditNewPassword] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("ADMIN");
  const [newBrandName, setNewBrandName] = useState("");
  const [removalUser, setRemovalUser] = useState<UserRecord | null>(null);
  const [removalPreview, setRemovalPreview] = useState<TransferPreview | null>(null);
  const [transferToUserId, setTransferToUserId] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const pendingUsers = users.filter((u) => u.status === "PENDING");
  const displayed = tab === "pending" ? pendingUsers : tab === "all" ? users : [];

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
    setEditNewPassword("");
    setError("");
  }

  function saveEdit(id: string) {
    startTransition(async () => {
      setError("");
      const body: Record<string, unknown> = {
        role: editRole,
        status: editStatus,
        brandName: editBrandName || null,
      };
      if (editNewPassword.trim()) {
        if (editNewPassword.length < 6) {
          setError("新密码至少需要 6 位字符");
          return;
        }
        body.newPassword = editNewPassword.trim();
      }
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setEditingId(null);
        setEditNewPassword("");
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

  function openRemoval(user: UserRecord) {
    setError("");
    setRemovalUser(user);
    setRemovalPreview(null);
    setTransferToUserId("");
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/users/${user.id}`);
        const data = await readApiResponse(res);
        if (!res.ok) {
          setError(data.error ?? "无法读取该用户的关联数据");
          setRemovalUser(null);
          return;
        }
        setRemovalPreview(data as TransferPreview);
      } catch {
        setError("读取关联数据失败，请稍后重试");
        setRemovalUser(null);
      }
    });
  }

  function closeRemoval() {
    if (pending) return;
    setRemovalUser(null);
    setRemovalPreview(null);
    setTransferToUserId("");
  }

  function deleteUser() {
    if (!removalUser || !transferToUserId) return;
    startTransition(async () => {
      setError("");
      try {
        const res = await fetch(`/api/admin/users/${removalUser.id}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transferToUserId }),
        });
        const data = await readApiResponse(res);
        if (!res.ok) {
          setError(data.error ?? "移除失败");
          return;
        }
        closeRemoval();
        await refreshUsers();
      } catch {
        setError("移除失败，请稍后重试");
      }
    });
  }

  const transferCandidates = removalUser
    ? users.filter((user) => user.id !== removalUser.id && user.status === "APPROVED" && (!removalPreview?.requiresChannelRecipient || user.role === "CHANNEL"))
    : [];

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
                  <option value="USER">内部员工</option>
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

      <Modal
        open={Boolean(removalUser)}
        onClose={closeRemoval}
        title="移除用户并移交数据"
      >
        {!removalPreview ? (
          <div className="py-5 text-sm text-slate-500">正在检查该用户关联的数据...</div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-slate-600">
              将移除 <span className="font-semibold text-slate-900">{removalPreview.user.name}</span>（{removalPreview.user.email}）。
              下列业务记录会完整移交给接收账户，不会被删除。
            </p>

            {removalPreview.impacts.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3">
                {removalPreview.impacts.map((impact) => (
                  <div key={impact.key} className="rounded-md bg-white px-3 py-2">
                    <div className="text-xs text-slate-500">{impact.label}</div>
                    <div className="mt-0.5 text-sm font-semibold text-slate-900">{impact.count} 条</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                未发现需要移交的业务记录。
              </div>
            )}

            {removalPreview.requiresChannelRecipient && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                该账户关联渠道商数据，接收账户必须选择“渠道商”角色。
              </div>
            )}

            <div>
              <label className="label">接收关联数据的账户</label>
              <select
                className="input"
                value={transferToUserId}
                onChange={(event) => setTransferToUserId(event.target.value)}
                disabled={pending}
              >
                <option value="">请选择接收账户</option>
                {transferCandidates.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} · {ROLE_LABELS[user.role] ?? user.role} · {user.email}
                  </option>
                ))}
              </select>
              {transferCandidates.length === 0 && (
                <p className="mt-1.5 text-xs text-rose-600">
                  没有可用的接收账户。请先创建并审核通过一个符合条件的账户。
                </p>
              )}
            </div>

            {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" className="btn-secondary" onClick={closeRemoval} disabled={pending}>
                取消
              </button>
              <button
                type="button"
                className="rounded-md bg-rose-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={deleteUser}
                disabled={pending || !transferToUserId || transferCandidates.length === 0}
              >
                {pending ? "移交中..." : "确认移交并移除"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Tabs */}
      <div className="tab-strip overflow-x-auto">
        <button
          type="button"
          onClick={() => setTab("overview")}
          className={tab === "overview" ? "tab-trigger tab-trigger-active" : "tab-trigger"}
        >
          {"\u7ba1\u7406\u6982\u89c8"}
        </button>
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
        <button
          type="button"
          onClick={() => setTab("permissions")}
          className={`rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${
            tab === "permissions"
              ? "border-b-2 border-brand-600 text-brand-700"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          权限分配
        </button>
        <button
          type="button"
          onClick={() => setTab("quality")}
          className={tab === "quality" ? "tab-trigger tab-trigger-active" : "tab-trigger"}
        >
          {"\u6570\u636e\u8d28\u91cf"}
        </button>
        <button
          type="button"
          onClick={() => setTab("audit")}
          className={tab === "audit" ? "tab-trigger tab-trigger-active" : "tab-trigger"}
        >
          {"\u64cd\u4f5c\u5ba1\u8ba1"}
        </button>
        <button
          type="button"
          onClick={() => setTab("api")}
          className={tab === "api" ? "tab-trigger tab-trigger-active" : "tab-trigger"}
        >
          {"API \u8bbf\u95ee"}
        </button>
      </div>

      {tab === "overview" && <AdminOverviewPanel overview={overview} issues={qualityIssues} auditLogs={auditLogs} apiLogs={apiLogs} />}
      {tab === "permissions" && <PermissionsPanel users={users} />}
      {tab === "quality" && <DataQualityPanel issues={qualityIssues} />}
      {tab === "audit" && <AuditLogPanel logs={auditLogs} />}
      {tab === "api" && <ApiAccessPanel logs={apiLogs} />}

      {error && !showCreate && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
          {error}
        </p>
      )}

      {(tab === "pending" || tab === "all") && (displayed.length === 0 ? (
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
                  {tab === "pending" && <th>邀请人</th>}
                  <th>品牌名称</th>
                  <th>新密码</th>
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
                          <option value="USER">普通员工</option>
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
                    {tab === "pending" && (
                      <td className="text-xs">
                        {u.inviter ? (
                          <div className="leading-tight">
                            <div className="font-medium text-slate-700">
                              {u.inviter.name}
                            </div>
                            <div className="text-slate-400">
                              {u.inviter.email}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    )}
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
                      {editingId === u.id ? (
                        <input
                          className="input text-xs"
                          type="password"
                          value={editNewPassword}
                          onChange={(e) => setEditNewPassword(e.target.value)}
                          placeholder="留空则不修改"
                          autoComplete="new-password"
                        />
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
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
                              onClick={() => openRemoval(u)}
                              disabled={pending}
                            >
                              移除用户
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
      ))}
    </div>
  );
}
