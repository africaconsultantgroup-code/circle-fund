import { createFileRoute } from "@tanstack/react-router";
import { Bell, Coins, UserPlus, AlertCircle } from "lucide-react";
import { notifications } from "@/lib/mock-data";

export const Route = createFileRoute("/_app/notifications")({
  component: NotificationsPage,
});

const iconFor = (type: string) => {
  if (type === "payout") return Coins;
  if (type === "join") return UserPlus;
  if (type === "reminder") return Bell;
  return AlertCircle;
};

function NotificationsPage() {
  return (
    <div className="flex flex-col px-5 pt-12">
      <h1 className="font-display text-2xl font-bold tracking-tight">Notifications</h1>
      <p className="text-xs text-muted-foreground">Stay updated on your circles</p>

      <ul className="mt-6 flex flex-col gap-3">
        {notifications.map((n) => {
          const Icon = iconFor(n.type);
          return (
            <li
              key={n.id}
              className={`flex items-start gap-3 rounded-2xl border p-4 ${
                n.read ? "border-border bg-card" : "border-primary/20 bg-secondary/40"
              }`}
            >
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${n.read ? "bg-muted text-muted-foreground" : "bg-gradient-primary text-primary-foreground"}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-display text-sm font-semibold">{n.title}</p>
                  {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gold" />}
                </div>
                <p className="mt-0.5 text-[12px] text-muted-foreground">{n.body}</p>
                <p className="mt-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">{n.time}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}