import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/auth/callback")({
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search.code === "string" ? search.code : undefined,
    next: typeof search.next === "string" ? search.next : "/verify/phone",
  }),
  beforeLoad: async ({ search }) => {
    if (search.code) {
      const { error } = await supabase.auth.exchangeCodeForSession(search.code);
      if (error) {
        throw redirect({
          to: "/login",
          search: { error: "email_confirmation_failed" },
        });
      }
    }

    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({
        to: "/login",
        search: { error: "session_missing" },
      });
    }

    throw redirect({ to: search.next || "/verify/phone" });
  },
});
