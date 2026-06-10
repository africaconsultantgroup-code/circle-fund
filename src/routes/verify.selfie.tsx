import { createFileRoute } from "@tanstack/react-router";
import { VerifySelfiePage } from "@/customer/pages/verification/VerifySelfiePage";

export const Route = createFileRoute("/verify/selfie")({
  component: VerifySelfiePage,
});
