import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/supabase-types";

export type CircleChatRoom = Database["public"]["Tables"]["circle_chat_rooms"]["Row"];
export type CircleChatMessage = Database["public"]["Tables"]["circle_chat_messages"]["Row"];
export type ChatMessageType = CircleChatMessage["message_type"];

export async function loadCircleChat(circleId: string, contributionId?: string | null) {
  const roomResult = await supabase
    .from("circle_chat_rooms")
    .select("*")
    .eq("circle_id", circleId)
    .maybeSingle();
  if (roomResult.error || !roomResult.data) {
    return {
      room: null,
      messages: [] as CircleChatMessage[],
      error: roomResult.error?.message ?? "Circle chat is not available.",
    };
  }

  let messageQuery = supabase
    .from("circle_chat_messages")
    .select("*")
    .eq("room_id", roomResult.data.id)
    .order("created_at", { ascending: true })
    .limit(200);
  if (contributionId) messageQuery = messageQuery.eq("contribution_id", contributionId);
  const messageResult = await messageQuery;
  return {
    room: roomResult.data,
    messages: messageResult.data ?? [],
    error: messageResult.error?.message ?? null,
  };
}

export function sendCircleChatMessage(input: {
  roomId: string;
  body: string;
  type?: "text" | "contribution_thread" | "announcement";
  replyTo?: string | null;
  contributionId?: string | null;
  mentions?: string[];
}) {
  return supabase.rpc("send_circle_chat_message", {
    check_room_id: input.roomId,
    requested_body: input.body,
    requested_type: input.type ?? "text",
    requested_reply_to: input.replyTo ?? null,
    requested_contribution_id: input.contributionId ?? null,
    requested_mentions: input.mentions ?? [],
  });
}

export function editCircleChatMessage(messageId: string, body: string) {
  return supabase.rpc("edit_circle_chat_message", {
    check_message_id: messageId,
    requested_body: body,
  });
}

export function deleteCircleChatMessage(messageId: string, reason: string) {
  return supabase.rpc("delete_circle_chat_message", {
    check_message_id: messageId,
    requested_reason: reason,
  });
}

export function reportCircleChatMessage(messageId: string, reason: string, details?: string) {
  return supabase.rpc("report_circle_chat_message", {
    check_message_id: messageId,
    requested_reason: reason,
    requested_details: details ?? null,
  });
}

export function markCircleChatRead(roomId: string, messageId?: string | null) {
  return supabase.rpc("mark_circle_chat_read", {
    check_room_id: roomId,
    check_message_id: messageId ?? null,
  });
}

export function subscribeToCircleChat(roomId: string, refresh: () => void) {
  return supabase
    .channel(`circle-chat:${roomId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "circle_chat_messages",
        filter: `room_id=eq.${roomId}`,
      },
      refresh,
    )
    .subscribe();
}
