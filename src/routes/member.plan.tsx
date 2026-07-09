import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useRole, PERSONAS } from "@/lib/role-context";
import { useDraft, percentComplete, type MemberDraft } from "@/lib/member-draft";

import {
  CheckCircle2, ArrowRight, ArrowLeft, Sparkles, RotateCcw, Upload, Mic, Square,
  FileText, HelpCircle, AlertCircle, Printer, Check, X, UserPlus, Compass, ClipboardList,
} from "lucide-react";
import { toast } from "sonner";
import { tagLabel, tagDescription, SERVICE_TAGS, EXTRA_DOCS } from "@/lib/service-tags";
import { loadDraft } from "@/lib/member-draft";


export const Route = createFileRoute("/member/plan")({ component: PlanPage });


type Option = { value: string; label: string };
type Clause = { attribute: string; op: string; value: unknown };
type Conditions = { op?: "AND" | "OR"; clauses: Clause[] };

function matchClause(c: Clause, profile: Record<string, unknown>): boolean {
  const v = profile[c.attribute];
  if (v === undefined || v === null || v === "") return false;
  switch (c.op) {
    case "eq": return String(v) === String(c.value);
    case "neq": return String(v) !== String(c.value);
    case "gt": return Number(v) > Number(c.value);
    case "lt": return Number(v) < Number(c.value);
    case "in":
      if (Array.isArray(c.value)) return (c.value as unknown[]).map(String).includes(String(v));
      if (Array.isArray(v)) return (v as unknown[]).map(String).includes(String(c.value));
      return false;
    default: return false;
  }
}
function ruleFires(conditions: unknown, profile: Record<string, unknown>): boolean {
  if (!conditions) return true;
  const c = conditions as Conditions;
  const clauses = c.clauses ?? [];
  if (clauses.length === 0) return true;
  const op = c.op ?? "AND";
  return op === "OR" ? clauses.some((x) => matchClause(x, profile)) : clauses.every((x) => matchClause(x, profile));
}

function usePublishedConfig() {
  return useQuery({
    queryKey: ["member", "published-config"],
    queryFn: async () => {
      const [signals, rules, questions, attrs, templates] = await Promise.all([
        supabase.from("discovery_signals").select("*").eq("active", true).order("sort_order"),
        supabase.from("recommendation_rules").select("*").eq("active", true).order("priority"),
        supabase.from("questions").select("*").order("sort_order"),
        supabase.from("attributes").select("*"),
        supabase.from("templates").select("*").order("published", { ascending: false }),
      ]);
      return {
        signals: signals.data ?? [],
        rules: rules.data ?? [],
        questions: (questions.data ?? []) as any[],
        attributes: attrs.data ?? [],
        templates: templates.data ?? [],
      };
    },
  });
}

type Step = "start" | "discovery" | "recommendations" | "interview" | "review" | "create";

function PlanPage() {
  const { role, setRole } = useRole();
  const persona = PERSONAS[role];
  const partnerRole = role === "member" ? "spouse" : "member";
  const partnerLabel = partnerRole;
  const { draft, hydrated, update, reset } = useDraft(role);
  const { data, isLoading } = usePublishedConfig();
  const hasProgress =
    draft.startedAt > 0 ||
    Object.keys(draft.discovery ?? {}).length > 0 ||
    Object.keys(draft.answers ?? {}).length > 0 ||
    (draft.selectedDocs ?? []).length > 0;
  const [step, setStep] = useState<Step>(hasProgress ? "discovery" : "start");
  const [inviteOpen, setInviteOpen] = useState(false);


  const recommendations = useMemo(() => {
    if (!data) return [] as { doc: string; reason: string | null; flag: string | null; ruleName: string }[];
    const fired = data.rules.filter((r) => ruleFires(r.conditions, draft.discovery));
    const seen = new Map<string, { doc: string; reason: string | null; flag: string | null; ruleName: string }>();
    for (const r of fired) {
      const doc = r.document ?? (r.recommends ?? [])[0];
      if (!doc) continue;
      const prev = seen.get(doc);
      if (!prev || (r.flag === "recommended" && prev.flag !== "recommended")) {
        seen.set(doc, { doc, reason: r.reason, flag: r.flag, ruleName: r.name });
      }
    }
    return Array.from(seen.values());
  }, [data, draft.discovery]);

  const selectedDocs = draft.selectedDocs ?? recommendations.map((r) => r.doc);
  const activeTags = useMemo(() => new Set<string>(["common", ...selectedDocs]), [selectedDocs]);

  const attrByQid = useMemo(() => {
    const m = new Map<string, { key: string; tags: string[] }>();
    if (!data) return m;
    const attrById = new Map(data.attributes.map((a: any) => [a.id, a]));
    for (const q of data.questions) {
      const a = q.attribute_id ? attrById.get(q.attribute_id) : null;
      m.set(q.id, { key: a?.key ?? q.id, tags: (q.tags ?? []) as string[] });
    }
    return m;
  }, [data]);

  const interview = useMemo(() => {
    if (!data) return [];
    const hasChildren = draft.discovery.has_children === true;
    const attrById = new Map(data.attributes.map((a: any) => [a.id, a]));
    const discovery = draft.discovery ?? {};
    const answeredKeys = new Set(
      Object.entries(discovery)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k]) => k),
    );
    return data.questions.filter((q) => {
      const tags = (q.tags ?? []) as string[];
      if (!tags.some((t) => activeTags.has(t))) return false;
      // Skip child-related questions if user said no children.
      if (!hasChildren) {
        const p = String(q.prompt ?? "").toLowerCase();
        if (p.includes("child") || p.includes("guardian") || p.includes("minor")) return false;
      }
      // Skip questions already answered in the "About you" discovery step.
      const attr: any = q.attribute_id ? attrById.get(q.attribute_id) : null;
      const key = attr?.key ?? q.id;
      if (answeredKeys.has(key)) return false;
      // Also dedupe by normalized prompt against discovery signal labels.
      const norm = String(q.prompt ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      for (const sig of data.signals ?? []) {
        if (!answeredKeys.has(sig.key)) continue;
        const sn = String(sig.label ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
        if (sn && norm && (sn === norm || (sn.length > 8 && norm.includes(sn)) || (norm.length > 8 && sn.includes(norm)))) {
          return false;
        }
      }
      return true;
    });
  }, [data, activeTags, draft.discovery]);


  const commonKeys = useMemo(() => {
    const s = new Set<string>();
    for (const sig of data?.signals ?? []) s.add(sig.key);
    for (const q of interview) if ((q.tags ?? []).includes("common")) s.add(q.id);
    return s;
  }, [data, interview]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { discovery?: Record<string, unknown>; selectedDocs?: string[]; answers?: Record<string, unknown> }
        | undefined;
      if (!detail) return;
      const nextSelected = (detail.selectedDocs && detail.selectedDocs.length > 0)
        ? detail.selectedDocs
        : (draft.selectedDocs ?? []);
      update(
        {
          discovery: detail.discovery ?? {},
          answers: detail.answers ?? {},
          selectedDocs: nextSelected,
        },
        { commonKeys },
      );
      setStep("review");
    };
    window.addEventListener("dep:apply-plan-intake", handler);
    return () => window.removeEventListener("dep:apply-plan-intake", handler);
  }, [commonKeys, update, draft.selectedDocs]);

  if (!hydrated || isLoading || !data) {
    return <AppShell title="My Will"><Card className="p-8 text-sm text-muted-foreground">Loading your Will…</Card></AppShell>;
  }

  const pct = percentComplete(draft, interview.length, data.signals.length);

  return (
    <AppShell
      title="My Will"
      subtitle="We'll guide you through a few simple questions and generate personalized legal documents based on your answers."
      action={
        <div className="flex items-center gap-2">
          <SavedChip updatedAt={draft.updatedAt} />
          {draft.startedAt > 0 && (
            <Button variant="ghost" size="sm" onClick={() => { reset(); setStep("start"); }}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" /> Start over
            </Button>
          )}
        </div>
      }
    >
      {step !== "start" && (
        <StepNav step={step} setStep={setStep} hasRecs={recommendations.length > 0} selectedDocs={selectedDocs} pct={pct} />
      )}

      {step === "start" && (
        <StartStep
          personaName={persona.name.split(" ")[0]}
          onAboutYou={() => setStep("discovery")}
          onKnowWhat={() => {
            if (draft.selectedDocs === null) update({ selectedDocs: [] });
            setStep("recommendations");
          }}
        />
      )}
      {step === "discovery" && (
        <DiscoveryStep
          signals={data.signals.filter((s) => {
            // Hide "any minor children" if they said they have no children.
            if (s.key === "has_minor_children" && draft.discovery.has_children === false) return false;
            return true;
          })}

          values={draft.discovery}
          onChange={(k, v) => update({ discovery: { [k]: v } }, { commonKeys })}
          onNext={() => setStep("recommendations")}
        />
      )}
      {step === "recommendations" && (
        <RecommendationsStep
          recs={recommendations}
          selected={selectedDocs}
          onToggle={(doc) => {
            const next = selectedDocs.includes(doc) ? selectedDocs.filter((d) => d !== doc) : [...selectedDocs, doc];
            update({ selectedDocs: next });
          }}
          onAddOther={(doc) => update({ selectedDocs: [...selectedDocs, doc] })}
          onBack={() => setStep(hasProgress && Object.keys(draft.discovery).length > 0 ? "discovery" : "start")}
          onNext={() => { if (draft.selectedDocs === null) update({ selectedDocs }); setStep("interview"); }}
        />
      )}
      {step === "interview" && (
        <InterviewStep
          questions={interview}
          answers={draft.answers}
          onAnswer={(qid, v) => update({ answers: { [qid]: v } }, { commonKeys })}
          templates={data.templates}
          attrByQid={attrByQid}
          discovery={draft.discovery}
          selectedDocs={selectedDocs}
          onBack={() => setStep("recommendations")}
          onDone={() => setStep("review")}
          onInvite={() => setInviteOpen(true)}
          partnerLabel={partnerLabel}
          partnerRole={partnerRole}
        />
      )}
      {step === "review" && (
        <ReviewStep
          questions={interview}
          signals={data.signals}
          answers={draft.answers}
          discovery={draft.discovery}
          templates={data.templates}
          selectedDocs={selectedDocs}
          attrByQid={attrByQid}
          onEditAnswer={(qid, v) => update({ answers: { [qid]: v } }, { commonKeys })}
          onEditDiscovery={(k, v) => update({ discovery: { [k]: v } }, { commonKeys })}
          onBack={() => setStep("interview")}
          onConfirm={() => setStep("create")}
        />
      )}
      {step === "create" && (
        <CreateStep
          templates={data.templates}
          selectedDocs={selectedDocs}
          answers={draft.answers}
          discovery={draft.discovery}
          attrByQid={attrByQid}
          approvedDocs={draft.approvedDocs ?? []}
          onApprove={(doc) => {
            const cur = new Set(draft.approvedDocs ?? []);
            cur.add(doc);
            update({ approvedDocs: Array.from(cur) });
            toast.success(`${tagLabel(doc)} added to your vault`);
          }}
          onSaveDraft={() => toast.success("Saved as draft")}
          onBack={() => setStep("review")}
        />
      )}

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        partnerLabel={partnerLabel}
        onSwitch={() => {
          setRole(partnerRole);
          setInviteOpen(false);
          toast.success(`Switched to ${partnerLabel} view`);
        }}
      />

    </AppShell>
  );
}

/* ---------------- Start chooser ---------------- */

function StartStep({ personaName, onAboutYou, onKnowWhat }: {
  personaName: string;
  onAboutYou: () => void;
  onKnowWhat: () => void;
}) {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="text-center">
        <h2 className="font-serif text-3xl">How would you like to get started, {personaName}?</h2>
        <p className="text-sm text-muted-foreground mt-2">
          Choose the experience that works best for you. You can switch between them at any time.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <button
          type="button"
          onClick={onAboutYou}
          className="text-left group rounded-xl border border-border bg-card p-6 hover:border-primary/60 hover:shadow-md transition-all"
        >
          <div className="h-11 w-11 rounded-lg bg-primary/10 text-primary grid place-items-center mb-4">
            <Compass className="h-5 w-5" />
          </div>
          <div className="font-serif text-xl leading-tight">Guided Recommendation</div>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            Answer a few simple questions about your family, finances, and goals. We'll recommend the legal documents that best fit your situation before you begin.
          </p>
          <div className="text-xs text-primary mt-4 inline-flex items-center gap-1 group-hover:gap-2 transition-all">
            Start Guided Setup <ArrowRight className="h-3.5 w-3.5" />
          </div>
        </button>
        <button
          type="button"
          onClick={onKnowWhat}
          className="text-left group rounded-xl border border-border bg-card p-6 hover:border-primary/60 hover:shadow-md transition-all"
        >
          <div className="h-11 w-11 rounded-lg bg-primary/10 text-primary grid place-items-center mb-4">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div className="font-serif text-xl leading-tight">Choose Documents Yourself</div>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            Already know which legal documents you need? Skip the recommendation step and select your documents directly.
          </p>
          <div className="text-xs text-primary mt-4 inline-flex items-center gap-1 group-hover:gap-2 transition-all">
            Choose Documents <ArrowRight className="h-3.5 w-3.5" />
          </div>
        </button>
      </div>
    </div>
  );
}

/* ---------------- Invite dialog ---------------- */

function InviteDialog({ open, onOpenChange, partnerLabel, onSwitch }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  partnerLabel: string;
  onSwitch: () => void;
}) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Invite your {partnerLabel}</DialogTitle>
          <DialogDescription>
            They'll get their own workspace with their own document drafts. Shared answers (personal, family, assets)
            sync between you both. You control sharing per document.
          </DialogDescription>
        </DialogHeader>
        {sent ? (
          <div className="rounded-md bg-primary-soft/60 border border-primary/20 p-4 text-sm">
            <Check className="h-4 w-4 text-primary inline mr-1" />
            Invitation sent to <b>{email}</b>. In this preview you can switch into their view now.
          </div>
        ) : (
          <div className="space-y-3">
            <label className="text-xs text-muted-foreground">Their email</label>
            <Input placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">
              Demo: no email is actually sent. Use the role switcher to enter the {partnerLabel}'s workspace.
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          {!sent && (
            <Button disabled={!email.includes("@")} onClick={() => setSent(true)}>
              <UserPlus className="h-4 w-4 mr-1" /> Send invite
            </Button>
          )}
          {sent && (
            <Button onClick={onSwitch}>Switch to {partnerLabel} view</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


/* ---------------- shared UI ---------------- */

function SavedChip({ updatedAt }: { updatedAt: number }) {
  if (!updatedAt) return null;
  const s = Math.max(1, Math.round((Date.now() - updatedAt) / 1000));
  const label = s < 60 ? "just now" : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`;
  return (
    <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
      <Check className="h-3 w-3 text-primary" /> Autosaved {label}
    </span>
  );
}

function StepNav({ step, setStep, hasRecs, selectedDocs, pct }: {
  step: Step;
  setStep: (s: Step) => void;
  hasRecs: boolean;
  selectedDocs: string[];
  pct: number;
}) {
  const steps: { key: Step; label: string }[] = [
    { key: "discovery", label: "About you" },
    { key: "recommendations", label: "Your Will" },
    { key: "interview", label: "Estate Profile" },
    { key: "review", label: "Review & Confirm" },
    { key: "create", label: "Create Document" },
  ];
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
        <span>Progress</span>
        <span>{pct}% complete</span>
      </div>
      <div className="h-1.5 bg-border rounded-full overflow-hidden">
        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center gap-2 mt-4 text-xs flex-wrap">
        {steps.map((s, i) => {
          const active = s.key === step;
          const locked = s.key !== "discovery" && !hasRecs && step === "discovery";
          const needsDocs = (s.key === "interview" || s.key === "review") && selectedDocs.length === 0;
          const disabled = locked || needsDocs;
          return (
            <button
              key={s.key}
              disabled={disabled}
              onClick={() => setStep(s.key)}
              className={`px-3 py-1.5 rounded-full border transition-colors ${
                active ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"
              } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              {i + 1}. {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- Discovery — one question at a time ---------------- */

function DiscoveryStep({ signals, values, onChange, onNext }: {
  signals: any[];
  values: Record<string, unknown>;
  onChange: (k: string, v: unknown) => void;
  onNext: () => void;
}) {
  const [i, setI] = useState(() => {
    const idx = signals.findIndex((s) => values[s.key] === undefined || values[s.key] === "");
    return idx === -1 ? Math.max(0, signals.length - 1) : idx;
  });

  if (signals.length === 0) {
    return <Card className="p-8 text-sm text-muted-foreground">No discovery questions have been published yet.</Card>;
  }

  const clamped = Math.min(i, signals.length - 1);
  const s = signals[clamped];
  const answered = values[s.key] !== undefined && values[s.key] !== "";

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
        <span>About you · {clamped + 1} of {signals.length}</span>
        <span>{signals.filter((x) => values[x.key] !== undefined && values[x.key] !== "").length} answered</span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={s.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
        >
          <PromptCard
            prompt={s.label}
            help={s.help_text}
            why={s.why_we_ask}
          >
            <SignalInput signal={s} value={values[s.key]} onChange={(v) => onChange(s.key, v)} />
          </PromptCard>
        </motion.div>
      </AnimatePresence>

      <div className="flex justify-between items-center mt-6">
        <Button variant="ghost" onClick={() => setI(Math.max(0, clamped - 1))} disabled={clamped === 0}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Previous
        </Button>
        {clamped === signals.length - 1 ? (
          <Button onClick={onNext} disabled={!answered}>Submit <ArrowRight className="h-4 w-4 ml-1" /></Button>
        ) : (
          <Button onClick={() => setI(clamped + 1)} disabled={!answered}>Next <ArrowRight className="h-4 w-4 ml-1" /></Button>
        )}
      </div>
    </div>
  );
}

function SignalInput({ signal, value, onChange }: { signal: any; value: unknown; onChange: (v: unknown) => void }) {
  const options: Option[] = Array.isArray(signal.options) ? signal.options : [];
  switch (signal.input_type) {
    case "boolean":
      return <ChoicePills value={value} onChange={onChange} options={[{ value: true, label: "Yes" }, { value: false, label: "No" }]} />;
    case "select":
      return options.length ? (
        <ChoicePills value={value} onChange={onChange} options={options.map((o) => ({ value: o.value, label: o.label }))} />
      ) : (
        <Select value={value ? String(value) : ""} onValueChange={onChange}>
          <SelectTrigger className="max-w-md"><SelectValue placeholder="Choose one" /></SelectTrigger>
          <SelectContent>{options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
      );
    case "multiselect":
      return <MultiSelectChips value={Array.isArray(value) ? (value as string[]) : []} options={options} onChange={onChange} />;
    case "number":
      return <Input className="max-w-xs" type="number" value={value !== undefined && value !== null ? String(value) : ""} onChange={(e) => onChange(Number(e.target.value))} />;
    default:
      return <Input className="max-w-md" value={value ? String(value) : ""} onChange={(e) => onChange(e.target.value)} />;
  }
}

function ChoicePills({ value, onChange, options }: { value: unknown; onChange: (v: unknown) => void; options: { value: unknown; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={String(o.value)}
            type="button"
            onClick={() => onChange(o.value)}
            className={"px-4 h-10 rounded-full text-sm transition border " + (active
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background text-foreground border-border hover:border-primary/60")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
function MultiSelectChips({ value, options, onChange }: { value: string[]; options: Option[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(active ? value.filter((x) => x !== o.value) : [...value, o.value])}
            className={"px-4 h-10 rounded-full text-sm transition border " + (active
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background text-foreground border-border hover:border-primary/60")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---- Shared prompt shell with "Why we ask this" popover ---- */
function PromptCard({ prompt, help, why, children }: {
  prompt: string;
  help?: string | null;
  why?: string | null;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const whyText = why && why.trim().length > 0
    ? why
    : "This helps us tailor your documents to your situation. Your answer only appears in your own plan.";
  return (
    <Card className="p-6">
      <div className="flex items-start gap-2">
        <div className="font-serif text-2xl leading-snug flex-1">{prompt}</div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Why we ask this"
          aria-expanded={open}
          title="Why we ask this"
          className="shrink-0 w-8 h-8 rounded-full border border-border grid place-items-center text-muted-foreground hover:text-foreground hover:border-primary/60 transition-colors"
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </div>

      {help && <p className="text-sm text-muted-foreground mt-2 whitespace-pre-line">{help}</p>}

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-4 rounded-md border-l-2 border-primary bg-primary-soft/30 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <HelpCircle className="h-3.5 w-3.5 text-primary" />
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Why we ask this</p>
                </div>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="w-6 h-6 rounded-md grid place-items-center hover:bg-background/60">
                  <X className="h-3 w-3" />
                </button>
              </div>
              <p className="text-sm leading-relaxed mt-2 whitespace-pre-line">{whyText}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-5">{children}</div>
    </Card>
  );
}

/* ---------------- Recommendations ---------------- */

function RecommendationsStep({ recs, selected, onToggle, onAddOther, onBack, onNext }: {
  recs: { doc: string; reason: string | null; flag: string | null; ruleName: string }[];
  selected: string[];
  onToggle: (doc: string) => void;
  onAddOther: (doc: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const combinedTags = [
    ...SERVICE_TAGS.filter((s) => s.value !== "common"),
    ...EXTRA_DOCS,
  ];
  const otherDocs = combinedTags.filter((s) => !recs.some((r) => r.doc === s.value) && !selected.includes(s.value));
  return (
    <div className="space-y-4">
      <Card className="p-5 bg-primary-soft/40 border-primary/20">
        <div className="flex items-start gap-3">
          <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div>
            <div className="font-serif text-lg">Your recommended estate plan</div>
            <p className="text-sm text-muted-foreground mt-1">
              Based on what you've told us. You can accept or adjust before we start the estate profile.
            </p>
          </div>
        </div>
      </Card>

      {recs.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">
          We couldn't shape a recommendation yet. Go back and answer a few more discovery questions, or pick documents to add below.
        </Card>
      ) : (
        <div className="space-y-3">
          {recs.map((r) => {
            const on = selected.includes(r.doc);
            return (
              <Card key={r.doc} className={`p-5 transition-colors ${on ? "" : "opacity-60"}`}>
                <div className="flex items-start gap-4">
                  <Checkbox checked={on} onCheckedChange={() => onToggle(r.doc)} className="mt-1" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-serif text-lg">{tagLabel(r.doc)}</span>
                      <Badge variant={r.flag === "recommended" ? "default" : "secondary"} className="text-[10px]">
                        {r.flag ?? "recommended"}
                      </Badge>
                    </div>
                    {(r.reason || tagDescription(r.doc)) && (
                      <p className="text-sm text-muted-foreground mt-2 max-w-2xl">{r.reason || tagDescription(r.doc)}</p>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}


      <div className="flex justify-between pt-2">
        <Button variant="ghost" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
        <Button onClick={onNext} disabled={selected.length === 0}>
          Confirm & start planning <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

/* ---------------- Interview — routed, one at a time ---------------- */

type Routing = { branches?: { when: string; goto: string }[]; default_next?: string | null };

function nextIdFor(current: any, value: unknown, questions: any[]): string | null {
  const r = (current?.routing ?? {}) as Routing;
  const branches = Array.isArray(r.branches) ? r.branches : [];
  const asStrs = Array.isArray(value) ? (value as unknown[]).map(String) : [String(value)];
  const hit = branches.find((b) => b.when && asStrs.includes(String(b.when)));
  if (hit?.goto && questions.some((q) => q.id === hit.goto)) return hit.goto;
  if (r.default_next && questions.some((q) => q.id === r.default_next)) return r.default_next;
  const idx = questions.findIndex((q) => q.id === current.id);
  return questions[idx + 1]?.id ?? null;
}

function InterviewStep({ questions, answers, onAnswer, templates, attrByQid, discovery, selectedDocs, onBack, onDone, onInvite, partnerLabel, partnerRole }: {
  questions: any[];
  answers: Record<string, unknown>;
  onAnswer: (qid: string, v: unknown) => void;
  templates: any[];
  attrByQid: Map<string, { key: string; tags: string[] }>;
  discovery: Record<string, unknown>;
  selectedDocs: string[];
  onBack: () => void;
  onDone: () => void;
  onInvite: () => void;
  partnerLabel: string;
  partnerRole: "member" | "spouse";
}) {
  // Path is the ordered list of question ids the user has visited via routing.
  const [path, setPath] = useState<string[]>(() => (questions[0] ? [questions[0].id] : []));
  const [pos, setPos] = useState(0);
  const partnerDraft = useMemo(() => loadDraft(partnerRole), [partnerRole]);
  const partnerActive = (partnerDraft.selectedDocs ?? []).length > 0 || Object.keys(partnerDraft.answers ?? {}).length > 0;

  if (questions.length === 0) {
    return (
      <Card className="p-8 text-sm text-muted-foreground">
        No questions apply to your selected documents yet.
        <div className="mt-4"><Button onClick={onDone}>Continue to review</Button></div>
      </Card>
    );
  }

  const currentId = path[Math.min(pos, path.length - 1)] ?? questions[0].id;
  const q = questions.find((x) => x.id === currentId) ?? questions[0];
  const value = answers[q.id];
  const answered = value !== undefined && value !== "";
  const doneCount = path.filter((id) => answers[id] !== undefined && answers[id] !== "").length;

  const goNext = () => {
    const nextId = nextIdFor(q, value, questions);
    if (!nextId) { onDone(); return; }
    const trimmed = path.slice(0, pos + 1);
    if (trimmed[trimmed.length - 1] !== nextId) trimmed.push(nextId);
    setPath(trimmed);
    setPos(pos + 1);
  };
  const goPrev = () => {
    if (pos === 0) { onBack(); return; }
    setPos(pos - 1);
  };

  const isLast = !nextIdFor(q, value, questions);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr,380px] gap-6">
      <div>
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <div className="text-xs text-muted-foreground">
            Question {pos + 1}{isLast ? " (last)" : ""} · {doneCount} answered
          </div>
          <Button variant="outline" size="sm" onClick={onInvite}>
            <UserPlus className="h-4 w-4 mr-1.5" /> Invite {partnerLabel}
          </Button>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={q.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            <PromptCard prompt={q.prompt} help={q.help_text} why={q.why_we_ask ?? q.how_to_answer}>
              {q.required && <div className="mb-3"><Badge variant="outline" className="text-[10px]">Required</Badge></div>}
              <QuestionInput q={q} value={value} onChange={(v) => onAnswer(q.id, v)} options={Array.isArray(q.options) ? q.options : []} />
            </PromptCard>
          </motion.div>
        </AnimatePresence>

        <div className="flex justify-between items-center mt-4">
          <Button variant="ghost" onClick={goPrev}>
            <ArrowLeft className="h-4 w-4 mr-1" /> {pos === 0 ? "Back to plan" : "Previous"}
          </Button>
          {isLast ? (
            <Button onClick={onDone} disabled={q.required && !answered}>
              Finish interview <CheckCircle2 className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={goNext} disabled={q.required && !answered}>
              Next <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      </div>

      <aside className="space-y-4">
        <LiveDocsPanel
          templates={templates}
          selectedDocs={selectedDocs}
          answers={answers}
          discovery={discovery}
          attrByQid={attrByQid}
        />
        {partnerActive && (
          <PartnerReadOnlyPanel
            partnerLabel={partnerLabel}
            partnerDraft={partnerDraft}
            templates={templates}
            attrByQid={attrByQid}
          />
        )}
      </aside>

    </div>
  );
}



function QuestionInput({ q, value, onChange, options }: { q: any; value: unknown; onChange: (v: unknown) => void; options: Option[] }) {
  switch (q.input_type) {
    case "boolean":
      return <ChoicePills value={value} onChange={onChange} options={[{ value: true, label: "Yes" }, { value: false, label: "No" }]} />;
    case "select":
      return options.length ? (
        <ChoicePills value={value} onChange={onChange} options={options.map((o) => ({ value: o.value, label: o.label }))} />
      ) : (
        <Select value={value ? String(value) : ""} onValueChange={onChange}>
          <SelectTrigger className="max-w-md"><SelectValue placeholder="Choose one" /></SelectTrigger>
          <SelectContent>{options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
      );
    case "multiselect":
      return <MultiSelectChips value={Array.isArray(value) ? (value as string[]) : []} options={options} onChange={onChange} />;
    case "long_text":
      return <Textarea rows={5} value={value ? String(value) : ""} onChange={(e) => onChange(e.target.value)} />;
    case "number":
      return <Input className="max-w-xs" type="number" value={value ? String(value) : ""} onChange={(e) => onChange(Number(e.target.value))} />;
    case "date":
      return <Input className="max-w-xs" type="date" value={value ? String(value) : ""} onChange={(e) => onChange(e.target.value)} />;
    case "address":
      return <Textarea rows={3} placeholder="Street, City, State, ZIP" value={value ? String(value) : ""} onChange={(e) => onChange(e.target.value)} />;
    case "document_upload":
      return <UploadInput questionId={q.id} value={value as UploadValue | undefined} onChange={onChange} />;
    case "voice_input":
      return <VoiceInput questionId={q.id} value={value as UploadValue | undefined} onChange={onChange} />;
    default:
      return <Input className="max-w-md" value={value ? String(value) : ""} onChange={(e) => onChange(e.target.value)} />;
  }
}

type UploadValue = { path: string; name: string; type: string };

async function uploadToBucket(qid: string, file: File): Promise<UploadValue> {
  const path = `${qid}/${Date.now()}-${file.name}`;
  const { error } = await supabase.storage.from("member-uploads").upload(path, file, { upsert: true });
  if (error) throw error;
  return { path, name: file.name, type: file.type };
}

function UploadInput({ questionId, value, onChange }: { questionId: string; value?: UploadValue; onChange: (v: UploadValue) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const upload = async (f: File) => {
    if (f.size > 25_000_000) return toast.error("File too large (25MB max).");
    setBusy(true);
    try {
      const v = await uploadToBucket(questionId, f);
      onChange(v);
      toast.success("Uploaded");
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <div>
      <input ref={inputRef} type="file" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="w-full border-2 border-dashed border-border rounded-md p-6 text-center hover:border-primary/60 transition-colors"
        disabled={busy}
      >
        <Upload className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
        {busy ? <div className="text-sm">Uploading…</div> : value ? (
          <div className="text-sm"><span className="font-medium">{value.name}</span> uploaded — click to replace</div>
        ) : (
          <div className="text-sm text-muted-foreground">Click to upload a document (PDF, DOCX, images)</div>
        )}
      </button>
    </div>
  );
}

function VoiceInput({ questionId, value, onChange }: { questionId: string; value?: UploadValue; onChange: (v: UploadValue) => void }) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks.current = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setBusy(true);
        try {
          const blob = new Blob(chunks.current, { type: "audio/webm" });
          const file = new File([blob], `voice-${Date.now()}.webm`, { type: "audio/webm" });
          const v = await uploadToBucket(questionId, file);
          onChange(v);
          toast.success("Voice answer saved");
        } catch (e) { toast.error((e as Error).message); }
        finally { setBusy(false); }
      };
      rec.start();
      recRef.current = rec;
      setRecording(true);
    } catch {
      toast.error("Could not access microphone.");
    }
  };
  const stop = () => { recRef.current?.stop(); setRecording(false); };

  return (
    <div className="border border-border rounded-md p-5">
      <div className="flex items-center gap-3">
        {recording ? (
          <Button onClick={stop} variant="destructive"><Square className="h-4 w-4 mr-1" /> Stop</Button>
        ) : (
          <Button onClick={start} disabled={busy}><Mic className="h-4 w-4 mr-1" /> {busy ? "Saving…" : value ? "Re-record" : "Record"}</Button>
        )}
        <div className="text-sm text-muted-foreground">
          {recording ? "Recording…" : value ? `Saved: ${value.name}` : "Tap Record and answer out loud."}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Live docs panel ---------------- */

function LiveDocsPanel({ templates, selectedDocs, answers, discovery, attrByQid }: {
  templates: any[];
  selectedDocs: string[];
  answers: Record<string, unknown>;
  discovery: Record<string, unknown>;
  attrByQid: Map<string, { key: string; tags: string[] }>;
}) {
  const merged = useMemo(() => {
    const m: Record<string, unknown> = { ...discovery };
    for (const [qid, v] of Object.entries(answers)) {
      const a = attrByQid.get(qid);
      if (a?.key) m[a.key] = v;
    }
    return m;
  }, [discovery, answers, attrByQid]);

  const [active, setActive] = useState<string>(selectedDocs[0] ?? "");
  const activeDoc = selectedDocs.includes(active) ? active : selectedDocs[0];
  const template = activeDoc ? templates.find((x) => (x.tags ?? []).includes(activeDoc)) : null;

  return (
    <Card className="p-4 sticky top-4">
      <div className="flex items-center gap-2 mb-3">
        <FileText className="h-4 w-4 text-primary" />
        <div className="font-serif text-lg">Your documents</div>
        <Badge variant="secondary" className="text-[10px] ml-auto">Live preview</Badge>
      </div>
      {selectedDocs.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-3 border-b border-border pb-3">
          {selectedDocs.map((d) => {
            const on = d === activeDoc;
            return (
              <button
                key={d}
                type="button"
                onClick={() => setActive(d)}
                className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                  on
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-primary/60"
                }`}
              >
                {tagLabel(d)}
              </button>
            );
          })}
        </div>
      )}
      <p className="text-xs text-muted-foreground mb-3">
        {activeDoc ? `Preview of your ${tagLabel(activeDoc)}. Updates as you answer.` : "Select a document to preview."}
      </p>
      <div className="rounded-md border border-border p-3 bg-paper-deep/40 max-h-[70vh] overflow-auto">
        {activeDoc && template ? (
          <MergedPreview body={template.body ?? ""} values={merged} />
        ) : activeDoc ? (
          <div className="text-xs text-muted-foreground italic">No template published yet for this document.</div>
        ) : (
          <div className="text-xs text-muted-foreground italic">No documents selected.</div>
        )}
      </div>
    </Card>
  );
}

function PartnerReadOnlyPanel({ partnerLabel, partnerDraft, templates, attrByQid }: {
  partnerLabel: string;
  partnerDraft: MemberDraft;
  templates: any[];
  attrByQid: Map<string, { key: string; tags: string[] }>;
}) {
  const partnerDocs = partnerDraft.selectedDocs ?? [];
  const merged = useMemo(() => {
    const m: Record<string, unknown> = { ...(partnerDraft.discovery ?? {}) };
    for (const [qid, v] of Object.entries(partnerDraft.answers ?? {})) {
      const a = attrByQid.get(qid);
      if (a?.key) m[a.key] = v;
    }
    return m;
  }, [partnerDraft, attrByQid]);
  const [active, setActive] = useState<string>(partnerDocs[0] ?? "");
  const activeDoc = partnerDocs.includes(active) ? active : partnerDocs[0];
  const template = activeDoc ? templates.find((x) => (x.tags ?? []).includes(activeDoc)) : null;
  const answered = Object.keys(partnerDraft.answers ?? {}).length + Object.keys(partnerDraft.discovery ?? {}).length;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-2">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <div className="font-serif text-lg capitalize">{partnerLabel}'s plan</div>
        <Badge variant="outline" className="text-[10px] ml-auto">View only</Badge>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        {answered} shared answer{answered === 1 ? "" : "s"} · {partnerDocs.length} document{partnerDocs.length === 1 ? "" : "s"}
      </p>
      {partnerDocs.length === 0 ? (
        <div className="text-xs text-muted-foreground italic">Your {partnerLabel} hasn't picked any documents yet.</div>
      ) : (
        <>
          {partnerDocs.length > 1 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {partnerDocs.map((d) => {
                const on = d === activeDoc;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setActive(d)}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                      on
                        ? "bg-secondary text-secondary-foreground border-border"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tagLabel(d)}
                  </button>
                );
              })}
            </div>
          )}
          <div className="rounded-md border border-border p-3 bg-paper-deep/30 max-h-[40vh] overflow-auto">
            {activeDoc && template ? (
              <MergedPreview body={template.body ?? ""} values={merged} />
            ) : (
              <div className="text-xs text-muted-foreground italic">No template published yet for this document.</div>
            )}
          </div>
        </>
      )}
    </Card>
  );
}


function MergedPreview({ body, values }: { body: string; values: Record<string, unknown> }) {
  const rendered = body.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, key: string) => {
    const v = values[key];
    if (v === undefined || v === null || v === "") return `[${key}]`;
    return Array.isArray(v) ? v.join(", ") : String(v);
  });
  return <div className="text-[11px] text-foreground/80 whitespace-pre-wrap leading-relaxed max-h-40 overflow-auto font-serif">{rendered}</div>;
}

/* ---------------- Review & Confirm (inline editable) ---------------- */

function ReviewStep({
  questions, signals, answers, discovery, templates: _templates, selectedDocs,
  attrByQid: _attrByQid, onEditAnswer, onEditDiscovery, onBack, onConfirm,
}: {
  questions: any[];
  signals: any[];
  answers: Record<string, unknown>;
  discovery: Record<string, unknown>;
  templates: any[];
  selectedDocs: string[];
  attrByQid: Map<string, { key: string; tags: string[] }>;
  onEditAnswer: (qid: string, v: unknown) => void;
  onEditDiscovery: (k: string, v: unknown) => void;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const missingSignals = signals.filter((s) => discovery[s.key] === undefined || discovery[s.key] === "");
  const missingRequired = questions.filter((q) => q.required && (answers[q.id] === undefined || answers[q.id] === ""));
  const complete = missingSignals.length === 0 && missingRequired.length === 0;

  return (
    <div className="space-y-5">
      <Card className={`p-5 border ${complete ? "bg-primary-soft/40 border-primary/30" : "bg-yellow-50 border-yellow-200"}`}>
        <div className="flex items-start gap-3">
          {complete ? <CheckCircle2 className="h-5 w-5 text-primary" /> : <AlertCircle className="h-5 w-5 text-yellow-600" />}
          <div className="flex-1">
            <div className="font-serif text-lg">
              {complete ? "Everything looks good" : "A few items still need attention"}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {complete
                ? "Review the answers below. Edit anything inline, then confirm to generate your documents."
                : "You can still edit any answer here — no need to go back."}
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="font-serif text-2xl mb-4">Review your answers</div>

        <section className="mb-6">
          <h3 className="font-medium mb-2">Documents to be created</h3>
          <div className="flex flex-wrap gap-2">
            {selectedDocs.map((d) => <Badge key={d}>{tagLabel(d)}</Badge>)}
          </div>
        </section>

        <section className="mb-6">
          <h3 className="font-medium mb-3">About you</h3>
          <div className="space-y-4">
            {signals.map((s) => (
              <EditableSignalRow
                key={s.id}
                signal={s}
                value={discovery[s.key]}
                onChange={(v) => onEditDiscovery(s.key, v)}
              />
            ))}
          </div>
        </section>

        <section>
          <h3 className="font-medium mb-3">Estate profile</h3>
          <div className="space-y-4">
            {questions.map((q) => (
              <EditableAnswerRow
                key={q.id}
                q={q}
                value={answers[q.id]}
                onChange={(v) => onEditAnswer(q.id, v)}
              />
            ))}
          </div>
        </section>
      </Card>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" /> Back to estate profile</Button>
        <Button onClick={onConfirm} disabled={!complete}>
          Confirm & create document <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

function EditableSignalRow({ signal, value, onChange }: {
  signal: any; value: unknown; onChange: (v: unknown) => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="border-b border-border pb-3">
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs text-muted-foreground flex-1">{signal.label}</div>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="text-xs text-primary hover:underline shrink-0"
        >
          {editing ? "Done" : "Edit"}
        </button>
      </div>
      {editing ? (
        <div className="mt-2"><SignalInput signal={signal} value={value} onChange={onChange} /></div>
      ) : (
        <div className="mt-1 text-sm">{formatValue(value)}</div>
      )}
    </div>
  );
}

function EditableAnswerRow({ q, value, onChange }: {
  q: any; value: unknown; onChange: (v: unknown) => void;
}) {
  const [editing, setEditing] = useState(false);
  const missing = q.required && (value === undefined || value === "");
  return (
    <div className="border-b border-border pb-3">
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs text-muted-foreground flex items-center gap-2 flex-1">
          {q.prompt}
          {missing && <Badge variant="destructive" className="text-[10px]">Missing</Badge>}
        </div>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="text-xs text-primary hover:underline shrink-0"
        >
          {editing ? "Done" : "Edit"}
        </button>
      </div>
      {editing ? (
        <div className="mt-2">
          <QuestionInput
            q={q}
            value={value}
            onChange={onChange}
            options={Array.isArray(q.options) ? q.options : []}
          />
        </div>
      ) : (
        <div className="mt-1 text-sm">{formatValue(value)}</div>
      )}
    </div>
  );
}

/* ---------------- Create Document ---------------- */

function CreateStep({
  templates, selectedDocs, answers, discovery, attrByQid,
  approvedDocs, onApprove, onSaveDraft, onBack,
}: {
  templates: any[];
  selectedDocs: string[];
  answers: Record<string, unknown>;
  discovery: Record<string, unknown>;
  attrByQid: Map<string, { key: string; tags: string[] }>;
  approvedDocs: string[];
  onApprove: (doc: string) => void;
  onSaveDraft: () => void;
  onBack: () => void;
}) {
  const merged = useMemo(() => {
    const m: Record<string, unknown> = { ...discovery };
    for (const [qid, v] of Object.entries(answers)) {
      const a = attrByQid.get(qid);
      if (a?.key) m[a.key] = v;
    }
    return m;
  }, [discovery, answers, attrByQid]);

  const printDoc = () => window.print();
  const approvedSet = new Set(approvedDocs);
  const allApproved = selectedDocs.length > 0 && selectedDocs.every((d) => approvedSet.has(d));

  return (
    <div className="space-y-5">
      <Card className="p-5 bg-primary-soft/40 border-primary/30">
        <div className="flex items-start gap-3">
          <Sparkles className="h-5 w-5 text-primary mt-0.5" />
          <div className="flex-1">
            <div className="font-serif text-lg">Your documents are ready</div>
            <p className="text-sm text-muted-foreground mt-1">
              We've embedded your answers into each template. Review each one, then approve to add it to your vault
              or save as a draft to come back later.
            </p>
          </div>
          <Button onClick={printDoc} variant="secondary"><Printer className="h-4 w-4 mr-1" /> Print / save PDF</Button>
        </div>
      </Card>

      <div className="space-y-4">
        {selectedDocs.map((doc) => {
          const t = templates.find((x) => (x.tags ?? []).includes(doc));
          const approved = approvedSet.has(doc);
          return (
            <Card key={doc} className="p-5">
              <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <div className="font-serif text-xl">{tagLabel(doc)}</div>
                  {approved && (
                    <Badge className="text-[10px]"><Check className="h-3 w-3 mr-1" /> Approved</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={onSaveDraft}>Save as draft</Button>
                  <Button size="sm" disabled={approved} onClick={() => onApprove(doc)}>
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                    {approved ? "Added to vault" : "Approve & add to vault"}
                  </Button>
                </div>
              </div>
              <div className="border border-border rounded-md p-4 bg-paper-deep/30 max-h-[520px] overflow-auto">
                {t ? (
                  <div className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed font-serif">
                    {(t.body ?? "").replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_: string, key: string) => {
                      const v = merged[key];
                      if (v === undefined || v === null || v === "") return `[${key}]`;
                      return Array.isArray(v) ? v.join(", ") : String(v);
                    })}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground italic">No template published yet for this document.</div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <div className="flex justify-between print:hidden">
        <Button variant="ghost" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" /> Back to review</Button>
        {allApproved ? (
          <Button asChild variant="secondary"><Link to="/member/documents">View my documents</Link></Button>
        ) : (
          <Button variant="ghost" onClick={onSaveDraft}>Save all as draft</Button>
        )}
      </div>
    </div>
  );
}

function formatValue(v: unknown): string {
  if (v === undefined || v === null || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object" && (v as any).name) return `📎 ${(v as any).name}`;
  return String(v);
}
