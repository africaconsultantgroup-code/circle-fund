import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BellRing,
  CornerUpLeft,
  Flag,
  Loader2,
  Megaphone,
  MessageCircle,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  loadCircleChat,
  markCircleChatRead,
  reportCircleChatMessage,
  sendCircleChatMessage,
  subscribeToCircleChat,
  type CircleChatMessage,
  type CircleChatRoom,
} from "@/lib/circle-chat";
import { supabase } from "@/lib/supabase";

type Props = {
  circleId: string;
  circleName: string;
  circleType: "rotational" | "goal";
  currentUserId: string;
  memberNames: Record<string, string>;
  isAdmin: boolean;
  isArchived: boolean;
  contributionId?: string | null;
  onCloseContributionThread?: () => void;
};

export function CircleChat({
  circleId,
  circleName,
  circleType,
  currentUserId,
  memberNames,
  isAdmin,
  isArchived,
  contributionId,
  onCloseContributionThread,
}: Props) {
  const [room, setRoom] = useState<CircleChatRoom | null>(null);
  const [messages, setMessages] = useState<CircleChatMessage[]>([]);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<CircleChatMessage | null>(null);
  const [announcement, setAnnouncement] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const result = await loadCircleChat(circleId, contributionId);
    setRoom(result.room);
    setMessages(result.messages);
    setError(result.error ?? "");
    setIsLoading(false);
    if (result.room && result.messages.length) {
      void markCircleChatRead(result.room.id, result.messages.at(-1)?.id);
    }
  }, [circleId, contributionId]);

  useEffect(() => {
    // Chat hydration synchronizes this view with Supabase.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!room) return;
    const channel = subscribeToCircleChat(room.id, () => void refresh());
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refresh, room]);

  const messageById = useMemo(
    () => new Map(messages.map((message) => [message.id, message])),
    [messages],
  );
  const readOnly = isArchived || room?.status !== "active";

  const send = async () => {
    if (!room || !body.trim()) return;
    setIsSending(true);
    setError("");
    const result = await sendCircleChatMessage({
      roomId: room.id,
      body: body.trim(),
      type: contributionId
        ? "contribution_thread"
        : announcement && isAdmin
          ? "announcement"
          : "text",
      replyTo: replyTo?.id,
      contributionId,
    });
    setIsSending(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setBody("");
    setReplyTo(null);
    setAnnouncement(false);
    await refresh();
  };

  const report = async (message: CircleChatMessage) => {
    const result = await reportCircleChatMessage(
      message.id,
      "prohibited_content",
      "Reported by a Circle member for moderation review.",
    );
    setError(result.error?.message ?? "");
    if (!result.error) await refresh();
  };

  return (
    <section className="flex min-h-[32rem] flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-card">
      <header className="border-b border-border bg-muted/30 p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-primary">
            <MessageCircle className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-sm font-semibold">{circleName} Chat</h2>
            <p className="text-[11px] capitalize text-muted-foreground">
              Private {circleType} Susu conversation
            </p>
          </div>
          {readOnly && (
            <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold">
              Read only
            </span>
          )}
        </div>
        {contributionId && (
          <div className="mt-3 flex items-center justify-between rounded-xl bg-gold/10 px-3 py-2 text-xs">
            <span>Contribution discussion</span>
            <button type="button" onClick={onCloseContributionThread} aria-label="Close thread">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {isLoading && (
          <p className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading private chat
          </p>
        )}
        {!isLoading && messages.length === 0 && (
          <div className="py-12 text-center">
            <MessageCircle className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-3 text-sm font-semibold">
              {contributionId ? "No contribution discussion yet" : "Start the Circle conversation"}
            </p>
            <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
              Messages support coordination only. Official payments and governance decisions remain
              in their approved workflows.
            </p>
          </div>
        )}
        {messages.map((message) => {
          const own = message.sender_user_id === currentUserId;
          const parent = message.reply_to_message_id
            ? messageById.get(message.reply_to_message_id)
            : null;
          if (message.message_type === "system" || message.message_type === "governance_event") {
            return (
              <div
                key={message.id}
                className="mx-auto max-w-[90%] rounded-xl bg-secondary/60 px-3 py-2 text-center text-[11px] text-primary"
              >
                <ShieldCheck className="mx-auto mb-1 h-3.5 w-3.5" />
                {message.body}
              </div>
            );
          }
          return (
            <article
              key={message.id}
              className={`group max-w-[88%] rounded-2xl p-3 ${
                own ? "ml-auto bg-primary text-primary-foreground" : "bg-muted"
              } ${message.message_type === "announcement" ? "border border-gold/40" : ""}`}
            >
              {message.message_type === "announcement" && (
                <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase">
                  <Megaphone className="h-3 w-3" /> Announcement
                </p>
              )}
              {!own && (
                <p className="mb-1 text-[10px] font-semibold text-primary">
                  {message.sender_user_id
                    ? (memberNames[message.sender_user_id] ?? "Circle member")
                    : "SikaCircle"}
                </p>
              )}
              {parent && (
                <div className="mb-2 truncate rounded-lg bg-background/20 px-2 py-1 text-[10px] opacity-80">
                  Replying to: {parent.body}
                </div>
              )}
              <p className="whitespace-pre-wrap break-words text-sm">
                {message.deleted_at ? "Message removed" : message.body}
              </p>
              <div className="mt-2 flex items-center justify-between gap-3 text-[9px] opacity-70">
                <span>
                  {new Date(message.created_at).toLocaleString([], {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {message.edited_at ? " · edited" : ""}
                </span>
                {!message.deleted_at && (
                  <span className="flex gap-2">
                    <button type="button" onClick={() => setReplyTo(message)} title="Reply">
                      <CornerUpLeft className="h-3.5 w-3.5" />
                    </button>
                    {!own && (
                      <button type="button" onClick={() => void report(message)} title="Report">
                        <Flag className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </span>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {error && (
        <p className="mx-4 mb-2 rounded-xl bg-destructive/5 p-2 text-xs text-destructive">
          {error}
        </p>
      )}
      {!readOnly && room && (
        <footer className="border-t border-border p-3">
          {replyTo && (
            <div className="mb-2 flex items-center justify-between rounded-xl bg-muted px-3 py-2 text-[11px]">
              <span className="truncate">Replying to {replyTo.body}</span>
              <button type="button" onClick={() => setReplyTo(null)}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {isAdmin && !contributionId && (
            <button
              type="button"
              onClick={() => setAnnouncement((value) => !value)}
              className={`mb-2 flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold ${
                announcement
                  ? "bg-gold/15 text-[color:var(--gold-foreground)]"
                  : "text-muted-foreground"
              }`}
            >
              <BellRing className="h-3 w-3" /> Post as announcement
            </button>
          )}
          <div className="flex items-end gap-2">
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              maxLength={4000}
              rows={2}
              placeholder={contributionId ? "Discuss this contribution…" : "Message the Circle…"}
              className="min-h-11 flex-1 resize-none rounded-2xl border border-input bg-background px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={isSending || !body.trim()}
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground disabled:opacity-50"
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
        </footer>
      )}
    </section>
  );
}
