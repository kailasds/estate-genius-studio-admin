import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Role = "admin" | "member" | "spouse";

export const ROLES: { value: Role; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" },
  { value: "spouse", label: "Spouse" },
];

export const PERSONAS: Record<Role, { name: string; initials: string; blurb: string }> = {
  admin: { name: "Admin", initials: "A", blurb: "MetLife Legal Plans" },
  member: { name: "Alex Morgan", initials: "AM", blurb: "Member" },
  spouse: { name: "Jordan Morgan", initials: "JM", blurb: "Spouse" },
};

const STORAGE_KEY = "dep:active-role";

const RoleCtx = createContext<{ role: Role; setRole: (r: Role) => void }>({
  role: "admin",
  setRole: () => {},
});

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>("admin");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "admin" || stored === "member" || stored === "spouse") {
      setRoleState(stored);
    }
  }, []);
  const setRole = (r: Role) => {
    setRoleState(r);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, r);
  };
  return <RoleCtx.Provider value={{ role, setRole }}>{children}</RoleCtx.Provider>;
}

export const useRole = () => useContext(RoleCtx);
