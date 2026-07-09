import { SERVICE_TAGS, tagLabel, type ServiceTag } from "@/lib/service-tags";
import { cn } from "@/lib/utils";

export function TagChips({ tags, className }: { tags: string[] | null | undefined; className?: string }) {
  if (!tags || tags.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {tags.map((t) => (
        <span key={t} className="inline-flex items-center rounded-full bg-primary-soft text-primary px-2 py-0.5 text-[11px] font-medium">
          {tagLabel(t)}
        </span>
      ))}
    </div>
  );
}

export function TagPicker({
  value, onChange,
}: { value: ServiceTag[]; onChange: (v: ServiceTag[]) => void }) {
  const toggle = (t: ServiceTag) =>
    onChange(value.includes(t) ? value.filter((x) => x !== t) : [...value, t]);
  return (
    <div className="flex flex-wrap gap-2">
      {SERVICE_TAGS.map((t) => {
        const on = value.includes(t.value);
        return (
          <button
            type="button"
            key={t.value}
            onClick={() => toggle(t.value)}
            className={cn(
              "rounded-full px-3 py-1 text-xs border transition-colors",
              on
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:border-primary/40"
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
