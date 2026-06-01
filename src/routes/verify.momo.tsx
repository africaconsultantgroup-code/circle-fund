import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Smartphone, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import type { MomoNetwork } from "@/lib/mock-data";

export const Route = createFileRoute("/verify/momo")({
  component: MomoVerify,
});

const networks: { id: MomoNetwork; color: string }[] = [
  { id: "MTN", color: "bg-yellow-400" },
  { id: "Telecel", color: "bg-red-500" },
  { id: "AirtelTigo", color: "bg-blue-500" },
];

function MomoVerify() {
  const navigate = useNavigate();
  const [net, setNet] = useState<MomoNetwork>("MTN");
  const [confirmed, setConfirmed] = useState(false);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <PageHeader title="Mobile Money" subtitle="Step 4 of 5" back="/verify" />

      <div className="flex flex-1 flex-col gap-5 p-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-primary">
          <Smartphone className="h-6 w-6" />
        </div>
        <div>
          <h2 className="font-display text-xl font-bold">Link your MoMo wallet</h2>
          <p className="mt-1 text-sm text-muted-foreground">Contributions and payouts go through this wallet. Name must match your Ghana Card.</p>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">Network</label>
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            {networks.map((n) => (
              <button
                key={n.id}
                onClick={() => setNet(n.id)}
                className={`flex flex-col items-center gap-2 rounded-2xl border p-3 ${
                  net === n.id ? "border-primary bg-secondary" : "border-border bg-card"
                }`}
              >
                <span className={`flex h-9 w-9 items-center justify-center rounded-full ${n.color} text-[10px] font-bold text-white`}>{n.id.slice(0, 3)}</span>
                <span className="text-[11px] font-semibold">{n.id}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">MoMo number</label>
          <div className="mt-1.5 flex items-center gap-2 rounded-2xl border border-input bg-muted/40 px-4 py-3.5">
            <span className="rounded-lg bg-card px-2 py-1 text-sm font-semibold">+233</span>
            <input defaultValue="24 555 0142" className="flex-1 bg-transparent text-sm outline-none" />
          </div>
        </div>

        {confirmed && (
          <div className="flex items-center gap-3 rounded-2xl border border-success/30 bg-success/5 p-4 text-success">
            <CheckCircle2 className="h-5 w-5" />
            <div>
              <p className="font-display text-sm font-semibold">ADJOA M. — {net}</p>
              <p className="text-[11px] opacity-80">Wallet name matches your Ghana Card.</p>
            </div>
          </div>
        )}

        <div className="mt-auto flex flex-col gap-3">
          {!confirmed ? (
            <button onClick={() => setConfirmed(true)} className="rounded-2xl border border-primary py-4 font-display text-base font-semibold text-primary">
              Confirm ownership
            </button>
          ) : (
            <button onClick={() => navigate({ to: "/verify/guarantor" })} className="rounded-2xl bg-gradient-primary py-4 font-display text-base font-semibold text-primary-foreground shadow-card">
              Continue
            </button>
          )}
        </div>
      </div>
    </div>
  );
}