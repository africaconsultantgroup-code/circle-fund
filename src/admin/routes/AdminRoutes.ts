import {
  Activity,
  AlertTriangle,
  Circle,
  FileBarChart,
  HandCoins,
  LayoutDashboard,
  LifeBuoy,
  Settings,
  Shield,
  ShieldCheck,
  Users,
  WalletCards,
} from "lucide-react";

export const adminRoutes = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/activity", label: "Activity", icon: Activity },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/verifications", label: "Verifications", icon: ShieldCheck },
  { to: "/admin/circles", label: "Circles", icon: Circle },
  { to: "/admin/contributions", label: "Contributions", icon: HandCoins },
  { to: "/admin/payouts", label: "Payouts", icon: WalletCards },
  { to: "/admin/trust", label: "Trust", icon: Shield },
  { to: "/admin/risk", label: "Risk", icon: AlertTriangle },
  { to: "/admin/support", label: "Support", icon: LifeBuoy },
  { to: "/admin/reports", label: "Reports", icon: FileBarChart },
  { to: "/admin/settings", label: "Settings", icon: Settings },
] as const;
