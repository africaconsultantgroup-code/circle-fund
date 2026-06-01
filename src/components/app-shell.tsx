import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { Home, Users, Wallet, Bell, User } from "lucide-react";
import type { ReactNode } from "react";

const navItems = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/circles", label: "Circles", icon: Users },
  { to: "/payments", label: "Payments", icon: Wallet },
  { to: "/notifications", label: "Alerts", icon: Bell },
  { to: "/profile", label: "Profile", icon: User },
] as const;

export function AppShell({ children }: { children?: ReactNode }) {
  const location = useLocation();
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <main className="flex-1 pb-24">{children ?? <Outlet />}</main>
      <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md border-t border-border bg-background/95 backdrop-blur">
        <ul className="grid grid-cols-5">
          {navItems.map(({ to, label, icon: Icon }) => {
            const active = location.pathname === to || location.pathname.startsWith(to + "/");
            return (
              <li key={to}>
                <Link
                  to={to}
                  className={`flex flex-col items-center gap-1 py-3 text-[11px] font-medium transition-colors ${
                    active ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-full transition-all ${
                      active ? "bg-primary/10 text-primary" : ""
                    }`}
                  >
                    <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} />
                  </span>
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="h-[env(safe-area-inset-bottom)] bg-background" />
      </nav>
    </div>
  );
}