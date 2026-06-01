import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Coins, ShieldCheck, Users } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SikaCircle — Digital Susu Made Simple" },
      { name: "description", content: "Save together with friends, family and coworkers through trusted digital susu circles." },
      { property: "og:title", content: "SikaCircle" },
      { property: "og:description", content: "Digital susu platform for trusted group savings." },
    ],
  }),
  component: Splash,
});

function Splash() {
  const navigate = useNavigate();
  useEffect(() => {
    const t = setTimeout(() => navigate({ to: "/login" }), 2400);
    return () => clearTimeout(t);
  }, [navigate]);

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-between overflow-hidden bg-gradient-card px-6 py-12 text-primary-foreground">
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-primary-glow/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-20 h-80 w-80 rounded-full bg-gold/30 blur-3xl" />

      <div className="flex-1" />

      <div className="relative z-10 flex flex-col items-center text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-gold shadow-elevated">
          <Coins className="h-10 w-10 text-gold-foreground" strokeWidth={2.4} />
        </div>
        <h1 className="font-display text-4xl font-bold tracking-tight">SikaCircle</h1>
        <p className="mt-2 text-sm text-primary-foreground/70">Save together. Win together.</p>
      </div>

      <div className="relative z-10 mt-12 flex w-full flex-col gap-6">
        <div className="flex items-center justify-around text-xs text-primary-foreground/80">
          <div className="flex flex-col items-center gap-1">
            <Users className="h-5 w-5" />
            <span>Trusted circles</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <ShieldCheck className="h-5 w-5" />
            <span>Bank-grade</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <Coins className="h-5 w-5" />
            <span>Auto payouts</span>
          </div>
        </div>
        <Link
          to="/login"
          className="rounded-2xl bg-gradient-gold py-4 text-center font-display text-base font-semibold text-gold-foreground shadow-elevated"
        >
          Get Started
        </Link>
        <div className="flex items-center justify-center gap-1.5 pt-2">
          <span className="h-1.5 w-6 rounded-full bg-primary-foreground/80" />
          <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground/30" />
          <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground/30" />
        </div>
      </div>
    </div>
  );
}
