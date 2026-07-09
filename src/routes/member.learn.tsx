import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/lib/role-context";
import { loadDraft } from "@/lib/member-draft";
import { BookOpen, FileText, Video, Link as LinkIcon, Search, ChevronDown, ChevronUp, PlayCircle, X } from "lucide-react";
import { tagLabel } from "@/lib/service-tags";

export const Route = createFileRoute("/member/learn")({ component: LearnPage });

type Asset = {
  id: string;
  kind: "faq" | "doc" | "video" | "link";
  title: string;
  body: string | null;
  url: string | null;
  file_path: string | null;
  tags: string[] | null;
  topic_tags: string[] | null;
  category: string | null;
  order_index: number | null;
};

function LearnPage() {
  const { role } = useRole();
  const [q, setQ] = useState("");
  const [topicFilter, setTopicFilter] = useState<string | null>(null);
  const [activeKind, setActiveKind] = useState<"all" | "faq" | "video" | "doc">("all");

  const draft = useMemo(() => loadDraft(role), [role]);

  const { data: content, isLoading } = useQuery({
    queryKey: ["member", "content"],
    queryFn: async () => {
      const { data } = await supabase
        .from("content_assets")
        .select("*")
        .eq("published", true)
        .order("order_index", { ascending: true });
      return (data ?? []) as unknown as Asset[];
    },
  });

  const { data: rules } = useQuery({
    queryKey: ["member", "rules-for-learn"],
    queryFn: async () =>
      (await supabase.from("recommendation_rules").select("document,recommends,active").eq("active", true)).data ?? [],
  });

  const memberTags = useMemo(() => {
    const s = new Set<string>(["common"]);
    // Broaden with any selected docs from the current plan draft
    for (const d of draft?.selectedDocs ?? []) s.add(d);
    if (rules) {
      for (const r of rules) {
        const doc = (r as any).document ?? ((r as any).recommends ?? [])[0];
        if (doc) s.add(doc);
      }
    }
    return s;
  }, [rules, draft]);

  const filtered = useMemo(() => {
    if (!content) return [];
    const ql = q.trim().toLowerCase();
    return content.filter((c) => {
      const tags = c.tags ?? [];
      const tagMatch = tags.length === 0 || tags.some((t) => memberTags.has(t));
      if (!tagMatch) return false;
      if (topicFilter && !(c.topic_tags ?? []).includes(topicFilter)) return false;
      if (activeKind !== "all" && !(activeKind === "doc" ? c.kind === "doc" || c.kind === "link" : c.kind === activeKind)) return false;
      if (!ql) return true;
      return [c.title, c.body, c.category, ...(c.topic_tags ?? [])]
        .filter(Boolean).join(" ").toLowerCase().includes(ql);
    });
  }, [content, q, memberTags, topicFilter, activeKind]);

  // Group by topic (first topic tag), fallback to category, fallback to "General"
  const groups = useMemo(() => {
    const m = new Map<string, Asset[]>();
    for (const c of filtered) {
      const topic = (c.topic_tags && c.topic_tags[0]) || c.category || "General";
      if (!m.has(topic)) m.set(topic, []);
      m.get(topic)!.push(c);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const allTopics = useMemo(() => {
    const s = new Set<string>();
    for (const c of content ?? []) for (const t of c.topic_tags ?? []) s.add(t);
    return Array.from(s).sort();
  }, [content]);

  const counts = useMemo(() => ({
    faq: filtered.filter((c) => c.kind === "faq").length,
    video: filtered.filter((c) => c.kind === "video").length,
    doc: filtered.filter((c) => c.kind === "doc" || c.kind === "link").length,
  }), [filtered]);

  return (
    <AppShell title="Learn" subtitle="FAQs, guides, and short videos curated for your plan.">
      {/* Controls */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative max-w-md flex-1">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search FAQs, guides, videos…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <div className="flex items-center gap-1 text-xs">
          {[
            { k: "all", l: `All (${filtered.length})` },
            { k: "faq", l: `FAQs (${counts.faq})` },
            { k: "video", l: `Videos (${counts.video})` },
            { k: "doc", l: `Guides (${counts.doc})` },
          ].map((t) => (
            <button
              key={t.k}
              onClick={() => setActiveKind(t.k as any)}
              className={`px-3 py-1.5 rounded-full border transition-colors ${
                activeKind === t.k
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.l}
            </button>
          ))}
        </div>
      </div>

      {allTopics.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground mr-1">Topics:</span>
          <button
            onClick={() => setTopicFilter(null)}
            className={`px-3 py-1 rounded-full text-xs border ${
              !topicFilter ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            All
          </button>
          {allTopics.map((t) => (
            <button
              key={t}
              onClick={() => setTopicFilter(topicFilter === t ? null : t)}
              className={`px-3 py-1 rounded-full text-xs border ${
                topicFilter === t ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {isLoading && <Card className="p-6 text-sm text-muted-foreground">Loading…</Card>}

      {!isLoading && filtered.length === 0 && (
        <Card className="p-8 text-sm text-muted-foreground">Nothing here yet — try a different search or topic.</Card>
      )}

      {groups.map(([topic, items]) => (
        <section key={topic} className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <BookOpen className="h-4 w-4 text-primary" />
            <h2 className="font-serif text-xl">{topic}</h2>
            <span className="text-xs text-muted-foreground">· {items.length} item{items.length === 1 ? "" : "s"}</span>
          </div>

          {/* FAQs first as accordions */}
          {items.filter((i) => i.kind === "faq").length > 0 && (
            <div className="space-y-2 mb-4">
              {items.filter((i) => i.kind === "faq").map((f) => <FaqItem key={f.id} item={f} />)}
            </div>
          )}

          {/* Videos + docs as cards */}
          {items.filter((i) => i.kind !== "faq").length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {items.filter((i) => i.kind !== "faq").map((i) =>
                i.kind === "video" ? <VideoCard key={i.id} item={i} /> : <DocCard key={i.id} item={i} />
              )}
            </div>
          )}
        </section>
      ))}
    </AppShell>
  );
}

/* ---- FAQ accordion ---- */
function FaqItem({ item }: { item: Asset }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="p-0 overflow-hidden">
      <button className="w-full flex items-center justify-between p-4 text-left" onClick={() => setOpen(!open)}>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="font-medium text-sm">{item.title}</div>
          <div className="flex items-center gap-1 flex-wrap">
            {(item.tags ?? []).slice(0, 3).map((t) => (
              <Badge key={t} variant="secondary" className="text-[10px]">{tagLabel(t)}</Badge>
            ))}
          </div>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
      </button>
      {open && item.body && (
        <div className="px-4 pb-4 text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed border-t border-border pt-3">
          {item.body}
        </div>
      )}
    </Card>
  );
}

/* ---- Video card with inline playback ---- */
function VideoCard({ item }: { item: Asset }) {
  const [playing, setPlaying] = useState(false);
  const embed = toEmbedInfo(item.url ?? "");
  const thumb = embed.thumbnail;

  return (
    <Card className="p-0 overflow-hidden">
      {playing && embed.kind !== "none" ? (
        <div className="relative aspect-video bg-black">
          {embed.kind === "iframe" ? (
            <iframe
              src={embed.src}
              title={item.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full h-full"
            />
          ) : (
            <video src={embed.src} controls autoPlay className="w-full h-full" />
          )}
          <button
            onClick={() => setPlaying(false)}
            className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white grid place-items-center hover:bg-black/80"
            aria-label="Close video"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => embed.kind !== "none" && setPlaying(true)}
          className="relative aspect-video w-full bg-primary-soft/60 grid place-items-center overflow-hidden group"
          disabled={embed.kind === "none"}
        >
          {thumb && <img src={thumb} alt="" className="absolute inset-0 w-full h-full object-cover" />}
          <div className="absolute inset-0 bg-black/20 group-hover:bg-black/30 transition-colors" />
          <PlayCircle className="h-14 w-14 text-white relative drop-shadow-lg" />
        </button>
      )}
      <div className="p-4">
        <div className="flex items-start gap-2">
          <Video className="h-4 w-4 text-primary mt-1 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-medium">{item.title}</div>
            {item.body && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.body}</p>}
            <div className="mt-2 flex items-center gap-1 flex-wrap">
              {(item.tags ?? []).slice(0, 3).map((t) => (
                <Badge key={t} variant="secondary" className="text-[10px]">{tagLabel(t)}</Badge>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ---- Doc / link card ---- */
function DocCard({ item }: { item: Asset }) {
  const Icon = item.kind === "link" ? LinkIcon : FileText;
  const href = item.url || (item.file_path ? publicUrl(item.file_path) : null);
  return (
    <Card className="p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-md bg-primary/10 text-primary grid place-items-center shrink-0">
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium">{item.title}</div>
          {item.body && <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{item.body}</p>}
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            {(item.tags ?? []).slice(0, 3).map((t) => (
              <Badge key={t} variant="secondary" className="text-[10px]">{tagLabel(t)}</Badge>
            ))}
            {href && (
              <Button asChild variant="ghost" size="sm" className="ml-auto h-7 text-xs">
                <a href={href} target="_blank" rel="noreferrer">Open</a>
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ---- helpers ---- */
type EmbedInfo =
  | { kind: "iframe"; src: string; thumbnail?: string }
  | { kind: "video"; src: string; thumbnail?: string }
  | { kind: "none"; src: null; thumbnail?: string };

function toEmbedInfo(url: string): EmbedInfo {
  if (!url) return { kind: "none", src: null };
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{6,})/);
  if (yt) {
    return {
      kind: "iframe",
      src: `https://www.youtube.com/embed/${yt[1]}?autoplay=1&rel=0`,
      thumbnail: `https://i.ytimg.com/vi/${yt[1]}/hqdefault.jpg`,
    };
  }
  const vm = url.match(/vimeo\.com\/(\d+)/);
  if (vm) return { kind: "iframe", src: `https://player.vimeo.com/video/${vm[1]}?autoplay=1` };
  if (/\.(mp4|webm|ogg)(\?|$)/i.test(url)) return { kind: "video", src: url };
  return { kind: "none", src: null };
}

function publicUrl(path: string): string {
  const { data } = supabase.storage.from("content").getPublicUrl(path);
  return data.publicUrl;
}
