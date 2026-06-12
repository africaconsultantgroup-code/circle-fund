import { createFileRoute } from "@tanstack/react-router";
import { PiggyBagPage } from "@/customer/pages/PiggyBagPage";

export const Route = createFileRoute("/_app/piggy-bag")({
  component: PiggyBagPage,
});
