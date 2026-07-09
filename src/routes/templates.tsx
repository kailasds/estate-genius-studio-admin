import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { SERVICE_TAGS, tagLabel, type ServiceTag } from "@/lib/service-tags";
import { RULE_FIELDS, RULE_FIELD_MAP } from "@/lib/selection-rule-fields";
import { evaluateRules, type SelectionRule } from "@/lib/rule-evaluator";
import { Plus, Trash2, Upload, FileText, Sparkles, Send, Loader2, Copy, MessageSquare, Wand2, Check, X, PlayCircle, ArrowUp } from "lucide-react";
import { toast } from "sonner";
import { useDebouncedSave } from "@/lib/use-debounced-save";
import { extractTemplateAttributes, suggestSelectionRules, templateChat } from "@/lib/template-assist.functions";
import type { Database, Json } from "@/integrations/supabase/types";

// helper: cast our clause tree into the Json shape supabase-js expects
const asJson = (v: unknown): Json => v as unknown as Json;

type Template = Database["public"]["Tables"]["templates"]["Row"];
type Family = Database["public"]["Tables"]["template_families"]["Row"];
type Detected = Database["public"]["Tables"]["detected_attributes"]["Row"];
type Rule = Database["public"]["Tables"]["template_selection_rules"]["Row"];

export const Route = createFileRoute("/templates")({ component: TemplatesPage });

function TemplatesPage() {
  const qc = useQueryClient();
  const [openFamilyId, setOpenFamilyId] = useState<string | null>(null);
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
              <Card key={f.id} onClick={() => setOpenFamilyId(f.id)}
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

      <NewFamilyDialog open={newOpen} onOpenChange={setNewOpen} onCreated={(id) => { setOpenFamilyId(id); qc.invalidateQueries({ queryKey: ["template_families"] }); }} />
      <IngestChatDialog open={chatOpen} onOpenChange={setChatOpen} onCreated={(id) => { setChatOpen(false); setOpenFamilyId(id); qc.invalidateQueries({ queryKey: ["template_families"] }); qc.invalidateQueries({ queryKey: ["templates_all"] }); }} />

      <Sheet open={!!openFamilyId} onOpenChange={(o) => !o && setOpenFamilyId(null)}>
        <SheetContent className="w-full sm:max-w-4xl overflow-y-auto">
          {openFamilyId && <FamilyDetail familyId={openFamilyId} families={families} onClose={() => setOpenFamilyId(null)} />}
        </SheetContent>
      </Sheet>

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

/* -------------------- Family detail (tabs) -------------------- */

function FamilyDetail({ familyId, families, onClose }: { familyId: string; families: Family[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: family } = useQuery({
    queryKey: ["family", familyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("template_families").select("*").eq("id", familyId).single();
      if (error) throw error;
      return data as Family;
    },
  });
  const { data: versions = [] } = useQuery({
    queryKey: ["family_versions", familyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("templates").select("*").eq("family_id", familyId).order("version", { ascending: false });
      if (error) throw error;
      return data as Template[];
    },
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = versions.find((v) => v.id === selectedId) ?? versions[0] ?? null;

  const del = async () => {
    if (!confirm("Delete this template and all versions?")) return;
    await supabase.from("template_families").delete().eq("id", familyId);
    qc.invalidateQueries({ queryKey: ["template_families"] });
    qc.invalidateQueries({ queryKey: ["templates_all"] });
    onClose();
    toast.success("Template deleted");
  };

  if (!family) return <div className="p-8 text-muted-foreground text-sm">Loading…</div>;

  return (
    <>
      <SheetHeader className="mb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <SheetTitle className="font-serif text-2xl">{family.name}</SheetTitle>
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
              <Badge className="bg-primary-soft text-primary hover:bg-primary-soft border-0">{tagLabel(family.service_tag)}</Badge>
              {family.jurisdiction && <Badge variant="outline">{family.jurisdiction}</Badge>}
              <span>·</span><span>{versions.length} version{versions.length === 1 ? "" : "s"}</span>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={del} className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
        </div>
      </SheetHeader>

      <Tabs defaultValue="versions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="versions"><FileText className="h-3.5 w-3.5 mr-1.5" />Versions</TabsTrigger>
          <TabsTrigger value="attributes"><Wand2 className="h-3.5 w-3.5 mr-1.5" />Data attributes</TabsTrigger>
          <TabsTrigger value="rules"><PlayCircle className="h-3.5 w-3.5 mr-1.5" />Selection rules</TabsTrigger>
          <TabsTrigger value="test"><PlayCircle className="h-3.5 w-3.5 mr-1.5" />Test selection</TabsTrigger>
        </TabsList>

        <TabsContent value="versions">
          <VersionsTab
            family={family}
            versions={versions}
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
            onChanged={() => qc.invalidateQueries({ queryKey: ["family_versions", familyId] })}
          />
          {selected && <VersionEditor key={selected.id} row={selected} onChanged={() => qc.invalidateQueries({ queryKey: ["family_versions", familyId] })} />}
        </TabsContent>

        <TabsContent value="attributes">
          {selected ? <AttributesTab template={selected} /> : <Empty label="Create a version first." />}
        </TabsContent>

        <TabsContent value="rules">
          <RulesTab family={family} />
        </TabsContent>

        <TabsContent value="test">
          <TestSelectionPanel family={family} families={families} />
        </TabsContent>
      </Tabs>
    </>
  );
}

/* -------------------- Versions tab -------------------- */

function VersionsTab({ family, versions, selectedId, onSelect, onChanged }: {
  family: Family; versions: Template[]; selectedId: string | null; onSelect: (id: string) => void; onChanged: () => void;
}) {
  const newVersion = async () => {
    const latest = versions[0];
    const nextV = (latest?.version ?? 0) + 1;
    const { data, error } = await supabase.from("templates").insert({
      family_id: family.id, name: family.name, description: family.description,
      body: latest?.body ?? "", tags: [family.service_tag],
      status: "draft", version: nextV, merge_fields: latest?.merge_fields ?? [],
    }).select().single();
    if (error) return toast.error(error.message);
    onChanged();
    onSelect(data.id);
    toast.success(`Created draft v${nextV}`);
  };

  const publish = async (id: string) => {
    // demote any currently published version, promote this one
    await supabase.from("templates").update({ status: "archived" }).eq("family_id", family.id).eq("status", "published");
    const { error } = await supabase.from("templates").update({ status: "published" }).eq("id", id);
    if (error) return toast.error(error.message);
    onChanged();
    toast.success("Version published");
  };

  const unpublish = async (id: string) => {
    const { error } = await supabase.from("templates").update({ status: "draft" }).eq("id", id);
    if (error) return toast.error(error.message);
    onChanged();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this version?")) return;
    await supabase.from("templates").delete().eq("id", id);
    onChanged();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Version history</span>
        <Button size="sm" variant="outline" onClick={newVersion}><Plus className="h-3.5 w-3.5 mr-1.5" />New draft version</Button>
      </div>
      <div className="rounded-lg border border-border divide-y divide-border bg-card">
        {versions.map((v) => (
          <div key={v.id} className={`p-3 flex items-center gap-3 ${selectedId === v.id ? "bg-primary-soft/40" : ""}`}>
            <button className="flex-1 text-left" onClick={() => onSelect(v.id)}>
              <div className="text-sm font-medium">v{v.version} · {v.name}</div>
              <div className="text-[11px] text-muted-foreground">Updated {new Date(v.updated_at).toLocaleString()}</div>
            </button>
            <Badge className={
              v.status === "published" ? "bg-primary text-primary-foreground" :
              v.status === "archived" ? "bg-muted text-muted-foreground" : "bg-gold/20 text-gold-foreground border-0"
            }>{v.status}</Badge>
            {v.status === "published"
              ? <Button size="sm" variant="ghost" onClick={() => unpublish(v.id)}>Unpublish</Button>
              : <Button size="sm" variant="ghost" onClick={() => publish(v.id)}>Publish</Button>}
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(v.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------- Single version editor -------------------- */

function VersionEditor({ row, onChanged }: { row: Template; onChanged: () => void }) {
  const [draft, setDraft] = useState<Template>(row);

  useDebouncedSave(draft, async (v) => {
    const { error } = await supabase.from("templates").update({
      name: v.name, description: v.description, body: v.body, tags: v.tags,
      merge_fields: v.merge_fields, version_notes: v.version_notes,
    }).eq("id", v.id);
    if (error) throw error;
    onChanged();
  });

  const upload = async (file: File) => {
    const path = `${row.family_id}/${row.id}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("template-sources").upload(path, file, { upsert: true });
    if (error) return toast.error(error.message);
    await supabase.from("templates").update({ source_file_path: path }).eq("id", row.id);
    setDraft((d) => ({ ...d, source_file_path: path }));
    onChanged();
    toast.success(`${file.name} uploaded`);
  };

  const mergeFields = ((draft.merge_fields ?? []) as unknown[])
    .map((mf) => (typeof mf === "string" ? { key: mf } : (mf as { key: string })))
    .filter((mf) => mf && typeof mf.key === "string" && mf.key.length > 0);

  return (
    <div className="mt-6 space-y-5 border-t border-border pt-6">
      <h4 className="font-serif text-lg">Editing v{draft.version}</h4>
      <Field label="Version notes"><Input value={draft.version_notes ?? ""} onChange={(e) => setDraft({ ...draft, version_notes: e.target.value })} placeholder="What changed in this version?" /></Field>
      <Field label="Source document (PDF / DOCX)" hint="Uploaded once at ingestion. To swap the source, clone this template as a new version.">
        {draft.source_file_path
          ? <div className="text-xs text-muted-foreground truncate rounded-md border border-dashed border-border px-3 py-2">{draft.source_file_path}</div>
          : <label className="inline-flex items-center gap-2 text-sm cursor-pointer rounded-md border border-dashed border-border px-3 py-2 hover:border-primary/40">
              <Upload className="h-4 w-4 text-muted-foreground" />
              <span>Upload PDF or DOCX</span>
              <input type="file" accept=".pdf,.docx,.doc,.txt" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            </label>}
      </Field>
      <Field label="Template body" hint="Paste the template text here (use {{attribute_key}} for merge fields). This is what AI ingestion reads.">
        <Textarea rows={12} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} className="font-mono text-sm" />
      </Field>
      <Field label="Merge fields">
        <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
          {mergeFields.length === 0 ? <span className="text-muted-foreground">No merge fields recorded. Run "Extract data attributes" to detect them.</span>
            : <div className="flex flex-wrap gap-2">{mergeFields.map((mf, i) => (
                <span key={i} className="inline-flex items-center rounded-md bg-primary-soft text-primary px-2 py-1 text-xs">{`{{${mf.key}}}`}</span>))}</div>}
        </div>
      </Field>
    </div>
  );
}

/* -------------------- Attributes tab (detect + approve) -------------------- */

function AttributesTab({ template }: { template: Template }) {
  const qc = useQueryClient();
  const call = useServerFn(extractTemplateAttributes);
  const { data: detected = [], isLoading } = useQuery({
    queryKey: ["detected", template.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("detected_attributes").select("*").eq("template_id", template.id).order("created_at");
      if (error) throw error;
      return data as Detected[];
    },
  });

  const detect = useMutation({
    mutationFn: async () => {
      if (!template.body.trim()) throw new Error("Add template body text before running detection.");
      const res = await call({ data: { text: template.body, templateName: template.name } });
      if (!res.attributes.length) throw new Error("AI returned no attributes. Try adding more template body text.");
      const rows = res.attributes.slice(0, 60).map((a) => ({
        template_id: template.id,
        key: (a.key || "unnamed").toString().toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 60),
        label: (a.label || a.key || "Attribute").toString().slice(0, 120),
        description: (a.description ?? null),
        data_type: normaliseDataType(a.data_type as string | undefined) as Detected["data_type"],
        status: "pending" as const,
      }));
      const { error } = await supabase.from("detected_attributes").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["detected", template.id] }); toast.success("Detection complete — review below."); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const pending = detected.filter((d) => d.status === "pending");

  const approve = useMutation({
    mutationFn: async () => {
      const chosen = pending.filter((d) => selection[d.id]);
      if (chosen.length === 0) throw new Error("Select at least one detected attribute.");
      // read existing attribute keys to dedupe
      const { data: existing } = await supabase.from("attributes").select("key");
      const existingKeys = new Set((existing ?? []).map((r) => r.key));
      const attrsToInsert = chosen.filter((d) => !existingKeys.has(d.key)).map((d) => ({
        key: d.key, label: d.label, description: d.description, data_type: d.data_type, tags: [template.tags?.[0] ?? "common"],
      }));
      let newAttrIds: { id: string; key: string }[] = [];
      if (attrsToInsert.length) {
        const { data, error } = await supabase.from("attributes").insert(attrsToInsert).select("id,key");
        if (error) throw error;
        newAttrIds = data as { id: string; key: string }[];
      }
      // push new attributes into the questionnaire as fresh questions
      if (newAttrIds.length) {
        const service = template.tags?.[0] ?? "common";
        const questions = newAttrIds.map((a, i) => ({
          prompt: chosen.find((c) => c.key === a.key)?.label ?? a.key,
          help_text: chosen.find((c) => c.key === a.key)?.description ?? null,
          input_type: mapInputType(chosen.find((c) => c.key === a.key)?.data_type ?? "text"),
          attribute_id: a.id, tags: [service], sort_order: 1000 + i, required: false,
        }));
        await supabase.from("questions").insert(questions);
      }
      await supabase.from("detected_attributes").update({ status: "approved" }).in("id", chosen.map((c) => c.id));
      return { added: attrsToInsert.length, questions: newAttrIds.length, skipped: chosen.length - attrsToInsert.length };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["detected", template.id] });
      qc.invalidateQueries({ queryKey: ["attributes"] });
      qc.invalidateQueries({ queryKey: ["questions"] });
      setSelection({});
      toast.success(`Approved. ${r.added} new attribute${r.added === 1 ? "" : "s"} → ${r.questions} new question${r.questions === 1 ? "" : "s"}; ${r.skipped} already existed.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reject = async (id: string) => {
    await supabase.from("detected_attributes").update({ status: "rejected" }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["detected", template.id] });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">AI parses the template body for merge fields, bracketed placeholders and blanks. Nothing is saved until you approve.</div>
        <Button size="sm" onClick={() => detect.mutate()} disabled={detect.isPending}>
          {detect.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5 text-gold" />}
          Extract data attributes
        </Button>
      </div>

      {isLoading ? <div className="text-sm text-muted-foreground">Loading…</div>
        : pending.length === 0 ? <Empty label="No pending detected attributes. Run extraction to populate this list." />
        : (
          <div className="rounded-lg border border-border bg-card divide-y divide-border">
            {pending.map((d) => (
              <div key={d.id} className="p-3 flex items-start gap-3">
                <Checkbox checked={!!selection[d.id]} onCheckedChange={(v) => setSelection((s) => ({ ...s, [d.id]: !!v }))} className="mt-1" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Input value={d.label} onChange={(e) => updateDetected(qc, d.id, { label: e.target.value })} className="h-7 text-sm max-w-xs" />
                    <code className="text-[11px] bg-muted rounded px-1.5 py-0.5">{d.key}</code>
                    <Select value={d.data_type} onValueChange={(v) => updateDetected(qc, d.id, { data_type: v as Detected["data_type"] })}>
                      <SelectTrigger className="h-7 text-xs w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>{DATA_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  {d.description && <p className="text-xs text-muted-foreground mt-1">{d.description}</p>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => reject(d.id)}><X className="h-3.5 w-3.5" /></Button>
              </div>
            ))}
          </div>
        )}

      {pending.length > 0 && (
        <div className="flex items-center justify-between pt-2">
          <Button variant="outline" size="sm" onClick={() => setSelection(Object.fromEntries(pending.map((d) => [d.id, true])))}>Select all</Button>
          <Button onClick={() => approve.mutate()} disabled={approve.isPending}>
            {approve.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            <Check className="h-4 w-4 mr-1.5" />Approve selected → questions
          </Button>
        </div>
      )}
    </div>
  );
}

const DATA_TYPES = ["text","number","date","boolean","select","multiselect","address"] as const;
function mapInputType(t: string): Database["public"]["Enums"]["question_input_type"] {
  switch (t) {
    case "number": return "number";
    case "date": return "date";
    case "boolean": return "boolean";
    case "select": return "select";
    case "multiselect": return "multiselect";
    case "address": return "address";
    case "long_text": return "long_text";
    default: return "short_text";
  }
}
async function updateDetected(qc: ReturnType<typeof useQueryClient>, id: string, patch: Partial<Detected>) {
  await supabase.from("detected_attributes").update(patch).eq("id", id);
  qc.invalidateQueries({ queryKey: ["detected"] });
}

/* -------------------- Rules tab -------------------- */

function RulesTab({ family }: { family: Family }) {
  const qc = useQueryClient();
  const { data: rules = [] } = useQuery({
    queryKey: ["selection_rules", family.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("template_selection_rules").select("*").eq("template_family_id", family.id).order("priority");
      if (error) throw error;
      return data as Rule[];
    },
  });
  const call = useServerFn(suggestSelectionRules);

  const create = async (rule?: Partial<Rule>) => {
    const { error } = await supabase.from("template_selection_rules").insert({
      service_tag: family.service_tag, template_family_id: family.id,
      name: rule?.name ?? "New rule", priority: rule?.priority ?? 100,
      conditions: asJson(rule?.conditions ?? { op: "AND", clauses: [] }),
      is_fallback: rule?.is_fallback ?? false, active: true,
    });
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["selection_rules", family.id] });
  };

  const suggest = useMutation({
    mutationFn: async () => {
      const { data: pub } = await supabase.from("templates").select("body,name").eq("family_id", family.id).eq("status", "published").maybeSingle();
      const body = pub?.body || (await supabase.from("templates").select("body").eq("family_id", family.id).order("version", { ascending: false }).limit(1).maybeSingle()).data?.body || "";
      if (!body.trim()) throw new Error("Add a template body first.");
      return call({ data: { text: body, templateName: family.name, serviceTag: family.service_tag } });
    },
    onSuccess: async (res) => {
      if (!res.rules.length) return toast.error("AI returned no rules.");
      for (const r of res.rules) {
        await create({
          name: String((r as { name?: string }).name ?? "AI rule"),
          priority: Number((r as { priority?: number }).priority ?? 100),
          conditions: (r as { conditions?: unknown }).conditions ?? { op: "AND", clauses: [] },
          is_fallback: Boolean((r as { is_fallback?: boolean }).is_fallback),
        } as Partial<Rule>);
      }
      toast.success(`Added ${res.rules.length} suggested rule${res.rules.length === 1 ? "" : "s"} as drafts — review below.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">Rules decide when this template is selected for a member. Lower priority = evaluated first.</div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => suggest.mutate()} disabled={suggest.isPending}>
            {suggest.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5 text-gold" />}
            AI: suggest rules
          </Button>
          <Button size="sm" onClick={() => create()}><Plus className="h-3.5 w-3.5 mr-1.5" />New rule</Button>
        </div>
      </div>
      {rules.length === 0 ? <Empty label="No rules yet. Add one or ask AI to suggest based on the template body." /> : (
        <div className="space-y-3">
          {rules.map((r) => <RuleEditor key={r.id} rule={r} />)}
        </div>
      )}
    </div>
  );
}

function RuleEditor({ rule }: { rule: Rule }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Rule>(rule);
  useDebouncedSave(draft, async (v) => {
    await supabase.from("template_selection_rules").update({
      name: v.name, description: v.description, priority: v.priority,
      conditions: v.conditions, is_fallback: v.is_fallback, active: v.active,
    }).eq("id", v.id);
    qc.invalidateQueries({ queryKey: ["selection_rules"] });
  });

  const conds = normalizeConds(draft.conditions);

  const addClause = () => setDraft({ ...draft, conditions: asJson({ op: conds.op, clauses: [...conds.clauses, { field: "state", op: "eq", value: "" }] }) });
  const setClause = (i: number, patch: Partial<{ field: string; op: string; value: unknown }>) => {
    const next = conds.clauses.map((c, idx) => idx === i ? { ...c, ...patch } : c);
    setDraft({ ...draft, conditions: asJson({ op: conds.op, clauses: next }) });
  };
  const removeClause = (i: number) => setDraft({ ...draft, conditions: asJson({ op: conds.op, clauses: conds.clauses.filter((_, idx) => idx !== i) }) });

  const del = async () => {
    if (!confirm("Delete rule?")) return;
    await supabase.from("template_selection_rules").delete().eq("id", rule.id);
    qc.invalidateQueries({ queryKey: ["selection_rules"] });
  };

  return (
    <Card className="p-4 space-y-3 bg-card border-border">
      <div className="flex items-center gap-2">
        <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="font-medium" />
        <Label className="text-xs text-muted-foreground">Priority</Label>
        <Input type="number" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })} className="w-20" />
        <label className="flex items-center gap-1.5 text-xs whitespace-nowrap">
          <Checkbox checked={draft.is_fallback} onCheckedChange={(v) => setDraft({ ...draft, is_fallback: !!v })} />
          Fallback
        </label>
        <label className="flex items-center gap-1.5 text-xs whitespace-nowrap">
          <Checkbox checked={draft.active} onCheckedChange={(v) => setDraft({ ...draft, active: !!v })} />
          Active
        </label>
        <Button variant="ghost" size="sm" onClick={del} className="text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>

      <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Match</span>
          <Select value={conds.op} onValueChange={(v) => setDraft({ ...draft, conditions: asJson({ op: v as "AND" | "OR", clauses: conds.clauses }) })}>
            <SelectTrigger className="h-6 w-20 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="AND">ALL</SelectItem><SelectItem value="OR">ANY</SelectItem></SelectContent>
          </Select>
          <span>of the following conditions:</span>
        </div>
        {conds.clauses.length === 0 && <div className="text-xs text-muted-foreground italic">No conditions — {draft.is_fallback ? "will fire as fallback." : "won't fire until you add one."}</div>}
        {conds.clauses.map((c, i) => {
          const field = RULE_FIELD_MAP[c.field];
          return (
            <div key={i} className="flex items-center gap-2 flex-wrap">
              <Select value={c.field} onValueChange={(v) => setClause(i, { field: v, value: "" })}>
                <SelectTrigger className="h-7 text-xs w-48"><SelectValue /></SelectTrigger>
                <SelectContent>{RULE_FIELDS.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={c.op} onValueChange={(v) => setClause(i, { op: v as Clause["op"] })}>
                <SelectTrigger className="h-7 text-xs w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="eq">is</SelectItem>
                  <SelectItem value="in">is one of</SelectItem>
                  {field?.type === "multi" && <SelectItem value="contains">contains</SelectItem>}
                </SelectContent>
              </Select>
              <ClauseValueInput field={field} clause={c} onChange={(value) => setClause(i, { value })} />
              <Button variant="ghost" size="sm" onClick={() => removeClause(i)}><X className="h-3.5 w-3.5" /></Button>
            </div>
          );
        })}
        <Button size="sm" variant="ghost" onClick={addClause}><Plus className="h-3.5 w-3.5 mr-1.5" />Add condition</Button>
      </div>
    </Card>
  );
}

type Clause = { field: string; op: "eq" | "in" | "contains"; value: unknown };
function normalizeConds(c: unknown): { op: "AND" | "OR"; clauses: Clause[] } {
  if (Array.isArray(c)) return { op: "AND", clauses: c as Clause[] };
  if (c && typeof c === "object" && "clauses" in c) {
    const x = c as { op?: "AND" | "OR"; clauses?: Clause[] };
    return { op: x.op ?? "AND", clauses: x.clauses ?? [] };
  }
  return { op: "AND", clauses: [] };
}

function ClauseValueInput({ field, clause, onChange }: { field?: { type: string; options?: { value: string; label: string }[] }; clause: Clause; onChange: (v: unknown) => void }) {
  if (!field) return <Input value={String(clause.value ?? "")} onChange={(e) => onChange(e.target.value)} className="h-7 text-xs w-40" />;
  if (field.type === "bool") {
    return <Select value={String(clause.value ?? "")} onValueChange={(v) => onChange(v === "true")}>
      <SelectTrigger className="h-7 text-xs w-28"><SelectValue placeholder="—" /></SelectTrigger>
      <SelectContent><SelectItem value="true">true</SelectItem><SelectItem value="false">false</SelectItem></SelectContent>
    </Select>;
  }
  if (clause.op === "in") {
    const arr = Array.isArray(clause.value) ? (clause.value as string[]) : [];
    return (
      <div className="flex flex-wrap gap-1 max-w-md">
        {field.options?.map((o) => {
          const on = arr.includes(o.value);
          return <button type="button" key={o.value}
            onClick={() => onChange(on ? arr.filter((x) => x !== o.value) : [...arr, o.value])}
            className={`text-[11px] rounded-full px-2 py-0.5 border ${on ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground"}`}>
            {o.label}
          </button>;
        })}
      </div>
    );
  }
  return (
    <Select value={String(clause.value ?? "")} onValueChange={onChange}>
      <SelectTrigger className="h-7 text-xs w-48"><SelectValue placeholder="Select…" /></SelectTrigger>
      <SelectContent>{field.options?.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
    </Select>
  );
}

/* -------------------- Test-the-rules panel (inside a template) -------------------- */

type ChatMsg = { role: "user" | "assistant"; content: string };

function TestSelectionPanel({ family, families }: { family: Family; families: Family[] }) {
  const [profile, setProfile] = useState<Record<string, unknown>>({
    document_type: family.service_tag,
    state: family.jurisdiction ?? "CA",
    marital_status: "married",
    has_real_estate: true,
    has_minor_children: true,
  });

  const { data: allRules = [] } = useQuery({
    queryKey: ["all_rules"],
    queryFn: async () => {
      const { data } = await supabase.from("template_selection_rules").select("*");
      return (data ?? []) as Rule[];
    },
  });
  const { data: allPublished = [] } = useQuery({
    queryKey: ["all_published"],
    queryFn: async () => {
      const { data } = await supabase.from("templates").select("*").eq("status", "published");
      return (data ?? []) as Template[];
    },
  });

  const service = (profile.document_type as ServiceTag) ?? family.service_tag as ServiceTag;
  const result = evaluateRules(allRules as SelectionRule[], profile, service);
  const winnerFamily = families.find((f) => f.id === result.winner?.template_family_id);
  const publishedVersion = winnerFamily ? allPublished.find((v) => v.family_id === winnerFamily.id) : null;
  const wouldWinHere = winnerFamily?.id === family.id;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Enter a sample member profile. We evaluate every active rule for the chosen service and show whether <b>this</b> template would be selected.
      </p>
      <div className="grid grid-cols-2 gap-4 max-h-[45vh] overflow-y-auto pr-2">
        {RULE_FIELDS.map((f) => (
          <Field key={f.key} label={f.label} hint={f.hint}>
            {f.type === "bool" ? (
              <Select value={String(profile[f.key] ?? "")} onValueChange={(v) => setProfile({ ...profile, [f.key]: v === "" ? undefined : v === "true" })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent><SelectItem value="true">true</SelectItem><SelectItem value="false">false</SelectItem></SelectContent>
              </Select>
            ) : f.type === "multi" ? (
              <div className="flex flex-wrap gap-1">
                {f.options?.map((o) => {
                  const arr = (profile[f.key] as string[] | undefined) ?? [];
                  const on = arr.includes(o.value);
                  return <button type="button" key={o.value}
                    onClick={() => setProfile({ ...profile, [f.key]: on ? arr.filter((x) => x !== o.value) : [...arr, o.value] })}
                    className={`text-[11px] rounded-full px-2 py-0.5 border ${on ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground"}`}>{o.label}</button>;
                })}
              </div>
            ) : (
              <Select value={String(profile[f.key] ?? "")} onValueChange={(v) => setProfile({ ...profile, [f.key]: v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent className="max-h-64">{f.options?.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </Field>
        ))}
      </div>
      <div className={`rounded-lg border p-4 ${wouldWinHere ? "border-primary/40 bg-primary-soft/60" : "border-border bg-muted/40"}`}>
        <div className="text-xs uppercase tracking-wider text-primary/80 mb-1">Result</div>
        {result.winner ? (
          <>
            <div className="font-serif text-lg">{winnerFamily?.name ?? "Unknown template"} {wouldWinHere && <span className="text-primary text-xs">(this template)</span>}</div>
            <div className="text-xs text-muted-foreground mt-1">
              Rule <b>{result.winner.name}</b> · priority {result.winner.priority}
              {result.winner.is_fallback && " · fallback"}
              {publishedVersion ? ` · would use v${publishedVersion.version}` : " · no published version"}
            </div>
          </>
        ) : (
          <div className="text-sm text-muted-foreground">No matching rule and no fallback configured for {tagLabel(service)}.</div>
        )}
      </div>
    </div>
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

export function ScopeFilter({ scope, setScope }: { scope: ServiceTag | "all"; setScope: (s: ServiceTag | "all") => void }) {
  return (
    <div className="mb-6 flex items-center gap-2 text-sm flex-wrap">
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
function normaliseDataType(t: string | undefined): Dtype {
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
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl flex items-center gap-2"><MessageSquare className="h-5 w-5 text-primary" />Chat assist — ingest a template</DialogTitle>
          <DialogDescription>Paste text or upload a plain-text template. Chat with the assistant, extract fields, then ingest as a new draft. Nothing is saved until you press Ingest.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left: source + metadata */}
          <div className="space-y-3">
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
          <div className="space-y-2 flex flex-col">
            <div className="rounded-lg border border-border bg-card min-h-[24rem] max-h-[28rem] overflow-y-auto p-4 space-y-3 flex-1">
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

        <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
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
