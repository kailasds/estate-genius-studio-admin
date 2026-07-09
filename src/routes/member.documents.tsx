import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useRole, PERSONAS, type Role } from "@/lib/role-context";
import { loadDraft } from "@/lib/member-draft";
import { usePlanShare, getShare, type Permission } from "@/lib/plan-share";
import { toPublicUrl } from "@/lib/public-path";
import { tagLabel } from "@/lib/service-tags";
import {
  FileText, Share2, Link as LinkIcon, Eye, Pencil, Copy, XCircle, ArrowRight, ShieldCheck, Users,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/member/documents")({ component: DocumentsPage });

function DocumentsPage() {
  const { role } = useRole();
  if (role !== "member" && role !== "spouse") {
    return <AppShell title="Documents"><p>Switch to Member or Spouse view.</p></AppShell>;
  }
  const partner: Role = role === "member" ? "spouse" : "member";
  const me = PERSONAS[role];
  const them = PERSONAS[partner];

  const myDraft = useMemo(() => loadDraft(role), [role]);
  const partnerDraft = useMemo(() => loadDraft(partner), [partner]);
  const { state, hydrated, setShare, createLink, revokeLink } = usePlanShare();

  const { data: totals } = useQuery({
    queryKey: ["docs", "totals"],
    queryFn: async () => {
      const [sigs, qs] = await Promise.all([
        supabase.from("discovery_signals").select("id", { count: "exact", head: true }).eq("active", true),
        supabase.from("questions").select("id", { count: "exact", head: true }),
      ]);
      return { signals: sigs.count ?? 0, questions: qs.count ?? 0 };
    },
  });

  const myDocs = myDraft.selectedDocs ?? [];
  const partnerDocs = partnerDraft.selectedDocs ?? [];

  // Docs partner has shared with me:
  const sharedWithMe = partnerDocs
    .map((doc) => ({ doc, perm: getShare(state, doc, partner, role) }))
    .filter((x) => x.perm !== null) as { doc: string; perm: Permission }[];

  const answered = Object.keys(myDraft.answers).length + Object.keys(myDraft.discovery).length;
  const total = Math.max(1, (totals?.signals ?? 0) + (totals?.questions ?? 0));
  const pct = Math.min(100, Math.round((answered / total) * 100));
  const status = pct >= 100 ? "complete" : "draft";

  return (
    <AppShell
      title="My documents"
      subtitle="Your legal drafts and anything your partner has shared with you."
    >
      {myDocs.length === 0 && sharedWithMe.length === 0 ? (
        <Card className="p-8 text-center">
          <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <h2 className="font-serif text-xl">No documents yet</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            Start your plan to get personalised document recommendations.
          </p>
          <Button asChild className="mt-4"><Link to="/member/plan">Start my Will <ArrowRight className="h-4 w-4 ml-1" /></Link></Button>
        </Card>
      ) : (
        <div className="space-y-8">
          {myDocs.length > 0 && (
            <section>
              <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
                {me.name.split(" ")[0]}'s documents
              </h2>
              <div className="grid gap-3">
                {myDocs.map((doc) => (
                  <DocRow
                    key={doc}
                    doc={doc}
                    status={status}
                    pct={pct}
                    ownerRole={role}
                    partnerRole={partner}
                    partnerName={them.name.split(" ")[0]}
                    currentShare={getShare(state, doc, role, partner)}
                    onShareChange={(perm) => {
                      setShare(doc, role, partner, perm);
                      toast.success(perm ? `Shared with ${them.name.split(" ")[0]} (${perm})` : "Sharing removed");
                    }}
                    links={state.links.filter((l) => l.doc === doc && l.owner === role)}
                    onCreateLink={() => {
                      const t = createLink(doc, role);
                      const url = toPublicUrl(`/share/${t}`);
                      navigator.clipboard?.writeText(url).catch(() => {});
                      toast.success("Secure link copied to clipboard");
                    }}
                    onRevoke={(t) => { revokeLink(t); toast.success("Link revoked"); }}
                  />
                ))}
              </div>
            </section>
          )}

          {sharedWithMe.length > 0 && (
            <section>
              <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                <Users className="h-3.5 w-3.5" /> Shared with you by {them.name.split(" ")[0]}
              </h2>
              <div className="grid gap-3">
                {sharedWithMe.map(({ doc, perm }) => (
                  <SharedInRow key={doc} doc={doc} perm={perm} fromName={them.name.split(" ")[0]} />
                ))}
              </div>
            </section>
          )}

          <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <ShieldCheck className="h-3 w-3" /> Sharing is stored in this browser for the prototype.
            {!hydrated ? " Loading…" : ""}
          </p>
        </div>
      )}
    </AppShell>
  );
}

function DocRow({
  doc, status, pct, ownerRole: _ownerRole, partnerRole: _partnerRole, partnerName, currentShare, onShareChange,
  links, onCreateLink, onRevoke,
}: {
  doc: string;
  status: "draft" | "complete";
  pct: number;
  ownerRole: Role;
  partnerRole: Role;
  partnerName: string;
  currentShare: Permission | null;
  onShareChange: (perm: Permission | null) => void;
  links: { token: string; createdAt: number; revokedAt?: number }[];
  onCreateLink: () => void;
  onRevoke: (token: string) => void;
}) {
  const [openLinks, setOpenLinks] = useState(false);
  const activeLinks = links.filter((l) => !l.revokedAt);
  return (
    <Card className="p-4 border-border">
      <div className="flex items-start gap-4">
        <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
          <FileText className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-serif text-lg">{tagLabel(doc)}</h3>
            <Badge variant={status === "complete" ? "default" : "secondary"} className="text-[10px]">
              {status === "complete" ? "Complete" : `Draft · ${pct}%`}
            </Badge>
          </div>
          <div className="h-1 bg-border rounded-full mt-2 overflow-hidden max-w-xs">
            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/member/plan">Open <ArrowRight className="h-3.5 w-3.5 ml-1" /></Link>
            </Button>

            <div className="flex items-center gap-1.5 ml-auto flex-wrap">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Share2 className="h-3 w-3" /> Share with {partnerName}
              </span>
              <Select
                value={currentShare ?? "none"}
                onValueChange={(v) => onShareChange(v === "none" ? null : (v as Permission))}
              >
                <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none"><span className="flex items-center gap-1"><XCircle className="h-3 w-3" /> No access</span></SelectItem>
                  <SelectItem value="view"><span className="flex items-center gap-1"><Eye className="h-3 w-3" /> Can view</span></SelectItem>
                  <SelectItem value="edit"><span className="flex items-center gap-1"><Pencil className="h-3 w-3" /> Can edit</span></SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" variant="ghost" onClick={() => setOpenLinks(true)}>
                <LinkIcon className="h-3.5 w-3.5 mr-1" /> Links{activeLinks.length ? ` (${activeLinks.length})` : ""}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <LinksDialog
        open={openLinks}
        onOpenChange={setOpenLinks}
        docLabel={tagLabel(doc)}
        links={links}
        onCreate={onCreateLink}
        onRevoke={onRevoke}
      />
    </Card>
  );
}

function SharedInRow({ doc, perm, fromName }: { doc: string; perm: Permission; fromName: string }) {
  return (
    <Card className="p-4 border-border">
      <div className="flex items-center gap-4">
        <div className="h-10 w-10 rounded-lg bg-primary-soft/60 text-primary grid place-items-center shrink-0">
          <FileText className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-serif text-lg">{tagLabel(doc)}</h3>
            <Badge variant="outline" className="text-[10px] flex items-center gap-1">
              {perm === "edit" ? <Pencil className="h-3 w-3" /> : <Eye className="h-3 w-3" />} {perm === "edit" ? "Editor" : "Viewer"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Shared by {fromName}.</p>
        </div>
        <Button size="sm" variant="outline" disabled title="Prototype: partner's live doc opens in their workspace">
          Open
        </Button>
      </div>
    </Card>
  );
}

function LinksDialog({
  open, onOpenChange, docLabel, links, onCreate, onRevoke,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  docLabel: string;
  links: { token: string; createdAt: number; revokedAt?: number }[];
  onCreate: () => void;
  onRevoke: (t: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Share link · {docLabel}</DialogTitle>
          <DialogDescription>
            Anyone with the link can view a read-only copy. Revoke any time.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 max-h-72 overflow-auto">
          {links.length === 0 && (
            <p className="text-sm text-muted-foreground">No links yet.</p>
          )}
          {links.map((l) => {
            const url = toPublicUrl(`/share/${l.token}`);
            const revoked = !!l.revokedAt;
            return (
              <div key={l.token} className="flex items-center gap-2 border border-border rounded-md p-2">
                <code className="text-xs flex-1 truncate">{url}</code>
                {revoked ? (
                  <Badge variant="destructive" className="text-[10px]">Revoked</Badge>
                ) : (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard?.writeText(url); toast.success("Copied"); }}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onRevoke(l.token)}>
                      <XCircle className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={onCreate}><LinkIcon className="h-4 w-4 mr-1" /> Create link</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
