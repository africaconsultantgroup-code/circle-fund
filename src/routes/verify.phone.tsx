import { createFileRoute } from "@tanstack/react-router";
import { VerifyPhonePage } from "@/customer/pages/verification/VerifyPhonePage";

export const Route = createFileRoute("/verify/phone")({
  component: VerifyPhonePage,
});
