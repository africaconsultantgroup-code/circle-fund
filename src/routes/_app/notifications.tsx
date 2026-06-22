import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertCircle, Bell, CheckCircle2, Loader2, UserPlus, XCircle } from "lucide-react";
import { listNotifications, type Notification } from "@/lib/db";
import { isSupabaseConfigured } from "@/lib/supabase";
import { notifications as mockNotifications } from "@/lib/mock-data";

export const Route = createFileRoute("/_app/notifications")({
  component: NotificationsPage,
});

function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let mounted = true;
    listNotifications().then(({ data, error: notificationError }) => {
      if (!mounted) return;
      setNotifications(data ?? []);
      setError(notificationError?.message ?? "");
      setIsLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const pendingRequestCount = notifications.filter(
    (item) => item.type === "join_request" && !item.read_at,
  ).length;

  if (!isSupabaseConfigured) {
    return <MockNotifications />;
  }

  return (
    <div className="flex flex-col px-5 pt-12">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Notifications</h1>
          <p className="text-xs text-muted-foreground">Stay updated on your circles</p>
        </div>
        <div className="rounded-2xl bg-gold/10 px-3 py-2 text-center text-[color:var(--gold-foreground)]">
          <p className="text-lg font-bold leading-none">{pendingRequestCount}</p>
          <p className="mt-1 text-[9px] font-semibold uppercase tracking-wide">Pending requests</p>
        </div>
      </div>

      {isLoading && (
        <div className="mt-6 flex items-center justify-center gap-2 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading notifications
        </div>
      )}
      {error && (
        <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}
      {!isLoading && !error && notifications.length === 0 && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
          No notifications yet.
        </div>
      )}

      <ul className="mt-6 flex flex-col gap-3">
        {notifications.map((notification) => {
          const Icon = iconFor(notification.type);
          const content = (
            <li
              className={`flex items-start gap-3 rounded-2xl border p-4 ${notification.read_at ? "border-border bg-card" : "border-primary/20 bg-secondary/40"}`}
            >
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${notification.read_at ? "bg-muted text-muted-foreground" : "bg-gradient-primary text-primary-foreground"}`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-display text-sm font-semibold">{notification.title}</p>
                  {!notification.read_at && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gold" />
                  )}
                </div>
                <p className="mt-0.5 text-[12px] text-muted-foreground">{notification.body}</p>
                <p className="mt-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {formatNotificationDate(notification.created_at)}
                </p>
              </div>
            </li>
          );

          return notification.circle_id ? (
            <Link key={notification.id} to="/circles/$id" params={{ id: notification.circle_id }}>
              {content}
            </Link>
          ) : (
            <div key={notification.id}>{content}</div>
          );
        })}
      </ul>
    </div>
  );
}

function iconFor(type: Notification["type"]) {
  if (type === "join_request") return UserPlus;
  if (type === "membership_approved") return CheckCircle2;
  if (type === "membership_rejected") return XCircle;
  return AlertCircle;
}

function formatNotificationDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

function MockNotifications() {
  return (
    <div className="flex flex-col px-5 pt-12">
      <h1 className="font-display text-2xl font-bold tracking-tight">Notifications</h1>
      <p className="text-xs text-muted-foreground">Stay updated on your circles</p>
      <ul className="mt-6 flex flex-col gap-3">
        {mockNotifications.map((notification) => (
          <li
            key={notification.id}
            className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <p className="font-display text-sm font-semibold">{notification.title}</p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">{notification.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
