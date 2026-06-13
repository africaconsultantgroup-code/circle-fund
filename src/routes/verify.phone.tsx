import { createFileRoute } from "@tanstack/react-router";
import { VerifyPhonePage } from "@/customer/pages/verification/VerifyPhonePage";
import { requireAuth } from "@/lib/phone-guard";

export const Route = createFileRoute("/verify/phone")({
  beforeLoad: requireAuth,
  component: VerifyPhonePage,
});
