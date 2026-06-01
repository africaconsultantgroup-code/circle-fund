import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  back = "/home",
  right,
}: {
  title: string;
  subtitle?: string;
  back?: string;
  right?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
      <Link
        to={back}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-secondary"
        aria-label="Back"
      >
        <ArrowLeft className="h-5 w-5" />
      </Link>
      <div className="flex-1 text-center">
        <h1 className="font-display text-base font-semibold leading-tight">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="flex h-10 w-10 items-center justify-center">{right}</div>
    </header>
  );
}