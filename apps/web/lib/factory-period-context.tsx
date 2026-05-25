"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { apiBase, getAccessToken } from "./api";

export interface FactoryRow {
  id: string;
  factory_name: string;
  role: string;
  can_view_dashboard: boolean;
  can_upload: boolean;
  can_administer: boolean;
}

export interface PeriodRow {
  id: string;
  period_end: string;
  label: string | null;
}

interface FactoryPeriodContextValue {
  factories: FactoryRow[];
  periods: PeriodRow[];
  factoryId: string;
  periodId: string;
  selectedFactory: FactoryRow | null;
  loading: boolean;
  authMessage: string | null;
  setFactoryId: (id: string) => void;
  setPeriodId: (id: string) => void;
  refreshFactories: () => void;
  refreshPeriods: (preferredPeriodId?: string) => Promise<PeriodRow[]>;
}

const FactoryPeriodContext = createContext<FactoryPeriodContextValue | null>(
  null,
);

const STORAGE_FACTORY = "filmbench_factory_id";
const STORAGE_PERIOD = "filmbench_period_id";

function readInitialId(
  searchParams: URLSearchParams,
  key: string,
  storageKey: string,
): string {
  const fromUrl = searchParams.get(key)?.trim() ?? "";
  if (fromUrl) return fromUrl;
  if (typeof window === "undefined") return "";
  return localStorage.getItem(storageKey)?.trim() ?? "";
}

export function FactoryPeriodProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [factories, setFactories] = useState<FactoryRow[]>([]);
  const [periods, setPeriods] = useState<PeriodRow[]>([]);
  const [factoryId, setFactoryIdState] = useState("");
  const [periodId, setPeriodIdState] = useState("");
  const [loading, setLoading] = useState(true);
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  const pushQuery = useCallback(
    (nextFactory: string, nextPeriod: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (nextFactory) params.set("factory_id", nextFactory);
      else params.delete("factory_id");
      if (nextPeriod) params.set("reporting_period_id", nextPeriod);
      else params.delete("reporting_period_id");
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname);
    },
    [pathname, router, searchParams],
  );

  const setFactoryId = useCallback(
    (id: string) => {
      setFactoryIdState(id);
      setPeriodIdState("");
      if (typeof window !== "undefined") {
        if (id) localStorage.setItem(STORAGE_FACTORY, id);
        else localStorage.removeItem(STORAGE_FACTORY);
        localStorage.removeItem(STORAGE_PERIOD);
      }
      pushQuery(id, "");
    },
    [pushQuery],
  );

  const setPeriodId = useCallback(
    (id: string) => {
      setPeriodIdState(id);
      if (typeof window !== "undefined") {
        if (id) localStorage.setItem(STORAGE_PERIOD, id);
        else localStorage.removeItem(STORAGE_PERIOD);
      }
      pushQuery(factoryId, id);
    },
    [factoryId, pushQuery],
  );

  const refreshFactories = useCallback(() => {
    const token = getAccessToken();
    if (!token) {
      setAuthMessage("Sign in to use factory context.");
      setFactories([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    void fetch(`${apiBase}/v1/factories`, {
      headers: { authorization: `Bearer ${token}` },
    })
      .then((r) => r.json() as Promise<{ factories?: FactoryRow[] }>)
      .then((data) => {
        setFactories(data.factories ?? []);
        setAuthMessage(null);
      })
      .catch(() => setAuthMessage("Could not load factories."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => refreshFactories());
  }, [refreshFactories]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      const f = readInitialId(searchParams, "factory_id", STORAGE_FACTORY);
      const p = readInitialId(
        searchParams,
        "reporting_period_id",
        STORAGE_PERIOD,
      );
      if (f) setFactoryIdState(f);
      if (p) setPeriodIdState(p);
    });
  }, [searchParams]);

  const applyPeriodList = useCallback(
    (list: PeriodRow[], preferredPeriodId?: string) => {
      setPeriods(list);
      const valid =
        preferredPeriodId && list.some((x) => x.id === preferredPeriodId)
          ? preferredPeriodId
          : periodId && list.some((x) => x.id === periodId)
            ? periodId
            : (list[0]?.id ?? "");
      if (!valid) return list;
      if (valid !== periodId) {
        setPeriodIdState(valid);
        if (typeof window !== "undefined") {
          localStorage.setItem(STORAGE_PERIOD, valid);
        }
        pushQuery(factoryId, valid);
      }
      return list;
    },
    [factoryId, periodId, pushQuery],
  );

  const refreshPeriods = useCallback(
    (preferredPeriodId?: string): Promise<PeriodRow[]> => {
      const token = getAccessToken();
      if (!token || !factoryId) {
        setPeriods([]);
        return Promise.resolve([]);
      }
      return fetch(`${apiBase}/v1/factories/${factoryId}/reporting-periods`, {
        headers: { authorization: `Bearer ${token}` },
      })
        .then((r) => r.json() as Promise<{ reporting_periods?: PeriodRow[] }>)
        .then((d) => applyPeriodList(d.reporting_periods ?? [], preferredPeriodId))
        .catch(() => {
          setPeriods([]);
          return [] as PeriodRow[];
        });
    },
    [applyPeriodList, factoryId],
  );

  useEffect(() => {
    void Promise.resolve().then(() => {
      void refreshPeriods();
    });
  }, [refreshPeriods]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      if (!factories.length || factoryId) return;
      const preferred =
        factories.find((f) => f.can_view_dashboard) ?? factories[0];
      if (!preferred?.id) return;
      setFactoryIdState(preferred.id);
      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_FACTORY, preferred.id);
      }
      pushQuery(preferred.id, periodId);
    });
  }, [factories, factoryId, periodId, pushQuery]);

  const selectedFactory = useMemo(
    () => factories.find((f) => f.id === factoryId) ?? null,
    [factories, factoryId],
  );

  const value = useMemo(
    () => ({
      factories,
      periods,
      factoryId,
      periodId,
      selectedFactory,
      loading,
      authMessage,
      setFactoryId,
      setPeriodId,
      refreshFactories,
      refreshPeriods,
    }),
    [
      factories,
      periods,
      factoryId,
      periodId,
      selectedFactory,
      loading,
      authMessage,
      setFactoryId,
      setPeriodId,
      refreshFactories,
      refreshPeriods,
    ],
  );

  return (
    <FactoryPeriodContext.Provider value={value}>
      {children}
    </FactoryPeriodContext.Provider>
  );
}

export function useFactoryPeriod(): FactoryPeriodContextValue {
  const ctx = useContext(FactoryPeriodContext);
  if (!ctx) {
    throw new Error("useFactoryPeriod must be used within FactoryPeriodProvider");
  }
  return ctx;
}
