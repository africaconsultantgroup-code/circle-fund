import { createFileRoute } from "@tanstack/react-router";
import { VerifyProfilePage } from "@/customer/pages/verification/VerifyProfilePage";

export const Route = createFileRoute("/verify/profile")({
  component: VerifyProfilePage,
});
