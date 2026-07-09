import { useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TagChips, TagPicker } from "@/components/tag-chips";
import { type ServiceTag, tagLabel } from "@/lib/service-tags";
import {
  Plus, Trash2, HelpCircle, FileText, Video, Link as LinkIcon,
  Upload, Eye, ArrowUp, ArrowDown, Loader2, X,
} from "lucide-react";
import { toast } from "sonner";
import { useDebouncedSave } from "@/lib/use-debounced-save";
import { AiAssistButton } from "@/components/ai-assist-dialog";
import { ScopeFilter, EmptyState, Field } from "@/routes/templates";
import type { Database } from "@/integrations/supabase/types";

type Content = Database["public"]["Tables"]["content_assets"]["Row"];
type Kind = "faq" | "doc" | "video" | "link";

const KIND_META: Record<Kind, { label: string; Icon: typeof HelpCircle; color: string }> = {
  faq:   { label: "FAQ",      Icon: HelpCircle, color: "text-primary" },
  doc:   { label: "Document", Icon: FileText,   color: "text-primary" },
  video: { label: "Video",    Icon: Video,      color: "text-gold" },
  link:  { label: "Link",     Icon: LinkIcon,   color: "text-primary" },
};

export const Route = createFileRoute("/faq")({
  component: FaqPage,
});

function FaqPage() {
  const [tab, setTab] = useState<"faq" | "content" | "preview">("faq");
  return (
    <AppShell
      title="FAQ & Content"
      subtitle="Shared library of FAQs, documents, and videos. Members see common items plus anything tagged for their plan."
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="mb-6">
          <TabsTrigger value="faq">FAQs</TabsTrigger>
          <TabsTrigger value="content">Documents & Videos</TabsTrigger>
          <TabsTrigger value="preview"><Eye className="h-3.5 w-3.5 mr-1.5" />Member preview</TabsTrigger>
        </TabsList>
        <TabsContent value="faq"><LibraryTab kind="faq" /></TabsContent>
        <TabsContent value="content"><LibraryTab kind="content" /></TabsContent>
        <TabsContent value="preview"><MemberPreview /></TabsContent>
      </Tabs>
    </AppShell>
  );
}

// ============================================================================
// Library tab (FAQs OR Docs+Videos)
// ============================================================================

function LibraryTab({ kind }: { kind: "faq" | "content" }) {
  const qc = useQueryClient();
  const [scope, setScope] = useState<ServiceTag | "all">("all");
  const [topicFilter, setTopicFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showDrafts, setShowDrafts] = useState(true);

  const kindsForTab: Kind[] = kind === "faq" ? ["faq"] : ["doc", "video", "link"];

  const { data: items = [] } = useQuery({
    queryKey: ["content", kind],
    queryFn: async () => {
      const { data } = await supabase
        .from("content_assets")
        .select("*")
        .in("kind", kindsForTab)
        .order("order_index")
        .order("title");
      return (data ?? []) as Content[];
    },
  });

  const allTopics = useMemo(() => {
    const s = new Set<string>();
    items.forEach((i) => (i.topic_tags ?? []).forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [items]);

  const filtered = useMemo(() => items.filter((c) => {
    if (!showDrafts && !c.published) return false;
    if (scope !== "all" && !(c.tags ?? []).includes(scope)) return false;
    if (topicFilter !== "all" && !(c.topic_tags ?? []).includes(topicFilter)) return false;
    return true;
  }), [items, scope, topicFilter, showDrafts]);

  const create = useMutation({
    mutationFn: async (asKind: Kind) => {
      const maxOrder = items.reduce((m, i) => Math.max(m, i.order_index ?? 0), 0);
      const { data, error } = await supabase.from("content_assets").insert({
        kind: asKind,
        title: asKind === "faq" ? "New question" : "New " + KIND_META[asKind].label.toLowerCase(),
        body: "",
        category: asKind === "faq" ? "General" : null,
        tags: [], topic_tags: [], published: false, order_index: maxOrder + 10,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (row) => { qc.invalidateQueries({ queryKey: ["content"] }); setSelectedId(row.id); },
  });

  const reorder = useMutation({
    mutationFn: async ({ id, dir }: { id: string; dir: -1 | 1 }) => {
      const idx = filtered.findIndex((c) => c.id === id);
      const swap = filtered[idx + dir];
      if (!swap) return;
      const a = filtered[idx];
      await Promise.all([
        supabase.from("content_assets").update({ order_index: swap.order_index }).eq("id", a.id),
        supabase.from("content_assets").update({ order_index: a.order_index }).eq("id", swap.id),
      ]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content"] }),
  });

  const selected = items.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <ScopeFilter scope={scope} setScope={setScope} />
          {allTopics.length > 0 && (
            <Select value={topicFilter} onValueChange={setTopicFilter}>
              <SelectTrigger className="w-48"><SelectValue placeholder="All topics" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All topics</SelectItem>
                {allTopics.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={showDrafts} onCheckedChange={setShowDrafts} />
            Show drafts
          </label>
        </div>
        <div className="flex gap-2">
          {kind === "faq" ? (
            <Button onClick={() => create.mutate("faq")}>
              <Plus className="h-4 w-4 mr-1.5" />New FAQ
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => create.mutate("doc")}>
                <FileText className="h-4 w-4 mr-1.5" />New document
              </Button>
              <Button variant="outline" onClick={() => create.mutate("video")}>
                <Video className="h-4 w-4 mr-1.5" />New video
              </Button>
              <Button variant="outline" onClick={() => create.mutate("link")}>
                <LinkIcon className="h-4 w-4 mr-1.5" />New link
              </Button>
            </>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState label={kind === "faq" ? "No FAQs in this scope yet." : "No documents or videos yet."} />
      ) : (
        <div className={kind === "faq" ? "space-y-2" : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"}>
          {filtered.map((c, i) =>
            kind === "faq"
              ? <FaqRow key={c.id} row={c} onOpen={() => setSelectedId(c.id)}
                  onUp={i > 0 ? () => reorder.mutate({ id: c.id, dir: -1 }) : undefined}
                  onDown={i < filtered.length - 1 ? () => reorder.mutate({ id: c.id, dir: 1 }) : undefined} />
              : <ContentCard key={c.id} row={c} onOpen={() => setSelectedId(c.id)} />
          )}
        </div>
      )}

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          {selected && <ContentEditor key={selected.id} row={selected} onDelete={() => setSelectedId(null)} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function FaqRow({ row, onOpen, onUp, onDown }: {
  row: Content; onOpen: () => void;
  onUp?: () => void; onDown?: () => void;
}) {
  return (
    <Card className="p-4 flex items-start gap-3 shadow-card hover:shadow-panel transition-shadow">
      <div className="flex flex-col gap-0.5 pt-0.5">
        <button onClick={onUp} disabled={!onUp} className="text-muted-foreground/40 hover:text-foreground disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
        <button onClick={onDown} disabled={!onDown} className="text-muted-foreground/40 hover:text-foreground disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
      </div>
      <button onClick={onOpen} className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-[11px] px-2 py-0.5 rounded-full ${row.published ? "bg-primary-soft text-primary" : "bg-muted text-muted-foreground"}`}>
            {row.published ? "Published" : "Draft"}
          </span>
          {row.category && <Badge variant="outline" className="text-[10px]">{row.category}</Badge>}
          {(row.topic_tags ?? []).map((t) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
        </div>
        <div className="font-medium">{row.title}</div>
        <div className="text-sm text-muted-foreground mt-1 line-clamp-2">{row.body}</div>
      </button>
      <TagChips tags={row.tags} />
    </Card>
  );
}

function ContentCard({ row, onOpen }: { row: Content; onOpen: () => void }) {
  const meta = KIND_META[(row.kind as Kind) ?? "doc"];
  return (
    <Card onClick={onOpen} className="p-5 cursor-pointer hover:shadow-panel transition-shadow shadow-card">
      <div className="flex items-start justify-between gap-3">
        <meta.Icon className={`h-5 w-5 ${meta.color}`} />
        <span className={`text-[11px] px-2 py-0.5 rounded-full ${row.published ? "bg-primary-soft text-primary" : "bg-muted text-muted-foreground"}`}>
          {row.published ? "Published" : "Draft"}
        </span>
      </div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mt-3">{meta.label}</div>
      <h3 className="font-serif text-lg mt-1">{row.title}</h3>
      {row.body && <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{row.body}</p>}
      <div className="mt-3 flex items-center gap-1.5 flex-wrap">
        {(row.topic_tags ?? []).map((t) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
      </div>
      <div className="mt-3"><TagChips tags={row.tags} /></div>
    </Card>
  );
}

// ============================================================================
// Editor
// ============================================================================

function ContentEditor({ row, onDelete }: { row: Content; onDelete: () => void }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Content>(row);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [topicInput, setTopicInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const kind = (draft.kind as Kind) ?? "faq";
  const meta = KIND_META[kind];

  useDebouncedSave(draft, async (v) => {
    const { error } = await supabase.from("content_assets").update({
      kind: v.kind, title: v.title, body: v.body, category: v.category,
      tags: v.tags, topic_tags: v.topic_tags, published: v.published,
      url: v.url, file_path: v.file_path, file_name: v.file_name,
      mime_type: v.mime_type, thumbnail_url: v.thumbnail_url,
      order_index: v.order_index,
    }).eq("id", v.id);
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["content"] });
  });

  const del = async () => {
    if (!confirm("Delete this item?")) return;
    if (draft.file_path) {
      await supabase.storage.from("content-assets").remove([draft.file_path]);
    }
    await supabase.from("content_assets").delete().eq("id", row.id);
    qc.invalidateQueries({ queryKey: ["content"] });
    onDelete();
    toast.success("Deleted");
  };

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const path = `${draft.id}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("content-assets").upload(path, file, { upsert: true });
      if (error) throw error;
      setDraft({ ...draft, file_path: path, file_name: file.name, mime_type: file.type });
      toast.success("Uploaded");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const addTopic = () => {
    const t = topicInput.trim();
    if (!t) return;
    const existing = draft.topic_tags ?? [];
    if (!existing.includes(t)) setDraft({ ...draft, topic_tags: [...existing, t] });
    setTopicInput("");
  };

  return (
    <>
      <SheetHeader className="mb-4 flex-row items-center justify-between">
        <SheetTitle className="font-serif text-2xl flex items-center gap-2">
          <meta.Icon className={`h-5 w-5 ${meta.color}`} />
          Edit {meta.label.toLowerCase()}
        </SheetTitle>
        <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
          <Eye className="h-3.5 w-3.5 mr-1.5" />Preview
        </Button>
      </SheetHeader>

      <div className="space-y-5">
        <Field label="Type">
          <Select value={kind} onValueChange={(v) => setDraft({ ...draft, kind: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(KIND_META) as Kind[]).map((k) => (
                <SelectItem key={k} value={k}>{KIND_META[k].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label={kind === "faq" ? "Question" : "Title"}>
          <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        </Field>

        {kind === "faq" && (
          <Field label="Category" hint="Groups related questions in the member view.">
            <Input value={draft.category ?? ""} onChange={(e) => setDraft({ ...draft, category: e.target.value })} />
          </Field>
        )}

        {(kind === "faq" || kind === "doc" || kind === "video" || kind === "link") && (
          <Field label={kind === "faq" ? "Answer" : "Description"}>
            <Textarea rows={kind === "faq" ? 8 : 4}
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              placeholder={kind === "faq" ? "Write a warm, plain-language answer…" : "Short description shown next to the item."}
            />
            {kind === "faq" && (
              <div className="flex gap-2 mt-2">
                <AiAssistButton task="draft_faq" content={draft.title} label="AI: draft from question" onApprove={(t) => setDraft({ ...draft, body: t.trim() })} />
                <AiAssistButton task="improve_answer" content={draft.body} label="AI: improve answer" onApprove={(t) => setDraft({ ...draft, body: t.trim() })} />
              </div>
            )}
          </Field>
        )}

        {(kind === "doc" || kind === "video") && (
          <Field label="Upload file" hint={kind === "video" ? "Video file, or use the URL field to embed YouTube/Vimeo." : "PDF, DOCX, etc."}>
            <input ref={fileInputRef} type="file" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }}
              accept={kind === "video" ? "video/*" : ".pdf,.doc,.docx,.txt,.md,.png,.jpg,.jpeg"} />
            <div className="flex items-center gap-3">
              <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}
                {draft.file_path ? "Replace file" : "Upload file"}
              </Button>
              {draft.file_name && (
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5" />{draft.file_name}
                  <button onClick={() => setDraft({ ...draft, file_path: null, file_name: null, mime_type: null })}
                    className="text-muted-foreground/60 hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                </div>
              )}
            </div>
          </Field>
        )}

        {(kind === "video" || kind === "link" || kind === "doc") && (
          <Field label={kind === "video" ? "Embed URL (YouTube / Vimeo / direct)" : "External URL"}>
            <Input value={draft.url ?? ""} onChange={(e) => setDraft({ ...draft, url: e.target.value })}
              placeholder="https://…" />
          </Field>
        )}

        <Field label="Service tags" hint="Members see items tagged with 'common' plus items tagged for their plan.">
          <TagPicker value={(draft.tags ?? []) as ServiceTag[]} onChange={(v) => setDraft({ ...draft, tags: v })} />
        </Field>

        <Field label="Topic tags" hint="Free-form topics (e.g. probate, guardianship) for filtering.">
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input value={topicInput} onChange={(e) => setTopicInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTopic(); } }}
                placeholder="Add a topic and press Enter" />
              <Button variant="outline" onClick={addTopic}>Add</Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(draft.topic_tags ?? []).map((t) => (
                <Badge key={t} variant="secondary" className="text-xs">
                  {t}
                  <button onClick={() => setDraft({ ...draft, topic_tags: (draft.topic_tags ?? []).filter((x) => x !== t) })}
                    className="ml-1.5 text-muted-foreground/60 hover:text-destructive"><X className="h-3 w-3" /></button>
                </Badge>
              ))}
            </div>
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Order"><Input type="number" value={draft.order_index}
            onChange={(e) => setDraft({ ...draft, order_index: Number(e.target.value) })} /></Field>
          <Field label="Publish">
            <div className="flex items-center h-9 gap-2">
              <Switch checked={draft.published} onCheckedChange={(v) => setDraft({ ...draft, published: v })} />
              <span className="text-sm text-muted-foreground">{draft.published ? "Visible to members" : "Draft only"}</span>
            </div>
          </Field>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-border">
          <span className="text-xs text-muted-foreground">ID: {row.id.slice(0, 8)}…</span>
          <Button variant="ghost" onClick={del} className="text-destructive">
            <Trash2 className="h-4 w-4 mr-1.5" />Delete
          </Button>
        </div>
      </div>

      <PreviewDialog open={previewOpen} onOpenChange={setPreviewOpen} row={draft} />
    </>
  );
}

// ============================================================================
// Preview (single item, as members see it)
// ============================================================================

function PreviewDialog({ open, onOpenChange, row }: {
  open: boolean; onOpenChange: (o: boolean) => void; row: Content;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-xs uppercase tracking-wider text-muted-foreground">
            Member preview
          </DialogTitle>
        </DialogHeader>
        <MemberItem row={row} />
      </DialogContent>
    </Dialog>
  );
}

function MemberItem({ row }: { row: Content }) {
  const kind = (row.kind as Kind) ?? "faq";
  const meta = KIND_META[kind];
  const [fileUrl, setFileUrl] = useState<string | null>(null);

  // Sign URL on demand for file previews
  useMemo(() => {
    if (!row.file_path) { setFileUrl(null); return; }
    supabase.storage.from("content-assets").createSignedUrl(row.file_path, 3600).then(({ data }) => {
      setFileUrl(data?.signedUrl ?? null);
    });
  }, [row.file_path]);

  const embedUrl = (url: string): string | null => {
    const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
    if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
    const v = url.match(/vimeo\.com\/(\d+)/);
    if (v) return `https://player.vimeo.com/video/${v[1]}`;
    return null;
  };

  return (
    <Card className="p-6 bg-paper-deep/50 border-border">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-2">
        <meta.Icon className={`h-4 w-4 ${meta.color}`} />
        {meta.label}
        {row.category && <span>· {row.category}</span>}
      </div>
      <h2 className="font-serif text-2xl">{row.title}</h2>
      {row.body && <p className="mt-3 text-foreground/80 whitespace-pre-wrap">{row.body}</p>}

      {kind === "video" && row.url && (() => {
        const emb = embedUrl(row.url);
        return emb ? (
          <div className="mt-4 aspect-video rounded-lg overflow-hidden border border-border">
            <iframe src={emb} className="w-full h-full" allowFullScreen title={row.title} />
          </div>
        ) : (
          <a href={row.url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-primary text-sm">
            <Video className="h-4 w-4" />Watch video
          </a>
        );
      })()}
      {kind === "video" && !row.url && fileUrl && (
        <video src={fileUrl} controls className="mt-4 w-full rounded-lg border border-border" />
      )}

      {kind === "doc" && (
        <div className="mt-4 flex gap-3">
          {fileUrl && (
            <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-primary text-sm">
              <FileText className="h-4 w-4" />Download {row.file_name}
            </a>
          )}
          {row.url && (
            <a href={row.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-primary text-sm">
              <LinkIcon className="h-4 w-4" />Open link
            </a>
          )}
        </div>
      )}
      {kind === "link" && row.url && (
        <a href={row.url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-primary text-sm">
          <LinkIcon className="h-4 w-4" />Open resource
        </a>
      )}

      <div className="mt-4 flex items-center gap-1.5 flex-wrap">
        {(row.topic_tags ?? []).map((t) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
      </div>
    </Card>
  );
}

// ============================================================================
// Member preview (whole library as a member would see it)
// ============================================================================

function MemberPreview() {
  const [plan, setPlan] = useState<ServiceTag>("will");
  const { data: items = [] } = useQuery({
    queryKey: ["content", "published"],
    queryFn: async () =>
      (await supabase.from("content_assets").select("*").eq("published", true).order("order_index").order("title")).data as Content[] ?? [],
  });

  const visible = items.filter((c) => (c.tags ?? []).includes("common") || (c.tags ?? []).includes(plan));
  const faqs = visible.filter((c) => c.kind === "faq");
  const media = visible.filter((c) => c.kind !== "faq");
  const grouped = useMemo(() => {
    const g: Record<string, Content[]> = {};
    faqs.forEach((f) => {
      const cat = f.category ?? "General";
      (g[cat] ??= []).push(f);
    });
    return g;
  }, [faqs]);

  return (
    <div className="space-y-6">
      <Card className="p-4 flex items-center gap-4 shadow-card">
        <div className="text-sm text-muted-foreground">Simulating a member on plan:</div>
        <Select value={plan} onValueChange={(v) => setPlan(v as ServiceTag)}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(["will", "trust", "poa", "healthcare"] as ServiceTag[]).map((s) => (
              <SelectItem key={s} value={s}>{tagLabel(s)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground ml-auto">
          {visible.length} item{visible.length === 1 ? "" : "s"} visible (common + {tagLabel(plan)})
        </div>
      </Card>

      {media.length > 0 && (
        <section>
          <h2 className="font-serif text-xl mb-3">Resources</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {media.map((m) => <MemberItem key={m.id} row={m} />)}
          </div>
        </section>
      )}

      <section>
        <h2 className="font-serif text-xl mb-3">Frequently asked questions</h2>
        {Object.keys(grouped).length === 0 ? (
          <EmptyState label="No published FAQs for this plan yet." />
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([cat, list]) => (
              <div key={cat}>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">{cat}</div>
                <div className="space-y-2">
                  {list.map((f) => (
                    <details key={f.id} className="group rounded-lg border border-border bg-card p-4">
                      <summary className="cursor-pointer font-medium list-none flex items-center justify-between">
                        {f.title}
                        <span className="text-muted-foreground group-open:rotate-45 transition-transform">+</span>
                      </summary>
                      <div className="mt-3 text-foreground/80 whitespace-pre-wrap">{f.body}</div>
                    </details>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
