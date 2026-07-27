import { useEffect, useMemo, useState } from "react";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import {
  getCircleProtectedFundSummary,
  getCustomerProtectedFundSummary,
  getPiggyProtectedFunds,
  type ProtectedFund,
} from "@/lib/protected-funds";
import { formatCurrency } from "@/lib/diaspora";
import type { CurrencyCode } from "@/lib/supabase-types";

type Props =
  | { scope: "customer" }
  | { scope: "circle"; circleId: string }
  | { scope: "piggy"; piggyId: string; maturityDate: string };

export function ProtectedFundsCard(props: Props) {
  const [values, setValues] = useState<Array<{ label: string; value: number }>>([]);
  const [currency, setCurrency] = useState("GHS");
  const [funds, setFunds] = useState<ProtectedFund[]>([]);
  const scope = props.scope;
  const circleId = props.scope === "circle" ? props.circleId : null;
  const piggyId = props.scope === "piggy" ? props.piggyId : null;

  useEffect(() => {
    if (scope === "customer") {
      void getCustomerProtectedFundSummary().then(({ data }) => {
        if (!data) return;
        setCurrency(data.currency || "GHS");
        setValues([
          { label: "Available Balance", value: Number(data.available_wallet_balance) },
          { label: "Protected Circle", value: Number(data.protected_circle_funds) },
          { label: "Protected Piggy", value: Number(data.protected_piggy_funds) },
          { label: "Pending Payments", value: Number(data.pending_balance) },
          { label: "Matured / Awaiting Release", value: Number(data.matured_eligible_balance) },
          { label: "Frozen", value: Number(data.frozen_balance) },
        ]);
      });
    } else if (scope === "circle" && circleId) {
      void getCircleProtectedFundSummary(circleId).then(({ data }) => {
        if (!data) return;
        setValues([
          { label: "Total Protected", value: Number(data.total_protected) },
          { label: "Pending", value: Number(data.pending) },
          { label: "Frozen", value: Number(data.frozen) },
          { label: "Matured", value: Number(data.matured) },
          { label: "Released", value: Number(data.released) },
          { label: "Remaining Protected", value: Number(data.remaining_protected) },
          { label: "My Protected Contributions", value: Number(data.my_protected) },
        ]);
      });
    } else {
      void getPiggyProtectedFunds(piggyId!).then(({ data }) => setFunds(data ?? []));
    }
  }, [scope, circleId, piggyId]);

  const piggyValues = useMemo(() => {
    if (props.scope !== "piggy") return [];
    const sum = (statuses: string[]) =>
      funds
        .filter((fund) => statuses.includes(fund.status))
        .reduce((total, fund) => total + Number(fund.amount), 0);
    return [
      {
        label: "Protected Balance",
        value: sum(["protected", "frozen", "matured", "release_pending"]),
      },
      { label: "Frozen", value: sum(["frozen"]) },
      { label: "Matured / Eligible", value: sum(["matured"]) },
      { label: "Available Today", value: 0 },
    ];
  }, [funds, props.scope]);

  const displayedValues = props.scope === "piggy" ? piggyValues : values;
  const title =
    props.scope === "circle"
      ? "Protected Circle Fund"
      : props.scope === "piggy"
        ? "Protected Savings"
        : "Your protected funds";
  const description =
    props.scope === "circle"
      ? "Confirmed contributions are locked according to this Circle's payout schedule."
      : props.scope === "piggy"
        ? "Your locked Piggy savings cannot be used before maturity."
        : "Available wallet money is kept separate from Circle and Piggy protected funds.";

  return (
    <section className="rounded-3xl border border-primary/15 bg-card p-4 shadow-card">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-primary">
          {props.scope === "customer" ? (
            <ShieldCheck className="h-5 w-5" />
          ) : (
            <LockKeyhole className="h-5 w-5" />
          )}
        </span>
        <div>
          <h2 className="font-display text-sm font-semibold">{title}</h2>
          <p className="mt-1 text-[11px] text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {displayedValues.map((item) => (
          <div key={item.label} className="rounded-xl bg-muted/40 p-2.5">
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{item.label}</p>
            <p className="mt-1 text-xs font-semibold">
              {formatCurrency(item.value, currency as CurrencyCode)}
            </p>
          </div>
        ))}
      </div>
      {props.scope === "piggy" && (
        <p className="mt-3 text-[10px] text-muted-foreground">
          Maturity: {new Date(`${props.maturityDate}T00:00:00`).toLocaleDateString()}
        </p>
      )}
    </section>
  );
}
