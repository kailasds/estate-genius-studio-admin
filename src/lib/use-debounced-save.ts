import { useEffect, useRef } from "react";
import { useAutosave } from "./autosave-context";

export function useDebouncedSave<T>(
  value: T,
  save: (v: T) => Promise<void>,
  delay = 700,
  enabled = true,
) {
  const { setState, markSaved } = useAutosave();
  const first = useRef(true);
  const last = useRef(value);

  useEffect(() => {
    if (!enabled) return;
    if (first.current) { first.current = false; last.current = value; return; }
    if (JSON.stringify(last.current) === JSON.stringify(value)) return;
    last.current = value;
    setState("saving");
    const t = setTimeout(async () => {
      try { await save(value); markSaved(); }
      catch { setState("error"); }
    }, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, enabled]);
}
