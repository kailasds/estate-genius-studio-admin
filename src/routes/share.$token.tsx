import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { loadPlanShare, findLink } from "@/lib/plan-share";
import { loadDraft } from "@/lib/member-draft";
import { PERSONAS } from "@/lib/role-context";
import { tagLabel } from "@/lib/service-tags";
import { FileText, ShieldCheck, XCircle } from "lucide-react";

export const Route = createFileRoute("/share/$token")({ component: SharePage });

function SharePage() {
  const { token } = Route.useParams();
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);

  const link = useMemo(() => (ready ? findLink(loadPlanShare(), token) : undefined), [ready, token]);

  const { data } = useQuery({
    queryKey: ["share", "config"],
    enabled: !!link,
    queryFn: async () => {
      const [templates, attrs, questions] = await Promise.all([
        supabase.from("templates").select("*"),
        supabase.from("attributes").select("*"),
        supabase.from("questions").select("*"),
      ]);
      return { templates: templates.data ?? [], attrs: attrs.data ?? [], questions: questions.data ?? [] };
    },
  });

  if (!ready) return null;

  if (!link) {
    return (
      <ShellWrap>
        <Card className="p-8 text-center">
          <XCircle className="h-8 w-8 text-destructive mx-auto mb-3" />
          <h1 className="font-serif text-2xl">Link not found</h1>
          <p className="text-sm text-muted-foreground mt-2">This share link is invalid or was created in a different browser.</p>
        </Card>
      </ShellWrap>
    );
  }

  if (link.revokedAt) {
    return (
      <ShellWrap>
        <Card className="p-8 text-center">
          <XCircle className="h-8 w-8 text-destructive mx-auto mb-3" />
          <h1 className="font-serif text-2xl">Link revoked</h1>
          <p className="text-sm text-muted-foreground mt-2">The owner has revoked access to this document.</p>
        </Card>
      </ShellWrap>
    );
  }

  const draft = loadDraft(link.owner);
  const template = (data?.templates ?? []).find((t: any) => (t.tags ?? []).includes(link.doc));
  const attrByQid = new Map<string, string>();
  (data?.questions ?? []).forEach((q: any) => {
    const a = (data?.attrs ?? []).find((x: any) => x.id === q.attribute_id);
    if (a) attrByQid.set(q.id, a.key);
  });
  const merged: Record<string, unknown> = { ...draft.discovery };
  Object.entries(draft.answers).forEach(([qid, val]) => {
    const key = attrByQid.get(qid);
    if (key) merged[key] = val;
  });

  const body = (template?.body as string | undefined) ?? "";
  const rendered = body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, k) => {
    const v = merged[k];
    return v === undefined || v === null || v === "" ? `⟨${k}⟩` : String(v);
  });

  return (
    <ShellWrap>
      <Card className="p-6 md:p-10">
        <div className="flex items-start gap-3 mb-6">
          <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary grid place-items-center">
            <FileText className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h1 className="font-serif text-2xl">{tagLabel(link.doc)}</h1>
            <p className="text-xs text-muted-foreground mt-1">
              Shared read-only by {PERSONAS[link.owner].name}.
            </p>
          </div>
          <Badge variant="secondary" className="text-[10px]">Read-only</Badge>
        </div>
        {template ? (
          <div className="prose prose-sm max-w-none whitespace-pre-wrap font-serif leading-relaxed text-foreground">
            {rendered}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">No template body published yet.</p>
        )}
        <p className="text-[11px] text-muted-foreground mt-8 flex items-center gap-1.5 border-t border-border pt-4">
          <ShieldCheck className="h-3 w-3" /> Guidance only — not legal advice.
        </p>
      </Card>
    </ShellWrap>
  );
}

function ShellWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6 text-center">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">MetLife Legal Plans</div>
          <div className="font-serif text-lg mt-0.5">Digital Estate Planning · Shared document</div>
        </div>
        {children}
      </div>
    </div>
  );
}
