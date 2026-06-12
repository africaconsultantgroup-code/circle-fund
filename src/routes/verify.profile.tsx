import { createFileRoute } from "@tanstack/react-router";
import { VerifyProfilePage } from "@/customer/pages/verification/VerifyProfilePage";
import { requireVerifiedPhone } from "@/lib/phone-guard";

export const Route = createFileRoute("/verify/profile")({
  beforeLoad: requireVerifiedPhone,
  component: VerifyProfilePage,
});
