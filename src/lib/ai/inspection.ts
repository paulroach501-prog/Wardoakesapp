import Anthropic from "@anthropic-ai/sdk";
import { getReportAIConfig } from "@/lib/settings";

// AI for the inspection: writing photo descriptions (vision) and the review-bot
// chat. Reuses the app's saved provider/model default; supports Claude and
// Gemini, and fails gracefully with a clear message when no key is set.

type Resolved = { provider: "claude" | "gemini"; model: string } | null;

function resolve(providerModel?: { provider?: string; model?: string }): Resolved {
  const claudeKey = Boolean(process.env.ANTHROPIC_API_KEY);
  const geminiKey = Boolean(process.env.GEMINI_API_KEY);
  const want = providerModel?.provider;

  const pick = (p: "claude" | "gemini"): Resolved => {
    if (p === "claude" && claudeKey)
      return { provider: "claude", model: providerModel?.model || "claude-opus-4-8" };
    if (p === "gemini" && geminiKey)
      return { provider: "gemini", model: providerModel?.model || "gemini-2.0-flash" };
    return null;
  };

  if (want === "claude" || want === "gemini") {
    const r = pick(want);
    if (r) return r;
  }
  if (claudeKey) return { provider: "claude", model: providerModel?.model || "claude-opus-4-8" };
  if (geminiKey) return { provider: "gemini", model: providerModel?.model || "gemini-2.0-flash" };
  return null;
}

async function resolveDefault(): Promise<Resolved> {
  const cfg = await getReportAIConfig();
  return resolve({ provider: cfg.provider ?? undefined, model: cfg.model ?? undefined });
}

const PHOTO_SYSTEM =
  "You are assisting a forensic roof inspector. Write a concise, factual, professional description of what a roof/exterior inspection photo shows, suitable for a Forensic Condition Assessment. Note visible conditions, materials, and any damage indicators (hail bruising, mechanical damage, granule loss, flashing issues). Do not speculate beyond what is visible. 1-3 sentences.";

const CHAT_SYSTEM =
  "You are the review-bot embedded in a forensic roof inspection app. You help the inspector in the field: answering questions about what they're seeing, suggesting what to document or photograph next, and organizing observations. Be concise and practical. You have access to the current inspection's photos (their tags and descriptions) as context.";

// Describe a single photo from its image bytes + inspector tags.
export async function describePhoto(
  imageBase64: string,
  mediaType: string,
  tags: string[],
): Promise<string> {
  const r = await resolveDefault();
  if (!r) throw new Error("NO_AI_KEY");

  const prompt = `Describe this inspection photo${
    tags.length ? ` (inspector tags: ${tags.join(", ")})` : ""
  }.`;

  if (r.provider === "claude") {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: r.model,
      max_tokens: 400,
      system: PHOTO_SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType as "image/jpeg", data: imageBase64 },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
    });
    return res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
  }

  // Gemini vision
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${r.model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: PHOTO_SYSTEM }] },
      contents: [
        {
          role: "user",
          parts: [
            { inline_data: { mime_type: mediaType, data: imageBase64 } },
            { text: prompt },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Gemini error ${res.status}`);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return (data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "").trim();
}

// Generic single-shot text generation on the configured provider. Used for the
// assembled-package field summary.
export async function synthesize(
  system: string,
  user: string,
  maxTokens = 1200,
): Promise<string> {
  const r = await resolveDefault();
  if (!r) throw new Error("NO_AI_KEY");

  if (r.provider === "claude") {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: r.model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    });
    return res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${r.model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
    }),
  });
  if (!res.ok) throw new Error(`Gemini error ${res.status}`);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return (data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "").trim();
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

// Reply in the inspection chat, given prior turns and a context summary of the
// inspection's photos.
export async function inspectionChat(
  turns: ChatTurn[],
  contextSummary: string,
): Promise<string> {
  const r = await resolveDefault();
  if (!r) throw new Error("NO_AI_KEY");

  const system = `${CHAT_SYSTEM}\n\nCurrent inspection context:\n${contextSummary || "(no photos yet)"}`;

  if (r.provider === "claude") {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: r.model,
      max_tokens: 800,
      system,
      messages: turns.map((t) => ({ role: t.role, content: t.content })),
    });
    return res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${r.model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: turns.map((t) => ({
        role: t.role === "assistant" ? "model" : "user",
        parts: [{ text: t.content }],
      })),
    }),
  });
  if (!res.ok) throw new Error(`Gemini error ${res.status}`);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return (data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "").trim();
}
