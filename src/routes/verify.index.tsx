import { createFileRoute } from "@tanstack/react-router";
import { VerifyIndexPage } from "@/customer/pages/verification/VerifyIndexPage";

export const Route = createFileRoute("/verify/")({
  component: VerifyIndexPage,
});
