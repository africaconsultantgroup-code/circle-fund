import { createFileRoute } from "@tanstack/react-router";
import { VerificationReview } from "@/admin";

export const Route = createFileRoute("/_admin/admin/verifications")({
  component: VerificationReview,
});
