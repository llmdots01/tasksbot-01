import { Hono } from "hono";
import type { AppEnv, Env } from "../types";
import { requireAuth } from "../auth";
import { loadUser } from "../settings";
import { runTool, TOOLS, type ToolAction } from "./tools";
import { enhanceTask } from "./enhance";
import { consumeAssistantQuota } from "./quota";

type Provider = "gemini" | "llama";
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
interface ChatResult {
  reply: string;
  actions: ToolAction[];
  provider: Provider;
  model: string;
}

const MAX_STEPS = 8;
const MAX_MESSAGES = 30;
const MAX_CHARS = 4000;

class ProviderError extends Error {
  /** True if the failure happened before any tool ran, so another provider can safely retry. */
  constructor(message: string, public retryable: boolean) {
    super(message);
  }
}

/** Local wall-clock time in `tz` with its UTC offset, e.g. 2026-11-14T10:05:00+05:30. */
function localIsoWithOffset(date: Date, tz: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const offsetMin = Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const off = `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${off}`;
}

function validTimezone(tz: unknown): string {
  if (typeof tz === "string" && tz.length < 64) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return tz;
    } catch {
      /* fall through */
    }
  }
  return "UTC";
}

function systemPrompt(name: string | null, tz: string): string {
  const now = new Date();
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(now);
  return `You are the assistant inside Task(AI)Do, a task and reminder app. You act on behalf of the signed-in user${
    name ? ` (${name})` : ""
  } using the provided tools. You can list, create, update, complete and delete their tasks, and manage their email and Slack notifications.

Current local time for the user: ${localIsoWithOffset(now, tz)} (${weekday}, time zone ${tz}).

Rules:
- Use tools to do what the user asks; never claim you did something without calling the tool.
- Write all dates for tools as ISO 8601 with the user's UTC offset shown above. Interpret "today", "tomorrow", "next Monday", "tonight" relative to the local time above. If no time is given, use 09:00 local time.
- When the user asks to be reminded without saying how early, set reminder_minutes_before to 15.
- To change, complete or delete a task, find its id with list_tasks first unless you already know it from this conversation. If several tasks match, ask which one.
- Before deleting a task or disconnecting Slack, ask the user to confirm in plain words; only then call the tool with confirmed=true.
- You cannot delete the user's account; tell them to use Settings → Delete account.
- When asked to improve, enhance or rewrite a task's description, write a clearer, actionable one (a one-sentence summary, then up to 5 "- " steps if useful), keep the user's facts and don't invent new ones, and save it with update_task.
- Phone push notifications are turned on per device by the user in Settings → Phone notifications (the browser must ask for permission), so you can't enable them yourself; you can send a test push once a device is enabled.
- Keep replies short and friendly. After making changes, summarise what you did in one or two sentences, showing dates in a natural local format (e.g. "Sat 15 Nov, 6:00 PM"). Use simple "- " bullet lists for several tasks.`;
}

// ---------- Gemini ----------

interface GeminiPart {
  text?: string;
  thought?: boolean;
  functionCall?: { name: string; args?: Record<string, unknown>; id?: string };
  [k: string]: unknown;
}

async function runGemini(env: Env, userId: string, system: string, history: ChatMessage[]): Promise<ChatResult> {
  const model = env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  const declarations = TOOLS.map((t) => (t.parameters ? { name: t.name, description: t.description, parameters: t.parameters } : { name: t.name, description: t.description }));
  const contents: Array<{ role: string; parts: GeminiPart[] }> = history.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const actions: ToolAction[] = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: system }] },
      contents,
      tools: [{ functionDeclarations: declarations }],
    };
    if (env.GEMINI_THINKING) body.generationConfig = { thinkingConfig: { thinkingLevel: env.GEMINI_THINKING } };

    let res: Response;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY! },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      throw new ProviderError(`Gemini request failed: ${(e as Error).message}`, actions.length === 0);
    }
    const data = (await res.json().catch(() => ({}))) as {
      candidates?: Array<{ content?: { role: string; parts?: GeminiPart[] }; finishReason?: string }>;
      error?: { message?: string };
    };
    if (!res.ok) throw new ProviderError(`Gemini ${res.status}: ${data.error?.message ?? "error"}`, actions.length === 0);

    const content = data.candidates?.[0]?.content;
    const parts = content?.parts ?? [];
    const calls = parts.filter((p) => p.functionCall).map((p) => p.functionCall!);
    if (!calls.length) {
      const reply = parts
        .filter((p) => p.text && !p.thought)
        .map((p) => p.text)
        .join("")
        .trim();
      if (!reply && actions.length === 0) throw new ProviderError(`Gemini returned no answer (${data.candidates?.[0]?.finishReason ?? "empty"})`, true);
      return { reply: reply || "Done.", actions, provider: "gemini", model };
    }

    // Echo the model turn back unchanged (it carries thought signatures Gemini requires), then the results.
    contents.push({ role: "model", parts });
    const responses: GeminiPart[] = [];
    for (const call of calls) {
      const { result, action } = await runTool(env, userId, call.name, call.args);
      if (action) actions.push(action);
      responses.push({ functionResponse: { name: call.name, ...(call.id ? { id: call.id } : {}), response: result } });
    }
    contents.push({ role: "user", parts: responses });
  }
  return { reply: "I made some changes but ran out of steps. Please check your tasks.", actions, provider: "gemini", model };
}

// ---------- Llama (Workers AI) ----------

interface OpenAIToolCall {
  id?: string;
  type?: string;
  function?: { name: string; arguments: string | Record<string, unknown> };
  name?: string;
  arguments?: string | Record<string, unknown>;
}

function parseArgs(a: unknown): Record<string, unknown> {
  if (a && typeof a === "object") return a as Record<string, unknown>;
  if (typeof a === "string") {
    try {
      return JSON.parse(a);
    } catch {
      return {};
    }
  }
  return {};
}

async function runLlama(env: Env, userId: string, system: string, history: ChatMessage[]): Promise<ChatResult> {
  const model = env.LLAMA_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
  const tools = TOOLS.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters ?? { type: "object", properties: {} } },
  }));
  const messages: Array<Record<string, unknown>> = [{ role: "system", content: system }, ...history.map((m) => ({ role: m.role, content: m.content }))];
  const actions: ToolAction[] = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    let out: Record<string, unknown>;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      out = (await (env.AI as any).run(model, { messages, tools, max_tokens: 1024 })) as Record<string, unknown>;
    } catch (e) {
      throw new ProviderError(`Llama request failed: ${(e as Error).message}`, actions.length === 0);
    }
    // Workers AI returns either the OpenAI chat.completion shape or its legacy { response, tool_calls } shape.
    const choice = (out.choices as Array<{ message?: { content?: string | null; tool_calls?: OpenAIToolCall[] } }> | undefined)?.[0]?.message;
    const rawCalls: OpenAIToolCall[] = choice?.tool_calls ?? (out.tool_calls as OpenAIToolCall[] | undefined) ?? [];
    const calls = rawCalls
      .map((c, i) => ({ id: c.id ?? `call_${step}_${i}`, name: c.function?.name ?? c.name ?? "", args: parseArgs(c.function?.arguments ?? c.arguments) }))
      .filter((c) => c.name);
    const text = (choice?.content ?? (out.response as string | undefined) ?? "").toString().trim();

    if (!calls.length) {
      if (!text && actions.length === 0) throw new ProviderError("Llama returned no answer", true);
      return { reply: text || "Done.", actions, provider: "llama", model };
    }

    messages.push({
      role: "assistant",
      content: text,
      tool_calls: calls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: JSON.stringify(c.args) } })),
    });
    for (const call of calls) {
      const { result, action } = await runTool(env, userId, call.name, call.args);
      if (action) actions.push(action);
      messages.push({ role: "tool", tool_call_id: call.id, name: call.name, content: JSON.stringify(result) });
    }
  }
  return { reply: "I made some changes but ran out of steps. Please check your tasks.", actions, provider: "llama", model };
}

// ---------- Route ----------

export const assistantRoutes = new Hono<AppEnv>();
assistantRoutes.use("*", requireAuth);

assistantRoutes.post("/enhance", enhanceTask);

assistantRoutes.get("/info", (c) =>
  c.json({ gemini: Boolean(c.env.GEMINI_API_KEY), llama: Boolean(c.env.AI), geminiModel: c.env.GEMINI_MODEL, llamaModel: c.env.LLAMA_MODEL }),
);

assistantRoutes.post("/chat", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { messages?: unknown; provider?: unknown; timezone?: unknown } | null;
  const raw = Array.isArray(body?.messages) ? (body!.messages as unknown[]) : [];
  const history: ChatMessage[] = raw
    .slice(-MAX_MESSAGES)
    .filter((m): m is ChatMessage => {
      const r = m as ChatMessage;
      return (r?.role === "user" || r?.role === "assistant") && typeof r.content === "string" && r.content.trim() !== "";
    })
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  if (!history.length || history[history.length - 1].role !== "user") return c.json({ error: "Send at least one user message." }, 400);

  const quota = await consumeAssistantQuota(c.env, c.var.userId);
  if (quota) return c.json({ error: quota }, 429);

  const user = await loadUser(c.env.DB, c.var.userId);
  const system = systemPrompt(user.name, validTimezone(body?.timezone));
  const requested = body?.provider === "gemini" || body?.provider === "llama" ? (body.provider as Provider) : "auto";
  const order: Provider[] =
    requested === "llama" ? ["llama"] : requested === "gemini" ? ["gemini", "llama"] : c.env.GEMINI_API_KEY ? ["gemini", "llama"] : ["llama"];

  let lastError = "No AI provider is configured.";
  for (const provider of order) {
    if (provider === "gemini" && !c.env.GEMINI_API_KEY) continue;
    try {
      const result = provider === "gemini" ? await runGemini(c.env, c.var.userId, system, history) : await runLlama(c.env, c.var.userId, system, history);
      return c.json({ ...result, fallback: requested !== "auto" && provider !== requested ? true : provider !== order[0] });
    } catch (e) {
      console.error(`assistant ${provider} failed`, e);
      lastError = (e as Error).message;
      // Only fall back if nothing was changed yet; otherwise a retry could repeat actions.
      if (!(e instanceof ProviderError) || !e.retryable) break;
    }
  }
  return c.json({ error: `The assistant is unavailable right now. ${lastError}` }, 502);
});
