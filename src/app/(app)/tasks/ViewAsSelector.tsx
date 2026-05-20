"use client";

import { useRouter, useSearchParams } from "next/navigation";

interface User {
  id: string;
  name: string;
}

export function ViewAsSelector({
  users,
  currentUserId,
}: {
  users: User[];
  currentUserId: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  const selectedId = sp.get("owner") ?? currentUserId;

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(sp.toString());
    if (e.target.value === currentUserId) {
      params.delete("owner");
    } else {
      params.set("owner", e.target.value);
    }
    router.push(`/tasks?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500 whitespace-nowrap">查看成员：</span>
      <select
        value={selectedId}
        onChange={handleChange}
        className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
      >
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.id === currentUserId ? `${u.name}（我）` : u.name}
          </option>
        ))}
      </select>
    </div>
  );
}
