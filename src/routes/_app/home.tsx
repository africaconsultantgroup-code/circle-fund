import { createFileRoute } from "@tanstack/react-router";
import { SimplifiedHomePage } from "@/customer/pages/SimplifiedHomePage";

export const Route = createFileRoute("/_app/home")({
  component: SimplifiedHomePage,
});
