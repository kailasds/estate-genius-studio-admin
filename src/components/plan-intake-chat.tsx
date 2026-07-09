import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useQuery } from "@tanstack/react-query";
import {
  Conversation, ConversationContent, ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput, PromptInputTextarea, PromptInputFooter, PromptInputSubmit,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ArrowRight, Sparkles, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRole, PERSONAS } from "@/lib/role-context";
import { loadDraft } from "@/lib/member-draft";
import { SERVICE_TAGS, EXTRA_DOCS, tagLabel } from "@/lib/service-tags";

type PlanReady = {
  discovery?: Record<string, unknown>;
  selectedDocs?: string[];
  answers?: Record<string, unknown>;
  summary?: string;
};

function extractPlanReady(text: string): { plan: PlanReady | null; visibleText: string } {
  const re = /```plan-json\s*([\s\S]*?)```/i;
  const m = text.match(re);
  if (!m) return { plan: null, visibleText: text };
  try {
    const plan = JSON.parse(m[1].trim()) as PlanReady;
    const visibleText = text.replace(re, "").trim();
    return { plan, visibleText };
  } catch {
    return { plan: null, visibleText: text };
  }
}

export function PlanIntakeChat({ onBack }: { onBack: () => void }) {
  const { role } = useRole();
  const persona = PERSONAS[role];
  const draft = useMemo(() => loadDraft(role), [role]);

  const { data: config } = useQuery({
    queryKey: ["plan-intake-config"],
    queryFn: async () => {
      const [signals, questions] = await Promise.all([
        supabase.from("discovery_signals").select("key,label,input_type,options").eq("active", true).order("sort_order"),
        supabase.from("questions").select("id,prompt,input_type,options").order("sort_order"),
      ]);
      return { signals: signals.data ?? [], questions: questions.data ?? [] };
    },
    staleTime: 60_000,
  });

  const docs = useMemo(
    () => [
      ...SERVICE_TAGS.filter((s) => s.value !== "common").map((s) => ({ value: s.value, label: s.label, description: s.description })),
      ...EXTRA_DOCS.map((d) => ({ value: d.value, label: d.label, description: d.description })),
    ],
    [],
  );

  const planIntake = useMemo(
    () =>
      config
        ? {
            signals: config.signals,
            questions: config.questions,
            docs,
            currentDiscovery: draft.discovery,
            currentAnswers: draft.answers,
            currentSelectedDocs: draft.selectedDocs ?? [],
          }
        : null,
    [config, docs, draft],
  );

  const { messages, sendMessage, status, setMessages } = useChat({
    id: `plan-intake:${role}`,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: () => ({ persona: role, planIntake }),
    }),
    onError: (err) => toast.error(err.message || "Something went wrong."),
  });

  // Seed the conversation with a friendly opener from the user side so the AI kicks off.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    if (!planIntake) return;
    if (messages.length > 0) { seededRef.current = true; return; }
    seededRef.current = true;
    sendMessage({
      text:
        "Please help me draft my estate plan through a short conversation. Start by asking me a couple of the most important questions.",
    });
  }, [planIntake, messages.length, sendMessage]);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => { textareaRef.current?.focus(); }, [status]);

  const busy = status === "submitted" || status === "streaming";
  const onSubmit = (m: PromptInputMessage) => {
    const text = m.text?.trim();
    if (text) sendMessage({ text });
  };

  // Find the latest plan-ready block across assistant messages.
  const readyPlan = useMemo<PlanReady | null>(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role !== "assistant") continue;
      const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
      const { plan } = extractPlanReady(text);
      if (plan) return plan;
    }
    return null;
  }, [messages]);

  const applyAndReview = () => {
    if (!readyPlan) return;
    window.dispatchEvent(
      new CustomEvent("dep:apply-plan-intake", {
        detail: {
          discovery: readyPlan.discovery ?? {},
          selectedDocs: readyPlan.selectedDocs ?? [],
          answers: readyPlan.answers ?? {},
        },
      }),
    );
    toast.success("Draft filled — review your plan below");
  };

  const finishNow = () => {
    sendMessage({
      text:
        "That's enough for now — please draft my plan with what I've told you and emit the plan-json block.",
    });
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-3 py-2 border-b border-border shrink-0 flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack} className="h-7 px-2">
          <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
        </Button>
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <Sparkles className="h-3.5 w-3.5 text-primary" /> AI plan intake
        </div>
        <div className="ml-auto">
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { seededRef.current = false; setMessages([]); }}>
              Restart
            </Button>
          )}
        </div>
      </div>

      <Conversation className="flex-1 min-h-0">
        <ConversationContent>
          {messages.map((m) => {
            const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
            const { visibleText } = extractPlanReady(text);
            // Hide our internal seed message from the user.
            if (m.role === "user" && text.startsWith("Please help me draft my estate plan through a short conversation")) return null;
            if (!visibleText.trim()) return null;
            return (
              <Message key={m.id} from={m.role === "user" ? "user" : "assistant"}>
                {m.role === "user" ? (
                  <MessageContent>{visibleText}</MessageContent>
                ) : (
                  <div className="max-w-[85%]"><MessageResponse>{visibleText}</MessageResponse></div>
                )}
              </Message>
            );
          })}
          {status === "submitted" && (
            <Message from="assistant"><div className="px-3"><Shimmer>Thinking…</Shimmer></div></Message>
          )}
          {readyPlan && (
            <div className="mx-3 my-2 rounded-lg border border-primary/30 bg-primary-soft/50 p-3 space-y-2">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary mt-0.5" />
                <div className="text-xs">
                  <div className="font-medium">Draft ready</div>
                  {readyPlan.summary && <div className="text-muted-foreground mt-0.5">{readyPlan.summary}</div>}
                </div>
              </div>
              {(readyPlan.selectedDocs ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {(readyPlan.selectedDocs ?? []).map((d) => (
                    <Badge key={d} variant="secondary" className="text-[10px]">{tagLabel(d)}</Badge>
                  ))}
                </div>
              )}
              <Button size="sm" className="w-full h-8" onClick={applyAndReview}>
                Apply & go to Review <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
              <p className="text-[10px] text-muted-foreground leading-snug">
                You'll be able to edit every answer on the review screen before creating the document.
              </p>
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {!readyPlan && messages.length > 1 && (
        <div className="px-3 pt-2 pb-1 border-t border-border shrink-0">
          <Button variant="outline" size="sm" className="w-full h-8 text-xs" onClick={finishNow} disabled={busy}>
            I'm done — draft my plan now
          </Button>
        </div>
      )}

      <div className="border-t border-border p-3 bg-paper-deep/40 shrink-0">
        <PromptInput onSubmit={onSubmit}>
          <PromptInputTextarea
            ref={textareaRef}
            placeholder={`Tell me about you, ${persona.name.split(" ")[0]}…`}
          />
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit status={status} disabled={busy && status !== "streaming"} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
