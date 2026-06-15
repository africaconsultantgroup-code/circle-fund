import { createFileRoute } from "@tanstack/react-router";
import { CapacityReviewPage } from "@/admin";

export const Route = createFileRoute("/_admin/admin/capacity")({
  component: CapacityReviewPage,
});
