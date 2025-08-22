"use client";

import { useEffect, useState } from "react";
import { Feature } from "@/types";
import { STATUS_TEXT } from "@/lib/utils/index";

export default function AdminPage() {
  const [items, setItems] = useState<Feature[]>([]);
  async function load() {
    const res = await fetch(`/api/features?email=admin@local`, { cache: "no-store" });
    const data = await res.json();
    setItems(data.items || []);
  }
  useEffect(() => {
    load();
  }, []);

  async function updateStatus(id: string, status: Feature["status"]) {
    await fetch(`/api/features/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await load();
  }

  return (
    <div className="container py-6">
      <h1 className="text-xl font-semibold">Admin · Status</h1>
      <div className="mt-4 space-y-3">
        {items.map((f) => (
          <div key={f.id} className="card p-4 flex items-center justify-between">
            <div>
              <div className="font-medium">{f.title}</div>
              <div className="text-xs text-gray-500">{STATUS_TEXT[f.status]}</div>
            </div>
            <select value={f.status} className="input w-44" onChange={(e) => updateStatus(f.id, e.target.value as any)}>
              <option value="open">Open</option>
              <option value="planned">Planned</option>
              <option value="in_progress">In Progress</option>
              <option value="done">Done</option>
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
