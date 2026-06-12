import { createFileRoute } from "@tanstack/react-router";
import { VerifySelfiePage } from "@/customer/pages/verification/VerifySelfiePage";
import { requireVerifiedPhone } from "@/lib/phone-guard";

export const Route = createFileRoute("/verify/selfie")({
  beforeLoad: requireVerifiedPhone,
  component: VerifySelfiePage,
});
