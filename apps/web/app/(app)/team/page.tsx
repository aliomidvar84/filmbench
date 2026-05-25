"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

const apiBase =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ??
  "http://127.0.0.1:4000";

interface FactoryRow {
  id: string;
  factory_name: string;
  role: string;
  can_view_dashboard: boolean;
  can_upload: boolean;
  can_administer: boolean;
}

interface MemberRow {
  user_id: string;
  email: string;
  full_name: string | null;
  role: string;
}

interface BatchRow {
  id: string;
  original_filename: string;
  status: string;
  row_count: number | null;
  created_at: string;
  uploaded_by_email: string;
}

interface AuditEventRow {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: unknown;
  created_at: string;
  actor_email: string | null;
}

export default function TeamPage() {
  const [factories, setFactories] = useState<FactoryRow[]>([]);
  const [factoryId, setFactoryId] = useState("");
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEventRow[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "manager" | "analyst">(
    "analyst",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const selected = useMemo(
    () => factories.find((f) => f.id === factoryId),
    [factories, factoryId],
  );

  const loadFactoryData = useCallback(() => {
    if (!factoryId) {
      setMembers([]);
      setBatches([]);
      setAuditEvents([]);
      return;
    }
    const token = localStorage.getItem("filmbench_access_token");
    if (!token) return;
    const f = factories.find((x) => x.id === factoryId);
    const canTeam = Boolean(
      f?.can_view_dashboard || f?.can_administer,
    );
    const canSeeAudit = Boolean(
      f?.can_view_dashboard || f?.can_administer,
    );
    setLoading(true);
    setMessage(null);
    const headers = { authorization: `Bearer ${token}` };
    const pMembers = canTeam
      ? fetch(`${apiBase}/v1/factories/${factoryId}/members`, { headers })
          .then((r) => r.json() as Promise<{ members?: MemberRow[]; error?: string }>)
          .then((d) => {
            if (!("members" in d)) setMessage(d.error ?? "members_load_failed");
            setMembers(d.members ?? []);
          })
          .catch(() => setMembers([]))
      : Promise.resolve();
    const pAudit =
      canSeeAudit && factoryId
        ? fetch(`${apiBase}/v1/factories/${factoryId}/audit-events`, { headers })
            .then(
              (r) =>
                r.json() as Promise<{
                  audit_events?: AuditEventRow[];
                  error?: string;
                }>,
            )
            .then((d) => {
              setAuditEvents(d.audit_events ?? []);
            })
            .catch(() => setAuditEvents([]))
        : Promise.resolve().then(() => setAuditEvents([]));
    const pBatches = fetch(`${apiBase}/v1/factories/${factoryId}/ingestion-batches`, {
      headers,
    })
      .then((r) => r.json() as Promise<{ ingestion_batches?: BatchRow[] }>)
      .then((d) => setBatches(d.ingestion_batches ?? []))
      .catch(() => setBatches([]));
    void Promise.all([pMembers, pAudit, pBatches]).finally(() => setLoading(false));
  }, [factoryId, factories]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      const token = localStorage.getItem("filmbench_access_token");
      if (!token) {
        setMessage("Sign in first.");
        return;
      }
      void fetch(`${apiBase}/v1/factories`, {
        headers: { authorization: `Bearer ${token}` },
      })
        .then((r) => r.json() as Promise<{ factories?: FactoryRow[] }>)
        .then((data) => {
          const list = data.factories ?? [];
          setFactories(list);
          if (list[0]?.id) setFactoryId(list[0].id);
        })
        .catch(() => setMessage("Could not load factories."));
    });
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => {
      void loadFactoryData();
    });
  }, [loadFactoryData]);

  async function onAddMember(e: FormEvent) {
    e.preventDefault();
    const token = localStorage.getItem("filmbench_access_token");
    if (!token || !factoryId || !newEmail.trim()) return;
    setMessage(null);
    const res = await fetch(`${apiBase}/v1/factories/${factoryId}/members`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ email: newEmail.trim(), role: newRole }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMessage(data.error ?? `add_failed_${res.status}`);
      return;
    }
    setNewEmail("");
    loadFactoryData();
  }

  async function changeRole(userId: string, role: string) {
    const token = localStorage.getItem("filmbench_access_token");
    if (!token || !factoryId) return;
    setMessage(null);
    const res = await fetch(
      `${apiBase}/v1/factories/${factoryId}/members/${userId}`,
      {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ role }),
      },
    );
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMessage(data.error ?? `patch_failed_${res.status}`);
      return;
    }
    loadFactoryData();
  }

  async function removeMember(userId: string) {
    if (!confirm("Remove this user from the factory?")) return;
    const token = localStorage.getItem("filmbench_access_token");
    if (!token || !factoryId) return;
    setMessage(null);
    const res = await fetch(
      `${apiBase}/v1/factories/${factoryId}/members/${userId}`,
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      },
    );
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMessage(data.error ?? `delete_failed_${res.status}`);
      return;
    }
    loadFactoryData();
  }

  return (
    <div className="flex min-h-full flex-col items-center bg-zinc-50 px-4 py-12 dark:bg-black">
      <div className="w-full max-w-5xl rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Factory team and ingestion history
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Sprint 8 — audit trail (last 200 events) for managers and admins;
          members and ingestion listing as before.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link className="font-medium underline" href="/">
            Home
          </Link>
          <Link className="font-medium underline" href="/dashboard">
            Dashboard
          </Link>
          <Link className="font-medium underline" href="/upload">
            Upload
          </Link>
          <Link className="font-medium underline" href="/data-quality">
            Data quality
          </Link>
          <Link className="font-medium underline" href="/login">
            Sign in
          </Link>
        </div>

        <label className="mt-6 flex max-w-md flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            Factory
          </span>
          <select
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-black dark:text-zinc-50"
            value={factoryId}
            onChange={(ev) => setFactoryId(ev.target.value)}
          >
            <option value="">Select…</option>
            {factories.map((f) => (
              <option key={f.id} value={f.id}>
                {f.factory_name} ({f.role})
              </option>
            ))}
          </select>
        </label>

        {message ? (
          <p className="mt-4 text-sm text-red-600 dark:text-red-400">{message}</p>
        ) : null}

        {selected?.can_administer ? (
          <form
            className="mt-8 flex flex-col gap-3 border-t border-zinc-200 pt-6 dark:border-zinc-800"
            onSubmit={onAddMember}
          >
            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              Add or update member (by email)
            </h2>
            <div className="flex max-w-lg flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex flex-1 flex-col gap-1 text-sm">
                <span>Email</span>
                <input
                  className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-black"
                  type="email"
                  value={newEmail}
                  onChange={(ev) => setNewEmail(ev.target.value)}
                  placeholder="user@example.com"
                  required
                />
              </label>
              <label className="flex w-40 flex-col gap-1 text-sm">
                <span>Role</span>
                <select
                  className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-black"
                  value={newRole}
                  onChange={(ev) =>
                    setNewRole(ev.target.value as "admin" | "manager" | "analyst")
                  }
                >
                  <option value="analyst">analyst</option>
                  <option value="manager">manager</option>
                  <option value="admin">admin</option>
                </select>
              </label>
              <button
                type="submit"
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
              >
                Save
              </button>
            </div>
          </form>
        ) : null}

        {selected?.can_view_dashboard || selected?.can_administer ? (
          <div className="mt-8 border-t border-zinc-200 pt-6 dark:border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              Members {loading ? "(loading…)" : ""}
            </h2>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-700">
                    <th className="py-2 pr-4">Email</th>
                    <th className="py-2 pr-4">Role</th>
                    {selected?.can_administer ? (
                      <th className="py-2">Actions</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr
                      key={m.user_id}
                      className="border-b border-zinc-100 dark:border-zinc-800"
                    >
                      <td className="py-2 pr-4">{m.email}</td>
                      <td className="py-2 pr-4">
                        {selected?.can_administer ? (
                          <select
                            className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-900"
                            value={m.role}
                            onChange={(ev) =>
                              void changeRole(m.user_id, ev.target.value)
                            }
                          >
                            <option value="analyst">analyst</option>
                            <option value="manager">manager</option>
                            <option value="admin">admin</option>
                          </select>
                        ) : (
                          m.role
                        )}
                      </td>
                      {selected?.can_administer ? (
                        <td className="py-2">
                          <button
                            type="button"
                            className="text-xs text-red-600 underline dark:text-red-400"
                            onClick={() => void removeMember(m.user_id)}
                          >
                            Remove
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : factoryId ? (
          <p className="mt-6 text-sm text-zinc-500">
            Roster is visible to managers and admins. You can still see ingestion
            history below.
          </p>
        ) : null}

        {selected?.can_view_dashboard || selected?.can_administer ? (
          <div className="mt-8 border-t border-zinc-200 pt-6 dark:border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              Audit trail {loading ? "(loading…)" : ""}
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Append-only log: membership changes, completed monthly uploads, and
              related actions.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-700">
                    <th className="py-2 pr-3">When</th>
                    <th className="py-2 pr-3">Actor</th>
                    <th className="py-2 pr-3">Action</th>
                    <th className="py-2 pr-3">Entity</th>
                    <th className="py-2">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {auditEvents.map((ev) => (
                    <tr
                      key={ev.id}
                      className="border-b border-zinc-100 dark:border-zinc-800"
                    >
                      <td className="py-2 pr-3 font-mono whitespace-nowrap">
                        {ev.created_at}
                      </td>
                      <td className="py-2 pr-3">{ev.actor_email ?? "—"}</td>
                      <td className="py-2 pr-3 font-mono">{ev.action}</td>
                      <td className="py-2 pr-3">
                        <span className="font-mono">{ev.entity_type}</span>
                        {ev.entity_id ? (
                          <span className="ml-1 text-zinc-500">{ev.entity_id}</span>
                        ) : null}
                      </td>
                      <td className="max-w-md truncate py-2 font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
                        {typeof ev.metadata === "object" && ev.metadata !== null
                          ? JSON.stringify(ev.metadata)
                          : String(ev.metadata ?? "")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!auditEvents.length && factoryId && !loading ? (
                <p className="mt-2 text-xs text-zinc-500">No audit events yet.</p>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="mt-8 border-t border-zinc-200 pt-6 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            Ingestion batches {loading ? "(loading…)" : ""}
          </h2>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-700">
                  <th className="py-2 pr-4">When</th>
                  <th className="py-2 pr-4">File</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Rows</th>
                  <th className="py-2">By</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr
                    key={b.id}
                    className="border-b border-zinc-100 dark:border-zinc-800"
                  >
                    <td className="py-2 pr-4 font-mono text-xs">{b.created_at}</td>
                    <td className="py-2 pr-4">{b.original_filename}</td>
                    <td className="py-2 pr-4">{b.status}</td>
                    <td className="py-2 pr-4">{b.row_count ?? "—"}</td>
                    <td className="py-2 text-xs">{b.uploaded_by_email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!batches.length && factoryId && !loading ? (
              <p className="mt-2 text-xs text-zinc-500">No batches yet.</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
