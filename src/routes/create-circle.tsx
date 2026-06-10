import { createFileRoute } from "@tanstack/react-router";
import { CreateCirclePage } from "@/customer/pages/CreateCirclePage";

export const Route = createFileRoute("/create-circle")({
  component: CreateCirclePage,
});
