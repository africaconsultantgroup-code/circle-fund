export type PayoutProviderRequest = {
  releaseId: string;
  releaseReference: string;
  beneficiaryUserId: string;
  amount: number;
  currency: string;
  destinationType: "mobile_money";
  destinationReference: string;
};

export type PayoutProviderResult =
  | {
      ok: true;
      status: "provider_processing";
      providerRequestReference: string;
    }
  | {
      ok: false;
      code: "payout_execution_preview_only" | "hubtel_disbursement_not_configured";
      status: "release_pending";
      message: string;
    };

export interface PayoutProvider {
  preparePayout(request: PayoutProviderRequest): Promise<PayoutProviderResult>;
  initiateDisbursement(request: PayoutProviderRequest): Promise<PayoutProviderResult>;
  verifyDisbursement(providerRequestReference: string): Promise<PayoutProviderResult>;
}

class PreviewOnlyPayoutProvider implements PayoutProvider {
  async preparePayout(_request: PayoutProviderRequest): Promise<PayoutProviderResult> {
    return {
      ok: false,
      code: "payout_execution_preview_only",
      status: "release_pending",
      message: "Payout execution is in preview mode. No provider request was sent.",
    };
  }

  async initiateDisbursement(_request: PayoutProviderRequest): Promise<PayoutProviderResult> {
    return {
      ok: false,
      code: "hubtel_disbursement_not_configured",
      status: "release_pending",
      message: "Hubtel disbursement has not been verified or configured.",
    };
  }

  async verifyDisbursement(_providerRequestReference: string): Promise<PayoutProviderResult> {
    return {
      ok: false,
      code: "hubtel_disbursement_not_configured",
      status: "release_pending",
      message: "Hubtel disbursement status verification is not configured.",
    };
  }
}

export function payoutProvider(): PayoutProvider {
  return new PreviewOnlyPayoutProvider();
}
