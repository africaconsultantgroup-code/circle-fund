import { createFileRoute } from "@tanstack/react-router";
import { VerifyStatusPage } from "@/customer/pages/verification/VerifyStatusPage";

export const Route = createFileRoute("/verify/status")({
  component: VerifyStatusPage,
});
