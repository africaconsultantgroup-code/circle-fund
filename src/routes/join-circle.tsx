import { createFileRoute } from "@tanstack/react-router";
import { JoinCirclePage } from "@/customer/pages/JoinCirclePage";

export const Route = createFileRoute("/join-circle")({
  component: JoinCirclePage,
});
