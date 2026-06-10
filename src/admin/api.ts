import { supabase } from "@/lib/supabase";

export type AdminUserVerification = {
  user_id: string;
  phone_verified: boolean;
  ghana_card_verified: boolean;
  face_verified: boolean;
  selfie_uploaded: boolean;
  verification_status: string;
  provider_reference: string | null;
  verified_at: string | null;
  updated_at: string | null;
};

export type AdminUser = {
  userId: string;
  email: string | null;
  fullName: string | null;
  phone: string | null;
  role: string;
  accountStatus: string;
  profileCompleted: boolean;
  createdAt: string | null;
  verification: AdminUserVerification | null;
};

type AdminFunctionResult<T> = {
  data: T | null;
  error: { message: string } | null;
};

export async function listAdminUsers() {
  return invokeAdminFunction<{ users: AdminUser[] }>("admin-list-users");
}

export async function markTestUserVerified(userId: string, adminSecret: string) {
  return invokeAdminFunction<{ status: string; providerReference: string }>("admin-mark-test-user-verified", {
    method: "POST",
    body: { userId },
    headers: {
      "x-admin-verification-secret": adminSecret,
    },
  });
}

async function invokeAdminFunction<T>(functionName: string, options?: Parameters<typeof supabase.functions.invoke<T>>[1]): Promise<AdminFunctionResult<T>> {
  try {
    const { data, error } = await supabase.functions.invoke<T>(functionName, options);
    if (error) {
      const message = await describeFunctionError(functionName, error);
      console.error("[admin edge function error]", { functionName, error, message });
      return { data: null, error: { message } };
    }

    return { data, error: null };
  } catch (error) {
    const message = await describeFunctionError(functionName, error);
    console.error("[admin edge function exception]", { functionName, error, message });
    return { data: null, error: { message } };
  }
}

async function describeFunctionError(functionName: string, error: unknown) {
  const details: string[] = [];
  const errorLike = error as {
    name?: string;
    message?: string;
    context?: unknown;
    cause?: unknown;
  };

  if (errorLike.name) details.push(`type=${errorLike.name}`);
  if (errorLike.message) details.push(`message=${errorLike.message}`);

  if (errorLike.context instanceof Response) {
    details.push(`status=${errorLike.context.status} ${errorLike.context.statusText}`.trim());
    const body = await safeReadResponseBody(errorLike.context);
    if (body) details.push(`body=${body}`);
  } else if (errorLike.context) {
    details.push(`context=${safeStringify(errorLike.context)}`);
  }

  if (errorLike.cause) details.push(`cause=${safeStringify(errorLike.cause)}`);

  if (details.length === 0) {
    details.push(safeStringify(error));
  }

  return `Edge Function "${functionName}" failed. ${details.join(" | ")}`;
}

async function safeReadResponseBody(response: Response) {
  try {
    return await response.clone().text();
  } catch {
    return "";
  }
}

function safeStringify(value: unknown) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
