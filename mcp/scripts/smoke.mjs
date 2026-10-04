// End-to-end check against a running server: node scripts/smoke.mjs [url]
// Speaks plain 2025-era streamable HTTP JSON-RPC, like most hosts today.
const URL_ = process.argv[2] || "http://localhost:8787/mcp";
let id = 0;
async function rpc(method, params){
  const res = await fetch(URL_, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
  });
  const text = await res.text();
  const body = text.startsWith("{") ? text : text.split("\n").filter(l => l.startsWith("data:")).map(l => l.slice(5)).pop();
  const msg = JSON.parse(body);
  if (msg.error) throw new Error(`${method}: ${JSON.stringify(msg.error)}`);
  return msg.result;
}
const ok = (cond, label) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) process.exitCode = 1; };

const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: { extensions: { "io.modelcontextprotocol/ui": { mimeTypes: ["text/html;profile=mcp-app"] } } }, clientInfo: { name: "smoke", version: "0" } });
ok(init.serverInfo?.name === "frame-speak" && init.instructions?.includes("show_feedback"), `initialize → ${init.protocolVersion}, instructions present`);

const { tools } = await rpc("tools/list", {});
const names = tools.map(t => t.name).sort();
ok(JSON.stringify(names) === JSON.stringify(["draw_topic", "list_frameworks", "show_feedback", "show_guide"]), `tools/list → ${names.join(", ")}`);
const draw = tools.find(t => t.name === "draw_topic");
const uri = draw._meta?.ui?.resourceUri;
ok(uri?.startsWith("ui://frame-speak/") && draw._meta["ui/resourceUri"] === uri, `draw_topic UI → ${uri}`);
ok(draw.inputSchema?.properties?.chart_type?.enum?.length === 12, "chart_type enum has any + 11 types");

const { resources } = await rpc("resources/list", {});
ok(resources.some(r => r.uri === uri), "resource listed");
const rr = await rpc("resources/read", { uri });
const c = rr.contents[0];
ok(c.mimeType === "text/html;profile=mcp-app" && c.text.includes('id="root"') && c.text.length > 100000, `resource html ${(c.text.length / 1024).toFixed(0)} KB, ${c.mimeType}`);

for (const [lang, deck, chart_type] of [["en", "work"], ["zh", "life"], ["en", "chart", "waterfall"], ["zh", "chart", "scatter"], ["en", "chart", "any"]]) {
  const r = await rpc("tools/call", { name: "draw_topic", arguments: { lang, deck, ...(chart_type ? { chart_type } : {}) } });
  const g = r.structuredContent?.guide;
  const allPhrases = g?.steps?.every(s => s.phrases?.length);
  const chartOk = deck !== "chart" || (g.chart && (chart_type === "any" || g.chart.type === chart_type) && r.content[0].text.includes(lang === "zh" ? "图表数据" : "Chart data"));
  ok(!r.isError && g?.lang === lang && allPhrases && chartOk, `draw_topic ${lang}/${deck}${chart_type ? "/" + chart_type : ""} → ${g?.topic}`);
}

const sg = await rpc("tools/call", { name: "show_guide", arguments: { lang: "en", topic: "Ask for a raise", framework: "PSB", steps: [{ label: "Problem", prompt: "What's off?", phrases: ["Right now…"] }, { label: "Ask", prompt: "What do you want?", phrases: [] }] } });
ok(sg.structuredContent?.kind === "guide" && sg.structuredContent.guide.source === "free", "show_guide → guide card");

const fb = { lang: "en", topic: "t", framework: "PREP", scores: { structure: 4, clarity: 3, vocabulary: 3, naturalness: 4 }, summary: "s", strengths: ["a"], fixes: [{ original: "x", better: "y" }], polished: "p **q**", speech: ["I *am*‿here."], vocab: [{ word: "w", meaning: "m" }], next: "n" };
const fr = await rpc("tools/call", { name: "show_feedback", arguments: fb });
ok(fr.structuredContent?.kind === "feedback" && fr.structuredContent.feedback.translations?.length === 0, "show_feedback → feedback card (translations defaulted)");
const bad = await rpc("tools/call", { name: "show_feedback", arguments: { ...fb, scores: { structure: 9 } } }).catch(e => ({ isError: true, err: e.message }));
ok(bad.isError, "show_feedback rejects bad scores");

const lf = await rpc("tools/call", { name: "list_frameworks", arguments: { lang: "zh" } });
ok(lf.content[0].text.includes("观点·理由·例子·重申"), "list_frameworks zh");
const { prompts } = await rpc("prompts/list", {});
ok(prompts.map(p => p.name).sort().join() === "my_situation,practice", "prompts/list");
const pr = await rpc("prompts/get", { name: "practice", arguments: { lang: "zh", deck: "chart" } });
ok(pr.messages[0].content.text.includes("图表"), "prompts/get practice zh chart");
