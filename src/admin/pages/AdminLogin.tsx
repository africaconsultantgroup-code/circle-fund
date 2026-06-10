import { useNavigate } from "@tanstack/react-router";
import { Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { signInWithPassword, signOut } from "@/lib/auth";
import { currentUserIsAdmin } from "@/shared/auth/roles";

export function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [unauthorized, setUnauthorized] = useState(false);

  const handleSubmit = async () => {
    setError("");
    setUnauthorized(false);
    setIsLoading(true);

    const result = await signInWithPassword(email, password);
    if (result.error || !result.data.user) {
      setIsLoading(false);
      setError(result.error?.message ?? "Unable to sign in.");
      return;
    }

    const isAdmin = await currentUserIsAdmin();
    if (!isAdmin) {
      await signOut();
      setIsLoading(false);
      setUnauthorized(true);
      return;
    }

    setIsLoading(false);
    navigate({ to: "/admin" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-elevated">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <h1 className="mt-4 font-display text-2xl font-bold tracking-tight">Admin sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">Use your SikaCircle admin account.</p>

        <div className="mt-5 flex flex-col gap-3">
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            placeholder="admin@sikacircle.com"
            className="rounded-2xl border border-input bg-muted/40 px-4 py-3.5 text-sm outline-none"
          />
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            placeholder="Password"
            className="rounded-2xl border border-input bg-muted/40 px-4 py-3.5 text-sm outline-none"
          />
        </div>

        {error && <AdminError message={error} />}
        {unauthorized && <AdminError message="Unauthorized. This account is not an admin. You have been signed out." />}

        <button
          disabled={isLoading}
          onClick={handleSubmit}
          className="mt-5 w-full rounded-2xl bg-gradient-primary py-4 font-display text-base font-semibold text-primary-foreground shadow-card disabled:opacity-50"
        >
          {isLoading ? <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Checking access</span> : "Sign in"}
        </button>
      </div>
    </div>
  );
}

function AdminError({ message }: { message: string }) {
  return (
    <div className="mt-4 flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-destructive">
      <ShieldAlert className="mt-0.5 h-4 w-4" />
      <p className="text-xs font-medium">{message}</p>
    </div>
  );
}
