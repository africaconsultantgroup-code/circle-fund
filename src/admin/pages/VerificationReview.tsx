import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import { getAdminOverview, markTestUserVerified, type AdminUser } from "@/admin/api";

export function VerificationReview() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [adminSecret, setAdminSecret] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadUsers = async () => {
    setIsLoading(true);
    const { data, error } = await getAdminOverview();
    setUsers(data?.users ?? []);
    setError(error?.message ?? "");
    setIsLoading(false);
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleMarkVerified = async (userId: string) => {
    setError("");
    setMessage("");
    setBusyUserId(userId);

    const { data, error } = await markTestUserVerified(userId, adminSecret);
    setBusyUserId("");

    if (error) {
      setError(error.message);
      return;
    }

    setMessage(`Test user marked verified. Reference: ${data?.providerReference ?? "n/a"}`);
    await loadUsers();
  };

  return (
    <section>
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Verification Review</h1>
        <p className="mt-2 text-sm text-muted-foreground">Review phone, Ghana Card, and face verification status. Test verification requires the admin override secret.</p>
      </div>

      <div className="mt-5 rounded-2xl border border-border bg-card p-4 shadow-card">
        <label className="text-xs font-medium text-muted-foreground">Admin test override secret</label>
        <input
          value={adminSecret}
          onChange={(event) => setAdminSecret(event.target.value)}
          type="password"
          placeholder="Required for test verification only"
          className="mt-1.5 w-full rounded-2xl border border-input bg-muted/40 px-4 py-3.5 text-sm outline-none"
        />
      </div>

      {message && (
        <div className="mt-5 flex items-center gap-2 rounded-2xl border border-success/30 bg-success/10 p-4 text-success">
          <CheckCircle2 className="h-4 w-4" />
          <p className="text-sm font-medium">{message}</p>
        </div>
      )}

      {error && (
        <div className="mt-5 flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-destructive">
          <ShieldAlert className="mt-0.5 h-4 w-4" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {isLoading ? (
        <div className="mt-5 flex items-center justify-center gap-2 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-card">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading verification queue
        </div>
      ) : (
        <ul className="mt-5 flex flex-col gap-3">
          {users.map((user) => (
            <li key={user.userId} className="rounded-2xl border border-border bg-card p-4 shadow-card">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-display text-sm font-semibold">{user.fullName || user.email || "Unnamed user"}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{user.email || user.userId}</p>
                </div>
                <button
                  disabled={!adminSecret || busyUserId === user.userId}
                  onClick={() => handleMarkVerified(user.userId)}
                  className="rounded-xl bg-gradient-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {busyUserId === user.userId ? "Updating..." : "Mark test verified"}
                </button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
                <VerificationBit label="Phone" verified={Boolean(user.verification?.phone_verified)} />
                <VerificationBit label="Ghana Card" verified={Boolean(user.verification?.ghana_card_verified)} />
                <VerificationBit label="Face" verified={Boolean(user.verification?.face_verified)} />
                <VerificationBit label="Overall" verified={user.verification?.verification_status === "verified"} value={user.verification?.verification_status ?? "not_started"} />
              </div>
            </li>
          ))}
          {users.length === 0 && (
            <li className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground shadow-card">
              No users found.
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

function VerificationBit({ label, verified, value }: { label: string; verified: boolean; value?: string }) {
  return (
    <div className="rounded-xl bg-muted/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-xs font-semibold ${verified ? "text-success" : "text-muted-foreground"}`}>
        {value ? value.replace("_", " ") : verified ? "verified" : "not verified"}
      </p>
    </div>
  );
}
