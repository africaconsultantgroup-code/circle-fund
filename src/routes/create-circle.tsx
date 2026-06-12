import { createFileRoute } from "@tanstack/react-router";
import { CreateCirclePage } from "@/customer/pages/CreateCirclePage";
import { requireVerifiedPhone } from "@/lib/phone-guard";

export const Route = createFileRoute("/create-circle")({
  beforeLoad: requireVerifiedPhone,
  component: CreateCirclePage,
});
