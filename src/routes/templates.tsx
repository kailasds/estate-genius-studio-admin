import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SERVICE_TAGS, tagLabel, type ServiceTag } from "@/lib/service-tags";
import { Plus, Upload, FileText, Loader2, MessageSquare, Wand2, Check, X, ArrowUp } from "lucide-react";
import { toast } from "sonner";
import { extractTemplateAttributes, templateChat } from "@/lib/template-assist.functions";
import type { Database, Json } from "@/integrations/supabase/types";

// helper: cast our clause tree into the Json shape supabase-js expects
const asJson = (v: unknown): Json => v as unknown as Json;

type Template = Database["public"]["Tables"]["templates"]["Row"];
type Family = Database["public"]["Tables"]["template_families"]["Row"];
type ChatMsg = { role: "user" | "assistant"; content: string };

export const Route = createFileRoute("/templates")({ component: TemplatesPage });

function TemplatesPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [newOpen, setNewOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [scope, setScope] = useState<ServiceTag | "all">("all");

  const { data: families = [], isLoading } = useQuery({
    queryKey: ["template_families"],
    queryFn: async () => {
      const { data, error } = await supabase.from("template_families").select("*").order("created_at");
      if (error) throw error;
      return data as Family[];
    },
  });
  const { data: allVersions = [] } = useQuery({
    queryKey: ["templates_all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("templates").select("*").order("version", { ascending: false });
      if (error) throw error;
      return data as Template[];
    },
  });

  const visible = useMemo(
    () => families.filter((f) => scope === "all" || f.service_tag === scope),
    [families, scope],
  );

  return (
    <AppShell
      title="Template Management"
      subtitle="Upload templates for each service, keep draft & published versions, and route members to the right template with the rules engine."
      action={
        <Button size="icon" onClick={() => setNewOpen(true)} aria-label="New template" title="New template">
          <Plus className="h-4 w-4" />
        </Button>
      }
    >
      <ScopeFilter scope={scope} setScope={setScope} />

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : visible.length === 0 ? (
        <Empty label={scope === "all" ? "No templates yet — add one to get started." : `No templates yet for ${tagLabel(scope)}.`} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((f) => {
            const versions = allVersions.filter((v) => v.family_id === f.id);
            const published = versions.find((v) => v.status === "published");
            return (
              <Card key={f.id} onClick={() => navigate({ to: "/templates/$familyId", params: { familyId: f.id } })}
                className="p-5 cursor-pointer hover:shadow-panel transition-shadow bg-card border-border shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <FileText className="h-5 w-5 text-primary" />
                  <div className="flex items-center gap-1.5">
                    <Badge className="bg-primary-soft text-primary hover:bg-primary-soft border-0 text-[10px]">{tagLabel(f.service_tag)}</Badge>
                    {f.jurisdiction && <Badge variant="outline" className="text-[10px]">{f.jurisdiction}</Badge>}
                  </div>
                </div>
                <h3 className="font-serif text-xl mt-4">{f.name}</h3>
                {f.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{f.description}</p>}
                <div className="mt-4 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{versions.length} version{versions.length === 1 ? "" : "s"}</span>
                  <span>{published ? `Published v${published.version}` : "No published version"}</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <NewFamilyDialog open={newOpen} onOpenChange={setNewOpen} onCreated={(id) => { qc.invalidateQueries({ queryKey: ["template_families"] }); navigate({ to: "/templates/$familyId", params: { familyId: id } }); }} />
      <IngestChatDialog open={chatOpen} onOpenChange={setChatOpen} onCreated={(id) => { setChatOpen(false); qc.invalidateQueries({ queryKey: ["template_families"] }); qc.invalidateQueries({ queryKey: ["templates_all"] }); navigate({ to: "/templates/$familyId", params: { familyId: id } }); }} />

      {/* Floating chat-assist button */}
      <button
        type="button"
        onClick={() => setChatOpen(true)}
        aria-label="Chat assist"
        title="Chat assist — ingest a template"
        className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-panel hover:shadow-lg grid place-items-center transition-transform hover:scale-105"
      >
        <MessageSquare className="h-6 w-6" />
      </button>
    </AppShell>
  );
}

/* -------------------- New family dialog -------------------- */

function NewFamilyDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [service, setService] = useState<ServiceTag>("will");
  const [jurisdiction, setJurisdiction] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { data: fam, error } = await supabase.from("template_families")
        .insert({ name: name.trim() || "Untitled template", description: description || null, service_tag: service, jurisdiction: jurisdiction || null })
        .select().single();
      if (error) throw error;
      // seed initial draft version
      const { error: e2 } = await supabase.from("templates").insert({
        name: fam.name, description: fam.description, body: "", tags: [service],
        family_id: fam.id, status: "draft", version: 1,
      });
      if (e2) throw e2;
      return fam as Family;
    },
    onSuccess: (fam) => { onCreated(fam.id); onOpenChange(false); toast.success("Template created"); setName(""); setDescription(""); setJurisdiction(""); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-serif text-2xl">New template</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. California Will — Married with Minor Children" /></Field>
          <Field label="Service"><Select value={service} onValueChange={(v) => setService(v as ServiceTag)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{SERVICE_TAGS.filter((s) => s.value !== "common").map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>))}
            </SelectContent></Select></Field>
          <Field label="Jurisdiction (optional)" hint="Two-letter state code, e.g. CA."><Input value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value.toUpperCase().slice(0, 2))} /></Field>
          <Field label="Description"><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>{create.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------- Small primitives -------------------- */

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
function Empty({ label }: { label: string }) {
  return <div className="rounded-xl border border-dashed border-border bg-card/60 p-8 text-center text-sm text-muted-foreground">{label}</div>;
}

// Re-exports for other routes that share these primitives / scope filter.
export { Field, Empty as EmptyState };

export function ScopeFilter({
  scope,
  setScope,
  className = "mb-6",
}: {
  scope: ServiceTag | "all";
  setScope: (s: ServiceTag | "all") => void;
  className?: string;
}) {
  return (
    <div className={`${className} flex items-center gap-2 text-sm flex-wrap`}>
      <span className="text-muted-foreground mr-2">Scope</span>
      <button
        onClick={() => setScope("all")}
        className={`rounded-full px-3 py-1 text-xs border ${scope === "all" ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground"}`}
      >All</button>
      {SERVICE_TAGS.map((t) => (
        <button
          key={t.value}
          onClick={() => setScope(t.value)}
          className={`rounded-full px-3 py-1 text-xs border ${scope === t.value ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:border-primary/40"}`}
        >{t.label}</button>
      ))}
    </div>
  );
}

/* -------------------- Module 1b — Ingest via chat --------------------
   Standalone chat-assist entry point: paste or upload a template, chat
   with the assistant to inspect it, then ingest as a new template family
   with extracted merge fields and attributes (admin always approves). */

const ALLOWED_DTYPE = ["address","boolean","date","json","multiselect","number","select","text"] as const;
type Dtype = typeof ALLOWED_DTYPE[number];
export function normaliseDataType(t: string | undefined): Dtype {
  const v = (t ?? "text").toLowerCase();
  if ((ALLOWED_DTYPE as readonly string[]).includes(v)) return v as Dtype;
  if (v === "long_text") return "text";
  if (v === "single_select") return "select";
  if (v === "multi_select") return "multiselect";
  if (v === "person") return "json";
  return "text";
}

function IngestChatDialog({ open, onOpenChange, onCreated }: {
  open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void;
}) {
  const [body, setBody] = useState("");
  const [name, setName] = useState("");
  const [service, setService] = useState<ServiceTag>("will");
  const [jurisdiction, setJurisdiction] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: "assistant", content: "Hi — paste a template on the left, or upload a .txt/.md file, and I'll help you inspect it before we ingest it. Try “What state is this for?”, “Extract the fields”, or “Suggest selection rules”." },
  ]);
  const [input, setInput] = useState("");
  const [detected, setDetected] = useState<{ key: string; label?: string; description?: string; data_type?: string }[] | null>(null);

  const chat = useServerFn(templateChat);
  const extract = useServerFn(extractTemplateAttributes);

  const send = useMutation({
    mutationFn: async () => {
      const next: ChatMsg[] = [...messages, { role: "user", content: input.trim() }];
      setMessages(next); setInput("");
      const res = await chat({ data: { messages: next, templateContext: body } });
      setMessages([...next, { role: "assistant", content: res.reply }]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runExtract = useMutation({
    mutationFn: async () => {
      if (!body.trim()) throw new Error("Paste or upload a template first.");
      const res = await extract({ data: { text: body, templateName: name || undefined } });
      setDetected(res.attributes as { key: string; label?: string; description?: string; data_type?: string }[]);
      toast.success(`Detected ${res.attributes.length} field${res.attributes.length === 1 ? "" : "s"} — review before ingest.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ingest = useMutation({
    mutationFn: async () => {
      if (!body.trim()) throw new Error("Nothing to ingest — paste a template first.");
      const famName = name.trim() || "Untitled template (via chat)";
      const { data: fam, error } = await supabase.from("template_families")
        .insert({ name: famName, service_tag: service, jurisdiction: jurisdiction || null, description: "Ingested via chat assist." })
        .select().single();
      if (error) throw error;
      const mergeFields = (detected ?? []).map((a) => ({ key: a.key, label: a.label ?? a.key, data_type: a.data_type ?? "text" }));
      const { data: ver, error: e2 } = await supabase.from("templates").insert({
        family_id: fam.id, name: famName, description: "Ingested via chat assist.",
        body, tags: [service], status: "draft", version: 1,
        merge_fields: asJson(mergeFields),
      }).select().single();
      if (e2) throw e2;
      // stash detected attributes for admin review inside the family
      if (detected && detected.length) {
        await supabase.from("detected_attributes").insert(detected.map((a) => ({
          template_id: ver.id, key: a.key, label: a.label ?? a.key,
          description: a.description ?? null, data_type: normaliseDataType(a.data_type), status: "pending" as const,
        })));
      }
      return fam.id as string;
    },
    onSuccess: (id) => { toast.success("Template ingested as draft"); reset(); onCreated(id); },
    onError: (e: Error) => toast.error(e.message),
  });

  const reset = () => {
    setBody(""); setName(""); setJurisdiction(""); setDetected(null);
    setMessages([{ role: "assistant", content: "Ready for the next template. Paste or upload when you are." }]);
  };

  const onFile = async (file: File) => {
    if (file.size > 2_000_000) return toast.error("File too large (2MB max for chat ingest — use New template for full PDF/DOCX).");
    const text = await file.text();
    setBody(text);
    if (!name) setName(file.name.replace(/\.[^.]+$/, ""));
    toast.success(`${file.name} loaded`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[calc(100vh-2rem)] overflow-hidden grid-rows-[auto_minmax(0,1fr)_auto]">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl flex items-center gap-2"><MessageSquare className="h-5 w-5 text-primary" />Chat assist — ingest a template</DialogTitle>
          <DialogDescription>Paste text or upload a plain-text template. Chat with the assistant, extract fields, then ingest as a new draft. Nothing is saved until you press Ingest.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0 overflow-y-auto pr-1">
          {/* Left: source + metadata */}
          <div className="space-y-3 min-h-0">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Template name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. NY Will — Single, no kids" /></Field>
              <Field label="Jurisdiction"><Input value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value.toUpperCase().slice(0, 2))} placeholder="CA" /></Field>
            </div>
            <Field label="Service">
              <Select value={service} onValueChange={(v) => setService(v as ServiceTag)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SERVICE_TAGS.filter((s) => s.value !== "common").map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>))}
                </SelectContent>
              </Select>
            </Field>
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Template text</Label>
              <label className="text-[11px] cursor-pointer inline-flex items-center gap-1 text-primary hover:underline">
                <Upload className="h-3 w-3" /> Upload .txt/.md
                <input type="file" accept=".txt,.md,text/plain,text/markdown" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
              </label>
            </div>
            <Textarea rows={14} value={body} onChange={(e) => setBody(e.target.value)}
              placeholder="Paste the template body here. Use {{merge_fields}} or [BRACKETED] placeholders — the assistant will find them." />
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => runExtract.mutate()} disabled={runExtract.isPending || !body.trim()}>
                {runExtract.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5 mr-1.5" />}
                Extract fields
              </Button>
              {detected && <span className="text-xs text-muted-foreground">{detected.length} detected</span>}
            </div>

            {detected && detected.length > 0 && (
              <div className="rounded-lg border border-border bg-card/60 p-3 max-h-40 overflow-y-auto space-y-1.5">
                {detected.map((a, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <Check className="h-3 w-3 text-primary shrink-0" />
                      <span className="font-medium truncate">{a.label ?? a.key}</span>
                      <span className="text-muted-foreground truncate">{a.key}</span>
                    </div>
                    <button onClick={() => setDetected((d) => (d ?? []).filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: chat */}
          <div className="space-y-2 flex min-h-0 flex-col">
            <div className="rounded-lg border border-border bg-card min-h-64 lg:min-h-0 lg:max-h-none overflow-y-auto p-4 space-y-3 lg:flex-1">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`rounded-lg px-3 py-2 max-w-[85%] text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                    {m.content}
                  </div>
                </div>
              ))}
              {send.isPending && <div className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Assistant is thinking…</div>}
            </div>
            <div className="flex flex-wrap gap-2">
              {["What state is this template for?", "Summarise the key clauses", "Which merge fields do you see?", "Suggest selection rules"].map((q) => (
                <button key={q} onClick={() => setInput(q)} className="text-[11px] rounded-full px-2.5 py-1 border border-border bg-card hover:border-primary/40 text-muted-foreground">
                  {q}
                </button>
              ))}
            </div>
            <div className="flex items-end gap-2">
              <Textarea value={input} onChange={(e) => setInput(e.target.value)} rows={2} placeholder="Ask about this template…"
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (input.trim()) send.mutate(); } }} />
              <Button onClick={() => send.mutate()} disabled={!input.trim() || send.isPending}><ArrowUp className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between shrink-0">
          <Button variant="ghost" onClick={() => { reset(); onOpenChange(false); }}>Cancel</Button>
          <Button onClick={() => ingest.mutate()} disabled={ingest.isPending || !body.trim()}>
            {ingest.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Ingest as new draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
