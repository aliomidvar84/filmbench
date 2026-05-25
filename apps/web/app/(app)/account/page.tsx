"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const apiBase =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ??
  "http://127.0.0.1:4000";

export default function AccountPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void Promise.resolve().then(() => {
      const token = localStorage.getItem("filmbench_access_token");
      if (!token) {
        setMessage("Sign in first.");
        return;
      }
      void fetch(`${apiBase}/v1/me`, {
        headers: { authorization: `Bearer ${token}` },
      })
        .then(
          (r) =>
            r.json() as Promise<{
              user?: { email: string };
              error?: string;
            }>,
        )
        .then((d) => {
          if (d.user?.email) setEmail(d.user.email);
          else setMessage(d.error ?? "could_not_load_profile");
        })
        .catch(() => setMessage("network_error"));
    });
  }, []);

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    const token = localStorage.getItem("filmbench_access_token");
    if (!token) {
      setMessage("Sign in first.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage("New passwords do not match.");
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`${apiBase}/v1/me/change-password`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMessage(data.error ?? `change_failed_${res.status}`);
        return;
      }
      setMessage(
        "Password updated. Sign in again with your new password (refresh tokens were revoked).",
      );
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      localStorage.removeItem("filmbench_refresh_token");
    } catch {
      setMessage("network_error");
    } finally {
      setLoading(false);
    }
  }

  async function onLogout() {
    const refresh = localStorage.getItem("filmbench_refresh_token");
    if (refresh) {
      try {
        await fetch(`${apiBase}/v1/auth/logout`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ refresh_token: refresh }),
        });
      } catch {
        /* still clear local session */
      }
    }
    localStorage.removeItem("filmbench_access_token");
    localStorage.removeItem("filmbench_refresh_token");
    router.push("/login");
  }

  return (
    <div className="flex min-h-full flex-col items-center bg-zinc-50 px-4 py-12 dark:bg-black">
      <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-xl font-semibold">Account</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Sprint 13 — change password and sign out. Health endpoint reports database
          and auth configuration for deploy checks.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link className="underline" href="/">
            Home
          </Link>
          <Link className="underline" href="/login">
            Sign in
          </Link>
        </div>

        {email ? (
          <p className="mt-6 text-sm">
            Signed in as <span className="font-medium">{email}</span>
          </p>
        ) : null}

        {message ? (
          <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">{message}</p>
        ) : null}

        <form
          className="mt-8 flex flex-col gap-3 border-t border-zinc-200 pt-6 dark:border-zinc-800"
          onSubmit={onChangePassword}
        >
          <h2 className="text-sm font-semibold">Change password</h2>
          <label className="flex flex-col gap-1 text-sm">
            <span>Current password</span>
            <input
              type="password"
              autoComplete="current-password"
              className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-black"
              value={currentPassword}
              onChange={(ev) => setCurrentPassword(ev.target.value)}
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>New password (min 8 characters)</span>
            <input
              type="password"
              autoComplete="new-password"
              className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-black"
              value={newPassword}
              onChange={(ev) => setNewPassword(ev.target.value)}
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>Confirm new password</span>
            <input
              type="password"
              autoComplete="new-password"
              className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-black"
              value={confirmPassword}
              onChange={(ev) => setConfirmPassword(ev.target.value)}
              required
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            {loading ? "Updating…" : "Update password"}
          </button>
        </form>

        <button
          type="button"
          className="mt-8 w-full rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 dark:border-zinc-600 dark:text-zinc-200"
          onClick={() => void onLogout()}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
