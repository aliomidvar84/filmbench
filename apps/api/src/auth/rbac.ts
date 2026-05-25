export type FactoryRole = "admin" | "manager" | "analyst";

export interface Membership {
  factory_id: string;
  role: FactoryRole;
}

export function parseRole(value: string): FactoryRole | null {
  if (value === "admin" || value === "manager" || value === "analyst") {
    return value;
  }
  return null;
}

export function roleForFactory(
  memberships: Membership[],
  factoryId: string,
): FactoryRole | null {
  const m = memberships.find((x) => x.factory_id === factoryId);
  return m?.role ?? null;
}

export function canUpload(role: FactoryRole | null): boolean {
  return role === "admin" || role === "analyst";
}

export function canViewDashboardAndReports(role: FactoryRole | null): boolean {
  return role === "admin" || role === "manager";
}

export function canAdminister(role: FactoryRole | null): boolean {
  return role === "admin";
}

export function assertFactoryRole(
  memberships: Membership[],
  factoryId: string,
  allowed: FactoryRole[],
): FactoryRole {
  const role = roleForFactory(memberships, factoryId);
  if (!role || !allowed.includes(role)) {
    const err = new Error("forbidden") as Error & { status?: number };
    err.status = 403;
    throw err;
  }
  return role;
}
