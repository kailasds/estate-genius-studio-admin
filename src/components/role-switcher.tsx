import { ROLES, useRole, type Role } from "@/lib/role-context";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { UserCog } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

const ROLE_HOME: Record<Role, string> = {
  admin: "/dashboard",
  member: "/member",
  spouse: "/member",
};

export function RoleSwitcher() {
  const { role, setRole } = useRole();
  const navigate = useNavigate();
  const onChange = (v: string) => {
    const next = v as Role;
    setRole(next);
    navigate({ to: ROLE_HOME[next] });
  };
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-border bg-card pl-2.5 pr-1 h-8">
      <UserCog className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <Select value={role} onValueChange={onChange}>
        <SelectTrigger className="h-7 border-0 shadow-none bg-transparent text-[12px] font-medium focus:ring-0 focus:border-transparent gap-1 px-1 hover:bg-transparent">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {ROLES.map((r) => (
            <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
