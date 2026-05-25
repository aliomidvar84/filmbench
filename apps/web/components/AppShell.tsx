"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { apiBase, getAccessToken } from "../lib/api";
import { useFactoryPeriod } from "../lib/factory-period-context";
import { filterNavForFactory, SHELL_NAV } from "../lib/shell-nav";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const {
    factories,
    periods,
    factoryId,
    periodId,
    selectedFactory,
    loading,
    authMessage,
    setFactoryId,
    setPeriodId,
  } = useFactoryPeriod();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  /** Avoid hydration mismatch: localStorage exists only on the client. */
  const [authHydrated, setAuthHydrated] = useState(false);
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    setHasToken(Boolean(getAccessToken()));
    setAuthHydrated(true);
  }, [pathname]);

  const showAuthChrome = authHydrated && hasToken;

  const navItems = useMemo(
    () =>
      filterNavForFactory(
        SHELL_NAV,
        selectedFactory
          ? {
              can_view_dashboard: selectedFactory.can_view_dashboard,
              can_upload: selectedFactory.can_upload,
              can_administer: selectedFactory.can_administer,
            }
          : null,
        showAuthChrome,
      ),
    [selectedFactory, showAuthChrome],
  );

  const dashboardFactories = useMemo(
    () => factories.filter((f) => f.can_view_dashboard),
    [factories],
  );

  const selectableFactories = useMemo(() => {
    if (dashboardFactories.length) return dashboardFactories;
    return factories;
  }, [dashboardFactories, factories]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      const token = getAccessToken();
      if (!token) {
        setUnread(0);
        return;
      }
      void fetch(`${apiBase}/v1/notifications/unread-count`, {
        headers: { authorization: `Bearer ${token}` },
      })
        .then((r) => r.json() as Promise<{ unread?: number }>)
        .then((d) => setUnread(d.unread ?? 0))
        .catch(() => setUnread(0));
    });
  }, [pathname]);

  return (
    <div className="flex min-h-full flex-col bg-zinc-50 dark:bg-zinc-950">
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
        <div className="flex h-14 items-center gap-3 px-4 lg:px-6">
          <button
            type="button"
            className="rounded-lg border border-zinc-300 px-2 py-1 text-sm lg:hidden dark:border-zinc-600"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            Menu
          </button>
          <Link
            href="/"
            className="shrink-0 text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
          >
            FilmBench
          </Link>
          <span className="hidden text-xs text-zinc-500 sm:inline">
            Sprint 17
          </span>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {showAuthChrome && selectableFactories.length > 0 ? (
              <>
                <label className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400">
                  <span className="hidden sm:inline">Factory</span>
                  <select
                    className="max-w-[10rem] rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900 sm:max-w-[12rem]"
                    value={factoryId}
                    onChange={(e) => setFactoryId(e.target.value)}
                    disabled={loading}
                  >
                    {selectableFactories.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.factory_name}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedFactory?.can_view_dashboard && periods.length > 0 ? (
                  <label className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400">
                    <span className="hidden sm:inline">Period</span>
                    <select
                      className="max-w-[8rem] rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900 sm:max-w-[10rem]"
                      value={periodId}
                      onChange={(e) => setPeriodId(e.target.value)}
                    >
                      {periods.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label ?? p.period_end}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </>
            ) : null}
            <Link
              href="/notifications"
              className="relative rounded-lg px-2 py-1 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Alerts
              {unread > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                  {unread > 99 ? "99+" : unread}
                </span>
              ) : null}
            </Link>
            <Link
              href={showAuthChrome ? "/account" : "/login"}
              className="rounded-lg px-2 py-1 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              suppressHydrationWarning
            >
              {showAuthChrome ? "Account" : "Sign in"}
            </Link>
          </div>
        </div>
        {authMessage ? (
          <p className="border-t border-amber-200 bg-amber-50 px-4 py-1 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            {authMessage}
          </p>
        ) : null}
      </header>

      <div className="flex flex-1">
        <aside
          className={`${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          } fixed inset-y-14 left-0 z-20 w-56 border-r border-zinc-200 bg-white p-3 transition-transform lg:static lg:inset-auto lg:translate-x-0 dark:border-zinc-800 dark:bg-zinc-950`}
        >
          <nav className="flex flex-col gap-0.5">
            <Link
              href="/"
              className={`rounded-lg px-3 py-2 text-sm ${
                pathname === "/"
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
              }`}
              onClick={() => setSidebarOpen(false)}
            >
              Home
            </Link>
            {navItems.map((item) => {
              const active =
                pathname === item.href ||
                pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={
                    factoryId && periodId && item.requiresDashboard
                      ? `${item.href}?factory_id=${factoryId}&reporting_period_id=${periodId}`
                      : item.href
                  }
                  className={`rounded-lg px-3 py-2 text-sm ${
                    active
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  }`}
                  onClick={() => setSidebarOpen(false)}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        {sidebarOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-10 bg-black/30 lg:hidden"
            aria-label="Close menu"
            onClick={() => setSidebarOpen(false)}
          />
        ) : null}

        <main className="flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
