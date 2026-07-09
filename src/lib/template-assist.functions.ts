import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const AttrExtractInput = z.object({
  text: z.string().min(1).max(50000),
  templateName: z.string().optional(),
});

const RuleSuggestInput = z.object({
  text: z.string().min(1).max(50000),
  templateName: z.string(),
  serviceTag: z.string(),
});

const ChatInput = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).min(1).max(30),
  templateContext: z.string().max(50000).optional(),
});

const ATTR_SYSTEM = `You analyse legal / estate-planning document templates and identify every piece of member-specific data that must be collected to complete the document.
Look at:
- {{merge_fields}} in double curly braces
- [BRACKETED] placeholders
- blanks like ______ or ___________
- underscore/space placeholders and inferred variable content ("Name: ____")
- clearly variable phrases ("the Testator, __, of __ County, State of __")

Return ONLY a JSON array. Each item:
{ "key": "snake_case_identifier",
  "label": "Short human label",
  "description": "One sentence explaining what this asks the member",
  "data_type": "text" | "long_text" | "number" | "date" | "boolean" | "single_select" | "multi_select" | "address" | "person" }

Do not include commentary. No markdown fences.`;

const RULE_SYSTEM = `You are an estate-planning template routing expert. Given a template's name, service and body text, propose 2-4 template-selection rules that would decide when this template should be used.

Available condition fields:
document_type (will|trust|poa|healthcare|bundle), state (2-letter US), marital_status (single|married|partnered|divorced|widowed), has_real_estate (bool), has_minor_children (bool), probate_avoidance (bool), estate_size (small|medium|large|complex), poa_type (durable|springing|statutory|custom), healthcare_form_type (living_will|proxy|combined|state_statutory), beneficiary_structure (outright|in_trust|staggered|spendthrift), bundle_composition (multi: will|trust|poa|healthcare), language (en|es|plain_language).

Return ONLY a JSON array. Each rule:
{ "name": "Short descriptive name",
  "description": "One sentence rationale",
  "priority": 100,
  "conditions": { "op": "AND", "clauses": [ { "field": "state", "op": "eq", "value": "CA" } ] },
  "is_fallback": false }

Lower priority number = evaluated first. Use is_fallback:true and clauses:[] for a service-wide default. No markdown.`;

const CHAT_SYSTEM = `You are the DEP Template Assistant for MetLife Legal Plans admins. You help them analyse, extract fields from, and write selection rules for estate-planning templates.
- Be concise, professional, and calm.
- When asked to extract fields or suggest rules, say briefly what you would do and remind the admin they can approve/edit the structured output using the "Extract fields" or "Suggest rules" buttons.
- Never claim to have saved anything — the admin is always in control.
- When a template body is supplied as context, reason about that specific template.`;

async function ai(system: string, user: string): Promise<string> {
  const { callLovableAI } = await import("./ai-gateway.server");
  return callLovableAI({ system, user });
}

function stripFences(s: string) {
  return s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

export const extractTemplateAttributes = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => AttrExtractInput.parse(input))
  .handler(async ({ data }): Promise<{ attributes: Loose[]; raw?: string }> => {
    const user = `Template name: ${data.templateName ?? "(unnamed)"}\n\nTemplate body:\n${data.text}`;
    const raw = await ai(ATTR_SYSTEM, user);
    const clean = stripFences(raw);
    try {
      const parsed = JSON.parse(clean);
      if (!Array.isArray(parsed)) throw new Error("not array");
      return { attributes: parsed };
    } catch {
      return { attributes: [], raw };
    }
  });

export const suggestSelectionRules = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => RuleSuggestInput.parse(input))
  .handler(async ({ data }): Promise<{ rules: Loose[]; raw?: string }> => {
    const user = `Template: ${data.templateName}\nService: ${data.serviceTag}\n\nBody:\n${data.text.slice(0, 12000)}`;
    const raw = await ai(RULE_SYSTEM, user);
    const clean = stripFences(raw);
    try {
      const parsed = JSON.parse(clean);
      if (!Array.isArray(parsed)) throw new Error("not array");
      return { rules: parsed };
    } catch {
      return { rules: [], raw };
    }
  });

export const templateChat = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ChatInput.parse(input))
  .handler(async ({ data }) => {
    const { callLovableAI } = await import("./ai-gateway.server");
    const historyText = data.messages
      .map((m) => `${m.role === "user" ? "Admin" : "Assistant"}: ${m.content}`)
      .join("\n\n");
    const user = data.templateContext
      ? `Current template context:\n${data.templateContext.slice(0, 12000)}\n\n---\n\n${historyText}\n\nAssistant:`
      : `${historyText}\n\nAssistant:`;
    const reply = await callLovableAI({ system: CHAT_SYSTEM, user });
    return { reply };
  });
