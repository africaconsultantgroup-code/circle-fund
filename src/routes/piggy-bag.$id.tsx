import { createFileRoute } from "@tanstack/react-router";
import { PiggyBagDetailPage } from "@/customer/pages/PiggyBagDetailPage";
import { requireVerifiedPhone } from "@/lib/phone-guard";

export const Route = createFileRoute("/piggy-bag/$id")({
  beforeLoad: requireVerifiedPhone,
  component: PiggyBagDetailRoute,
});

function PiggyBagDetailRoute() {
  const { id } = Route.useParams();
  return <PiggyBagDetailPage planId={id} />;
}
