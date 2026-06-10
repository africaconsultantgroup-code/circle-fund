import { LayoutDashboard, Users, ShieldCheck } from "lucide-react";

export const adminRoutes = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/verifications", label: "Verifications", icon: ShieldCheck },
] as const;
