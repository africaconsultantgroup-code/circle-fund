import { createFileRoute } from "@tanstack/react-router";
import { VerifyGhanaCardPage } from "@/customer/pages/verification/VerifyGhanaCardPage";
import { requireVerifiedPhone } from "@/lib/phone-guard";

export const Route = createFileRoute("/verify/ghana-card")({
  beforeLoad: requireVerifiedPhone,
  component: VerifyGhanaCardPage,
});
