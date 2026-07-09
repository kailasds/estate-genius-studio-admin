import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional().nullable(),
  data_type: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const SYSTEM = `You are designing an estate-planning intake question for MetLife Legal Plans members. Given an attribute (a canonical fact the member app must capture), generate:
- a warm, plain-language question prompt (one sentence, no legal jargon)
- concise help_text (one sentence, optional but useful)
- the best input_type from EXACTLY this list: short_text | long_text | number | date | boolean | select | multiselect | address | document_upload | voice_input
- if input_type is "select" or "multiselect", a list of 2-8 answer options as { value, label } (value = snake_case)

Return ONLY valid JSON, no markdown fences, matching:
{ "prompt": string, "help_text": string, "input_type": string, "options": [{ "value": string, "label": string }] }`;

function stripFences(s: string) {
  return s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
}

const ALLOWED = [
  "short_text","long_text","number","date","boolean","select","multiselect","address","document_upload","voice_input",
] as const;
type AllowedType = typeof ALLOWED[number];

export const generateQuestionFromAttribute = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const { callLovableAI } = await import("./ai-gateway.server");
    const userMsg = `Attribute:
- key: ${data.key}
- label: ${data.label}
- description: ${data.description ?? "(none)"}
- underlying data_type: ${data.data_type ?? "text"}
- service tags: ${(data.tags ?? []).join(", ") || "common"}`;
    const raw = await callLovableAI({ system: SYSTEM, user: userMsg });
    const clean = stripFences(raw);
    try {
      const parsed = JSON.parse(clean) as {
        prompt?: string; help_text?: string; input_type?: string;
        options?: { value: string; label: string }[];
      };
      const it = (ALLOWED as readonly string[]).includes(parsed.input_type ?? "")
        ? (parsed.input_type as AllowedType)
        : "short_text";
      return {
        prompt: (parsed.prompt ?? data.label).toString().trim(),
        help_text: (parsed.help_text ?? "").toString().trim() || null,
        input_type: it,
        options: Array.isArray(parsed.options)
          ? parsed.options
              .filter((o) => o && typeof o.value === "string" && typeof o.label === "string")
              .slice(0, 12)
          : [],
      };
    } catch {
      return { prompt: data.label, help_text: null, input_type: "short_text" as AllowedType, options: [], raw };
    }
  });
