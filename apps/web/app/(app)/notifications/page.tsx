"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

const apiBase =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ??
  "http://127.0.0.1:4000";

interface NotificationRow {
  id: string;
  factory_id: string | null;
  factory_name: string | null;
  kind: string;
  severity: string;
  title: string;
  body: string | null;
  href: string | null;
  read_at: string | null;
  created_at: string;
}

const SEVERITY_CLASS: Record<string, string> = {
  info: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  warning: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  critical: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
};

function authHeaders(): HeadersInit | null {
  const token = localStorage.getItem("filmbench_access_token");
  if (!token) return null;
  return { authorization: `Bearer ${token}` };
}

export default function NotificationsPage() {
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const headers = authHeaders();
    if (!headers) {
      setMessage("Sign in first.");
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const q = unreadOnly ? "?unread_only=true&limit=100" : "?limit=100";
      const [listRes, countRes] = await Promise.all([
        fetch(`${apiBase}/v1/notifications${q}`, { headers }),
        fetch(`${apiBase}/v1/notifications/unread-count`, { headers }),
      ]);
      const listData = (await listRes.json()) as {
        notifications?: NotificationRow[];
        error?: string;
      };
      const countData = (await countRes.json()) as { unread?: number };
      if (!listRes.ok) {
        setMessage(listData.error ?? `load_failed_${listRes.status}`);
        return;
      }
      setRows(listData.notifications ?? []);
      setUnread(countData.unread ?? 0);
    } catch {
      setMessage("network_error");
    } finally {
      setLoading(false);
    }
  }, [unreadOnly]);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  async function markRead(id: string) {
    const headers = authHeaders();
    if (!headers) return;
    await fetch(`${apiBase}/v1/notifications/${id}`, {
      method: "PATCH",
      headers,
    });
    void load();
  }

  async function markAllRead() {
    const headers = authHeaders();
    if (!headers) return;
    await fetch(`${apiBase}/v1/notifications/mark-all-read`, {
      method: "POST",
      headers,
    });
    void load();
  }

  return (
    <div className="min-h-full bg-zinc-50 px-4 py-10 font-sans dark:bg-black">
      <main className="mx-auto max-w-3xl rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-wide text-zinc-500">
              Sprint 15 — in-app notifications
            </p>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
              Notifications
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {unread} unread
            </p>
          </div>
          <Link
            href="/"
            className="text-sm font-medium text-zinc-700 underline dark:text-zinc-300"
          >
            Home
          </Link>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setUnreadOnly((v) => !v)}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
          >
            {unreadOnly ? "Show all" : "Unread only"}
          </button>
          <button
            type="button"
            onClick={() => void markAllRead()}
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Mark all read
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
          >
            Refresh
          </button>
        </div>

        {message ? (
          <p className="mb-4 text-sm text-red-600 dark:text-red-400">{message}</p>
        ) : null}
        {loading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-zinc-500">No notifications yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {rows.map((n) => (
              <li
                key={n.id}
                className={`py-4 ${n.read_at ? "opacity-70" : ""}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${SEVERITY_CLASS[n.severity] ?? SEVERITY_CLASS.info}`}
                      >
                        {n.severity}
                      </span>
                      {!n.read_at ? (
                        <span className="text-xs font-medium text-sky-600 dark:text-sky-400">
                          New
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 font-medium text-zinc-900 dark:text-zinc-100">
                      {n.title}
                    </p>
                    {n.body ? (
                      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                        {n.body}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-zinc-500">
                      {n.factory_name ?? "Account"}
                      {" · "}
                      {new Date(n.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    {n.href ? (
                      <Link
                        href={n.href}
                        className="text-sm font-medium text-sky-700 underline dark:text-sky-400"
                      >
                        Open
                      </Link>
                    ) : null}
                    {!n.read_at ? (
                      <button
                        type="button"
                        onClick={() => void markRead(n.id)}
                        className="text-left text-sm text-zinc-600 underline dark:text-zinc-400"
                      >
                        Mark read
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
