import { Link, useRouterState } from "@tanstack/react-router";
import {
  FileText, HelpCircle, LayoutTemplate, ListChecks, PanelLeftClose, PanelLeftOpen,
  Home, ScrollText, BookOpen, MapPin, type LucideIcon,
} from "lucide-react";

import { useState, type ReactNode } from "react";
import { RoleSwitcher } from "@/components/role-switcher";
import { AutosaveChip } from "@/components/autosave-chip";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PERSONAS, useRole } from "@/lib/role-context";
import { toPublicPath } from "@/lib/public-path";
import { FloatingAssistant } from "@/components/floating-assistant";
import { VaultSheet } from "@/components/vault-sheet";

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  /** semantic accent hint for the icon tile */
  tone?: "primary" | "success" | "warning" | "info" | "violet";
};

const ADMIN_NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Overview",
    items: [
      { to: "/dashboard", label: "Home", icon: Home, tone: "primary" },
    ],
  },
  {
    section: "Build",
    items: [
      { to: "/templates", label: "Template Management", icon: LayoutTemplate, tone: "primary" },
      { to: "/questions", label: "Question Management", icon: ListChecks, tone: "info" },
    ],
  },
  {
    section: "Configure",
    items: [
      { to: "/rules", label: "Rules Management", icon: FileText, tone: "violet" },
      { to: "/faq", label: "FAQ & Content", icon: HelpCircle, tone: "warning" },
    ],
  },
];

const MEMBER_NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Overview",
    items: [
      { to: "/member", label: "Home", icon: Home, tone: "primary" },
      { to: "/member/plan", label: "My Will", icon: ScrollText, tone: "violet" },
    ],
  },
  {
    section: "Resources",
    items: [
      { to: "/member/learn", label: "Learn", icon: BookOpen, tone: "info" },
      { to: "/member/find-attorney", label: "Find an attorney", icon: MapPin, tone: "warning" },
    ],
  },
];

const TONE_TILE: Record<NonNullable<NavItem["tone"]>, string> = {
  primary: "bg-primary-soft text-[var(--cyan-edge)]",
  success: "bg-success-soft text-[var(--success-edge)]",
  warning: "bg-warning-soft text-[var(--warning-edge)]",
  info: "bg-info-soft text-[var(--info-edge)]",
  violet: "bg-violet-soft text-[var(--violet-edge)]",
};

function crumbFor(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  const last = parts[parts.length - 1] ?? "";
  if (!last || last === "member" || last === "index" || last === "dashboard") return "Home";
  return last.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AppShell({ children, title, subtitle, action, splitRight, crumb: crumbOverride, eyebrow }: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  /** Optional panel docked flush to the right edge of the viewport, spanning the full height of the content area. */
  splitRight?: ReactNode;
  /** Override the auto-derived breadcrumb (e.g. a record name instead of a raw route param). */
  crumb?: string;
  /** Optional content rendered above the title (e.g. a "Back to X" link). */
  eyebrow?: ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [collapsed, setCollapsed] = useState(true);
  const { role } = useRole();
  const persona = PERSONAS[role];
  const isMember = role === "member" || role === "spouse";
  const nav = isMember ? MEMBER_NAV : ADMIN_NAV;
  const crumb = crumbOverride ?? crumbFor(pathname);

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className="min-h-screen w-full flex bg-paper"
        style={{
          backgroundImage:
            "linear-gradient(135deg, #ffffff 0%, color-mix(in oklab, var(--sky) 28%, #ffffff) 55%, var(--sky) 100%)",
          backgroundRepeat: "no-repeat",
          backgroundSize: "100% 100%",
        }}
      >
        <aside
          className={`${collapsed ? "w-17" : "w-72"} shrink-0 border-r border-border bg-sidebar text-sidebar-foreground flex flex-col transition-[width] duration-200`}
        >
          <div className={`${collapsed ? "px-3" : "px-5"} pt-6 pb-5 border-b border-sidebar-border`}>
            <div className={`flex items-center ${collapsed ? "justify-center" : "gap-3"}`}>
              {isMember ? (
                <div className="relative h-10 w-10 rounded-xl bg-linear-to-br from-(--cyan) to-(--cyan-edge) text-white grid place-items-center font-serif text-[15px] shrink-0 shadow-[0_4px_10px_-2px_color-mix(in_oklab,var(--cyan)_45%,transparent)]">
                  {persona.initials}
                </div>
              ) : (
                <img
                  src={toPublicPath("/logo.svg")}
                  alt="DEP"
                  className="relative h-10 w-10 rounded-xl shrink-0 shadow-[0_4px_10px_-2px_color-mix(in_oklab,var(--cyan)_45%,transparent)]"
                />
              )}
              {!collapsed && (
                <div className="min-w-0">
                  <div className="font-serif text-[15px] leading-tight truncate">
                    {isMember ? persona.name : "DEP Admin"}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                    {isMember ? persona.blurb : "MetLife Legal Plans"}
                  </div>
                </div>
              )}
            </div>
          </div>

          <nav className="flex-1 px-2.5 py-4 space-y-5 scroll-quiet overflow-y-auto">
            {nav.map((group) => (
              <div key={group.section}>
                {!collapsed && (
                  <div className="text-caption px-2.5 mb-1.5">{group.section}</div>
                )}
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const active =
                      item.to === "/member"
                        ? pathname === "/member"
                        : pathname.startsWith(item.to);
                    const Icon = item.icon;
                    const tone = item.tone ?? "primary";
                    const link = (
                      <Link
                        key={item.to}
                        to={item.to}
                        className={`group relative flex items-center gap-3 rounded-lg ${collapsed ? "justify-center px-1.5" : "px-2"} py-2 text-[13px] transition-colors ${
                          active
                            ? "text-foreground"
                            : "hover:bg-paper-deep/50 text-sidebar-foreground/85"
                        }`}
                      >
                        {active && !collapsed && (
                          <span className="absolute left-0 top-1.5 bottom-1.5 w-0.75 rounded-r-full bg-primary" />
                        )}
                        <span
                          className={`h-8 w-8 rounded-md grid place-items-center shrink-0 transition-colors ${
                            active
                              ? TONE_TILE[tone]
                              : "bg-transparent text-muted-foreground group-hover:bg-muted"
                          }`}
                        >
                          <Icon className="h-3.75 w-3.75" strokeWidth={active ? 2.2 : 1.8} />
                        </span>
                        {!collapsed && (
                          <span className={`font-medium leading-tight truncate ${active ? "text-foreground" : ""}`}>
                            {item.label}
                          </span>
                        )}
                      </Link>
                    );
                    return collapsed ? (
                      <Tooltip key={item.to}>
                        <TooltipTrigger asChild>{link}</TooltipTrigger>
                        <TooltipContent side="right">{item.label}</TooltipContent>
                      </Tooltip>
                    ) : (
                      link
                    );
                  })}
                  {isMember && group.section === "Resources" && <VaultSheet collapsed={collapsed} />}
                </div>
              </div>
            ))}
          </nav>

          <div className={`${collapsed ? "px-2" : "px-3"} py-3 border-t border-sidebar-border flex ${collapsed ? "justify-center" : "justify-end"}`}>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </Button>
          </div>
        </aside>

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b border-border bg-paper/80 backdrop-blur-md flex items-center justify-between px-8 sticky top-0 z-30">
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground min-w-0">
              <span className="text-foreground/60">{isMember ? "Member" : "Admin"}</span>
              <span className="text-border">/</span>
              <span className="text-foreground font-medium truncate">{crumb}</span>
            </div>
            <div className="flex items-center gap-3">
              {!isMember && <AutosaveChip />}
              <RoleSwitcher />
            </div>
          </header>

          <main className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden lg:flex">
            <div className="lg:flex-1 lg:min-w-0 lg:overflow-y-auto">
              <div className="max-w-6xl mx-auto px-8 py-10">
                <div className="mb-8">
                  {eyebrow && <div className="mb-4">{eyebrow}</div>}
                  <div className="flex items-start justify-between gap-6">
                    <div className="min-w-0">
                      <h1 className="font-serif text-[38px] leading-[1.05] tracking-tight text-foreground">{title}</h1>
                    </div>
                  {action && <div className="shrink-0">{action}</div>}
                </div>
                  {subtitle && (
                    <p className="mt-3 w-full max-w-none text-[15px] leading-relaxed text-muted-foreground">{subtitle}</p>
                  )}
                </div>
                {children}
              </div>
            </div>
            {splitRight && (
              <aside className="border-t border-border lg:border-t-0 lg:border-l lg:flex lg:flex-col lg:w-[420px] lg:shrink-0 lg:overflow-y-auto bg-paper/70">
                {splitRight}
              </aside>
            )}
          </main>
        </div>
        {isMember && !pathname.startsWith("/member/assistant") && <FloatingAssistant />}
      </div>
    </TooltipProvider>
  );
}
