import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { AssistantPanel } from "@/components/assistant-panel";

export const Route = createFileRoute("/member/assistant")({ component: AssistantPage });

function AssistantPage() {
  return (
    <AppShell
      title="Ask the assistant"
      subtitle="Guidance only — not legal advice. Ask about estate planning or using this app."
    >
      <Card className="flex flex-col h-[calc(100vh-14rem)] min-h-[500px] overflow-hidden p-0">
        <AssistantPanel />
      </Card>
    </AppShell>
  );
}
