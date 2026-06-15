import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Users } from "lucide-react";
import { requireAuth } from "@/lib/phone-guard";

export const Route = createFileRoute("/circle/$id/members")({
  beforeLoad: requireAuth,
  component: MembersPage,
});

function MembersPage() {
  const { id } = Route.useParams();

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <PageHeader title="Members" subtitle="Live roster" back="/circles" />

      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="rounded-3xl border border-border bg-card p-5 text-center shadow-card">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary">
            <Users className="h-5 w-5" />
          </div>
          <p className="mt-3 font-display text-sm font-semibold">Open the circle details page</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Approved members and admin approval actions now live in the Members tab.
          </p>
        </div>

        <Link to="/circles/$id" params={{ id }} className="mt-auto rounded-2xl bg-gradient-primary py-4 text-center font-display text-sm font-semibold text-primary-foreground shadow-card">
          Open members tab
        </Link>
      </div>
    </div>
  );
}
