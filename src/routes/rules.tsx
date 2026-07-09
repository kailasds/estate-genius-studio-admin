import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Play, Sparkles, GripVertical, CheckCircle2, XCircle, Rocket, History, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useDebouncedSave } from "@/lib/use-debounced-save";
import { AiAssistButton } from "@/components/ai-assist-dialog";
import { useServerFn } from "@tanstack/react-start";
import { runAiAssist } from "@/lib/ai.functions";
import { EmptyState, Field } from "@/routes/templates";
import type { Database } from "@/integrations/supabase/types";

type Rule = Database["public"]["Tables"]["recommendation_rules"]["Row"];
type Signal = Database["public"]["Tables"]["discovery_signals"]["Row"];
type Version = Database["public"]["Tables"]["recommendation_rule_versions"]["Row"];
type ServiceTag = Database["public"]["Enums"]["service_tag"];

type ClauseOp = "eq" | "neq" | "gt" | "lt" | "in";
type Clause = { attribute: string; op: ClauseOp; value: string | number | boolean };
type Conditions = { op: "AND" | "OR"; clauses: Clause[] };
type SignalOption = { value: string; label: string };

const OPS: ClauseOp[] = ["eq", "neq", "gt", "lt", "in"];
const RULE_TYPES = [
  { value: "standard", label: "Standard" },
  { value: "baseline", label: "Baseline (fires for everyone)" },
  { value: "bundle", label: "Bundle (coordinated package)" },
];
const FLAGS = [
  { value: "recommended", label: "Recommended" },
  { value: "optional", label: "Optional" },
];
const DOCUMENTS: { value: ServiceTag; label: string }[] = [
  { value: "will", label: "Will" },
  { value: "trust", label: "Trust" },
  { value: "poa", label: "Power of Attorney" },
  { value: "healthcare", label: "Healthcare Directive" },
  { value: "common", label: "Common (shared)" },
];
const INPUT_TYPES = [
  { value: "select", label: "Single choice" },
  { value: "multiselect", label: "Multiple choice" },
  { value: "boolean", label: "Yes / No" },
  { value: "text", label: "Free text" },
  { value: "number", label: "Number" },
];

export const Route = createFileRoute("/rules")({
  component: RulesPage,
});

function RulesPage() {
  return (
    <AppShell
      title="Recommendation Rules"
      subtitle="Configure the discovery a member answers and the rules that map their situation to recommended documents. Deterministic, auditable, editable without code."
    >
      <Tabs defaultValue="rules" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="rules">Rules</TabsTrigger>
          <TabsTrigger value="signals">Discovery signals</TabsTrigger>
          <TabsTrigger value="test">Test plan</TabsTrigger>
          <TabsTrigger value="versions">Versions</TabsTrigger>
        </TabsList>
        <TabsContent value="rules"><RulesTab /></TabsContent>
        <TabsContent value="signals"><SignalsTab /></TabsContent>
        <TabsContent value="test"><TestPanel /></TabsContent>
        <TabsContent value="versions"><VersionsTab /></TabsContent>
      </Tabs>
    </AppShell>
  );
}

// ============================================================================
// Rules tab
// ============================================================================

function RulesTab() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [proposeOpen, setProposeOpen] = useState(false);

  const { data: rules = [] } = useQuery({
    queryKey: ["rec-rules"],
    queryFn: async () =>
      (await supabase.from("recommendation_rules").select("*").order("priority", { ascending: false })).data as Rule[] ?? [],
  });
  const { data: signals = [] } = useQuery({
    queryKey: ["discovery-signals"],
    queryFn: async () =>
      (await supabase.from("discovery_signals").select("*").order("sort_order")).data as Signal[] ?? [],
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from("recommendation_rules").insert({
        name: "New rule",
        conditions: { op: "AND", clauses: [] } as unknown as Database["public"]["Tables"]["recommendation_rules"]["Insert"]["conditions"],
        recommends: [] as ServiceTag[],
        priority: 50,
        active: true,
        flag: "recommended",
        rule_type: "standard",
        status: "draft",
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (row) => { qc.invalidateQueries({ queryKey: ["rec-rules"] }); setSelectedId(row.id); },
  });

  const selected = rules.find((r) => r.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {rules.length} rule{rules.length === 1 ? "" : "s"} · sorted by priority (highest wins).
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setProposeOpen(true)}>
            <Sparkles className="h-4 w-4 mr-1.5 text-gold" />AI: propose rules
          </Button>
          <Button onClick={() => create.mutate()}>
            <Plus className="h-4 w-4 mr-1.5" />New rule
          </Button>
        </div>
      </div>

      {rules.length === 0 ? <EmptyState label="No rules yet. Add one or let AI propose a starter set." /> : (
        <Card className="divide-y divide-border overflow-hidden shadow-card">
          {rules.map((r) => <RuleRow key={r.id} rule={r} onOpen={() => setSelectedId(r.id)} />)}
        </Card>
      )}

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          {selected && <RuleEditor key={selected.id} row={selected} signals={signals} onDelete={() => setSelectedId(null)} />}
        </SheetContent>
      </Sheet>

      <ProposeRulesDialog open={proposeOpen} onOpenChange={setProposeOpen} signals={signals} onCreated={() => qc.invalidateQueries({ queryKey: ["rec-rules"] })} />
    </div>
  );
}

function RuleRow({ rule, onOpen }: { rule: Rule; onOpen: () => void }) {
  const clauses = (rule.conditions as unknown as Conditions)?.clauses ?? [];
  const isBaseline = rule.rule_type === "baseline";
  const isBundle = rule.rule_type === "bundle";
  return (
    <div onClick={onOpen} className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-muted/40">
      <div className={`h-2 w-2 rounded-full ${rule.active ? "bg-primary" : "bg-muted-foreground/40"}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="font-medium truncate">{rule.name}</div>
          {isBaseline && <Badge variant="secondary" className="text-[10px]">Baseline</Badge>}
          {isBundle && <Badge className="text-[10px] border border-gold/30 bg-gold/15 text-foreground hover:bg-gold/15">Bundle</Badge>}
          <Badge variant="outline" className="text-[10px] capitalize">{rule.flag}</Badge>
        </div>
        <div className="text-xs text-muted-foreground mt-0.5 truncate">
          {isBaseline ? "Fires for everyone" : `${clauses.length} condition${clauses.length === 1 ? "" : "s"}`}
          {rule.reason ? ` · ${rule.reason.slice(0, 80)}${rule.reason.length > 80 ? "…" : ""}` : ""}
        </div>
      </div>
      <div className="text-xs text-muted-foreground w-16 text-right">P{rule.priority}</div>
      <div className="flex gap-1">
        {(rule.recommends ?? []).map((d) => (
          <Badge key={d} variant="outline" className="text-[10px] uppercase">{d}</Badge>
        ))}
      </div>
    </div>
  );
}

function RuleEditor({ row, signals, onDelete }: { row: Rule; signals: Signal[]; onDelete: () => void }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Rule>(row);

  useDebouncedSave(draft, async (v) => {
    const { error } = await supabase.from("recommendation_rules").update({
      name: v.name, description: v.description, conditions: v.conditions,
      recommends: v.recommends, priority: v.priority, active: v.active,
      reason: v.reason, flag: v.flag, rule_type: v.rule_type,
      document: v.document, min_matches: v.min_matches, status: v.status,
    }).eq("id", v.id);
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["rec-rules"] });
  });

  const conditions = (draft.conditions as unknown as Conditions) ?? { op: "AND", clauses: [] };
  const setConditions = (c: Conditions) => setDraft({ ...draft, conditions: c as never });

  const del = async () => {
    if (!confirm("Delete this rule?")) return;
    await supabase.from("recommendation_rules").delete().eq("id", row.id);
    qc.invalidateQueries({ queryKey: ["rec-rules"] });
    onDelete();
    toast.success("Rule deleted");
  };

  const isBundle = draft.rule_type === "bundle";
  const isBaseline = draft.rule_type === "baseline";

  return (
    <>
      <SheetHeader className="mb-4">
        <SheetTitle className="font-serif text-2xl">Edit rule</SheetTitle>
      </SheetHeader>

      <div className="space-y-5">
        <Field label="Name">
          <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Rule type">
            <Select value={draft.rule_type} onValueChange={(v) => setDraft({ ...draft, rule_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{RULE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Flag">
            <Select value={draft.flag} onValueChange={(v) => setDraft({ ...draft, flag: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{FLAGS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>

        <Field label="Description" hint="Internal note for admins.">
          <Textarea rows={2} value={draft.description ?? ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        </Field>

        {!isBundle && (
          <Field label="Recommends document">
            <Select value={draft.document ?? ""} onValueChange={(v) => setDraft({ ...draft, document: v, recommends: [v as ServiceTag] })}>
              <SelectTrigger><SelectValue placeholder="Pick a document" /></SelectTrigger>
              <SelectContent>{DOCUMENTS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        )}

        {isBundle && (
          <Field label="Minimum matching documents" hint="Bundle fires when at least this many other rules apply.">
            <Input type="number" value={draft.min_matches ?? 2}
              onChange={(e) => setDraft({ ...draft, min_matches: Number(e.target.value) })} />
          </Field>
        )}

        <Field label="Conditions" hint={isBaseline ? "Baseline rules fire for everyone — conditions are optional." : "All/any of these must match the member's discovery signals."}>
          <div className="rounded-lg border border-border p-4 bg-muted/30 space-y-3">
            <Select value={conditions.op} onValueChange={(v) => setConditions({ ...conditions, op: v as "AND" | "OR" })}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="AND">Match ALL</SelectItem>
                <SelectItem value="OR">Match ANY</SelectItem>
              </SelectContent>
            </Select>
            {conditions.clauses.map((c, i) => (
              <ClauseRow key={i} clause={c} signals={signals}
                onChange={(next) => {
                  const arr = [...conditions.clauses]; arr[i] = next;
                  setConditions({ ...conditions, clauses: arr });
                }}
                onDelete={() => setConditions({ ...conditions, clauses: conditions.clauses.filter((_, j) => j !== i) })}
              />
            ))}
            <Button variant="outline" size="sm" onClick={() => setConditions({
              ...conditions,
              clauses: [...conditions.clauses, { attribute: signals[0]?.key ?? "", op: "eq", value: "" }],
            })}>
              <Plus className="h-3.5 w-3.5 mr-1" />Add condition
            </Button>
          </div>
        </Field>

        <Field label="Member-facing reason" hint="Shown to the member as plain-language justification.">
          <Textarea rows={3} value={draft.reason ?? ""} onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
            placeholder="e.g. You have minor children — your Will is where you name a guardian…" />
          <div className="mt-2">
            <AiAssistButton
              task="draft_reason"
              content={JSON.stringify({ name: draft.name, document: draft.document, conditions }, null, 2)}
              label="AI: draft reason"
              onApprove={(t) => setDraft({ ...draft, reason: t.trim() })}
            />
          </div>
        </Field>

        <div className="grid grid-cols-3 gap-4">
          <Field label="Priority" hint="Higher wins ties.">
            <Input type="number" value={draft.priority}
              onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })} />
          </Field>
          <Field label="Status">
            <Select value={draft.status} onValueChange={(v) => setDraft({ ...draft, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Active">
            <div className="flex items-center h-9 gap-2">
              <Switch checked={draft.active} onCheckedChange={(v) => setDraft({ ...draft, active: v })} />
              <span className="text-sm text-muted-foreground">{draft.active ? "Live" : "Off"}</span>
            </div>
          </Field>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-border">
          <span className="text-xs text-muted-foreground">Rule ID: {row.id.slice(0, 8)}…</span>
          <Button variant="ghost" onClick={del} className="text-destructive">
            <Trash2 className="h-4 w-4 mr-1.5" />Delete
          </Button>
        </div>
      </div>
    </>
  );
}

function ClauseRow({ clause, signals, onChange, onDelete }: {
  clause: Clause; signals: Signal[];
  onChange: (c: Clause) => void; onDelete: () => void;
}) {
  const signal = signals.find((s) => s.key === clause.attribute);
  const opts = (signal?.options as unknown as SignalOption[] | undefined) ?? [];
  const isBool = signal?.input_type === "boolean";
  const isChoice = signal && (signal.input_type === "select" || signal.input_type === "multiselect");
  const isMulti = signal?.input_type === "multiselect";

  return (
    <div className="flex gap-2 items-start">
      <GripVertical className="h-4 w-4 text-muted-foreground/50 mt-2 shrink-0" />
      <Select value={clause.attribute} onValueChange={(v) => onChange({ ...clause, attribute: v, value: "" })}>
        <SelectTrigger className="flex-1"><SelectValue placeholder="Signal" /></SelectTrigger>
        <SelectContent>{signals.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={clause.op} onValueChange={(v) => onChange({ ...clause, op: v as ClauseOp })}>
        <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
        <SelectContent>
          {(isMulti ? ["in"] : isBool ? ["eq"] : OPS).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
      {isBool ? (
        <Select value={String(clause.value)} onValueChange={(v) => onChange({ ...clause, value: v === "true" })}>
          <SelectTrigger className="flex-1"><SelectValue placeholder="value" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="true">Yes</SelectItem>
            <SelectItem value="false">No</SelectItem>
          </SelectContent>
        </Select>
      ) : isChoice ? (
        <Select value={String(clause.value ?? "")} onValueChange={(v) => onChange({ ...clause, value: v })}>
          <SelectTrigger className="flex-1"><SelectValue placeholder="value" /></SelectTrigger>
          <SelectContent>{opts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
      ) : (
        <Input value={String(clause.value ?? "")} onChange={(e) => onChange({ ...clause, value: e.target.value })}
          className="flex-1" placeholder="value" />
      )}
      <Button variant="ghost" size="icon" onClick={onDelete}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

// ============================================================================
// AI propose rules
// ============================================================================

function ProposeRulesDialog({ open, onOpenChange, signals, onCreated }: {
  open: boolean; onOpenChange: (o: boolean) => void;
  signals: Signal[]; onCreated: () => void;
}) {
  const call = useServerFn(runAiAssist);
  const [proposals, setProposals] = useState<Array<{
    name: string; description?: string; conditions: Conditions;
    document: ServiceTag; reason: string; flag: string; priority: number;
    approved: boolean;
  }>>([]);

  const propose = useMutation({
    mutationFn: async () => {
      const res = await call({
        data: {
          task: "propose_recommendation_rules",
          content: JSON.stringify(signals.map((s) => ({
            key: s.key, label: s.label, input_type: s.input_type,
            options: s.options,
          })), null, 2),
        },
      });
      // Strip markdown fences if present
      const cleaned = res.output.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
      const parsed = JSON.parse(cleaned) as Array<{
        name: string; description?: string; conditions: Conditions;
        document: ServiceTag; reason: string; flag: string; priority: number;
      }>;
      return parsed;
    },
    onSuccess: (arr) => setProposals(arr.map((p) => ({ ...p, approved: true }))),
    onError: (e: Error) => toast.error(e.message),
  });

  const commit = useMutation({
    mutationFn: async () => {
      const approved = proposals.filter((p) => p.approved);
      if (approved.length === 0) return 0;
      const rows = approved.map((p) => ({
        name: p.name,
        description: p.description ?? null,
        conditions: p.conditions as never,
        recommends: [p.document] as ServiceTag[],
        document: p.document,
        reason: p.reason,
        flag: p.flag,
        rule_type: "standard",
        priority: p.priority,
        active: true,
        status: "draft",
      }));
      const { error } = await supabase.from("recommendation_rules").insert(rows);
      if (error) throw error;
      return approved.length;
    },
    onSuccess: (n) => {
      toast.success(`Added ${n} rule${n === 1 ? "" : "s"} as draft`);
      onCreated(); onOpenChange(false); setProposals([]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="font-serif text-2xl flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-gold" /> AI proposes rules
          </SheetTitle>
        </SheetHeader>
        <p className="text-sm text-muted-foreground mb-4">
          AI suggestions are never auto-applied — review each proposal, uncheck what you don't want, then approve to save as drafts.
        </p>

        {proposals.length === 0 && (
          <Button onClick={() => propose.mutate()} disabled={propose.isPending}>
            {propose.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5 text-gold" />}
            Generate proposals from signals
          </Button>
        )}

        {proposals.length > 0 && (
          <div className="space-y-3">
            {proposals.map((p, i) => (
              <Card key={i} className="p-4 space-y-2">
                <div className="flex items-start gap-3">
                  <Switch checked={p.approved} onCheckedChange={(v) => {
                    const arr = [...proposals]; arr[i] = { ...p, approved: v }; setProposals(arr);
                  }} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      → <span className="uppercase">{p.document}</span> · {p.flag} · priority {p.priority}
                    </div>
                    <div className="text-sm mt-2 text-foreground/80">{p.reason}</div>
                    <div className="text-xs text-muted-foreground mt-2">
                      {p.conditions?.op ?? "AND"}: {(p.conditions?.clauses ?? []).map((c) =>
                        `${c.attribute} ${c.op} ${JSON.stringify(c.value)}`).join(" · ") || "(no conditions)"}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setProposals([])}>Discard</Button>
              <Button onClick={() => commit.mutate()} disabled={commit.isPending}>
                {commit.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Approve selected
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ============================================================================
// Discovery signals tab
// ============================================================================

function SignalsTab() {
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

  const selected = signals.find((s) => s.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {signals.length} signals. Members answer these up front — the rules use the answers.
        </div>
        <Button onClick={() => create.mutate()}><Plus className="h-4 w-4 mr-1.5" />New signal</Button>
      </div>

      {signals.length === 0 ? <EmptyState label="No discovery signals yet." /> : (
        <Card className="divide-y divide-border overflow-hidden shadow-card">
          {signals.map((s) => (
            <div key={s.id} onClick={() => setSelectedId(s.id)} className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-muted/40">
              <div className={`h-2 w-2 rounded-full ${s.active ? "bg-primary" : "bg-muted-foreground/40"}`} />
              <div className="flex-1 min-w-0">
                <div className="font-medium">{s.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  <code className="font-mono">{s.key}</code> · {s.input_type}
                  {s.help_text ? ` · ${s.help_text}` : ""}
                </div>
              </div>
              <Badge variant="outline" className="text-[10px] capitalize">{s.category}</Badge>
              <div className="text-xs text-muted-foreground w-12 text-right">#{s.sort_order}</div>
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
              <SelectContent>{INPUT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
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
                  }}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => {
                setDraft({ ...draft, options: [...options, { value: "", label: "" }] as never });
              }}><Plus className="h-3.5 w-3.5 mr-1" />Add option</Button>
            </div>
          </Field>
        )}

        <Field label="Active">
          <div className="flex items-center h-9 gap-2">
            <Switch checked={draft.active} onCheckedChange={(v) => setDraft({ ...draft, active: v })} />
            <span className="text-sm text-muted-foreground">{draft.active ? "Live" : "Off"}</span>
          </div>
        </Field>

        <div className="flex items-center justify-between pt-4 border-t border-border">
          <span className="text-xs text-muted-foreground">Signal ID: {row.id.slice(0, 8)}…</span>
          <Button variant="ghost" onClick={del} className="text-destructive"><Trash2 className="h-4 w-4 mr-1.5" />Delete</Button>
        </div>
      </div>
    </>
  );
}

// ============================================================================
// Test panel
// ============================================================================

function TestPanel() {
  const { data: signals = [] } = useQuery({
    queryKey: ["discovery-signals-active"],
    queryFn: async () =>
      (await supabase.from("discovery_signals").select("*").eq("active", true).order("sort_order")).data as Signal[] ?? [],
  });
  const { data: rules = [] } = useQuery({
    queryKey: ["rec-rules-active"],
    queryFn: async () =>
      (await supabase.from("recommendation_rules").select("*").eq("active", true).order("priority", { ascending: false })).data as Rule[] ?? [],
  });

  const [profile, setProfile] = useState<Record<string, unknown>>({});

  const plan = useMemo(() => evaluatePlan(rules, profile), [rules, profile]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-5 shadow-card">
        <div className="font-serif text-lg mb-1">Sample member profile</div>
        <div className="text-xs text-muted-foreground mb-4">Simulate the answers a member would give during discovery.</div>
        <div className="space-y-3">
          {signals.map((s) => <SignalInput key={s.id} signal={s}
            value={profile[s.key]} onChange={(v) => setProfile({ ...profile, [s.key]: v })} />)}
          {signals.length === 0 && <div className="text-sm text-muted-foreground">Add discovery signals first.</div>}
        </div>
      </Card>

      <Card className="p-5 shadow-card">
        <div className="flex items-center justify-between mb-1">
          <div className="font-serif text-lg">Recommended plan</div>
          <Badge variant="outline">{plan.matched.length} rule{plan.matched.length === 1 ? "" : "s"} fired</Badge>
        </div>
        <div className="text-xs text-muted-foreground mb-4">What the member would see — deterministic and auditable.</div>

        {plan.bundle && (
          <div className="rounded-lg border border-gold/40 bg-gold/10 p-4 mb-4">
            <div className="flex items-center gap-2 font-medium">
              <Rocket className="h-4 w-4 text-gold" /> {plan.bundle.name}
            </div>
            <div className="text-sm mt-1 text-foreground/80">{plan.bundle.reason}</div>
          </div>
        )}

        <div className="space-y-2">
          {plan.documents.length === 0 && (
            <div className="text-sm text-muted-foreground">No documents recommended yet — answer the signals.</div>
          )}
          {plan.documents.map((d) => (
            <div key={d.document + d.ruleId} className="rounded-lg border border-border p-3 bg-paper-deep/40">
              <div className="flex items-center justify-between">
                <div className="font-medium capitalize">{documentLabel(d.document)}</div>
                <Badge variant={d.flag === "recommended" ? "default" : "outline"} className="text-[10px] capitalize">
                  {d.flag}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground mt-1">{d.reason}</div>
              <div className="text-[10px] text-muted-foreground/70 mt-2">
                via <span className="font-mono">{d.ruleName}</span> · priority {d.priority}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t border-border">
          <div className="text-xs font-medium text-muted-foreground mb-2">Rule trace</div>
          <div className="space-y-1 text-xs">
            {rules.map((r) => {
              const fired = plan.matched.find((m) => m.id === r.id);
              return (
                <div key={r.id} className="flex items-center gap-2">
                  {fired ? <CheckCircle2 className="h-3 w-3 text-primary" /> : <XCircle className="h-3 w-3 text-muted-foreground/40" />}
                  <span className={fired ? "" : "text-muted-foreground/60"}>{r.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      </Card>
    </div>
  );
}

function SignalInput({ signal, value, onChange }: {
  signal: Signal; value: unknown; onChange: (v: unknown) => void;
}) {
  const opts = (signal.options as unknown as SignalOption[]) ?? [];
  if (signal.input_type === "boolean") {
    return (
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm">{signal.label}</div>
        <Switch checked={value === true} onCheckedChange={onChange} />
      </div>
    );
  }
  if (signal.input_type === "select") {
    return (
      <Field label={signal.label}>
        <Select value={(value as string) ?? ""} onValueChange={onChange}>
          <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>{opts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
      </Field>
    );
  }
  if (signal.input_type === "multiselect") {
    const current = (value as string[]) ?? [];
    return (
      <Field label={signal.label}>
        <div className="flex flex-wrap gap-1.5">
          {opts.map((o) => {
            const on = current.includes(o.value);
            return (
              <button key={o.value} type="button"
                onClick={() => onChange(on ? current.filter((v) => v !== o.value) : [...current, o.value])}
                className={`text-xs px-2.5 py-1 rounded-full border ${on ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>
                {o.label}
              </button>
            );
          })}
        </div>
      </Field>
    );
  }
  return (
    <Field label={signal.label}>
      <Input value={(value as string) ?? ""} type={signal.input_type === "number" ? "number" : "text"}
        onChange={(e) => onChange(signal.input_type === "number" ? Number(e.target.value) : e.target.value)} />
    </Field>
  );
}

// ============================================================================
// Rule evaluation (deterministic)
// ============================================================================

function evaluateClause(c: Clause, profile: Record<string, unknown>): boolean {
  const val = profile[c.attribute];
  if (val === undefined || val === null) return false;
  switch (c.op) {
    case "eq":  return String(val) === String(c.value);
    case "neq": return String(val) !== String(c.value);
    case "gt":  return Number(val) >  Number(c.value);
    case "lt":  return Number(val) <  Number(c.value);
    case "in":
      if (Array.isArray(val)) return val.map(String).includes(String(c.value));
      return String(c.value).split(",").map((s) => s.trim()).includes(String(val));
  }
}

function evaluateRule(rule: Rule, profile: Record<string, unknown>): boolean {
  const cond = (rule.conditions as unknown as Conditions) ?? { op: "AND", clauses: [] };
  if (cond.clauses.length === 0) return true; // baseline
  return cond.op === "AND" ? cond.clauses.every((c) => evaluateClause(c, profile))
                            : cond.clauses.some((c) => evaluateClause(c, profile));
}

function evaluatePlan(rules: Rule[], profile: Record<string, unknown>) {
  const matched = rules.filter((r) => evaluateRule(r, profile));
  // Deduplicate documents by highest priority
  const byDoc = new Map<string, Rule>();
  for (const r of matched) {
    if (r.rule_type === "bundle") continue;
    const doc = r.document ?? r.recommends?.[0];
    if (!doc) continue;
    const existing = byDoc.get(doc);
    if (!existing || r.priority > existing.priority) byDoc.set(doc, r);
  }
  const documents = Array.from(byDoc.entries()).map(([doc, r]) => ({
    document: doc, ruleId: r.id, ruleName: r.name,
    reason: r.reason ?? r.description ?? "",
    flag: r.flag, priority: r.priority,
  })).sort((a, b) => b.priority - a.priority);

  // Bundle: fires when >= min_matches documents apply
  const bundleRule = matched.find((r) => r.rule_type === "bundle");
  const bundle = bundleRule && documents.length >= (bundleRule.min_matches ?? 2)
    ? { name: bundleRule.name, reason: bundleRule.reason ?? "" }
    : null;

  return { matched, documents, bundle };
}

function documentLabel(d: string): string {
  return DOCUMENTS.find((x) => x.value === d)?.label ?? d;
}

// ============================================================================
// Versions tab
// ============================================================================

function VersionsTab() {
  const qc = useQueryClient();
  const [notes, setNotes] = useState("");

  const { data: versions = [] } = useQuery({
    queryKey: ["rec-rule-versions"],
    queryFn: async () =>
      (await supabase.from("recommendation_rule_versions").select("*").order("version_number", { ascending: false })).data as Version[] ?? [],
  });

  const publish = useMutation({
    mutationFn: async () => {
      const { data: rules } = await supabase.from("recommendation_rules").select("*");
      const { data: signals } = await supabase.from("discovery_signals").select("*");
      const next = (versions[0]?.version_number ?? 0) + 1;
      const snapshot = { rules: rules ?? [], signals: signals ?? [] };
      const { error } = await supabase.from("recommendation_rule_versions").insert({
        version_number: next, notes: notes || null, snapshot: snapshot as never,
      });
      if (error) throw error;
      // Mark all draft rules published
      await supabase.from("recommendation_rules").update({ status: "published" }).eq("status", "draft");
      return next;
    },
    onSuccess: (n) => {
      toast.success(`Published v${n}`);
      setNotes("");
      qc.invalidateQueries({ queryKey: ["rec-rule-versions"] });
      qc.invalidateQueries({ queryKey: ["rec-rules"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
      <Card className="p-5 shadow-card h-fit">
        <div className="font-serif text-lg mb-1 flex items-center gap-2"><Rocket className="h-4 w-4" />Publish new version</div>
        <div className="text-xs text-muted-foreground mb-4">Snapshots the current rules + signals so the member app can consume this exact set.</div>
        <Field label="Release notes">
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Added pet-trust rule; tightened priorities." />
        </Field>
        <Button className="mt-3 w-full" onClick={() => publish.mutate()} disabled={publish.isPending}>
          {publish.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
          Publish snapshot
        </Button>
      </Card>

      <div>
        <div className="text-sm text-muted-foreground mb-3 flex items-center gap-1.5">
          <History className="h-3.5 w-3.5" /> Version history
        </div>
        {versions.length === 0 ? <EmptyState label="No published versions yet." /> : (
          <Card className="divide-y divide-border overflow-hidden shadow-card">
            {versions.map((v) => {
              const snap = v.snapshot as unknown as { rules?: unknown[]; signals?: unknown[] } | null;
              return (
                <div key={v.id} className="px-5 py-4">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">v{v.version_number}</div>
                    <div className="text-xs text-muted-foreground">{new Date(v.published_at).toLocaleString()}</div>
                  </div>
                  {v.notes && <div className="text-sm text-foreground/80 mt-1">{v.notes}</div>}
                  <div className="text-xs text-muted-foreground mt-2">
                    {snap?.rules?.length ?? 0} rules · {snap?.signals?.length ?? 0} signals
                  </div>
                </div>
              );
            })}
          </Card>
        )}
      </div>
    </div>
  );
}
