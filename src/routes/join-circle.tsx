import { createFileRoute } from "@tanstack/react-router";
import { JoinCirclePage } from "@/customer/pages/JoinCirclePage";
import { requireVerifiedPhone } from "@/lib/phone-guard";

export const Route = createFileRoute("/join-circle")({
  beforeLoad: requireVerifiedPhone,
  component: JoinCirclePage,
});
