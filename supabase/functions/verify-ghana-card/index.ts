import {
  getAuthedServiceClient,
  hashSensitiveValue,
  isOptions,
  json,
  providerReference,
  corsHeaders,
} from "../_shared/verification.ts";

Deno.serve(async (req) => {
  if (isOptions(req)) return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed." }, 405);
    }

    const { user, serviceClient, error } = await getAuthedServiceClient(req);
    if (error) return error;

    const { ghanaCardNumber } = await req.json();
    const normalizedCardNumber =
      typeof ghanaCardNumber === "string" ? ghanaCardNumber.trim().toUpperCase() : "";
    if (!isValidGhanaCardNumber(normalizedCardNumber)) {
      return json({
        ok: false,
        error: "Enter a valid Ghana Card number, for example GHA-123456789-1.",
      });
    }

    const { data: testAccount, error: testAccountError } = await serviceClient
      .from("app_test_accounts")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (testAccountError) return json({ ok: false, error: testAccountError.message }, 500);

    const isTestAccount = Boolean(testAccount);
    const isDummyCard = isDummyGhanaCardNumber(normalizedCardNumber);
    if (isDummyCard && !isTestAccount) {
      return json(
        {
          ok: false,
          error: "Dummy Ghana Card numbers are restricted to designated test accounts.",
        },
        403,
      );
    }

    const reference = providerReference(isDummyCard ? "ghana_card_test" : "ghana_card_review");
    const ghanaCardNumberHash = await hashSensitiveValue(normalizedCardNumber);
    const failureReason = "Live Ghana Card provider is not connected. Submitted for admin review.";
    const { data: existingVerification, error: existingVerificationError } = await serviceClient
      .from("user_verifications")
      .select("ghana_card_verified, face_verified, verification_status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingVerificationError)
      return json({ ok: false, error: existingVerificationError.message }, 500);

    const cardAlreadyVerified = existingVerification?.ghana_card_verified === true;
    const status = isDummyCard
      ? existingVerification?.face_verified
        ? "verified"
        : "pending"
      : resolveAggregateStatus(existingVerification);
    const ghanaCardStatus = isDummyCard || cardAlreadyVerified ? "verified" : "pending";

    const { error: upsertError } = await serviceClient.from("user_verifications").upsert(
      {
        user_id: user.id,
        ghana_card_number_hash: ghanaCardNumberHash,
        ghana_card_verified: isDummyCard || cardAlreadyVerified,
        ghana_card_status: ghanaCardStatus,
        verification_provider: isDummyCard ? "test_dummy_ghana_card" : "admin_review",
        provider_reference: reference,
        verification_status: status,
        is_test_verification: isDummyCard || undefined,
        failure_reason: isDummyCard
          ? "Test Ghana Card verification. Real money movement remains disabled."
          : status === "verified"
            ? null
            : failureReason,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    if (upsertError) {
      return json({
        ok: false,
        error: upsertError.message,
      });
    }

    if (isDummyCard) {
      await serviceClient.from("audit_logs").insert({
        staff_user_id: user.id,
        action: "test_ghana_card_verified",
        target_type: "user_verification",
        target_id: user.id,
        notes: "Designated test account used an approved dummy Ghana Card number.",
        metadata: {
          test_account: true,
          provider_reference: reference,
          real_money_movement_allowed: false,
        },
      });
    }

    return json({
      ok: true,
      status,
      providerReference: reference,
      message: isDummyCard
        ? "Test Ghana Card accepted. Real money movement remains disabled."
        : "Ghana Card submitted for review.",
      isTestVerification: isDummyCard,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    return json({ ok: false, error: message });
  }
});

function resolveAggregateStatus(
  existingVerification: {
    ghana_card_verified: boolean;
    face_verified: boolean;
    verification_status: string;
  } | null,
) {
  if (
    existingVerification?.ghana_card_verified &&
    existingVerification.face_verified &&
    existingVerification.verification_status === "verified"
  ) {
    return "verified";
  }

  return existingVerification?.verification_status === "manual_review"
    ? "manual_review"
    : "pending";
}

function isValidGhanaCardNumber(value: string) {
  return /^GHA-\d{9}-\d$/.test(value) || /^GHA\d{10}$/.test(value);
}

function isDummyGhanaCardNumber(value: string) {
  return value === "GHA-000000000-0" || value === "GHA-999999999-9";
}
