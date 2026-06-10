import { createFileRoute } from "@tanstack/react-router";
import { CirclesPage } from "@/customer/pages/CirclesPage";

export const Route = createFileRoute("/_app/circles")({
  component: CirclesPage,
});
