import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  task: z.enum([
    "rewrite_question",
    "suggest_followups",
    "extract_merge_fields",
    "explain_rule",
    "draft_faq",
    "improve_answer",
    "draft_reason",
    "propose_recommendation_rules",
  ]),
  content: z.string().min(1).max(20000),
  context: z.string().max(5000).optional(),
});

const SYSTEMS: Record<z.infer<typeof InputSchema>["task"], string> = {
  rewrite_question:
    "You are a plain-language legal writing coach for an estate-planning intake wizard. Rewrite the given question so it is clear, warm, jargon-free, and answerable by a layperson. Return only the rewritten question, one sentence.",
  suggest_followups:
    "You are an estate-planning intake designer. Given a question, propose 3 short follow-up questions that would refine the answer. Return a plain numbered list.",
  extract_merge_fields:
    "You are extracting merge fields from a legal template. Return a JSON array of suggested field keys (snake_case) that appear or would sensibly appear in the text. Only return the JSON array.",
  explain_rule:
    "You are explaining a recommendation rule to a non-technical reviewer. Given the rule JSON, produce a one-paragraph plain-English explanation.",
  draft_faq:
    "You are drafting an FAQ answer for MetLife Legal Plans estate planning. Given a topic, write a concise 2-3 sentence member-friendly answer. Return only the answer.",
  improve_answer:
    "You are an editor improving an FAQ answer. Keep meaning; make it clearer, warmer, and shorter. Return only the improved answer.",
  draft_reason:
    "You are drafting the plain-language 'why we recommend this' shown to a member for an estate-planning recommendation rule. Given the rule (name, conditions, document), write ONE warm, jargon-free sentence (max 30 words) that explains why this document fits their situation. Return only the sentence.",
  propose_recommendation_rules:
    "You are an estate-planning intake designer. Given a list of discovery signals (JSON) and the available document types (will, trust, poa, healthcare), propose 3-6 new recommendation rules that would map member answers to documents. For each rule return: name, plain-English description, conditions (op AND/OR + clauses of {attribute, op, value}), the single document, a member-facing reason (one sentence), flag (recommended|optional), priority (0-100). Return ONLY a valid JSON array — no prose, no markdown fences.",
};

export const runAiAssist = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const { callLovableAI } = await import("./ai-gateway.server");
    const user = data.context
      ? `${data.content}\n\nContext:\n${data.context}`
      : data.content;
    const output = await callLovableAI({
      system: SYSTEMS[data.task],
      user,
    });
    return { output };
  });
