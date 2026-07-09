import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { runAiAssist } from "@/lib/ai.functions";
import { toast } from "sonner";

type Task =
  | "rewrite_question"
  | "suggest_followups"
  | "extract_merge_fields"
  | "explain_rule"
  | "draft_faq"
  | "improve_answer"
  | "draft_reason"
  | "propose_recommendation_rules";

export function AiAssistButton({
  task, content, context, onApprove, label, variant = "outline", disabled,
}: {
  task: Task;
  content: string;
  context?: string;
  onApprove: (text: string) => void;
  label: string;
  variant?: "outline" | "ghost" | "default";
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const call = useServerFn(runAiAssist);
  const mut = useMutation({
    mutationFn: async () => call({ data: { task, content, context } }),
    onSuccess: (res) => setDraft(res.output),
    onError: (e: Error) => toast.error(e.message),
  });

  const start = () => {
    setDraft("");
    setOpen(true);
    mut.mutate();
  };

  return (
    <>
      <Button type="button" variant={variant} size="sm" onClick={start} disabled={disabled || !content.trim()}>
        <Sparkles className="h-3.5 w-3.5 mr-1.5 text-gold" />
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-serif">Review AI suggestion</DialogTitle>
            <DialogDescription>
              You are always in control. Edit the draft below and approve to apply it, or discard.
            </DialogDescription>
          </DialogHeader>
          {mut.isPending ? (
            <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Generating…
            </div>
          ) : (
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={10}
              className="font-sans"
            />
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Discard</Button>
            <Button
              onClick={() => { onApprove(draft); setOpen(false); toast.success("Applied AI suggestion"); }}
              disabled={mut.isPending || !draft.trim()}
            >
              Approve & apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
