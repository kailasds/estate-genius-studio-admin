import { useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AssistantPanel, type AssistantContext } from "@/components/assistant-panel";
import { PlanIntakeChat } from "@/components/plan-intake-chat";
import { useRouterState } from "@tanstack/react-router";

type View = "chat" | "plan-intake";

export function FloatingAssistant({ context }: { context?: AssistantContext }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("chat");
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const onPlanPage = pathname === "/member/plan";

  const close = () => { setOpen(false); setView("chat"); };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg grid place-items-center hover:scale-105 transition-transform"
        aria-label="Open assistant"
      >
        <MessageCircle className="h-6 w-6" />
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
            onClick={close}
          />
          <div className="fixed bottom-6 right-6 z-50 w-[380px] max-w-[calc(100vw-2rem)] h-[600px] max-h-[calc(100vh-3rem)] rounded-xl bg-card border border-border shadow-2xl flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-primary" />
                <div className="font-medium text-sm">Assistant</div>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={close}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 min-h-0">
              {view === "plan-intake" ? (
                <PlanIntakeChat onBack={() => setView("chat")} />
              ) : (
                <AssistantPanel
                  compact
                  context={context}
                  hideDefaultSuggestions={onPlanPage}
                  extraSuggestions={
                    onPlanPage
                      ? [
                          { label: "Help me fill", onClick: () => setView("plan-intake") },
                          { label: "Explain in detail", prompt: "Explain my Will in detail — walk me through what each section means and why it matters." },
                          { label: "Connect me with an expert", prompt: "How can I connect with an estate-planning expert or attorney to review my Will?" },
                        ]
                      : undefined
                  }
                />

              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}


