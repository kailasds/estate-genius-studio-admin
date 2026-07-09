import { useCallback, useEffect, useState } from "react";
import type { Role } from "@/lib/role-context";

export type MemberDraft = {
  discovery: Record<string, unknown>;
  answers: Record<string, unknown>;
  selectedDocs: string[] | null; // null = not yet confirmed
  approvedDocs?: string[]; // docs the member has approved & added to vault
  startedAt: number;
  updatedAt: number;
};

const EMPTY: MemberDraft = { discovery: {}, answers: {}, selectedDocs: null, approvedDocs: [], startedAt: 0, updatedAt: 0 };
const key = (role: Role) => `dep:draft:${role}`;
const partnerOf = (role: Role): Role | null => (role === "member" ? "spouse" : role === "spouse" ? "member" : null);

const CHANGE_EVENT = "dep:draft-change";

export function loadDraft(role: Role): MemberDraft {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(key(role));
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<MemberDraft>;
    return {
      discovery: parsed.discovery ?? {},
      answers: parsed.answers ?? {},
      selectedDocs: parsed.selectedDocs ?? null,
      approvedDocs: parsed.approvedDocs ?? [],
      startedAt: parsed.startedAt ?? 0,
      updatedAt: parsed.updatedAt ?? 0,
    };
  } catch {
    return EMPTY;
  }
}

export function saveDraft(role: Role, draft: MemberDraft) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key(role), JSON.stringify(draft));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { role } }));
}

export function clearDraft(role: Role) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key(role));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { role } }));
}

/**
 * Mirror common-tagged discovery/answer keys into partner draft.
 * commonKeys: set of storage keys (question ids or signal keys) considered "common".
 */
function mirrorCommon(
  role: Role,
  section: "discovery" | "answers",
  patch: Record<string, unknown>,
  commonKeys: Set<string>,
) {
  const partner = partnerOf(role);
  if (!partner) return;
  const filtered = Object.fromEntries(Object.entries(patch).filter(([k]) => commonKeys.has(k)));
  if (Object.keys(filtered).length === 0) return;
  const other = loadDraft(partner);
  const next: MemberDraft = {
    ...other,
    [section]: { ...(other[section]), ...filtered },
    startedAt: other.startedAt || Date.now(),
    updatedAt: Date.now(),
  } as MemberDraft;
  saveDraft(partner, next);
}

export function useDraft(role: Role) {
  const [draft, setDraft] = useState<MemberDraft>(EMPTY);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setDraft(loadDraft(role));
    setHydrated(true);
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent).detail as { role: Role } | undefined;
      if (!detail || detail.role === role) setDraft(loadDraft(role));
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === key(role)) setDraft(loadDraft(role));
    };
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [role]);

  const update = useCallback(
    (
      patch: Partial<Pick<MemberDraft, "discovery" | "answers" | "selectedDocs" | "approvedDocs">>,
      opts?: { commonKeys?: Set<string> },
    ) => {
      setDraft((prev) => {
        const next: MemberDraft = {
          discovery: patch.discovery ? { ...prev.discovery, ...patch.discovery } : prev.discovery,
          answers: patch.answers ? { ...prev.answers, ...patch.answers } : prev.answers,
          selectedDocs: patch.selectedDocs !== undefined ? patch.selectedDocs : prev.selectedDocs,
          approvedDocs: patch.approvedDocs !== undefined ? patch.approvedDocs : (prev.approvedDocs ?? []),
          startedAt: prev.startedAt || Date.now(),
          updatedAt: Date.now(),
        };
        saveDraft(role, next);
        if (opts?.commonKeys) {
          if (patch.discovery) mirrorCommon(role, "discovery", patch.discovery, opts.commonKeys);
          if (patch.answers) mirrorCommon(role, "answers", patch.answers, opts.commonKeys);
        }
        return next;
      });
    },
    [role],
  );

  const reset = useCallback(() => {
    clearDraft(role);
    setDraft(EMPTY);
  }, [role]);

  return { draft, hydrated, update, reset };
}

export function percentComplete(draft: MemberDraft, totalQuestions: number, totalSignals: number) {
  const total = Math.max(1, totalQuestions + totalSignals);
  const done = Object.keys(draft.discovery).length + Object.keys(draft.answers).length;
  return Math.min(100, Math.round((done / total) * 100));
}
