import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { CheckCircle2, Database, RefreshCw, XCircle } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export const Route = createFileRoute("/supabase-health")({
  component: SupabaseHealthPage,
});

type HealthStatus = "idle" | "loading" | "success" | "error";

function SupabaseHealthPage() {
  const [status, setStatus] = useState<HealthStatus>("idle");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function testAppConnection() {
    setStatus("loading");
    setError(null);

    if (!isSupabaseConfigured) {
      setRows([]);
      setStatus("error");
      setError("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      return;
    }

    const { data, error: queryError } = await supabase
      .from("app_connection_tests")
      .select("*")
      .limit(20);

    if (queryError) {
      setRows([]);
      setStatus("error");
      setError(queryError.message);
      return;
    }

    setRows((data ?? []) as Record<string, unknown>[]);
    setStatus("success");
  }

  useEffect(() => {
    void testAppConnection();
  }, []);

  const isLoading = status === "loading";
  const isSuccess = status === "success";
  const isError = status === "error";

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <PageHeader title="Supabase Health" back="/" />

      <main className="flex flex-1 flex-col gap-4 px-5 py-6">
        <section className="rounded-3xl border bg-card p-5 shadow-card">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-primary/10 p-3 text-primary">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <p className="font-display text-lg font-semibold">App connection test</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Reads from <code className="rounded bg-muted px-1 py-0.5">app_connection_tests</code> only.
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-2xl bg-muted/50 p-4">
            {isLoading ? (
              <StatusLine icon={<RefreshCw className="h-4 w-4 animate-spin" />} text="Testing connection..." />
            ) : isSuccess ? (
              <StatusLine
                icon={<CheckCircle2 className="h-4 w-4 text-success" />}
                text={`Connection passed. ${rows.length} row${rows.length === 1 ? "" : "s"} returned.`}
              />
            ) : isError ? (
              <StatusLine icon={<XCircle className="h-4 w-4 text-destructive" />} text={error ?? "Connection failed."} />
            ) : (
              <StatusLine icon={<Database className="h-4 w-4" />} text="Ready to test." />
            )}
          </div>

          <button
            type="button"
            onClick={() => void testAppConnection()}
            disabled={isLoading}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-primary py-3 font-display text-sm font-semibold text-primary-foreground shadow-card disabled:cursor-not-allowed disabled:opacity-70"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Run test
          </button>
        </section>

        {isSuccess ? (
          <section className="rounded-3xl border bg-card p-5 shadow-card">
            <p className="font-display text-base font-semibold">Returned rows</p>
            <pre className="mt-3 max-h-96 overflow-auto rounded-2xl bg-muted p-4 text-xs text-muted-foreground">
              {JSON.stringify(rows, null, 2)}
            </pre>
          </section>
        ) : null}
      </main>
    </div>
  );
}

function StatusLine({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>{text}</span>
    </div>
  );
}
