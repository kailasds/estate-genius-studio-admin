import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useRole, PERSONAS } from "@/lib/role-context";
import { useDraft, percentComplete } from "@/lib/member-draft";
import {
  ScrollText, MapPin, BookOpen, ArrowRight, Clock, Check, FileText, Sparkles,
} from "lucide-react";

export const Route = createFileRoute("/member/")({ component: MemberHome });

function useCounts() {
  return useQuery({
    queryKey: ["member", "counts"],
    queryFn: async () => {
      const [sigs, qs] = await Promise.all([
        supabase.from("discovery_signals").select("id", { count: "exact", head: true }).eq("active", true),
        supabase.from("questions").select("id", { count: "exact", head: true }),
      ]);
      return { signals: sigs.count ?? 0, questions: qs.count ?? 0 };
    },
  });
}

type Tone = "primary" | "info" | "warning" | "violet";

const TONE: Record<Tone, { tile: string; ring: string; accent: string }> = {
  primary: {
    tile: "bg-primary-soft text-[var(--cyan-edge)]",
    ring: "group-hover:ring-[var(--cyan)]/25",
    accent: "text-[var(--cyan-edge)]",
  },
  info: {
    tile: "bg-info-soft text-[var(--info-edge)]",
    ring: "group-hover:ring-[var(--info)]/25",
    accent: "text-[var(--info-edge)]",
  },
  warning: {
    tile: "bg-warning-soft text-[var(--warning-edge)]",
    ring: "group-hover:ring-[var(--warning)]/25",
    accent: "text-[var(--warning-edge)]",
  },
  violet: {
    tile: "bg-violet-soft text-[var(--violet-edge)]",
    ring: "group-hover:ring-[var(--violet)]/25",
    accent: "text-[var(--violet-edge)]",
  },
};

function MemberHome() {
  const { role } = useRole();
  const persona = PERSONAS[role];
  const { draft } = useDraft(role);
  const { data: counts } = useCounts();

  const pct = counts ? percentComplete(draft, counts.questions, counts.signals) : 0;
  const started = draft.startedAt > 0;
  const minutesLeft = counts
    ? Math.max(1, Math.round(((counts.signals + counts.questions) - (Object.keys(draft.discovery).length + Object.keys(draft.answers).length)) * 0.4))
    : null;

  const cards: {
    to: string; title: string; icon: typeof ScrollText; image: string;
    body: string; cta: string; meta: string; tone: Tone;
  }[] = [
    {
      to: "/member/plan",
      title: started ? "Continue Your Will" : "Create Your Will",
      icon: ScrollText,
      image: "/images/member-create-will.jpg",
      body: started
        ? `You're ${pct}% of the way through. Pick up where you left off.`
        : "We'll ask a few questions and generate a personalized Will tailored to your situation.",
      cta: started ? "Continue" : "Start",
      meta: started && minutesLeft ? `About ${minutesLeft} min left` : "About 10 min",
      tone: "violet",
    },
    {
      to: "/member/find-attorney",
      title: "Find an Estate Planning Attorney",
      icon: MapPin,
      image: "/images/member-find-attorney.jpg",
      body: "Connect with experienced attorneys near you for legal advice, document review, or in-person assistance.",
      cta: "Find Attorneys",
      meta: "In-person option",
      tone: "warning",
    },
    {
      to: "/member/learn",
      title: "Learning Center",
      icon: BookOpen,
      image: "/images/member-learning-center.jpg",
      body: "Explore articles, videos, and answers to common questions to better understand estate planning and your legal documents.",
      cta: "Explore Resources",
      meta: "Reading & videos",
      tone: "info",
    },
  ];

  return (
    <AppShell
      title={`Welcome back, ${persona.name.split(" ")[0]}`}
      subtitle="Everything you need to create, manage, and protect your estate plan — start where it makes the most sense for you."
    >
      {/* Hero progress panel */}
      {started && counts ? (
        <Card className="relative mb-10 overflow-hidden border-border">
          <div className="absolute inset-0 bg-gradient-to-br from-primary-soft via-card to-card pointer-events-none" />
          <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[var(--cyan)]/10 blur-3xl pointer-events-none" />
          <div className="relative p-7 md:p-8 flex flex-col md:flex-row md:items-center gap-6 justify-between">
            <div className="min-w-0">
              <Badge variant="default" className="mb-3">
                <Sparkles className="h-3 w-3" /> In progress
              </Badge>
              <div className="font-serif text-2xl leading-tight text-foreground">
                Your plan is {pct}% complete
              </div>
              <div className="mt-1.5 text-sm text-muted-foreground flex items-center gap-4 flex-wrap">
                {minutesLeft && (
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" /> ~{minutesLeft} min left
                  </span>
                )}
                <span className="flex items-center gap-1.5 text-[var(--success-edge)]">
                  <Check className="h-3.5 w-3.5" /> Answers autosaved
                </span>
              </div>
              <div className="h-2 mt-5 max-w-md rounded-full bg-[var(--border-strong)]/40 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[var(--cyan)] to-[var(--cyan-edge)] transition-[width] duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button asChild variant="outline" size="sm">
                <Link to="/member/documents">
                  <FileText className="h-3.5 w-3.5" /> My documents
                </Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/member/plan">
                  Continue <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {/* Action cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {cards.map((c) => {
          const Icon = c.icon;
          const t = TONE[c.tone];
          return (
            <Link
              key={c.to}
              to={c.to}
              className={`group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-14px_rgba(15,17,21,0.15)] ring-1 ring-transparent ${t.ring}`}
            >
              <div className="relative aspect-video w-full overflow-hidden">
                <img
                  src={c.image}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/0 to-black/0" />
                <div className={`absolute left-4 top-4 h-11 w-11 rounded-xl grid place-items-center ${t.tile}`}>
                  <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
                </div>
                <span className="absolute right-4 bottom-3 text-[11px] text-white/90 uppercase tracking-wider drop-shadow">
                  {c.meta}
                </span>
              </div>
              <div className="flex flex-col flex-1 p-6">
                <h2 className="font-serif text-[20px] leading-tight text-foreground">{c.title}</h2>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed flex-1">{c.body}</p>
                <div className={`mt-5 inline-flex items-center gap-1.5 text-sm font-medium ${t.accent}`}>
                  {c.cta}
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </AppShell>
  );
}
