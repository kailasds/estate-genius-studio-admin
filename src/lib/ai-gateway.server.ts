// Server-only helper — never import from client code.
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export function createLovableAiGatewayProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
}

export async function callLovableAI(opts: {
  system: string;
  user: string;
  model?: string;
}): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model ?? "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("Rate limited — please try again shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted — add credits in Workspace Settings.");
    throw new Error(`AI request failed (${res.status}): ${txt}`);
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content ?? "";
}
