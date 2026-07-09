import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type SaveState = "idle" | "saving" | "saved" | "error";

const Ctx = createContext<{
  state: SaveState;
  lastSavedAt: number | null;
  setState: (s: SaveState) => void;
  markSaved: () => void;
}>({ state: "idle", lastSavedAt: null, setState: () => {}, markSaved: () => {} });

export function AutosaveProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SaveState>("idle");
  const [lastSavedAt, setLast] = useState<number | null>(null);
  const markSaved = useCallback(() => {
    setState("saved");
    setLast(Date.now());
  }, []);
  return (
    <Ctx.Provider value={{ state, lastSavedAt, setState, markSaved }}>{children}</Ctx.Provider>
  );
}

export const useAutosave = () => useContext(Ctx);
