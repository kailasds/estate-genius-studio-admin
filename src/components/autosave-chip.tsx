import { useAutosave } from "@/lib/autosave-context";
import { Check, Loader2, CircleAlert } from "lucide-react";
import { useEffect, useState } from "react";

function timeAgo(ts: number | null) {
  if (!ts) return "";
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

export function AutosaveChip() {
  const { state, lastSavedAt } = useAutosave();
  const [, tick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(i);
  }, []);

  const base = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium border";
  if (state === "saving")
    return (
      <div className={`${base} border-border bg-card text-muted-foreground`}>
        <Loader2 className="h-3 w-3 animate-spin" /> Saving…
      </div>
    );
  if (state === "error")
    return (
      <div className={`${base} border-transparent bg-danger-soft text-[var(--danger-edge)]`}>
        <CircleAlert className="h-3 w-3" /> Save failed
      </div>
    );
  if (state === "saved")
    return (
      <div className={`${base} border-transparent bg-success-soft text-[var(--success-edge)]`}>
        <Check className="h-3 w-3" /> Saved · {timeAgo(lastSavedAt)}
      </div>
    );
  return null;
}
