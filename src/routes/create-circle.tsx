import { createFileRoute } from "@tanstack/react-router";
import { CreateCirclePage } from "@/customer/pages/CreateCirclePage";
import { requireAuth } from "@/lib/phone-guard";

export const Route = createFileRoute("/create-circle")({
  beforeLoad: requireAuth,
  component: CreateCirclePage,
});
