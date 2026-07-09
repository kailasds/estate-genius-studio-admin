import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Vault, FileText, Eye, Share2, Download, ShieldCheck, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRole, PERSONAS, type Role } from "@/lib/role-context";
import { loadDraft } from "@/lib/member-draft";
import { usePlanShare } from "@/lib/plan-share";
import { toPublicUrl } from "@/lib/public-path";
import { tagLabel } from "@/lib/service-tags";
import { toast } from "sonner";

export function VaultSheet({ collapsed }: { collapsed: boolean }) {
  const { role } = useRole();
  const [open, setOpen] = useState(false);
  const isMember = role === "member" || role === "spouse";
  if (!isMember) return null;

  const trigger = (
    <SheetTrigger asChild>
      <button
        className={`group relative flex items-center gap-3 rounded-lg w-full ${collapsed ? "justify-center px-1.5" : "px-2"} py-2 text-[13px] transition-colors hover:bg-paper-deep/50 text-sidebar-foreground/85`}
        aria-label="Open document vault"
      >
        <span className="h-8 w-8 rounded-md grid place-items-center bg-transparent text-muted-foreground group-hover:bg-muted transition-colors shrink-0">
          <Vault className="h-[15px] w-[15px]" strokeWidth={1.8} />
        </span>
        {!collapsed && <span className="font-medium leading-tight truncate">Vault</span>}
      </button>
    </SheetTrigger>
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent side="right">Vault</TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}
      <SheetContent side="left" className="w-[420px] sm:max-w-none overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-serif text-2xl flex items-center gap-2">
            <Vault className="h-5 w-5 text-primary" /> Document vault
          </SheetTitle>
          <SheetDescription>
            Your completed legal documents. View, share, or download in one place.
          </SheetDescription>
        </SheetHeader>
        <VaultContents role={role} onClose={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

function VaultContents({ role, onClose }: { role: Role; onClose: () => void }) {
  const me = PERSONAS[role];
  const draft = useMemo(() => loadDraft(role), [role]);
  const { createLink } = usePlanShare();

  const { data: totals } = useQuery({
    queryKey: ["vault", "totals"],
    queryFn: async () => {
      const [sigs, qs] = await Promise.all([
        supabase.from("discovery_signals").select("id", { count: "exact", head: true }).eq("active", true),
        supabase.from("questions").select("id", { count: "exact", head: true }),
      ]);
      return { signals: sigs.count ?? 0, questions: qs.count ?? 0 };
    },
  });

  const answered = Object.keys(draft.answers).length + Object.keys(draft.discovery).length;
  const total = Math.max(1, (totals?.signals ?? 0) + (totals?.questions ?? 0));
  const pct = Math.min(100, Math.round((answered / total) * 100));
  const docs = draft.selectedDocs ?? [];
  const approved = new Set(draft.approvedDocs ?? []);
  const completed = docs.filter((d) => approved.has(d) || pct >= 100);
  const inProgress = docs.filter((d) => !approved.has(d) && pct < 100);

  const handleShare = (doc: string) => {
    const token = createLink(doc, role);
    const url = toPublicUrl(`/share/${token}`);
    navigator.clipboard?.writeText(url).catch(() => {});
    toast.success("Secure share link copied");
  };

  const handleDownload = (doc: string) => {
    const label = tagLabel(doc);
    const body = [
      `${label}`,
      `Prepared for: ${me.name}`,
      `Generated: ${new Date().toLocaleString()}`,
      ``,
      `— This is a prototype export. The full document will be generated from the approved template.`,
    ].join("\n");
    const blob = new Blob([body], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${label.replace(/\s+/g, "_")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${label} downloaded`);
  };

  return (
    <div className="mt-6 space-y-6">
      {docs.length === 0 && (
        <Card className="p-6 text-center">
          <FileText className="h-7 w-7 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            No documents yet. Start your plan to add documents to your vault.
          </p>
          <Button asChild size="sm" className="mt-3" onClick={onClose}>
            <Link to="/member/plan">Start my Will</Link>
          </Button>
        </Card>
      )}

      {completed.length > 0 && (
        <section>
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
            Completed ({completed.length})
          </h3>
          <div className="space-y-2">
            {completed.map((doc) => (
              <VaultRow
                key={doc}
                doc={doc}
                complete
                onView={onClose}
                onShare={() => handleShare(doc)}
                onDownload={() => handleDownload(doc)}
              />
            ))}
          </div>
        </section>
      )}

      {inProgress.length > 0 && (
        <section>
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
            In progress ({inProgress.length}) · {pct}%
          </h3>
          <div className="space-y-2">
            {inProgress.map((doc) => (
              <VaultRow
                key={doc}
                doc={doc}
                complete={false}
                onView={onClose}
                onShare={() => handleShare(doc)}
                onDownload={() => handleDownload(doc)}
              />
            ))}
          </div>
        </section>
      )}

      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 pt-2 border-t border-border">
        <ShieldCheck className="h-3 w-3" /> Encrypted vault · only you and people you share with can open these.
      </p>
    </div>
  );
}

function VaultRow({
  doc, complete, onView, onShare, onDownload,
}: {
  doc: string;
  complete: boolean;
  onView: () => void;
  onShare: () => void;
  onDownload: () => void;
}) {
  return (
    <Card className="p-3">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-md bg-primary/10 text-primary grid place-items-center shrink-0">
          <FileText className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">{tagLabel(doc)}</span>
            <Badge variant={complete ? "default" : "secondary"} className="text-[10px]">
              {complete ? "Complete" : "Draft"}
            </Badge>
          </div>
          <div className="mt-2 flex items-center gap-1">
            <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onView}>
              <Link to="/member/plan"><Eye className="h-3.5 w-3.5 mr-1" /> View</Link>
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onShare}>
              <Share2 className="h-3.5 w-3.5 mr-1" /> Share
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={onDownload}
              disabled={!complete}
              title={complete ? "Download" : "Available once complete"}
            >
              {complete ? <Download className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
              Download
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
