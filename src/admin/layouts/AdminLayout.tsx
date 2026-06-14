import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { Activity, Loader2, ShieldAlert } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { currentUserIsAdmin } from "@/shared/auth/roles";
import { adminRoutes } from "@/admin/routes/AdminRoutes";

export function AdminLayout({ children }: { children?: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState<"checking" | "allowed" | "blocked">("checking");

  useEffect(() => {
    let isMounted = true;

    currentUserIsAdmin().then((isAdmin) => {
      if (!isMounted) return;
      if (isAdmin) {
        setStatus("allowed");
        return;
      }

      setStatus("blocked");
      navigate({ to: "/admin/login" });
    });

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  if (status === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Checking admin access
      </div>
    );
  }

  if (status === "blocked") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-center">
        <div className="max-w-sm rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-destructive">
          <ShieldAlert className="mx-auto h-6 w-6" />
          <p className="mt-2 font-display text-sm font-semibold">Admin access required</p>
          <p className="mt-1 text-xs">Redirecting to admin sign in.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-border bg-card px-5 py-6 md:block">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Activity className="h-5 w-5" />
          </span>
          <div>
            <p className="font-display text-lg font-bold text-primary">Operations Portal</p>
            <p className="text-xs text-muted-foreground">Circle Fund Admin</p>
          </div>
        </div>
        <nav className="mt-8 flex flex-col gap-2">
          {adminRoutes.map(({ to, label, icon: Icon }) => {
            const active = location.pathname === to || (to !== "/admin" && location.pathname.startsWith(to));
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${active ? "bg-secondary text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                <Icon className="h-4 w-4" /> {label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="min-h-screen px-5 py-6 md:ml-72 md:px-8">
        <div className="mb-5 flex items-center justify-between md:hidden">
          <p className="font-display text-lg font-bold text-primary">Operations Portal</p>
          <Link to="/home" className="text-xs font-semibold text-primary">Customer app</Link>
        </div>
        {children ?? <Outlet />}
      </main>
    </div>
  );
}
