"use client";

import { useState, useEffect, useTransition } from "react";
import { Badge } from "@/components/ui/Badge";
import {
  FEATURES,
  PERM_LEVELS,
  PERM_LEVEL_LABELS,
  PERM_LEVEL_COLORS,
  ALL_ROLES,
  ROLE_LABELS_FOR_PERM,
  type PermLevel,
} from "@/lib/featurePermissions";

type UserRecord = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type Tab = "role" | "user";

export function PermissionsPanel({ users }: { users: UserRecord[] }) {
  const [tab, setTab] = useState<Tab>("role");

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-slate-100">
        <button
          type="button"
          onClick={() => setTab("role")}
          className={`px-4 py-2 text-sm font-medium ${
            tab === "role"
              ? "border-b-2 border-brand-600 text-brand-700"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          按角色配置（默认权限）
        </button>
        <button
          type="button"
          onClick={() => setTab("user")}
          className={`px-4 py-2 text-sm font-medium ${
            tab === "user"
              ? "border-b-2 border-brand-600 text-brand-700"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          按用户配置（个性化覆盖）
        </button>
      </div>

      {tab === "role" ? <RolePermissionsTab /> : <UserPermissionsTab users={users} />}
    </div>
  );
}

// ── 角色权限 Tab ──────────────────────────────────────────────────────────────
function RolePermissionsTab() {
  const [data, setData] = useState<Record<string, Record<string, PermLevel>>>({});
  const [loading, setLoading] = useState(true);
  const [, startTransition] = useTransition();
  const [savedKey, setSavedKey] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/permissions/role")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      });
  }, []);

  function setLevel(role: string, feature: string, level: PermLevel) {
    setData((prev) => ({
      ...prev,
      [role]: { ...(prev[role] ?? {}), [feature]: level },
    }));
    startTransition(async () => {
      const res = await fetch("/api/admin/permissions/role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, feature, level }),
      });
      if (res.ok) {
        const k = `${role}::${feature}`;
        setSavedKey(k);
        setTimeout(() => setSavedKey((c) => (c === k ? null : c)), 1500);
      } else {
        alert("保存失败");
      }
    });
  }

  if (loading) {
    return (
      <div className="card p-8 text-center text-slate-400">加载中…</div>
    );
  }

  return (
    <div className="card overflow-x-auto">
      <p className="border-b border-slate-100 px-4 py-3 text-xs text-slate-500">
        💡 修改某角色的某个功能权限后会即时生效，影响所有未单独设置过覆盖的用户
      </p>
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-slate-600">功能</th>
            {ALL_ROLES.map((r) => (
              <th key={r} className="px-3 py-3 text-center font-medium text-slate-600">
                {ROLE_LABELS_FOR_PERM[r]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {FEATURES.map((f) => (
            <tr key={f.key} className="hover:bg-slate-50">
              <td className="px-4 py-3">
                <div className="font-medium text-slate-900">{f.label}</div>
                {f.description && (
                  <div className="text-xs text-slate-400">{f.description}</div>
                )}
              </td>
              {ALL_ROLES.map((r) => {
                const lv = data[r]?.[f.key] ?? "NONE";
                const isSaved = savedKey === `${r}::${f.key}`;
                return (
                  <td key={r} className="px-3 py-3 text-center">
                    <select
                      className={`text-xs rounded border px-2 py-1 ${
                        isSaved
                          ? "border-emerald-400 bg-emerald-50"
                          : "border-slate-200"
                      }`}
                      value={lv}
                      onChange={(e) =>
                        setLevel(r, f.key, e.target.value as PermLevel)
                      }
                    >
                      {PERM_LEVELS.map((p) => (
                        <option key={p} value={p}>
                          {PERM_LEVEL_LABELS[p]}
                        </option>
                      ))}
                    </select>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── 用户权限 Tab ──────────────────────────────────────────────────────────────
function UserPermissionsTab({ users }: { users: UserRecord[] }) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const filtered = users
    .filter(
      (u) =>
        !search ||
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase()),
    );

  const selected = users.find((u) => u.id === selectedId);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* 用户列表 */}
      <div className="card overflow-hidden lg:col-span-1">
        <div className="border-b border-slate-100 p-3">
          <input
            className="input text-sm"
            placeholder="搜索姓名或邮箱"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="max-h-[60vh] overflow-y-auto divide-y divide-slate-100">
          {filtered.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => setSelectedId(u.id)}
              className={`w-full text-left px-3 py-2.5 hover:bg-slate-50 ${
                selectedId === u.id ? "bg-brand-50" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-900 text-sm">
                  {u.name}
                </span>
                <Badge className="bg-slate-100 text-slate-600 text-[10px]">
                  {ROLE_LABELS_FOR_PERM[u.role] ?? u.role}
                </Badge>
              </div>
              <div className="text-xs text-slate-400">{u.email}</div>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="p-4 text-center text-xs text-slate-400">无匹配用户</p>
          )}
        </div>
      </div>

      {/* 用户权限详情 */}
      <div className="lg:col-span-2">
        {selected ? (
          <UserPermissionEditor user={selected} />
        ) : (
          <div className="card flex h-full items-center justify-center p-8 text-slate-400">
            从左侧选择用户配置个性化权限
          </div>
        )}
      </div>
    </div>
  );
}

function UserPermissionEditor({ user }: { user: UserRecord }) {
  const [effective, setEffective] = useState<Record<string, PermLevel>>({});
  const [overrideKeys, setOverrideKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [, startTransition] = useTransition();

  function load() {
    setLoading(true);
    fetch(`/api/admin/permissions/user/${user.id}`)
      .then((r) => r.json())
      .then((d) => {
        setEffective(d.effective ?? {});
        setOverrideKeys(new Set<string>(d.overrideKeys ?? []));
        setLoading(false);
      });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  function update(feature: string, level: PermLevel) {
    setEffective((prev) => ({ ...prev, [feature]: level }));
    startTransition(async () => {
      const res = await fetch(`/api/admin/permissions/user/${user.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feature, level }),
      });
      if (res.ok) {
        load();
      } else {
        alert("保存失败");
      }
    });
  }

  function reset(feature: string) {
    startTransition(async () => {
      const res = await fetch(`/api/admin/permissions/user/${user.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feature, reset: true }),
      });
      if (res.ok) load();
    });
  }

  if (loading) {
    return <div className="card p-8 text-center text-slate-400">加载中…</div>;
  }

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-100 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-900">{user.name}</h3>
            <p className="text-xs text-slate-500">{user.email}</p>
          </div>
          <Badge className="bg-slate-100 text-slate-700">
            {ROLE_LABELS_FOR_PERM[user.role] ?? user.role}
          </Badge>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          💡 初始权限继承自角色「{ROLE_LABELS_FOR_PERM[user.role] ?? user.role}」。
          有 <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">已覆盖</span> 标记的功能表示已被单独调整。
        </p>
      </div>

      <table className="w-full text-sm">
        <thead className="border-b border-slate-100 bg-slate-50">
          <tr>
            <th className="px-4 py-2 text-left font-medium text-slate-600">功能</th>
            <th className="px-3 py-2 text-center font-medium text-slate-600">权限</th>
            <th className="px-3 py-2 text-center font-medium text-slate-600">来源</th>
            <th className="px-3 py-2 text-center font-medium text-slate-600">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {FEATURES.map((f) => {
            const lv = effective[f.key] ?? "NONE";
            const isOverride = overrideKeys.has(f.key);
            return (
              <tr key={f.key} className="hover:bg-slate-50">
                <td className="px-4 py-2">
                  <div className="font-medium text-slate-800">{f.label}</div>
                  {f.description && (
                    <div className="text-xs text-slate-400">
                      {f.description}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-center">
                  <select
                    className="rounded border border-slate-200 px-2 py-1 text-xs"
                    value={lv}
                    onChange={(e) =>
                      update(f.key, e.target.value as PermLevel)
                    }
                  >
                    {PERM_LEVELS.map((p) => (
                      <option key={p} value={p}>
                        {PERM_LEVEL_LABELS[p]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2 text-center">
                  {isOverride ? (
                    <Badge className="bg-amber-100 text-amber-700">已覆盖</Badge>
                  ) : (
                    <Badge className={PERM_LEVEL_COLORS[lv]}>
                      角色默认
                    </Badge>
                  )}
                </td>
                <td className="px-3 py-2 text-center">
                  {isOverride && (
                    <button
                      type="button"
                      onClick={() => reset(f.key)}
                      className="text-xs text-slate-500 hover:text-rose-600"
                    >
                      恢复默认
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
