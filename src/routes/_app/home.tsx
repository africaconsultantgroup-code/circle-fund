import { createFileRoute } from "@tanstack/react-router";
import { HomePage } from "@/customer/pages/HomePage";

export const Route = createFileRoute("/_app/home")({
  component: HomePage,
});
