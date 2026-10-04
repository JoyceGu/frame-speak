// Frame & Speak MCP server (Cloudflare Worker, stateless).
// The server only hands out topics, frameworks and a UI; the host's own model
// (the user's ChatGPT / Claude account) writes guides and feedback.
import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { FRAMEWORKS, CHART_TYPES, CHART_ORDER } from "./shared/data.js";
import { guideFromDeck, drawIndex, guideText } from "./shared/guide.js";
import { VIEW_HTML, VIEW_HASH } from "./generated/view.js";

const VERSION = "1.0.0";
const UI_URI = `ui://frame-speak/app-${VIEW_HASH}.html`;
const UI_META = { ui: { resourceUri: UI_URI } };
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

const INSTRUCTIONS = `Frame & Speak is a guided speaking-practice coach in two separate sections: Chinese (lang "zh") and English (lang "en").
Pick lang from what the user wants to practise, not from the language they write in. A Chinese speaker practising English uses "en".
Flow:
1. Get a practice card: draw_topic for a random life / work / chart topic, or show_guide when the user describes their own situation.
2. The card shows the question, a step-by-step answer framework with useful phrases for every step, and for chart topics the chart itself. Do not repeat the card's contents in chat; just invite the user to answer, step by step, out loud or in writing.
3. When the user answers (in the card, which sends their answer as a chat message, or directly in chat), review it and call show_feedback, following that tool's rubric exactly.
Keep your own chat text short; the cards carry the content.`;

const FW_MENU = Object.entries(FRAMEWORKS).filter(([k]) => k !== "DATA")
  .map(([k, f]) => `${k}: ${f.en.name} (${f.en.use}) / ${f.zh.name}（${f.zh.use}）: ${f.en.steps.map(s => s[0]).join(" → ")}`).join("\n");

const RUBRIC = `Write the feedback in the section's language only: lang "en" means all feedback in clear, simple English (Chinese only when quoting the user); lang "zh" means all feedback in Chinese.
English section: the learner is a Chinese-native professional. Chinese fragments in their answer are "how do I say this" requests; put each in "translations" (from = their Chinese, to = natural English).
Chinese section: coach them to sound organised, focused, appropriate and natural, not bookish or translated. English words they mixed in go to "translations" (from = English, to = natural Chinese).
scores: integers 1-5. structure = each step does its job and flows; clarity = easy to follow when heard once; vocabulary = range and precision; naturalness = sounds like real speech.
fixes: up to 5 most useful corrections. "original" quotes their exact words, "better" is a natural spoken alternative, "why" is a short reason.
polished: their answer rewritten as one natural spoken paragraph, keeping their ideas and details, in framework order (English 90-160 words; Chinese 150-280 characters). Wrap 4-6 upgraded words or phrases in **double asterisks**.
speech: the SAME polished text split into sentences and marked for reading aloud. English: put "‿" between words whose sounds link (consonant-to-vowel like "pick‿it‿up", same consonant like "big‿game", reductions like "want‿to"). Both languages: " / " at natural short pauses, and the 1-3 most stressed words of each sentence in *single asterisks*. No double asterisks in speech. Chinese uses no "‿".
vocab: 5 words, idioms or sentence patterns worth learning, with "pos" (part of speech, or phrase / 成语 / 句式), a short "meaning", and an "example" tied to their situation.
next: one concrete thing to focus on next time.
Chart topics: check every number and trend they state against the chart data from draw_topic and correct misreadings in fixes. Reward leading with the takeaway, sensible rounding, and comparing instead of listing; judge whether they read it the way that chart type is best read. Favour data-reporting language in vocab.`;

const LANG = z.enum(["en", "zh"]).describe('Section: "en" to practise English, "zh" to practise Chinese');
const CHART_KIND = z.enum(["any", ...CHART_ORDER]).describe("Chart type to practise (chart deck only): " +
  CHART_ORDER.map(k => `${k} = ${CHART_TYPES[k].en} (${CHART_TYPES[k].cat.en})`).join("; "));

function guideResult(g, extra){
  const zh = g.lang === "zh";
  const note = zh
    ? "练习卡已显示给用户（题目、框架、每步可用表达" + (g.chart ? "、图表" : "") + "）。不要在聊天里重复卡片内容，简短邀请用户按步骤作答即可。用户作答后，按 show_feedback 的评分标准点评并调用 show_feedback。"
    : "The practice card is now shown to the user (question, framework, phrases per step" + (g.chart ? ", chart" : "") + "). Don't repeat it in chat; briefly invite them to answer step by step. When they answer, review it and call show_feedback following its rubric.";
  return {
    content: [{ type: "text", text: guideText(g) + "\n" + note + (extra ? "\n" + extra : "") }],
    structuredContent: { kind: "guide", guide: g },
  };
}

function buildServer(){
  const server = new McpServer({ name: "frame-speak", title: "Frame & Speak", version: VERSION }, { instructions: INSTRUCTIONS });

  registerAppResource(server, "Frame & Speak practice card", UI_URI,
    { description: "Interactive practice card: topic, framework steps, chart, answer boxes, and the feedback view with read-aloud." },
    async () => ({ contents: [{ uri: UI_URI, mimeType: RESOURCE_MIME_TYPE, text: VIEW_HTML, _meta: { ui: { prefersBorder: true } } }] }));

  registerAppTool(server, "draw_topic", {
    title: "Draw a practice topic",
    description: "Draw a random speaking topic with a ready-made answer framework and per-step phrases, shown as an interactive card. " +
      'deck "life" = everyday questions, "work" = workplace situations, "chart" = data-reporting practice with a real chart to present (optionally pick chart_type).',
    inputSchema: z.object({
      lang: LANG,
      deck: z.enum(["life", "work", "chart"]).default("work").describe("Topic deck"),
      chart_type: CHART_KIND.optional(),
      avoid_index: z.number().int().optional().describe("Index of the current topic, so a redraw gives a different one. Usually omit."),
    }),
    annotations: READ_ONLY,
    _meta: UI_META,
  }, async ({ lang, deck, chart_type, avoid_index }) => {
    const i = drawIndex(deck, deck === "chart" ? chart_type : undefined, avoid_index);
    if (i == null) return { isError: true, content: [{ type: "text", text: `No topics for chart_type ${chart_type}.` }] };
    return guideResult(guideFromDeck(lang, deck, i));
  });

  registerAppTool(server, "show_guide", {
    title: "Show a guide for the user's own situation",
    description: "When the user describes a real situation they will face, YOU write one speaking task and answer guide for it, then call this to show it as a practice card.\n" +
      "Pick the best-fitting framework:\n" + FW_MENU + "\nor a custom 3-5 step framework when none fits (small talk: Open-Ask-Share-Bridge; a toast: Hook-Story-Wish).\n" +
      'Write everything in the section language only (lang "en": all English; lang "zh": all Chinese, with Chinese framework names such as 观点·理由·例子·重申). ' +
      "Each step gets a short prompt written for THIS situation and 2-3 expressions a skilled speaker would really use at that point (natural, not textbook; use … where content goes).",
    inputSchema: z.object({
      lang: LANG,
      topic: z.string().describe("The exact question to answer out loud, one sentence"),
      context: z.string().optional().describe("Who they speak to and the setting, one short line"),
      framework: z.string().describe("Short framework name"),
      why: z.string().optional().describe("Why this framework fits, very short"),
      steps: z.array(z.object({
        label: z.string(),
        prompt: z.string(),
        phrases: z.array(z.string()).max(4),
      })).min(2).max(6),
    }),
    annotations: READ_ONLY,
    _meta: UI_META,
  }, async (g) => guideResult({ source: "free", ...g, context: g.context || "", why: g.why || "", chart: null }));

  registerAppTool(server, "show_feedback", {
    title: "Show feedback on the user's answer",
    description: "After the user answers a practice card, write the feedback yourself and call this to show it with scores, fixes, a model answer, a read-aloud script with linking / pause / stress marks and playback, and vocabulary cards.\n" + RUBRIC,
    inputSchema: z.object({
      lang: LANG,
      topic: z.string(),
      framework: z.string(),
      scores: z.object({
        structure: z.number().int().min(1).max(5),
        clarity: z.number().int().min(1).max(5),
        vocabulary: z.number().int().min(1).max(5),
        naturalness: z.number().int().min(1).max(5),
      }),
      summary: z.string(),
      strengths: z.array(z.string()).max(4),
      fixes: z.array(z.object({ original: z.string(), better: z.string(), why: z.string().optional() })).max(6),
      translations: z.array(z.object({ from: z.string(), to: z.string() })).max(10).default([]),
      polished: z.string(),
      speech: z.array(z.string()).min(1),
      vocab: z.array(z.object({ word: z.string(), pos: z.string().optional(), meaning: z.string(), example: z.string().optional() })).max(8),
      next: z.string(),
    }),
    annotations: READ_ONLY,
    _meta: UI_META,
  }, async (f) => ({
    content: [{ type: "text", text: f.lang === "zh"
      ? "反馈卡已显示（分数、修改建议、示范回答、带标记的朗读稿和生词）。不要在聊天里重复，可以问用户要不要再练一遍或换一题。"
      : "The feedback card is shown (scores, fixes, model answer, marked read-aloud script, vocab). Don't repeat it in chat; offer another attempt or a new topic." }],
    structuredContent: { kind: "feedback", feedback: f },
  }));

  server.registerTool("list_frameworks", {
    title: "List answer frameworks",
    description: "The built-in answer frameworks with their steps and phrases for each step, in one section language.",
    inputSchema: z.object({ lang: LANG }),
    annotations: READ_ONLY,
  }, async ({ lang }) => ({
    content: [{ type: "text", text: Object.entries(FRAMEWORKS).map(([k, f]) => {
      const F = f[lang];
      return `${k}: ${F.name} (${F.use})\n` + F.steps.map(([l, p], i) => `  ${i + 1}. ${l}: ${p}`).join("\n");
    }).join("\n\n") }],
  }));

  server.registerPrompt("practice", {
    title: "Practise a topic",
    description: "Draw a topic and practise answering it with a framework",
    argsSchema: z.object({ lang: LANG, deck: z.enum(["life", "work", "chart"]).optional() }),
  }, ({ lang, deck }) => ({
    messages: [{ role: "user", content: { type: "text", text: lang === "zh"
      ? `我想练习中文表达。请用 draw_topic 抽一道${deck === "life" ? "生活" : deck === "chart" ? "图表汇报" : "工作"}题（lang: zh）。`
      : `I want to practise speaking English. Please draw a ${deck || "work"} topic with draw_topic (lang: en).` } }],
  }));

  server.registerPrompt("my_situation", {
    title: "Rehearse my own situation",
    description: "Describe a real situation and get a guide built for it",
    argsSchema: z.object({ lang: LANG, situation: z.string() }),
  }, ({ lang, situation }) => ({
    messages: [{ role: "user", content: { type: "text", text: lang === "zh"
      ? `我想用中文排练这个场景，请为它写一份回答向导并用 show_guide 显示（lang: zh）：\n${situation}`
      : `I want to rehearse this in English. Write an answer guide for it and show it with show_guide (lang: en):\n${situation}` } }],
  }));

  return server;
}

const mcp = createMcpHandler(() => buildServer());

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Expose-Headers": "*",
};

const HOME = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Frame & Speak MCP</title>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px;color:#15302A;background:#E9EDEA}code{background:#fff;padding:2px 6px;border-radius:4px}</style>
<h1>Frame &amp; Speak · MCP</h1>
<p>Guided speaking practice (中文 / English) for ChatGPT, Claude and other MCP clients. Add this URL as a custom connector / MCP server:</p>
<p><code>__URL__</code></p>
<p>Transport: Streamable HTTP. Authentication: none (no account, API key or OAuth). Your own AI assistant writes the guides and feedback.</p>
<p>Tools: draw_topic, show_guide, show_feedback, list_frameworks. Interactive cards use MCP Apps.</p>
<p>中文：这是一个 MCP 服务器地址（Streamable HTTP，无需认证）。在支持自定义 MCP 连接器的 AI 应用里添加上面的地址即可。</p>`;

/* Global per-minute cap (Workers Rate Limiting binding, counted per Cloudflare location). */
const BUSY = {
  en: "Frame & Speak is busy right now. Please try again in a minute.",
  zh: "Frame & Speak 当前使用的人较多，请一分钟后再试。",
};
async function overLimit(env){
  if (!env?.MCP_LIMIT) return false;
  try { const { success } = await env.MCP_LIMIT.limit({ key: "mcp" }); return !success; } catch { return false; }
}
async function busyResponse(request){
  let id = null;
  try { const b = await request.clone().json(); id = Array.isArray(b) ? null : (b?.id ?? null); } catch {}
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32000, message: `${BUSY.en} / ${BUSY.zh}` } }),
    { status: 429, headers: { "content-type": "application/json", "retry-after": "60", ...CORS } });
}

/* Some clients accept only JSON (or send no Accept header). The SDK requires both,
   so add text/event-stream for them and unwrap the single SSE message back into JSON. */
async function serveMcp(request){
  const accept = request.headers.get("accept") || "";
  const wantsSse = accept.includes("text/event-stream");
  let req = request;
  if (request.method === "POST" && !(wantsSse && accept.includes("application/json"))) {
    const headers = new Headers(request.headers);
    headers.set("accept", "application/json, text/event-stream");
    req = new Request(request, { headers });
  }
  const res = await mcp.fetch(req);
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  if (request.method === "POST" && !wantsSse && (res.headers.get("content-type") || "").includes("text/event-stream")) {
    const text = await res.text();
    const msgs = text.split(/\r?\n/).filter(l => l.startsWith("data:")).map(l => l.slice(5).trim()).filter(Boolean);
    headers.set("content-type", "application/json");
    headers.delete("content-length");
    return new Response(msgs.length > 1 ? `[${msgs.join(",")}]` : (msgs[0] || ""), { status: res.status, headers });
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

const page = (url) => new Response(HOME.replace("__URL__", `${url.origin}/mcp`), { headers: { "content-type": "text/html; charset=utf-8", ...CORS } });

export default {
  async fetch(request, env){
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === "/mcp" || url.pathname === "/mcp/") {
      // A browser or web-fetch tool opening the endpoint gets the explainer page instead of a bare 405.
      if (request.method === "GET" && (request.headers.get("accept") || "").includes("text/html")) return page(url);
      if (request.method === "POST" && await overLimit(env)) return busyResponse(request);
      return serveMcp(request);
    }
    if (url.pathname === "/") return page(url);
    return new Response("Not found", { status: 404 });
  },
};
