import { createFileRoute } from "@tanstack/react-router";
import { CreatePiggyBagPage } from "@/customer/pages/CreatePiggyBagPage";
import { requireVerifiedPhone } from "@/lib/phone-guard";

export const Route = createFileRoute("/piggy-bag/create")({
  beforeLoad: requireVerifiedPhone,
  component: CreatePiggyBagPage,
});
