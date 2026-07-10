import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, EmptyState as Empty, normaliseDataType } from "@/routes/templates";
import { tagLabel, type ServiceTag } from "@/lib/service-tags";
import { RULE_FIELDS, RULE_FIELD_MAP } from "@/lib/selection-rule-fields";
import { evaluateRules, type SelectionRule } from "@/lib/rule-evaluator";
import { Plus, Trash2, Upload, FileText, Sparkles, Loader2, Wand2, Check, X, PlayCircle, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useDebouncedSave } from "@/lib/use-debounced-save";
import { extractTemplateAttributes, suggestSelectionRules } from "@/lib/template-assist.functions";
import type { Database, Json } from "@/integrations/supabase/types";

const asJson = (v: unknown): Json => v as unknown as Json;

type Template = Database["public"]["Tables"]["templates"]["Row"];
type Family = Database["public"]["Tables"]["template_families"]["Row"];
type Detected = Database["public"]["Tables"]["detected_attributes"]["Row"];
type Rule = Database["public"]["Tables"]["template_selection_rules"]["Row"];

export const Route = createFileRoute("/templates_/$familyId")({ component: TemplateDetailPage });

function TemplateDetailPage() {
  const { familyId } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: family } = useQuery({
    queryKey: ["family", familyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("template_families").select("*").eq("id", familyId).single();
      if (error) throw error;
      return data as Family;
    },
  });
  const { data: families = [] } = useQuery({
    queryKey: ["template_families"],
    queryFn: async () => {
      const { data, error } = await supabase.from("template_families").select("*").order("created_at");
      if (error) throw error;
      return data as Family[];
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
    toast.success("Template deleted");
    navigate({ to: "/templates" });
  };

  const backLink = (
    <Link to="/templates" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
      <ArrowLeft className="h-3.5 w-3.5" /> Back to Templates
    </Link>
  );

  if (!family) {
    return (
      <AppShell title="Templates" eyebrow={backLink}>
        <div className="p-8 text-muted-foreground text-sm">Loading…</div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={family.name}
      crumb={family.name}
      subtitle={family.description ?? undefined}
      eyebrow={backLink}
      action={<Button variant="ghost" size="sm" onClick={del} className="text-destructive"><Trash2 className="h-4 w-4 mr-1.5" />Delete</Button>}
    >
      <div className="text-xs text-muted-foreground mb-6 flex items-center gap-2">
        <Badge className="bg-primary-soft text-primary hover:bg-primary-soft border-0">{tagLabel(family.service_tag)}</Badge>
        {family.jurisdiction && <Badge variant="outline">{family.jurisdiction}</Badge>}
        <span>·</span><span>{versions.length} version{versions.length === 1 ? "" : "s"}</span>
      </div>

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
    </AppShell>
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
      <div className="flex items-center justify-between gap-6">
        <div className="text-sm text-muted-foreground">AI parses the template body for merge fields, bracketed placeholders and blanks. Nothing is saved until you approve.</div>
        <Button size="sm" onClick={() => detect.mutate()} disabled={detect.isPending}>
          {detect.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin text-white" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5 text-white" />}
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
