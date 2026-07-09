import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { LayoutTemplate, ListChecks, FileText, HelpCircle, ArrowRight, type LucideIcon } from "lucide-react";

export const Route = createFileRoute("/dashboard")({ component: AdminHome });

type Tone = "primary" | "info" | "violet" | "warning";

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

const cards: {
  to: string; title: string; icon: LucideIcon; image: string;
  body: string; cta: string; meta: string; tone: Tone;
}[] = [
  {
    to: "/templates",
    title: "Template Management",
    icon: LayoutTemplate,
    image: "https://images.unsplash.com/photo-1568667256549-094345857637?auto=format&fit=crop&w=800&q=60",
    body: "Create, organize, and publish legal document templates used to generate personalized estate planning documents.",
    cta: "Manage Templates",
    meta: "Documents",
    tone: "primary",
  },
  {
    to: "/questions",
    title: "Question Management",
    icon: ListChecks,
    image: "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=800&q=60",
    body: "Create and manage the interview questions that help members receive personalized document recommendations.",
    cta: "Manage Questions",
    meta: "Questionnaire",
    tone: "info",
  },
  {
    to: "/rules",
    title: "Rules Management",
    icon: FileText,
    image: "https://images.unsplash.com/photo-1589578527966-fdac0f44566c?auto=format&fit=crop&w=800&q=60",
    body: "Define the business rules that determine which legal documents and templates are recommended based on a member's responses.",
    cta: "Manage Rules",
    meta: "Logic engine",
    tone: "violet",
  },
  {
    to: "/faq",
    title: "FAQ & Content",
    icon: HelpCircle,
    image: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=800&q=60",
    body: "Manage educational articles, FAQs, videos, and resources available to members throughout their estate planning journey.",
    cta: "Manage Content",
    meta: "Member resources",
    tone: "warning",
  },
];

function AdminHome() {
  return (
    <AppShell
      title="DEP Administration"
      subtitle="Manage document templates, questionnaires, business rules, and educational content that power the member experience."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
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
                <div className="absolute inset-0 bg-linear-to-t from-black/40 via-black/0 to-black/0" />
                <div className={`absolute left-4 top-4 h-11 w-11 rounded-xl grid place-items-center ${t.tile}`}>
                  <Icon className="h-4.5 w-4.5" strokeWidth={2} />
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
