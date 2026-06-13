import { createFileRoute } from "@tanstack/react-router";
import { VerifyStatusPage } from "@/customer/pages/verification/VerifyStatusPage";
import { requireAuth } from "@/lib/phone-guard";

export const Route = createFileRoute("/verify/status")({
  beforeLoad: requireAuth,
  component: VerifyStatusPage,
});
