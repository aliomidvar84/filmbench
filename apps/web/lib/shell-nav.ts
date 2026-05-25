export interface ShellNavItem {
  href: string;
  label: string;
  /** Dashboard-style pages (manager + admin). */
  requiresDashboard?: boolean;
  /** Upload / analyst+admin. */
  requiresUpload?: boolean;
  /** Factory admin only. */
  requiresAdmin?: boolean;
  /** Shown without factory dashboard (e.g. notifications). */
  anyMember?: boolean;
}

export const SHELL_NAV: ShellNavItem[] = [
  { href: "/getting-started", label: "Getting started", requiresDashboard: true },
  { href: "/dashboard", label: "Dashboard", requiresDashboard: true },
  { href: "/benchmark", label: "Benchmark", requiresDashboard: true },
  { href: "/insights", label: "Insights", requiresDashboard: true },
  { href: "/overview", label: "Overview", requiresDashboard: true },
  { href: "/trends", label: "Trends", requiresDashboard: true },
  { href: "/compare", label: "Compare", requiresDashboard: true },
  { href: "/targets", label: "Targets", requiresDashboard: true },
  { href: "/data-quality", label: "Data quality", requiresDashboard: true },
  { href: "/actions", label: "Actions", requiresDashboard: true },
  { href: "/reports", label: "Reports", requiresDashboard: true },
  { href: "/upload", label: "Upload", requiresUpload: true },
  { href: "/team", label: "Team", requiresDashboard: true },
  { href: "/settings", label: "Settings", requiresAdmin: true },
  { href: "/admin/rules", label: "Insight rules", requiresAdmin: true },
  { href: "/integrations", label: "Integrations", requiresDashboard: true },
  { href: "/notifications", label: "Notifications", anyMember: true },
  { href: "/account", label: "Account", anyMember: true },
];

export interface FactoryCapabilities {
  can_view_dashboard: boolean;
  can_upload: boolean;
  can_administer: boolean;
}

export function filterNavForFactory(
  items: ShellNavItem[],
  caps: FactoryCapabilities | null,
  hasToken: boolean,
): ShellNavItem[] {
  if (!hasToken) return [];
  if (!caps) {
    return items.filter((i) => i.anyMember);
  }
  return items.filter((item) => {
    if (item.anyMember) return true;
    if (item.requiresAdmin && !caps.can_administer) return false;
    if (item.requiresUpload && !caps.can_upload) return false;
    if (item.requiresDashboard && !caps.can_view_dashboard) return false;
    return true;
  });
}
