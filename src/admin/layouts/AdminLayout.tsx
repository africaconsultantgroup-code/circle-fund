import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { Activity, ChevronDown, Loader2, LogOut, Settings, ShieldAlert, User } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { getCurrentUserProfile, signOut, type UserProfile } from "@/lib/auth";
import { getCurrentStaffRole } from "@/shared/auth/roles";
import { adminRoutes, staffCanAccessAdminRoute } from "@/admin/routes/AdminRoutes";
import type { StaffRole } from "@/lib/supabase-types";

export function AdminLayout({ children }: { children?: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState<"checking" | "allowed" | "blocked">("checking");
  const [staffRole, setStaffRole] = useState<StaffRole | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    Promise.all([getCurrentStaffRole(), getCurrentUserProfile()]).then(([role, profile]) => {
      if (!isMounted) return;
      if (role) {
        setStaffRole(role);
        setProfile(profile);
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

  const canAccessRoute = staffCanAccessAdminRoute(staffRole, location.pathname);
  const displayName = profile?.full_name || profile?.email || "Admin user";
  const displayEmail = profile?.email || "No email";

  const handleLogout = async () => {
    await signOut();
    navigate({ to: "/admin/login" });
  };

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

  if (!canAccessRoute) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-center">
        <div className="max-w-sm rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-destructive">
          <ShieldAlert className="mx-auto h-6 w-6" />
          <p className="mt-2 font-display text-sm font-semibold">Permission required</p>
          <p className="mt-1 text-xs">Your staff role cannot access this admin page.</p>
          <Link to="/admin" className="mt-4 inline-flex text-xs font-semibold text-primary">Back to dashboard</Link>
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
          {adminRoutes.filter((route) => !("hidden" in route && route.hidden) && staffCanAccessAdminRoute(staffRole, route.to)).map(({ to, label, icon: Icon }) => {
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
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="md:hidden">
            <p className="font-display text-lg font-bold text-primary">Operations Portal</p>
            <Link to="/home" className="text-xs font-semibold text-primary">Customer app</Link>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold">{displayName}</p>
              <p className="text-xs text-muted-foreground">{displayEmail}</p>
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => setProfileOpen((open) => !open)}
                className="flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 text-left shadow-card"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-primary">
                  <User className="h-4 w-4" />
                </span>
                <span className="hidden min-w-0 sm:block">
                  <span className="block text-xs font-semibold capitalize text-foreground">{formatRole(staffRole ?? "staff")}</span>
                  <span className="block max-w-36 truncate text-[11px] text-muted-foreground">{displayName}</span>
                </span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>

              {profileOpen && (
                <div className="absolute right-0 z-20 mt-2 w-64 overflow-hidden rounded-2xl border border-border bg-card shadow-card">
                  <div className="border-b border-border p-4">
                    <p className="text-sm font-semibold">{displayName}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{displayEmail}</p>
                    <p className="mt-2 inline-flex rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold capitalize text-primary">
                      {formatRole(staffRole ?? "staff")}
                    </p>
                  </div>
                  <Link to="/admin/settings" onClick={() => setProfileOpen(false)} className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
                    <User className="h-4 w-4" /> My Profile
                  </Link>
                  <Link to="/admin/settings" onClick={() => setProfileOpen(false)} className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
                    <Settings className="h-4 w-4" /> Settings
                  </Link>
                  <button onClick={handleLogout} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-destructive hover:bg-destructive/5">
                    <LogOut className="h-4 w-4" /> Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        {children ?? <Outlet />}
      </main>
    </div>
  );
}

function formatRole(role: string) {
  return role.replace("_", " ");
}
