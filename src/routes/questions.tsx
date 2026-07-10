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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { TagChips, TagPicker } from "@/components/tag-chips";
import { SERVICE_TAGS, tagLabel, type ServiceTag } from "@/lib/service-tags";
import {
  Plus, Trash2, GripVertical, Sparkles, Loader2, Upload, Link as LinkIcon, FileText,
  Route as RouteIcon, GitBranch, History, AlertTriangle, CheckCircle2, X, ChevronRight,
  Compass, ChevronUp, ChevronDown, Lightbulb,
} from "lucide-react";
import { toast } from "sonner";
import { useDebouncedSave } from "@/lib/use-debounced-save";
import { AiAssistButton } from "@/components/ai-assist-dialog";
import { ScopeFilter, EmptyState, Field } from "@/routes/templates";
import { generateQuestionFromAttribute } from "@/lib/question-assist.functions";
import type { Database, Json } from "@/integrations/supabase/types";

type Question = Database["public"]["Tables"]["questions"]["Row"];
type Attribute = Database["public"]["Tables"]["attributes"]["Row"];
type KbAsset = Database["public"]["Tables"]["question_kb_assets"]["Row"];
type Version = Database["public"]["Tables"]["question_set_versions"]["Row"];
type Signal = Database["public"]["Tables"]["discovery_signals"]["Row"];
type SignalOption = { value: string; label: string };

const SIGNAL_INPUT_TYPES = [
  { value: "select", label: "Single choice" },
  { value: "multiselect", label: "Multiple choice" },
  { value: "boolean", label: "Yes / No" },
  { value: "text", label: "Free text" },
  { value: "number", label: "Number" },
];
const SIGNAL_INPUT_TYPE_LABEL: Record<string, string> = Object.fromEntries(SIGNAL_INPUT_TYPES.map((t) => [t.value, t.label]));

const asJson = (v: unknown): Json => v as unknown as Json;

const INPUT_TYPES = [
  "short_text", "long_text", "number", "date", "boolean", "select", "multiselect",
  "address", "document_upload", "voice_input",
] as const;

const INPUT_TYPE_LABEL: Record<string, string> = {
  short_text: "Short text",
  long_text: "Long text",
  number: "Number",
  date: "Date",
  boolean: "Yes / No",
  select: "Single-select (radio)",
  multiselect: "Multi-select",
  address: "Address",
  document_upload: "Document upload",
  voice_input: "Voice input",
};

export const Route = createFileRoute("/questions")({ component: QuestionsPage });

/* ============================================================
   Page
   ============================================================ */

function QuestionsPage() {
  const qc = useQueryClient();
  const [scope, setScope] = useState<ServiceTag | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);

  const { data: questions = [] } = useQuery({
    queryKey: ["questions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("questions").select("*").order("sort_order").order("created_at");
      if (error) throw error;
      return data as Question[];
    },
  });

  const { data: attributes = [] } = useQuery({
    queryKey: ["attributes"],
    queryFn: async () => (await supabase.from("attributes").select("*").order("label")).data as Attribute[] ?? [],
  });

  const filtered = useMemo(
    () => (scope === "all" ? questions : questions.filter((q) => (q.tags ?? []).includes(scope))),
    [questions, scope],
  );

  const attrsInScope = useMemo(
    () => (scope === "all" ? attributes : attributes.filter((a) => (a.tags ?? []).includes(scope))),
    [attributes, scope],
  );

  const unmapped = useMemo(() => {
    const mapped = new Set(questions.map((q) => q.attribute_id).filter(Boolean) as string[]);
    return attrsInScope.filter((a) => !mapped.has(a.id));
  }, [attrsInScope, questions]);

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from("questions").insert({
        prompt: "New question", input_type: "short_text", tags: [], options: [], routing: {},
        sort_order: (questions[questions.length - 1]?.sort_order ?? 0) + 10,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (row) => { qc.invalidateQueries({ queryKey: ["questions"] }); setSelectedId(row.id); },
  });

  const selected = questions.find((q) => q.id === selectedId) ?? null;

  return (
    <AppShell
      title="Question Management"
      subtitle="One shared question bank. Every question is tagged with the services it powers — the member app composes the right subset per document and dedupes automatically."
      action={
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setVersionsOpen(true)}><History className="h-4 w-4 mr-1.5" />Versions</Button>
          <Button size="icon" onClick={() => create.mutate()} aria-label="New question" title="New question"><Plus className="h-4 w-4" /></Button>
        </div>
      }
    >
      <Tabs defaultValue="questions" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="questions">Questions</TabsTrigger>
          <TabsTrigger value="signals">Discovery signals</TabsTrigger>
        </TabsList>

        <TabsContent value="questions">
          <ScopeFilter scope={scope} setScope={setScope} />

          {unmapped.length > 0 && (
            <UnmappedAttributesPanel
              attributes={unmapped}
              scope={scope}
              onCreated={(id) => { qc.invalidateQueries({ queryKey: ["questions"] }); setSelectedId(id); }}
            />
          )}

          {filtered.length === 0 ? (
            <EmptyState label="No questions in this scope yet. Approve template attributes or add one manually." />
          ) : (
            <Card className="divide-y divide-border overflow-hidden shadow-card">
              {filtered.map((q, i) => {
                const attr = attributes.find((a) => a.id === q.attribute_id);
                return (
                  <div
                    key={q.id}
                    onClick={() => setSelectedId(q.id)}
                    className="flex items-start gap-4 px-5 py-4 cursor-pointer hover:bg-muted/40"
                  >
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-[10px] text-muted-foreground font-mono">{i + 1}</span>
                      <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-foreground">{q.prompt}</div>
                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px]">{INPUT_TYPE_LABEL[q.input_type] ?? q.input_type}</Badge>
                        {attr ? <span>→ {attr.label}</span> : <span className="text-amber-700">unmapped</span>}
                        {hasRouting(q.routing) && <span className="inline-flex items-center gap-1 text-primary"><GitBranch className="h-3 w-3" /> routing</span>}
                      </div>
                    </div>
                    <TagChips tags={q.tags} className="justify-end max-w-xs" />
                  </div>
                );
              })}
            </Card>
          )}
        </TabsContent>

        <TabsContent value="signals">
          <DiscoverySignalsTab />
        </TabsContent>
      </Tabs>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
          {selected && (
            <QuestionEditor
              key={selected.id}
              row={selected}
              attributes={attributes}
              questions={questions}
              onDelete={() => setSelectedId(null)}
              onJump={(qid) => setSelectedId(qid)}
            />
          )}
        </SheetContent>
      </Sheet>

      <VersionsDialog open={versionsOpen} onOpenChange={setVersionsOpen} questions={questions} />
    </AppShell>
  );
}

/* ============================================================
   Unmapped attributes → generate questions with AI
   ============================================================ */

function UnmappedAttributesPanel({
  attributes, scope, onCreated,
}: { attributes: Attribute[]; scope: ServiceTag | "all"; onCreated: (id: string) => void }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewAttr, setPreviewAttr] = useState<Attribute | null>(null);
  const gen = useServerFn(generateQuestionFromAttribute);

  const [draft, setDraft] = useState<{
    prompt: string; help_text: string | null; input_type: Question["input_type"];
    options: { value: string; label: string }[];
  } | null>(null);

  const runGenerate = async (attr: Attribute) => {
    setBusyId(attr.id);
    try {
      const res = await gen({ data: {
        key: attr.key, label: attr.label, description: attr.description,
        data_type: attr.data_type, tags: attr.tags ?? [],
      }});
      setDraft({
        prompt: res.prompt,
        help_text: res.help_text,
        input_type: res.input_type as Question["input_type"],
        options: res.options ?? [],
      });
      setPreviewAttr(attr);
      setPreviewOpen(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const approveCreate = async () => {
    if (!previewAttr || !draft) return;
    const tags = ((previewAttr.tags ?? []) as ServiceTag[]);
    const { data, error } = await supabase.from("questions").insert({
      prompt: draft.prompt, help_text: draft.help_text ?? null,
      input_type: draft.input_type, attribute_id: previewAttr.id,
      tags, options: asJson(draft.options), routing: asJson({}),
      sort_order: 1000, required: false,
    }).select().single();
    if (error) return toast.error(error.message);
    toast.success("Question added");
    setPreviewOpen(false); setDraft(null); setPreviewAttr(null);
    onCreated(data.id);
  };

  return (
    <Card className="p-4 mb-6 border-dashed border-primary/30 bg-primary-soft/30">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-serif text-lg flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Attributes waiting for a question</div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {attributes.length} attribute{attributes.length === 1 ? "" : "s"} in {scope === "all" ? "the bank" : tagLabel(scope)} have no question yet.
            AI will draft the prompt, help text, input type and options — you always approve.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {attributes.slice(0, 12).map((a) => (
          <button
            key={a.id}
            onClick={() => runGenerate(a)}
            disabled={busyId === a.id}
            className="inline-flex items-center gap-1.5 rounded-full bg-card border border-border px-3 py-1 text-xs hover:border-primary/50 transition-colors disabled:opacity-60"
          >
            {busyId === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3 text-primary" />}
            <span className="font-medium">{a.label}</span>
            <span className="text-muted-foreground">{a.key}</span>
          </button>
        ))}
        {attributes.length > 12 && <span className="text-xs text-muted-foreground self-center">+{attributes.length - 12} more</span>}
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[calc(100vh-2rem)] overflow-hidden grid-rows-[auto_minmax(0,1fr)_auto]">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">Review AI-drafted question</DialogTitle>
            <DialogDescription>
              For attribute <b>{previewAttr?.label}</b> (<code className="text-xs">{previewAttr?.key}</code>). Edit anything below, then approve to add it to the bank.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto pr-1">
            {draft && (
              <div className="space-y-4">
                <Field label="Prompt">
                  <Textarea rows={2} value={draft.prompt} onChange={(e) => setDraft({ ...draft, prompt: e.target.value })} />
                </Field>
                <Field label="Help text">
                  <Textarea rows={2} value={draft.help_text ?? ""} onChange={(e) => setDraft({ ...draft, help_text: e.target.value })} />
                </Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Input type">
                    <Select value={draft.input_type} onValueChange={(v) => setDraft({ ...draft, input_type: v as Question["input_type"] })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {INPUT_TYPES.map((t) => <SelectItem key={t} value={t}>{INPUT_TYPE_LABEL[t]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                {(draft.input_type === "select" || draft.input_type === "multiselect") && (
                  <Field label="Answer options">
                    <OptionsEditor
                      options={draft.options}
                      onChange={(opts) => setDraft({ ...draft, options: opts })}
                    />
                  </Field>
                )}
              </div>
            )}
          </div>
          <DialogFooter className="shrink-0">
            <Button variant="ghost" onClick={() => setPreviewOpen(false)}>Discard</Button>
            <Button onClick={approveCreate} disabled={!draft?.prompt.trim()}>
              <CheckCircle2 className="h-4 w-4 mr-1.5" />Approve & add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ============================================================
   Question editor (tabs)
   ============================================================ */

function QuestionEditor({
  row, attributes, questions, onDelete, onJump,
}: {
  row: Question; attributes: Attribute[]; questions: Question[]; onDelete: () => void; onJump: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Question>(row);

  useDebouncedSave(draft, async (v) => {
    const { error } = await supabase.from("questions").update({
      prompt: v.prompt, help_text: v.help_text, input_type: v.input_type,
      attribute_id: v.attribute_id, tags: v.tags, options: v.options,
      required: v.required, routing: v.routing, sort_order: v.sort_order,
      how_to_answer: (v as any).how_to_answer ?? null,
      why_we_ask: (v as any).why_we_ask ?? null,
    } as any).eq("id", v.id);
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["questions"] });
  });

  const del = async () => {
    if (!confirm("Delete this question?")) return;
    await supabase.from("questions").delete().eq("id", row.id);
    qc.invalidateQueries({ queryKey: ["questions"] });
    onDelete();
    toast.success("Question deleted");
  };

  const options = (draft.options ?? []) as { value: string; label: string }[];
  const needsOptions = draft.input_type === "select" || draft.input_type === "multiselect";

  return (
    <>
      <SheetHeader className="mb-4">
        <SheetTitle className="font-serif text-2xl">Edit question</SheetTitle>
        <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
          <Badge variant="outline">{INPUT_TYPE_LABEL[draft.input_type]}</Badge>
          <TagChips tags={draft.tags} />
        </div>
      </SheetHeader>

      <Tabs defaultValue="question" className="space-y-4">
        <TabsList>
          <TabsTrigger value="question"><FileText className="h-3.5 w-3.5 mr-1.5" />Question</TabsTrigger>
          <TabsTrigger value="kb"><Upload className="h-3.5 w-3.5 mr-1.5" />Knowledge base</TabsTrigger>
          <TabsTrigger value="routing"><RouteIcon className="h-3.5 w-3.5 mr-1.5" />Routing</TabsTrigger>
        </TabsList>

        <TabsContent value="question">
          <div className="space-y-5">
            <Field label="Prompt">
              <Textarea rows={2} value={draft.prompt} onChange={(e) => setDraft({ ...draft, prompt: e.target.value })} />
              <div className="flex gap-2 mt-2">
                <AiAssistButton task="rewrite_question" content={draft.prompt} label="AI: rewrite for clarity" onApprove={(t) => setDraft({ ...draft, prompt: t.trim() })} />
                <AiAssistButton task="suggest_followups" content={draft.prompt} label="AI: suggest follow-ups" onApprove={(t) => setDraft({ ...draft, help_text: (draft.help_text ? draft.help_text + "\n\n" : "") + "Follow-ups:\n" + t })} />
              </div>
            </Field>

            <Field label="Help text (optional)">
              <Textarea rows={2} value={draft.help_text ?? ""} onChange={(e) => setDraft({ ...draft, help_text: e.target.value })} />
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label='"How to answer" tip' hint="Practical guidance the member sees on this question.">
                <Textarea rows={3} value={(draft as any).how_to_answer ?? ""} onChange={(e) => setDraft({ ...draft, how_to_answer: e.target.value } as any)} />
              </Field>
              <Field label='"Why we ask this" tip' hint="Plain-language reason the member needs to answer this.">
                <Textarea rows={3} value={(draft as any).why_we_ask ?? ""} onChange={(e) => setDraft({ ...draft, why_we_ask: e.target.value } as any)} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Input type">
                <Select value={draft.input_type} onValueChange={(v) => setDraft({ ...draft, input_type: v as Question["input_type"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INPUT_TYPES.map((t) => <SelectItem key={t} value={t}>{INPUT_TYPE_LABEL[t]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Sort order">
                <Input type="number" value={draft.sort_order} onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) })} />
              </Field>
            </div>

            <Field label="Mapped attribute" hint="The canonical fact this question captures.">
              <Select value={draft.attribute_id ?? "none"} onValueChange={(v) => setDraft({ ...draft, attribute_id: v === "none" ? null : v })}>
                <SelectTrigger><SelectValue placeholder="Unmapped" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unmapped</SelectItem>
                  {attributes.map((a) => <SelectItem key={a.id} value={a.id}>{a.label} — {a.key}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Service tags"><TagPicker value={(draft.tags ?? []) as ServiceTag[]} onChange={(v) => setDraft({ ...draft, tags: v })} /></Field>

            {needsOptions && (
              <Field label="Answer options">
                <OptionsEditor options={options} onChange={(opts) => setDraft({ ...draft, options: asJson(opts) })} />
              </Field>
            )}

            <Field label="Preview" hint="How the member will see this question.">
              <QuestionPreview prompt={draft.prompt} help={draft.help_text} inputType={draft.input_type} options={options} />
            </Field>

            <div className="flex items-center justify-between pt-4 border-t border-border">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={draft.required} onChange={(e) => setDraft({ ...draft, required: e.target.checked })} />
                Required
              </label>
              <Button variant="ghost" onClick={del} className="text-destructive"><Trash2 className="h-4 w-4 mr-1.5" />Delete</Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="kb">
          <KnowledgeBasePanel questionId={row.id} />
        </TabsContent>

        <TabsContent value="routing">
          <RoutingEditor question={draft} allQuestions={questions} onChange={(routing) => setDraft({ ...draft, routing: asJson(routing) })} onJump={onJump} />
        </TabsContent>
      </Tabs>
    </>
  );
}

/* ============================================================
   Preview
   ============================================================ */

function QuestionPreview({
  prompt, help, inputType, options,
}: { prompt: string; help: string | null; inputType: Question["input_type"]; options: { value: string; label: string }[] }) {
  return (
    <div className="rounded-xl bg-paper-deep/60 p-6 border border-border">
      <div className="font-serif text-xl text-foreground">{prompt}</div>
      {help && <div className="text-sm text-muted-foreground mt-1 whitespace-pre-line">{help}</div>}
      <div className="mt-4">
        {inputType === "long_text" ? <Textarea disabled placeholder="Member answers here…" /> :
          inputType === "boolean" ? (
            <div className="flex gap-2">
              <button disabled className="px-4 py-1.5 rounded-md border border-border bg-card text-sm">Yes</button>
              <button disabled className="px-4 py-1.5 rounded-md border border-border bg-card text-sm">No</button>
            </div>
          ) :
          inputType === "select" || inputType === "multiselect" ? (
            <div className="flex flex-wrap gap-2">
              {options.length === 0 && <span className="text-xs text-muted-foreground">Add options above.</span>}
              {options.map((o, i) => <span key={i} className="px-3 py-1.5 rounded-md border border-border bg-card text-sm">{o.label || o.value}</span>)}
            </div>
          ) :
          inputType === "document_upload" ? (
            <div className="border-2 border-dashed border-border rounded-md p-6 text-center text-sm text-muted-foreground">
              <Upload className="h-5 w-5 mx-auto mb-1" /> Member uploads a document here
            </div>
          ) :
          inputType === "voice_input" ? (
            <div className="border border-border rounded-md p-4 text-center text-sm text-muted-foreground">🎙️ Member records a voice answer</div>
          ) :
          inputType === "date" ? <Input disabled type="date" /> :
          inputType === "number" ? <Input disabled type="number" placeholder="0" /> :
          <Input disabled placeholder="Member answers here…" />}
      </div>
    </div>
  );
}

/* ============================================================
   Options editor
   ============================================================ */

function OptionsEditor({
  options, onChange,
}: { options: { value: string; label: string }[]; onChange: (opts: { value: string; label: string }[]) => void }) {
  return (
    <div className="space-y-2">
      {options.map((o, i) => (
        <div key={i} className="flex gap-2">
          <Input placeholder="value" value={o.value} onChange={(e) => {
            const next = [...options]; next[i] = { ...o, value: e.target.value }; onChange(next);
          }} className="max-w-[160px]" />
          <Input placeholder="Label shown to member" value={o.label} onChange={(e) => {
            const next = [...options]; next[i] = { ...o, label: e.target.value }; onChange(next);
          }} />
          <Button variant="ghost" size="icon" onClick={() => onChange(options.filter((_, j) => j !== i))}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={() => onChange([...options, { value: "", label: "" }])}>
        <Plus className="h-3.5 w-3.5 mr-1" />Add option
      </Button>
    </div>
  );
}

/* ============================================================
   Knowledge base per question
   ============================================================ */

function KnowledgeBasePanel({ questionId }: { questionId: string }) {
  const qc = useQueryClient();
  const { data: assets = [] } = useQuery({
    queryKey: ["kb", questionId],
    queryFn: async () => {
      const { data, error } = await supabase.from("question_kb_assets")
        .select("*").eq("question_id", questionId).order("created_at");
      if (error) throw error;
      return data as KbAsset[];
    },
  });

  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [tipTitle, setTipTitle] = useState("");
  const [tipNotes, setTipNotes] = useState("");

  const onFile = async (file: File) => {
    if (file.size > 15_000_000) return toast.error("File too large (15MB max).");
    const path = `${questionId}/${Date.now()}-${file.name}`;
    const up = await supabase.storage.from("question-kb").upload(path, file, { upsert: false });
    if (up.error) return toast.error(up.error.message);
    const { error } = await supabase.from("question_kb_assets").insert({
      question_id: questionId, kind: "file", filename: file.name, mime_type: file.type,
      file_path: path, title: file.name,
    });
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["kb", questionId] });
    toast.success(`${file.name} added to knowledge base`);
  };

  const addLink = async () => {
    if (!linkUrl.trim()) return;
    const { error } = await supabase.from("question_kb_assets").insert({
      question_id: questionId, kind: "link", url: linkUrl.trim(), title: linkTitle.trim() || linkUrl.trim(),
    });
    if (error) return toast.error(error.message);
    setLinkTitle(""); setLinkUrl("");
    qc.invalidateQueries({ queryKey: ["kb", questionId] });
    toast.success("Link added");
  };

  const addTip = async () => {
    if (!tipTitle.trim() || !tipNotes.trim()) return;
    // Stored as kind "link" (no url) — the "notes" field is what marks this as a quick FAQ
    // tip rather than a real reference link, since the kind column only allows file/link.
    const { error } = await supabase.from("question_kb_assets").insert({
      question_id: questionId, kind: "link", title: tipTitle.trim(), notes: tipNotes.trim(),
    });
    if (error) return toast.error(error.message);
    setTipTitle(""); setTipNotes("");
    qc.invalidateQueries({ queryKey: ["kb", questionId] });
    toast.success("FAQ tip added");
  };

  const remove = async (a: KbAsset) => {
    if (!confirm("Remove this reference?")) return;
    if (a.kind === "file" && a.file_path) {
      await supabase.storage.from("question-kb").remove([a.file_path]);
    }
    await supabase.from("question_kb_assets").delete().eq("id", a.id);
    qc.invalidateQueries({ queryKey: ["kb", questionId] });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Reference material the AI assistant can use when a member asks a question about this step — PDFs, links, and quick FAQ tips shown right on the question.
      </p>

      <div className="grid grid-cols-3 gap-3">
        <label className="rounded-lg border border-dashed border-border bg-card hover:border-primary/40 cursor-pointer p-4 flex flex-col items-center justify-center gap-2 text-sm">
          <Upload className="h-5 w-5 text-primary" />
          <span className="font-medium">Upload file</span>
          <span className="text-[11px] text-muted-foreground">PDF, DOCX, TXT · up to 15MB</span>
          <input type="file" className="hidden" accept=".pdf,.docx,.doc,.txt,.md"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
        </label>
        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          <div className="text-sm font-medium flex items-center gap-1.5"><LinkIcon className="h-4 w-4 text-primary" />Add link</div>
          <Input placeholder="Title (optional)" value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} />
          <Input placeholder="https://…" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
          <Button size="sm" onClick={addLink} disabled={!linkUrl.trim()}>Add</Button>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          <div className="text-sm font-medium flex items-center gap-1.5"><Lightbulb className="h-4 w-4 text-primary" />Add FAQ tip</div>
          <Input placeholder="e.g. Which address do I use?" value={tipTitle} onChange={(e) => setTipTitle(e.target.value)} />
          <Textarea rows={2} placeholder="Short, plain-language answer…" value={tipNotes} onChange={(e) => setTipNotes(e.target.value)} />
          <Button size="sm" onClick={addTip} disabled={!tipTitle.trim() || !tipNotes.trim()}>Add</Button>
        </div>
      </div>

      {assets.length === 0 ? (
        <EmptyState label="No knowledge-base references yet." />
      ) : (
        <div className="rounded-lg border border-border divide-y divide-border bg-card">
          {assets.map((a) => (
            <div key={a.id} className="p-3 flex items-center gap-3">
              {a.kind === "file" ? <FileText className="h-4 w-4 text-primary shrink-0" />
                : a.notes ? <Lightbulb className="h-4 w-4 text-primary shrink-0" />
                : <LinkIcon className="h-4 w-4 text-primary shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{a.title ?? a.filename ?? a.url}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {a.kind === "file" ? (a.mime_type || "file") + " · " + (a.file_path ?? "")
                    : a.notes ? a.notes
                    : a.url}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => remove(a)} className="text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Routing editor + validation
   ============================================================ */

type Branch = { when: string; goto: string };
type Routing = { branches?: Branch[]; default_next?: string | null };

function normaliseRouting(r: unknown): Routing {
  if (!r || typeof r !== "object") return {};
  const rr = r as Routing;
  return {
    branches: Array.isArray(rr.branches) ? rr.branches : [],
    default_next: rr.default_next ?? null,
  };
}
function hasRouting(r: unknown): boolean {
  const rr = normaliseRouting(r);
  return (rr.branches?.length ?? 0) > 0 || !!rr.default_next;
}

function RoutingEditor({
  question, allQuestions, onChange, onJump,
}: { question: Question; allQuestions: Question[]; onChange: (r: Routing) => void; onJump: (id: string) => void }) {
  const routing = normaliseRouting(question.routing);
  const branches: Branch[] = routing.branches ?? [];
  const others = allQuestions.filter((q) => q.id !== question.id).sort((a, b) => a.sort_order - b.sort_order);

  const options = ((question.options ?? []) as { value: string; label: string }[]);
  const isChoice = question.input_type === "select" || question.input_type === "multiselect";
  const isBool = question.input_type === "boolean";
  const possibleAnswers: { value: string; label: string }[] = isBool
    ? [{ value: "true", label: "Yes" }, { value: "false", label: "No" }]
    : isChoice ? options : [];

  const addBranch = () => onChange({ ...routing, branches: [...branches, { when: possibleAnswers[0]?.value ?? "", goto: "" }] });
  const setBranch = (i: number, patch: Partial<Branch>) => onChange({
    ...routing,
    branches: branches.map((b, idx) => idx === i ? { ...b, ...patch } : b),
  });
  const removeBranch = (i: number) => onChange({ ...routing, branches: branches.filter((_, idx) => idx !== i) });

  // Validation for THIS question
  const issues: string[] = [];
  branches.forEach((b, i) => {
    if (!b.goto) issues.push(`Branch ${i + 1}: missing target question.`);
    else if (!others.find((q) => q.id === b.goto)) issues.push(`Branch ${i + 1}: target question no longer exists.`);
    if (!b.when && (isChoice || isBool)) issues.push(`Branch ${i + 1}: missing answer value.`);
  });
  if (routing.default_next && !others.find((q) => q.id === routing.default_next))
    issues.push(`Default next: target question no longer exists.`);

  // Detect cycles reachable from THIS question via DFS
  const graph = new Map<string, string[]>();
  allQuestions.forEach((q) => {
    const r = normaliseRouting(q.routing);
    const nexts: string[] = [];
    (r.branches ?? []).forEach((b) => b.goto && nexts.push(b.goto));
    if (r.default_next) nexts.push(r.default_next);
    graph.set(q.id, nexts);
  });
  const inCycle = detectCycleFrom(question.id, graph);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Optional per-question routing. Add branches like <i>"if the answer is X, go to question Y"</i>, plus a default next.
        Leave empty to fall through to the next question in <b>Sort order</b>.
      </p>

      {!isChoice && !isBool && (
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2 flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> Branch conditions work best on Yes/No, single-select, or multi-select questions. On this input type, branches must match the exact typed answer string.
        </div>
      )}

      <div className="space-y-2">
        {branches.map((b, i) => (
          <Card key={i} className="p-3 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">If answer</span>
            {possibleAnswers.length > 0 ? (
              <Select value={b.when} onValueChange={(v) => setBranch(i, { when: v })}>
                <SelectTrigger className="h-8 text-xs w-40"><SelectValue placeholder="Choose…" /></SelectTrigger>
                <SelectContent>
                  {possibleAnswers.map((o) => <SelectItem key={o.value} value={o.value}>{o.label} <span className="text-muted-foreground">— {o.value}</span></SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <Input value={b.when} onChange={(e) => setBranch(i, { when: e.target.value })} placeholder="answer value" className="h-8 text-xs w-40" />
            )}
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">go to</span>
            <Select value={b.goto} onValueChange={(v) => setBranch(i, { goto: v })}>
              <SelectTrigger className="h-8 text-xs flex-1 min-w-[220px]"><SelectValue placeholder="Choose question…" /></SelectTrigger>
              <SelectContent>
                {others.map((q) => <SelectItem key={q.id} value={q.id}>{shortenPrompt(q.prompt)}</SelectItem>)}
              </SelectContent>
            </Select>
            {b.goto && <Button variant="ghost" size="sm" onClick={() => onJump(b.goto)}>Open</Button>}
            <Button variant="ghost" size="icon" onClick={() => removeBranch(i)}><X className="h-3.5 w-3.5" /></Button>
          </Card>
        ))}
        <Button size="sm" variant="outline" onClick={addBranch}><Plus className="h-3.5 w-3.5 mr-1" />Add branch</Button>
      </div>

      <div className="rounded-md border border-border bg-muted/30 p-3 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">Default next (used if no branch matches):</span>
        <Select value={routing.default_next ?? "auto"} onValueChange={(v) => onChange({ ...routing, default_next: v === "auto" ? null : v })}>
          <SelectTrigger className="h-8 text-xs flex-1 min-w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Next by sort order</SelectItem>
            {others.map((q) => <SelectItem key={q.id} value={q.id}>{shortenPrompt(q.prompt)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {(issues.length > 0 || inCycle) ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-1 text-xs text-amber-900">
          <div className="flex items-center gap-1.5 font-medium"><AlertTriangle className="h-3.5 w-3.5" /> Routing issues</div>
          {inCycle && <div>• This question is part of a circular route — a member could loop forever.</div>}
          {issues.map((iss, i) => <div key={i}>• {iss}</div>)}
        </div>
      ) : (branches.length > 0 || routing.default_next) && (
        <div className="rounded-md border border-primary/30 bg-primary-soft/40 p-3 text-xs text-primary flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" /> Routing looks valid.
        </div>
      )}

      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">Preview path from this question</div>
        <FlowPreview startId={question.id} allQuestions={allQuestions} />
      </div>
    </div>
  );
}

function detectCycleFrom(start: string, graph: Map<string, string[]>): boolean {
  const visited = new Set<string>();
  const stack: string[] = [start];
  const path = new Set<string>();
  function dfs(node: string): boolean {
    if (path.has(node)) return true;
    if (visited.has(node)) return false;
    path.add(node); visited.add(node);
    for (const n of graph.get(node) ?? []) {
      if (dfs(n)) return true;
    }
    path.delete(node);
    return false;
  }
  void stack;
  return dfs(start);
}

function FlowPreview({ startId, allQuestions }: { startId: string; allQuestions: Question[] }) {
  const sorted = [...allQuestions].sort((a, b) => a.sort_order - b.sort_order);
  const path: Question[] = [];
  const seen = new Set<string>();
  let currentId: string | null = startId;
  let steps = 0;
  while (currentId && !seen.has(currentId) && steps < 12) {
    const q = allQuestions.find((x) => x.id === currentId);
    if (!q) break;
    path.push(q); seen.add(currentId); steps++;
    const r = normaliseRouting(q.routing);
    if (r.default_next) { currentId = r.default_next; continue; }
    const idx = sorted.findIndex((x) => x.id === currentId);
    currentId = idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1].id : null;
  }
  return (
    <div className="rounded-lg border border-border bg-card divide-y divide-border">
      {path.map((q, i) => (
        <div key={q.id} className="p-2.5 text-sm flex items-center gap-2">
          <span className="text-[10px] font-mono text-muted-foreground w-4">{i + 1}</span>
          <span className="truncate">{q.prompt}</span>
        </div>
      ))}
      {path.length === 0 && <div className="p-3 text-xs text-muted-foreground">No path from this question.</div>}
    </div>
  );
}

function shortenPrompt(s: string) {
  return s.length > 60 ? s.slice(0, 57) + "…" : s;
}

/* ============================================================
   Versions & publish
   ============================================================ */

function VersionsDialog({
  open, onOpenChange, questions,
}: { open: boolean; onOpenChange: (o: boolean) => void; questions: Question[] }) {
  const qc = useQueryClient();
  const { data: versions = [] } = useQuery({
    queryKey: ["question_set_versions"],
    queryFn: async () => (await supabase.from("question_set_versions").select("*").order("version", { ascending: false })).data as Version[] ?? [],
    enabled: open,
  });
  const [notes, setNotes] = useState("");

  // Global validation across all questions
  const validation = useMemo(() => validateAllRouting(questions), [questions]);

  const publish = useMutation({
    mutationFn: async () => {
      const nextV = (versions[0]?.version ?? 0) + 1;
      // Demote current published
      await supabase.from("question_set_versions").update({ status: "archived" }).eq("status", "published");
      const snapshot = { questions: questions.map((q) => ({
        id: q.id, prompt: q.prompt, help_text: q.help_text, input_type: q.input_type,
        attribute_id: q.attribute_id, tags: q.tags, options: q.options, required: q.required,
        routing: q.routing, sort_order: q.sort_order,
      })) };
      const { error } = await supabase.from("question_set_versions").insert({
        version: nextV, status: "published", notes: notes || null, snapshot: asJson(snapshot), published_at: new Date().toISOString(),
      });
      if (error) throw error;
      return nextV;
    },
    onSuccess: (v) => { qc.invalidateQueries({ queryKey: ["question_set_versions"] }); toast.success(`Published v${v}`); setNotes(""); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Question set — versions</DialogTitle>
          <DialogDescription>
            Publish a snapshot of the finalised question set. The member app reads the latest published version.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className={`rounded-md border p-3 text-xs ${validation.ok
            ? "border-primary/30 bg-primary-soft/40 text-primary"
            : "border-amber-300 bg-amber-50 text-amber-900"}`}>
            {validation.ok ? (
              <div className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> Ready to publish · {questions.length} question{questions.length === 1 ? "" : "s"}</div>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 font-medium"><AlertTriangle className="h-3.5 w-3.5" /> Fix before publishing</div>
                {validation.issues.map((iss, i) => <div key={i}>• {iss}</div>)}
              </div>
            )}
          </div>

          <Field label="Release notes (optional)">
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What changed in this version?" />
          </Field>

          <Button onClick={() => publish.mutate()} disabled={publish.isPending || !validation.ok}>
            {publish.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />} Publish new version
          </Button>

          <div className="rounded-lg border border-border divide-y divide-border">
            {versions.length === 0 && <div className="p-4 text-sm text-muted-foreground">No versions yet.</div>}
            {versions.map((v) => (
              <div key={v.id} className="p-3 flex items-center gap-3">
                <Badge className={v.status === "published" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}>{v.status}</Badge>
                <div className="flex-1">
                  <div className="text-sm font-medium">v{v.version}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {v.published_at ? `Published ${new Date(v.published_at).toLocaleString()}` : `Created ${new Date(v.created_at).toLocaleString()}`}
                    {v.notes ? ` · ${v.notes}` : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function validateAllRouting(questions: Question[]): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  const ids = new Set(questions.map((q) => q.id));
  const graph = new Map<string, string[]>();
  const reachedBy = new Map<string, number>();
  const sorted = [...questions].sort((a, b) => a.sort_order - b.sort_order);

  questions.forEach((q) => {
    const r = normaliseRouting(q.routing);
    const nexts: string[] = [];
    (r.branches ?? []).forEach((b, i) => {
      if (!b.goto) issues.push(`"${shortenPrompt(q.prompt)}" — branch ${i + 1} missing target.`);
      else if (!ids.has(b.goto)) issues.push(`"${shortenPrompt(q.prompt)}" — branch ${i + 1} points to a deleted question.`);
      else nexts.push(b.goto);
    });
    if (r.default_next) {
      if (!ids.has(r.default_next)) issues.push(`"${shortenPrompt(q.prompt)}" — default next points to a deleted question.`);
      else nexts.push(r.default_next);
    } else {
      const idx = sorted.findIndex((x) => x.id === q.id);
      if (idx >= 0 && idx < sorted.length - 1) nexts.push(sorted[idx + 1].id);
    }
    graph.set(q.id, nexts);
  });

  // Reachability from first question
  if (sorted.length > 0) {
    const start = sorted[0].id;
    const seen = new Set<string>([start]);
    const stack = [start];
    while (stack.length) {
      const n = stack.pop()!;
      for (const next of graph.get(n) ?? []) {
        if (!seen.has(next)) { seen.add(next); stack.push(next); }
      }
    }
    questions.forEach((q) => { reachedBy.set(q.id, seen.has(q.id) ? 1 : 0); });
    questions.forEach((q) => {
      if (!seen.has(q.id)) issues.push(`"${shortenPrompt(q.prompt)}" is unreachable from the first question.`);
    });
  }

  // Cycle detection (global)
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  questions.forEach((q) => color.set(q.id, WHITE));
  const cyclic = new Set<string>();
  function dfs(node: string): boolean {
    color.set(node, GRAY);
    for (const n of graph.get(node) ?? []) {
      if (color.get(n) === GRAY) { cyclic.add(n); return true; }
      if (color.get(n) === WHITE && dfs(n)) return true;
    }
    color.set(node, BLACK);
    return false;
  }
  questions.forEach((q) => { if (color.get(q.id) === WHITE) dfs(q.id); });
  cyclic.forEach((id) => {
    const q = questions.find((x) => x.id === id);
    if (q) issues.push(`"${shortenPrompt(q.prompt)}" is inside a routing cycle.`);
  });

  return { ok: issues.length === 0 && questions.length > 0, issues };
}

/* ============================================================
   Discovery signals tab — the short "about you" intake members
   answer before their plan is generated (discovery_signals table).
   ============================================================ */

function DiscoverySignalsTab() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: signals = [] } = useQuery({
    queryKey: ["discovery-signals"],
    queryFn: async () =>
      (await supabase.from("discovery_signals").select("*").order("sort_order")).data as Signal[] ?? [],
  });

  const create = useMutation({
    mutationFn: async () => {
      const maxOrder = signals.reduce((m, s) => Math.max(m, s.sort_order), 0);
      const { data, error } = await supabase.from("discovery_signals").insert({
        key: `signal_${Date.now()}`, label: "New signal", input_type: "boolean",
        options: [], sort_order: maxOrder + 10, category: "situation", active: true,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (row) => { qc.invalidateQueries({ queryKey: ["discovery-signals"] }); setSelectedId(row.id); },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("discovery_signals").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["discovery-signals"] }),
  });

  const reorder = useMutation({
    mutationFn: async ({ aId, aOrder, bId, bOrder }: { aId: string; aOrder: number; bId: string; bOrder: number }) => {
      const [r1, r2] = await Promise.all([
        supabase.from("discovery_signals").update({ sort_order: bOrder }).eq("id", aId),
        supabase.from("discovery_signals").update({ sort_order: aOrder }).eq("id", bId),
      ]);
      if (r1.error) throw r1.error;
      if (r2.error) throw r2.error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["discovery-signals"] }),
  });

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= signals.length) return;
    const a = signals[index], b = signals[target];
    reorder.mutate({ aId: a.id, aOrder: a.sort_order, bId: b.id, bOrder: b.sort_order });
  };

  const del = async (s: Signal) => {
    if (!confirm(`Delete "${s.label}"? Rules that reference it will break.`)) return;
    await supabase.from("discovery_signals").delete().eq("id", s.id);
    qc.invalidateQueries({ queryKey: ["discovery-signals"] });
    toast.success("Signal deleted");
  };

  const selected = signals.find((s) => s.id === selectedId) ?? null;
  const activeCount = signals.filter((s) => s.active).length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Compass className="h-4 w-4 text-primary shrink-0" />
            <h3 className="font-serif text-xl">Discovery signals</h3>
            <Badge variant="outline" className="text-[10px]">{activeCount} active</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
            The short intake members answer before their plan is generated. Only <b>active</b> signals appear,
            in the order shown here. Keep it tight — the goal is a two-minute conversation, not a form.
          </p>
        </div>
        <Button onClick={() => create.mutate()} className="shrink-0"><Plus className="h-4 w-4 mr-1.5" />Add signal</Button>
      </div>

      {signals.length === 0 ? <EmptyState label="No discovery signals yet." /> : (
        <Card className="divide-y divide-border overflow-hidden shadow-card">
          {signals.map((s, i) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted/40">
              <div className="flex flex-col items-center text-muted-foreground/50 shrink-0">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label="Move up"
                  className="hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <GripVertical className="h-3.5 w-3.5" />
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === signals.length - 1}
                  aria-label="Move down"
                  className="hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>

              <button type="button" onClick={() => setSelectedId(s.id)} className="flex-1 min-w-0 text-left">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`font-medium ${s.active ? "text-foreground" : "line-through text-muted-foreground"}`}>{s.label}</span>
                  <Badge variant="outline" className="text-[10px]">{SIGNAL_INPUT_TYPE_LABEL[s.input_type] ?? s.input_type}</Badge>
                </div>
                <div className={`text-xs mt-0.5 font-mono ${s.active ? "text-muted-foreground" : "text-muted-foreground/60"}`}>{s.key}</div>
              </button>

              <Switch
                checked={s.active}
                onCheckedChange={(v) => toggleActive.mutate({ id: s.id, active: v })}
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => del(s)}
                className="text-muted-foreground hover:text-destructive shrink-0"
                aria-label="Delete signal"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </Card>
      )}

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selected && <SignalEditor key={selected.id} row={selected} onDelete={() => setSelectedId(null)} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SignalEditor({ row, onDelete }: { row: Signal; onDelete: () => void }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Signal>(row);
  const options = (draft.options as unknown as SignalOption[]) ?? [];

  useDebouncedSave(draft, async (v) => {
    const { error } = await supabase.from("discovery_signals").update({
      key: v.key, label: v.label, help_text: v.help_text, input_type: v.input_type,
      options: v.options, sort_order: v.sort_order, category: v.category, active: v.active,
    }).eq("id", v.id);
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["discovery-signals"] });
  });

  const del = async () => {
    if (!confirm("Delete this signal? Rules that reference it will break.")) return;
    await supabase.from("discovery_signals").delete().eq("id", row.id);
    qc.invalidateQueries({ queryKey: ["discovery-signals"] });
    onDelete(); toast.success("Signal deleted");
  };

  const isChoice = draft.input_type === "select" || draft.input_type === "multiselect";

  return (
    <>
      <SheetHeader className="mb-4">
        <SheetTitle className="font-serif text-2xl">Edit signal</SheetTitle>
      </SheetHeader>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Label"><Input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} /></Field>
          <Field label="Key" hint="Referenced by rules.">
            <Input value={draft.key} onChange={(e) => setDraft({ ...draft, key: e.target.value })} className="font-mono text-sm" />
          </Field>
        </div>

        <Field label="Help text"><Input value={draft.help_text ?? ""} onChange={(e) => setDraft({ ...draft, help_text: e.target.value })} /></Field>

        <div className="grid grid-cols-3 gap-4">
          <Field label="Input type">
            <Select value={draft.input_type} onValueChange={(v) => setDraft({ ...draft, input_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SIGNAL_INPUT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Category">
            <Select value={draft.category} onValueChange={(v) => setDraft({ ...draft, category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="situation">Situation</SelectItem>
                <SelectItem value="assets">Assets</SelectItem>
                <SelectItem value="goals">Goals</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Order"><Input type="number" value={draft.sort_order}
            onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) })} /></Field>
        </div>

        {isChoice && (
          <Field label="Options">
            <div className="space-y-2 rounded-lg border border-border p-3 bg-muted/30">
              {options.map((o, i) => (
                <div key={i} className="flex gap-2">
                  <Input value={o.value} placeholder="value" className="flex-1 font-mono text-sm"
                    onChange={(e) => {
                      const arr = [...options]; arr[i] = { ...o, value: e.target.value };
                      setDraft({ ...draft, options: arr as never });
                    }} />
                  <Input value={o.label} placeholder="label" className="flex-1"
                    onChange={(e) => {
                      const arr = [...options]; arr[i] = { ...o, label: e.target.value };
                      setDraft({ ...draft, options: arr as never });
                    }} />
                  <Button variant="ghost" size="icon" onClick={() => {
                    setDraft({ ...draft, options: options.filter((_, j) => j !== i) as never });
                  }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => {
                setDraft({ ...draft, options: [...options, { value: "", label: "" }] as never });
              }}>
                <Plus className="h-3.5 w-3.5 mr-1" />Add option
              </Button>
            </div>
          </Field>
        )}

        <div className="flex items-center justify-between pt-4 border-t border-border">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={draft.active} onCheckedChange={(v) => setDraft({ ...draft, active: v })} />
            Active
          </label>
          <Button variant="ghost" onClick={del} className="text-destructive"><Trash2 className="h-4 w-4 mr-1.5" />Delete</Button>
        </div>
      </div>
    </>
  );
}
