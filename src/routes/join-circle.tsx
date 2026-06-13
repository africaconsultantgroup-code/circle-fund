import { createFileRoute } from "@tanstack/react-router";
import { JoinCirclePage } from "@/customer/pages/JoinCirclePage";
import { requireAuth } from "@/lib/phone-guard";

export const Route = createFileRoute("/join-circle")({
  beforeLoad: ({ location }) => requireAuth(location.href),
  component: JoinCirclePage,
});
