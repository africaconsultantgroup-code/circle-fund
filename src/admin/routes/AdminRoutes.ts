import {
  Activity,
  AlertTriangle,
  CalendarClock,
  Circle,
  FileBarChart,
  HandCoins,
  LayoutDashboard,
  LifeBuoy,
  Settings,
  ShieldQuestion,
  UserCog,
  Shield,
  ShieldCheck,
  Users,
  WalletCards,
} from "lucide-react";
import type { StaffRole } from "@/lib/supabase-types";

export type AdminRoutePermission = StaffRole | "staff";

export const adminRoutes = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, roles: ["staff"] },
  { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["staff"], hidden: true },
  { to: "/admin/activity", label: "Activity", icon: Activity, roles: ["super_admin"] },
  { to: "/admin/users", label: "Users", icon: Users, roles: ["super_admin", "operations", "support"] },
  { to: "/admin/roles", label: "Roles", icon: UserCog, roles: ["super_admin"] },
  { to: "/admin/verifications", label: "Verifications", icon: ShieldCheck, roles: ["super_admin", "compliance"] },
  { to: "/admin/capacity", label: "Capacity Review", icon: ShieldQuestion, roles: ["super_admin", "compliance"] },
  { to: "/admin/circles", label: "Circles", icon: Circle, roles: ["super_admin", "operations"] },
  { to: "/admin/contributions", label: "Contributions", icon: HandCoins, roles: ["super_admin", "operations", "finance"] },
  { to: "/admin/automations", label: "Automation", icon: CalendarClock, roles: ["super_admin", "operations", "finance"] },
  { to: "/admin/protected-funds", label: "Protected Funds", icon: ShieldCheck, roles: ["super_admin", "operations", "finance", "compliance"] },
  { to: "/admin/payouts", label: "Payouts", icon: WalletCards, roles: ["super_admin", "finance"] },
  { to: "/admin/trust", label: "Trust", icon: Shield, roles: ["super_admin"] },
  { to: "/admin/risk", label: "Risk", icon: AlertTriangle, roles: ["super_admin", "compliance"] },
  { to: "/admin/support", label: "Support", icon: LifeBuoy, roles: ["super_admin", "support"] },
  { to: "/admin/reports", label: "Reports", icon: FileBarChart, roles: ["super_admin", "finance"] },
  { to: "/admin/settings", label: "Settings", icon: Settings, roles: ["super_admin"] },
] as const;

export function staffCanAccessAdminRoute(role: StaffRole | null, pathname: string) {
  if (!role) return false;
  if (role === "super_admin") return true;

  const match = adminRoutes
    .filter((route) => route.to !== "/admin")
    .sort((a, b) => b.to.length - a.to.length)
    .find((route) => pathname === route.to || pathname.startsWith(`${route.to}/`));

  const route = match ?? adminRoutes.find((item) => item.to === "/admin");
  const permissions = route?.roles as readonly AdminRoutePermission[] | undefined;
  return Boolean(permissions?.includes("staff") || permissions?.includes(role));
}
