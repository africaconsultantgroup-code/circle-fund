export type ScheduledPaymentProviderRequest = {
  scheduledPaymentId: string;
  userId: string;
  amount: number;
  currency: string;
  paymentMethod: "mobile_money" | "wallet";
  phoneNumber?: string | null;
  authorizationReference?: string | null;
};

export type ScheduledPaymentProviderResult =
  | { ok: true; providerReference: string; status: "processing" }
  | {
      ok: false;
      code: "provider_recurring_not_configured" | "wallet_automation_not_configured";
      status: "due";
      message: string;
    };

export interface ScheduledPaymentProvider {
  initiateScheduledPayment(
    request: ScheduledPaymentProviderRequest,
  ): Promise<ScheduledPaymentProviderResult>;
}

class ProviderIndependentScheduledPaymentService implements ScheduledPaymentProvider {
  async initiateScheduledPayment(
    request: ScheduledPaymentProviderRequest,
  ): Promise<ScheduledPaymentProviderResult> {
    if (request.paymentMethod === "wallet") {
      return {
        ok: false,
        code: "wallet_automation_not_configured",
        status: "due",
        message:
          "Automatic wallet deductions are not enabled. Payment is due and must be authorized.",
      };
    }

    return {
      ok: false,
      code: "provider_recurring_not_configured",
      status: "due",
      message:
        "Recurring Mobile Money authorization is not configured. Payment is due and must be authorized.",
    };
  }
}

export function scheduledPaymentProvider(): ScheduledPaymentProvider {
  return new ProviderIndependentScheduledPaymentService();
}
