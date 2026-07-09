import { useEffect, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput, PromptInputTextarea, PromptInputFooter, PromptInputSubmit,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import { MessageCircle, RotateCcw, ShieldAlert, Scale, LifeBuoy } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { toast } from "sonner";
import { PERSONAS, useRole } from "@/lib/role-context";

export type AssistantContext = {
  questionPrompt?: string;
  questionHelp?: string;
  documents?: string[];
};

const DEFAULT_SUGGESTIONS = [
  "What is the difference between a will and a trust?",
  "Do I need a power of attorney if I already have a will?",
  "How do I pick a guardian for my kids?",
];

export function AssistantPanel({
  compact = false,
  context,
  title,
  extraSuggestions,
  hideDefaultSuggestions = false,
}: {
  compact?: boolean;
  context?: AssistantContext;
  title?: string;
  extraSuggestions?: { label: string; onClick?: () => void; prompt?: string }[];
  hideDefaultSuggestions?: boolean;
}) {
  const { role } = useRole();
  const persona = PERSONAS[role];

  const { messages, sendMessage, status, setMessages } = useChat({
    id: `assistant:${role}${compact ? ":fab" : ""}`,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { persona: role, context },
    }),
    onError: (err) => toast.error(err.message || "Something went wrong."),
  });

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => { textareaRef.current?.focus(); }, [status, role]);

  const busy = status === "submitted" || status === "streaming";
  const onSubmit = (m: PromptInputMessage) => {
    const text = m.text?.trim();
    if (text) sendMessage({ text });
  };

  const suggestions = context?.questionPrompt
    ? [
        `Help me answer: "${context.questionPrompt}"`,
        "Why are you asking this?",
        "What should I have ready before I answer?",
      ]
    : DEFAULT_SUGGESTIONS;

  return (
    <div className="flex flex-col h-full min-h-0">
      {title && (
        <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-primary" />
            <div className="font-medium text-sm">{title}</div>
          </div>
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setMessages([])}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" /> New
            </Button>
          )}
        </div>
      )}

      <div className="px-4 py-2 border-b border-border bg-amber-50/60 dark:bg-amber-950/20 shrink-0 flex items-start gap-2">
        <ShieldAlert className="h-3.5 w-3.5 mt-0.5 text-amber-700 dark:text-amber-400 shrink-0" />
        <p className="text-[11px] leading-snug text-amber-900 dark:text-amber-200">
          Guidance only — not legal advice. For decisions about your situation, talk to an attorney.
        </p>
      </div>

      <Conversation className="flex-1 min-h-0">
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState
              icon={<MessageCircle className="h-6 w-6 text-primary" />}
              title={`Hi ${persona.name.split(" ")[0]} — what can I help with?`}
              description={context?.questionPrompt ? "Ask about this question, or anything else about estate planning." : "Pick a starter or ask your own estate-planning question."}
            >
              <div className="mt-2 flex flex-col gap-2 items-center">
                {extraSuggestions?.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => {
                      if (s.prompt) sendMessage({ text: s.prompt });
                      s.onClick?.();
                    }}
                    className="text-sm px-3 py-2 rounded-md border border-primary/40 bg-primary-soft/40 hover:bg-primary-soft text-left max-w-md font-medium"
                  >✨ {s.label}</button>
                ))}
                {!hideDefaultSuggestions && suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendMessage({ text: s })}
                    className="text-sm px-3 py-2 rounded-md border border-border hover:bg-paper-deep text-left max-w-md"
                  >{s}</button>
                ))}
              </div>
            </ConversationEmptyState>
          ) : (
            messages.map((m) => {
              const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
              return (
                <Message key={m.id} from={m.role === "user" ? "user" : "assistant"}>
                  {m.role === "user" ? (
                    <MessageContent>{text}</MessageContent>
                  ) : (
                    <div className="max-w-[85%]"><MessageResponse>{text}</MessageResponse></div>
                  )}
                </Message>
              );
            })
          )}
          {status === "submitted" && (
            <Message from="assistant"><div className="px-3"><Shimmer>Thinking…</Shimmer></div></Message>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t border-border px-3 pt-2 pb-1 bg-paper-deep/40 shrink-0 flex flex-wrap gap-1.5">
        <Button asChild variant="outline" size="sm" className="h-7 text-xs">
          <Link to="/member/find-attorney"><Scale className="h-3 w-3 mr-1" /> Find an attorney</Link>
        </Button>
        <Button asChild variant="outline" size="sm" className="h-7 text-xs">
          <Link to="/member/learn"><LifeBuoy className="h-3 w-3 mr-1" /> Learn / FAQs</Link>
        </Button>
      </div>

      <div className="border-t border-border p-3 bg-paper-deep/40 shrink-0">
        <PromptInput onSubmit={onSubmit}>
          <PromptInputTextarea ref={textareaRef} placeholder="Ask about estate planning…" />
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit status={status} disabled={busy && status !== "streaming"} />
          </PromptInputFooter>
        </PromptInput>
        <p className="text-[11px] text-muted-foreground mt-2 px-1">
          Estate-planning topics only. AI can be wrong — verify important details with an attorney.
        </p>
      </div>
    </div>
  );
}

