import { createFileRoute } from "@tanstack/react-router";
import { VerifyProfilePage } from "@/customer/pages/verification/VerifyProfilePage";
import { requireAuth } from "@/lib/phone-guard";

export const Route = createFileRoute("/verify/profile")({
  beforeLoad: requireAuth,
  component: VerifyProfilePage,
});
