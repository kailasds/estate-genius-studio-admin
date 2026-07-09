// Server-only helper - never import from client code.
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const LOVABLE_BASE_URL = "https://ai.gateway.lovable.dev/v1";
const LOVABLE_MODEL = "google/gemini-3-flash-preview";

export type AiGatewayConfig = {
  name: string;
  baseURL: string;
  apiKey: string;
  model: string;
};

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export function getAiGatewayConfig(): AiGatewayConfig {
  const openAiKey = process.env.OPENAI_API_KEY;
  if (openAiKey) {
    const baseURL =
      process.env.OPENAI_BASE_URL ||
      process.env.DEFAULT_OPENAI_BASE_URL ||
      "https://api.openai.com/v1";
    const model = process.env.OPENAI_MODEL;

    if (!model) {
      throw new Error("OPENAI_MODEL missing");
    }

    return {
      name: "openai-compatible",
      baseURL: trimTrailingSlash(baseURL),
      apiKey: openAiKey,
      model,
    };
  }

  const lovableKey = process.env.LOVABLE_API_KEY;
  if (lovableKey) {
    return {
      name: "lovable",
      baseURL: LOVABLE_BASE_URL,
      apiKey: lovableKey,
      model: LOVABLE_MODEL,
    };
  }

  throw new Error("Missing AI environment variable: set OPENAI_API_KEY or LOVABLE_API_KEY");
}

export function createAiGatewayProvider(config = getAiGatewayConfig()) {
  return createOpenAICompatible({
    name: config.name,
    baseURL: config.baseURL,
    headers: { Authorization: `Bearer ${config.apiKey}` },
  });
}

export function createLovableAiGatewayProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "lovable",
    baseURL: LOVABLE_BASE_URL,
    headers: { Authorization: `Bearer ${apiKey}` },
  });
}

export async function callLovableAI(opts: {
  system: string;
  user: string;
  model?: string;
}): Promise<string> {
  const config = getAiGatewayConfig();

  const res = await fetch(`${config.baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model ?? config.model,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("Rate limited - please try again shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted - check your gateway billing.");
    throw new Error(`AI request failed (${res.status}): ${txt}`);
  }

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content ?? "";
}
