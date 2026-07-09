export type Clause = { field: string; op: "eq" | "in" | "contains"; value: unknown };
export type RuleConditions = { op?: "AND" | "OR"; clauses: Clause[] } | Clause[];

export type SelectionRule = {
  id: string;
  name: string;
  service_tag: string;
  priority: number;
  conditions: unknown;
  template_family_id: string | null;
  is_fallback: boolean;
  active: boolean;
};

function normalize(conditions: unknown): { op: "AND" | "OR"; clauses: Clause[] } {
  if (Array.isArray(conditions)) return { op: "AND", clauses: conditions as Clause[] };
  if (conditions && typeof conditions === "object" && "clauses" in conditions) {
    const c = conditions as { op?: "AND" | "OR"; clauses: Clause[] };
    return { op: c.op ?? "AND", clauses: c.clauses ?? [] };
  }
  return { op: "AND", clauses: [] };
}

function matchClause(clause: Clause, profile: Record<string, unknown>): boolean {
  const pv = profile[clause.field];
  if (pv === undefined || pv === null || pv === "") return false;
  switch (clause.op) {
    case "eq":
      return pv === clause.value;
    case "in":
      return Array.isArray(clause.value) && (clause.value as unknown[]).includes(pv);
    case "contains":
      return Array.isArray(pv) && (pv as unknown[]).includes(clause.value);
    default:
      return false;
  }
}

export function ruleMatches(rule: SelectionRule, profile: Record<string, unknown>): boolean {
  const { op, clauses } = normalize(rule.conditions);
  if (clauses.length === 0) return rule.is_fallback; // empty rule only fires as a fallback
  return op === "OR"
    ? clauses.some((c) => matchClause(c, profile))
    : clauses.every((c) => matchClause(c, profile));
}

// Evaluate a list of rules for a given service; returns the winning rule (lowest priority number)
// or the first is_fallback rule when nothing matched.
export function evaluateRules(
  rules: SelectionRule[],
  profile: Record<string, unknown>,
  service: string,
): { winner: SelectionRule | null; matched: SelectionRule[] } {
  const scoped = rules.filter((r) => r.active && r.service_tag === service);
  const matched = scoped
    .filter((r) => !r.is_fallback && ruleMatches(r, profile))
    .sort((a, b) => a.priority - b.priority);
  if (matched.length > 0) return { winner: matched[0], matched };
  const fallback = scoped.find((r) => r.is_fallback) ?? null;
  return { winner: fallback, matched: fallback ? [fallback] : [] };
}
