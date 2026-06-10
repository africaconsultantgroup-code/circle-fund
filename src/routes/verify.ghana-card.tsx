import { createFileRoute } from "@tanstack/react-router";
import { VerifyGhanaCardPage } from "@/customer/pages/verification/VerifyGhanaCardPage";

export const Route = createFileRoute("/verify/ghana-card")({
  component: VerifyGhanaCardPage,
});
