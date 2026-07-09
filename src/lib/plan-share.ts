import { useCallback, useEffect, useState } from "react";
import type { Role } from "@/lib/role-context";

export type Permission = "view" | "edit";

export type ShareLink = {
  token: string;
  doc: string;
  owner: Role; // whose document
  createdAt: number;
  revokedAt?: number;
};

export type PlanShareState = {
  invited: { member: boolean; spouse: boolean };
  invitedAt: { member?: number; spouse?: number };
  // Per-document shares: e.g. shares["will"].member = "edit" means member's will shared with spouse w/ edit.
  shares: Record<string, Partial<Record<Role, Permission>>>;
  links: ShareLink[];
};

const EMPTY: PlanShareState = {
  invited: { member: true, spouse: false },
  invitedAt: { member: Date.now() },
  shares: {},
  links: [],
};

const KEY = "dep:plan-share";
const EVT = "dep:plan-share-change";

export function loadPlanShare(): PlanShareState {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<PlanShareState>;
    return {
      invited: { ...EMPTY.invited, ...(parsed.invited ?? {}) },
      invitedAt: { ...EMPTY.invitedAt, ...(parsed.invitedAt ?? {}) },
      shares: parsed.shares ?? {},
      links: parsed.links ?? [],
    };
  } catch {
    return EMPTY;
  }
}

export function savePlanShare(next: PlanShareState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(EVT));
}

export function usePlanShare() {
  const [state, setState] = useState<PlanShareState>(EMPTY);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setState(loadPlanShare());
    setHydrated(true);
    const on = () => setState(loadPlanShare());
    window.addEventListener(EVT, on);
    window.addEventListener("storage", (e) => e.key === KEY && on());
    return () => {
      window.removeEventListener(EVT, on);
    };
  }, []);

  const update = useCallback((patch: (s: PlanShareState) => PlanShareState) => {
    setState((prev) => {
      const next = patch(prev);
      savePlanShare(next);
      return next;
    });
  }, []);

  const invitePartner = useCallback((role: "member" | "spouse") => {
    update((s) => ({
      ...s,
      invited: { ...s.invited, [role]: true },
      invitedAt: { ...s.invitedAt, [role]: Date.now() },
    }));
  }, [update]);

  const setShare = useCallback(
    (doc: string, owner: Role, withRole: Role, perm: Permission | null) => {
      update((s) => {
        const cur = { ...(s.shares[doc] ?? {}) } as Partial<Record<Role, Permission>>;
        // Namespace by owner:withRole so member↔spouse shares are distinct.
        const key = `${owner}->${withRole}` as unknown as Role;
        if (perm) cur[key] = perm; else delete cur[key];
        return { ...s, shares: { ...s.shares, [doc]: cur } };
      });
    },
    [update],
  );

  const createLink = useCallback((doc: string, owner: Role) => {
    const token = `${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
    update((s) => ({
      ...s,
      links: [...s.links, { token, doc, owner, createdAt: Date.now() }],
    }));
    return token;
  }, [update]);

  const revokeLink = useCallback((token: string) => {
    update((s) => ({
      ...s,
      links: s.links.map((l) => (l.token === token ? { ...l, revokedAt: Date.now() } : l)),
    }));
  }, [update]);

  return { state, hydrated, update, invitePartner, setShare, createLink, revokeLink };
}

export function getShare(state: PlanShareState, doc: string, owner: Role, withRole: Role): Permission | null {
  const key = `${owner}->${withRole}` as unknown as Role;
  return (state.shares[doc]?.[key] as Permission | undefined) ?? null;
}

export function findLink(state: PlanShareState, token: string): ShareLink | undefined {
  return state.links.find((l) => l.token === token);
}
