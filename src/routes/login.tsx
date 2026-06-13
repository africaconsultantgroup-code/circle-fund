import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent, type ChangeEventHandler, type ReactNode } from "react";
import { Coins, Eye, EyeOff, Mail, Lock } from "lucide-react";
import { signInWithPassword } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("adjoa@sikacircle.app");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signInWithPassword(email, password);
    setLoading(false);

    if (result.error) {
      setError(result.error.message || "Unable to sign in.");
      return;
    }

    const redirectTo = new URLSearchParams(window.location.search).get("redirect");
    if (redirectTo?.startsWith("/")) {
      window.location.assign(redirectTo);
      return;
    }

    navigate({ to: "/home" });
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background px-6 pt-12 pb-8">
      <div className="mb-10 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-primary shadow-card">
          <Coins className="h-6 w-6 text-primary-foreground" />
        </div>
        <div>
          <h2 className="font-display text-lg font-semibold">SikaCircle</h2>
          <p className="text-xs text-muted-foreground">Trusted group savings</p>
        </div>
      </div>

      <h1 className="font-display text-3xl font-bold tracking-tight">Welcome back</h1>
      <p className="mt-2 text-sm text-muted-foreground">Sign in to continue contributing to your circles.</p>

      <form className="mt-8 flex flex-col gap-4" onSubmit={handleSubmit}>
        <Field
          icon={<Mail className="h-4 w-4" />}
          label="Email"
          type="email"
          placeholder="adjoa@sikacircle.app"
          name="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <div>
          <label className="text-xs font-medium text-muted-foreground">Password</label>
          <div className="mt-1.5 flex items-center gap-2 rounded-2xl border border-input bg-muted/40 px-4 py-3.5">
            <Lock className="h-4 w-4 text-muted-foreground" />
            <input
              name="password"
              type={show ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <button type="button" onClick={() => setShow((s) => !s)} className="text-muted-foreground">
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs">
          <label className="flex items-center gap-2 text-muted-foreground">
            <input type="checkbox" className="h-4 w-4 rounded border-input accent-[color:var(--primary)]" defaultChecked />
            Remember me
          </label>
          <Link to="/login" className="font-medium text-primary">
            Forgot password?
          </Link>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-4 rounded-2xl bg-gradient-primary py-4 font-display text-base font-semibold text-primary-foreground shadow-card transition-transform active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> or continue with <span className="h-px flex-1 bg-border" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button className="rounded-2xl border border-border bg-background py-3 text-sm font-medium">Google</button>
        <button className="rounded-2xl border border-border bg-background py-3 text-sm font-medium">Apple</button>
      </div>

      <p className="mt-auto pt-8 text-center text-sm text-muted-foreground">
        New to SikaCircle?{" "}
        <Link to="/register" className="font-semibold text-primary">Create an account</Link>
      </p>
    </div>
  );
}

export function Field({
  icon,
  label,
  type = "text",
  placeholder,
  defaultValue,
  value,
  name,
  onChange,
  suffix,
}: {
  icon?: ReactNode;
  label: string;
  type?: string;
  placeholder?: string;
  defaultValue?: string;
  value?: string;
  name?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  suffix?: string;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="mt-1.5 flex items-center gap-2 rounded-2xl border border-input bg-muted/40 px-4 py-3.5">
        {icon && <span className="text-muted-foreground">{icon}</span>}
        <input
          name={name}
          type={type}
          placeholder={placeholder}
          defaultValue={defaultValue}
          value={value}
          onChange={onChange}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {suffix && <span className="text-xs font-semibold text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}
