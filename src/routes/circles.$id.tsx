import { createFileRoute, notFound } from "@tanstack/react-router";
import { getCircle } from "@/lib/mock-data";
import { isSupabaseConfigured } from "@/lib/supabase";
import { requireAuth } from "@/lib/phone-guard";
import { CircleDetailsContent } from "@/routes/circle.$id";

export const Route = createFileRoute("/circles/$id")({
  beforeLoad: requireAuth,
  loader: async ({ params }) => {
    if (!isSupabaseConfigured) {
      const circle = getCircle(params.id);
      if (!circle) throw notFound();
      return { circleId: params.id, mockCircle: circle };
    }

    return { circleId: params.id, mockCircle: null };
  },
  component: CircleDetailsRoute,
  notFoundComponent: () => (
    <div className="p-8 text-center text-sm text-muted-foreground">Circle not found.</div>
  ),
});

function CircleDetailsRoute() {
  const { circleId, mockCircle } = Route.useLoaderData();
  return <CircleDetailsContent circleId={circleId} mockCircle={mockCircle} />;
}
