import type { Context } from "hono";
import type { AppEnv, Env } from "../types";
import { PRIORITIES } from "../types";
import { consumeAssistantQuota } from "./quota";

/** What the model may suggest. Fields the user already filled are only rewritten for title/description. */
interface Enhanced {
  title?: string;
  description?: string;
  category?: string;
  tags?: string;
  priority?: string;
}

const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Concise, specific task title (max 80 characters), same meaning as the original" },
    description: { type: "string", description: "Clear, actionable description: one-sentence summary, then up to 5 lines starting with '- ' for steps if useful" },
    category: { type: "string", description: "One or two words, e.g. Work, Home, Health, Finance" },
    tags: { type: "string", description: "Up to 3 short lowercase tags, comma-separated" },
    priority: { type: "string", enum: [...PRIORITIES], description: "Only if clearly implied by the task" },
  },
  required: ["title", "description"],
} as const;

const SYSTEM = `You improve tasks in a to-do app. Rewrite the user's task so it is clear and actionable.
Rules:
- Keep the user's meaning, language and facts. Never invent names, numbers, places, dates or amounts that aren't given or clearly implied.
- description: a one-sentence summary of the goal, then (only if useful) up to 5 short steps, each on its own line starting with "- ". Plain text, no Markdown headings or bold. Max 600 characters.
- title: concise and specific, max 80 characters, starting with a verb when natural.
- category and tags: suggest only if helpful; tags are lowercase, comma-separated, max 3.
- priority: only if the task clearly implies urgency or importance; otherwise omit.
Respond with JSON only.`;

/** Some models put "- step" bullets inline ("summary, - a, - b"); put each on its own line. */
function tidyDescription(d: string): string {
  let out = d.replace(/\r/g, "");
  // Only treat it as a list when there are at least two inline bullets, so a single dash in a sentence stays put.
  if (!out.includes("\n") && (out.match(/\s-\s/g) ?? []).length >= 2) out = out.replace(/[,;:]?\s+-\s+/g, "\n- ");
  return out
    .split("\n")
    .map((l) => l.trim().replace(/^[*•]\s+/, "- ").replace(/[,;]$/, ""))
    .filter((l, i, arr) => l || (i > 0 && arr[i - 1]))
    .join("\n")
    .trim();
}

function clean(raw: unknown): Enhanced {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
  const out: Enhanced = {
    title: str(r.title, 100),
    description: str(r.description, 2000) && tidyDescription(str(r.description, 2000)!),
    category: str(r.category, 50),
    tags: str(r.tags, 200)
      ?.split(",")
      .map((t) => t.trim().toLowerCase().replace(/^#/, ""))
      .filter(Boolean)
      .slice(0, 3)
      .join(", "),
  };
  if (typeof r.priority === "string" && (PRIORITIES as readonly string[]).includes(r.priority)) out.priority = r.priority;
  return out;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : {};
  }
}

async function viaGemini(env: Env, prompt: string): Promise<Enhanced> {
  const model = env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: SCHEMA,
      ...(env.GEMINI_THINKING ? { thinkingConfig: { thinkingLevel: env.GEMINI_THINKING } } : {}),
    },
  };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY! },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25_000),
  });
  const data = (await res.json().catch(() => ({}))) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>; error?: { message?: string } };
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${data.error?.message ?? "error"}`);
  const text = (data.candidates?.[0]?.content?.parts ?? []).filter((p) => p.text && !p.thought).map((p) => p.text).join("");
  return clean(parseJson(text));
}

async function viaLlama(env: Env, prompt: string): Promise<Enhanced> {
  const model = env.LLAMA_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out = (await (env.AI as any).run(model, {
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_schema", json_schema: SCHEMA },
    max_tokens: 700,
  })) as Record<string, unknown>;
  const choice = (out.choices as Array<{ message?: { content?: string } }> | undefined)?.[0]?.message?.content;
  const resp = out.response;
  return clean(typeof resp === "object" && resp ? resp : parseJson(String(choice ?? resp ?? "")));
}

/** POST /api/assistant/enhance — returns an improved title/description plus optional suggestions. Doesn't save anything. */
export async function enhanceTask(c: Context<AppEnv>) {
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 100) : "";
  if (!title) return c.json({ error: "Add a title first, then enhance." }, 400);
  const field = (k: string, max: number) => (typeof body?.[k] === "string" && (body[k] as string).trim() ? (body[k] as string).trim().slice(0, max) : "");
  const description = field("description", 2000);

  const quota = await consumeAssistantQuota(c.env, c.var.userId);
  if (quota) return c.json({ error: quota }, 429);

  const prompt = [
    `Title: ${title}`,
    `Description: ${description || "(none)"}`,
    field("due_date", 40) && `Due: ${field("due_date", 40)}`,
    field("priority", 20) && `Current priority: ${field("priority", 20)}`,
    field("category", 50) && `Current category: ${field("category", 50)}`,
    field("tags", 200) && `Current tags: ${field("tags", 200)}`,
  ]
    .filter(Boolean)
    .join("\n");

  const errors: string[] = [];
  for (const provider of c.env.GEMINI_API_KEY ? ["gemini", "llama"] : ["llama"]) {
    try {
      const result = provider === "gemini" ? await viaGemini(c.env, prompt) : await viaLlama(c.env, prompt);
      if (!result.description) throw new Error("empty result");
      return c.json({ ...result, provider });
    } catch (e) {
      console.error(`enhance via ${provider} failed`, e);
      errors.push(`${provider}: ${(e as Error).message}`);
    }
  }
  return c.json({ error: `AI is unavailable right now. ${errors.join("; ")}` }, 502);
}
