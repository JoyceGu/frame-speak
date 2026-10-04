// The practice card shown inside ChatGPT / Claude (MCP Apps view).
// Renders either a guide (topic + framework + chart + answer boxes) or feedback.
import { App, applyDocumentTheme } from "@modelcontextprotocol/ext-apps";
import { CHART_TYPES, CHART_ORDER } from "../shared/data.js";
import { xLabels, allVals, fmtN, fmtV, fmtS, guideText } from "../shared/guide.js";

const T = {
  en:{section:"English", life:"Life", work:"Work", charts:"Charts", drawAnother:"Draw another", anyType:"Any chart type",
    showData:"Show the numbers", submit:"Get feedback", sending:"Sent. Your assistant is reviewing it…",
    sendFail:"Couldn't send from the card. Your answer is copied; paste it into the chat.", sendFailNoCopy:"Couldn't send from the card. Copy your answer into the chat instead.",
    needAnswer:"Fill in at least one step first.", sayIt:"Write a line or two per step, read it through, then say it out loud once.",
    stuck:"Stuck on a word? Write it in Chinese and the feedback will give you the English.",
    feedback:"Feedback", dims:["Structure","Clarity","Vocabulary","Naturalness"], worked:"What worked", better:"Say it better",
    translations:"Your Chinese, in English", polished:"Model answer", readAloud:"Read-aloud script", playAll:"Play all", stop:"Stop",
    legend:[["‿","linked sounds, say them as one"],["/","short pause"],["bold","stressed word"]],
    shadow:"Play a sentence, pause, and repeat it right after. Then play the whole passage and speak along with it.",
    words:"Words to keep", listen:"Listen", next:"Next time", speed:"Speed", noVoice:"No speech voice is available here, so playback is off.",
    newTopic:"New topic", newTopicMsg:"Let's do another topic in the English section.", loading:"Preparing your card…", talk:"How to talk about it: ",
    answerMsg:(g,body)=>`Here's my answer to “${g.topic}” (${g.framework}):\n${body}\n\nPlease review it and show feedback.`,
    cardNote:"Card details (drawn inside the card, so you haven't seen them yet):"},
  zh:{section:"中文", life:"生活", work:"工作", charts:"图表", drawAnother:"换一题", anyType:"全部图表类型",
    showData:"查看数据", submit:"获取反馈", sending:"已发送，助手正在点评…",
    sendFail:"卡片无法直接发送，回答已复制，请粘贴到对话框。", sendFailNoCopy:"卡片无法直接发送，请把回答复制到对话框。",
    needAnswer:"请至少先写一步。", sayIt:"每步写一两句，通读一遍，再完整地说出来。",
    stuck:"不用追求完美，先把意思写下来，反馈会帮你打磨。",
    feedback:"反馈", dims:["结构","清晰","用词","自然"], worked:"做得好的", better:"更好的说法",
    translations:"夹杂的英文，用中文说", polished:"示范回答", readAloud:"朗读稿", playAll:"全部播放", stop:"停止",
    legend:[["/","停顿"],["加粗","重音"]],
    shadow:"逐句播放，暂停后立刻跟读；熟练后播放全文，跟着一起说。",
    words:"好词好句", listen:"朗读", next:"下次重点", speed:"语速", noVoice:"当前环境没有语音引擎，无法播放。",
    newTopic:"换个新题", newTopicMsg:"再来一道中文题。", loading:"正在准备练习卡…", talk:"怎么讲这类图：",
    answerMsg:(g,body)=>`这是我对「${g.topic}」的回答（${g.framework}）：\n${body}\n\n请点评并显示反馈。`,
    cardNote:"卡片信息（这道题是在卡片里换的，你还没看到）："}
};

/* ---------- dom ---------- */
const root = document.getElementById("root");
function h(tag, attrs={}, ...kids){
  const el = document.createElement(tag);
  for(const [k,v] of Object.entries(attrs)){
    if(k==="class") el.className=v; else if(k.startsWith("on")) el.addEventListener(k.slice(2),v);
    else if(v!==false && v!=null) el.setAttribute(k,v===true?"":v);
  }
  for(const kid of kids.flat()){ if(kid==null||kid===false) continue; el.append(kid.nodeType?kid:String(kid)); }
  return el;
}
const SVGNS = "http://www.w3.org/2000/svg";
function sv(tag, attrs={}, text){ const el=document.createElementNS(SVGNS,tag); for(const [k,v] of Object.entries(attrs)) el.setAttribute(k,v); if(text!=null) el.textContent=text; return el; }
const LS = {
  get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}},
  set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
};
function countText(v, lang){
  v = (v||"").trim(); if(!v) return "";
  if(lang==="zh"){ const n=(v.match(/[一-鿿]/g)||[]).length; return n+" 字"; }
  return (v.match(/[A-Za-z']+/g)||[]).length+" words";
}

/* ---------- app bridge ---------- */
const app = new App({ name: "frame-speak-card", version: "1.0.0" });
let state = { guide:null, answers:[], seenByModel:true, chartType:"any" };

app.ontoolinput = () => { if(!root.firstChild || root.dataset.view==="loading") showLoading(); };
app.ontoolresult = (r) => {
  const sc = r?.structuredContent;
  if(sc?.kind==="guide") { state.seenByModel = true; showGuide(sc.guide); }
  else if(sc?.kind==="feedback") showFeedback(sc.feedback);
};
app.onhostcontextchanged = (ctx) => { if(ctx?.theme) applyDocumentTheme(ctx.theme); };
app.onteardown = async () => { stopSpeech(); return {}; };

function showLoading(){
  root.dataset.view = "loading";
  root.replaceChildren(h("div",{class:"panel status"}, h("span",{class:"dot"}), h("span",{}, (document.documentElement.lang==="zh-CN"?T.zh:T.en).loading)));
}

/* ---------- guide ---------- */
const draftKey = g => "fs.mcp.draft." + g.lang + "." + g.topic;

function showGuide(g){
  stopSpeech();
  const L = g.lang==="zh" ? "zh" : "en", t = T[L];
  document.documentElement.lang = L==="zh" ? "zh-CN" : "en";
  state.guide = g;
  state.answers = LS.get(draftKey(g), null) || new Array(g.steps.length).fill("");
  if(g.deck==="chart" && g.chart) state.chartType = state.chartType==="any" ? "any" : g.chart.type;
  root.dataset.view = "guide";

  const head = h("header",{class:"top"},
    h("div",{class:"brand"}, h("b",{}, "Frame ", h("span",{}, "&"), " Speak"), h("span",{class:"tag"}, t.section)));
  if(g.source==="deck"){
    const deckBtn = (k,label) => h("button",{class:"chip",type:"button","aria-pressed":String(g.deck===k),onclick:()=>redraw(k)}, label);
    const tools = h("div",{class:"row"}, deckBtn("life",t.life), deckBtn("work",t.work), deckBtn("chart",t.charts));
    if(g.deck==="chart"){
      const sel = h("select",{"aria-label":t.anyType},
        h("option",{value:"any"}, t.anyType),
        CHART_ORDER.map(k=>h("option",{value:k, selected:state.chartType===k}, `${CHART_TYPES[k][L]} · ${CHART_TYPES[k].cat[L]}`)));
      sel.value = state.chartType;
      sel.onchange = () => { state.chartType = sel.value; redraw("chart"); };
      tools.append(sel);
    }
    tools.append(h("button",{class:"btn",type:"button",onclick:()=>redraw(g.deck)}, t.drawAnother));
    head.append(tools);
  }

  const topic = h("section",{class:"panel stack"},
    h("div",{class:"topic"},
      h("div",{class:"row"}, h("span",{class:"tag"}, g.framework), g.why ? h("span",{class:"note"}, g.why) : null),
      h("div",{class:"q"}, g.topic),
      g.context ? h("div",{class:"ctx"}, g.context) : null));
  const fig = h("figure",{class:"chart",hidden:!g.chart});
  topic.append(fig);
  const rail = h("div",{class:"rail"}); topic.append(rail);
  const renderRail = () => { rail.replaceChildren(); g.steps.forEach((s,i)=>{ if(i) rail.append(h("span",{class:"arrow"},"→")); rail.append(h("span",{class:"node"+((state.answers[i]||"").trim()?" done":"")}, s.label)); }); };

  let ctxTimer = null;
  const steps = h("section",{class:"steps"}, g.steps.map((s,i)=>{
    const ta = h("textarea",{rows:"2","aria-label":s.label});
    ta.value = state.answers[i]||"";
    const wc = h("div",{class:"wc"}, countText(ta.value, L));
    const card = h("article",{class:"step"},
      h("div",{class:"step-head"}, h("span",{class:"n"}, String(i+1).padStart(2,"0")), h("h3",{}, s.label)),
      h("div",{class:"prompt"}, s.prompt),
      s.phrases?.length ? h("div",{class:"sphr"}, s.phrases.map(x=>h("span",{}, x))) : null,
      ta, wc);
    ta.addEventListener("focus",()=>{ steps.querySelectorAll(".step").forEach(x=>x.classList.remove("active")); card.classList.add("active"); });
    ta.addEventListener("input",()=>{
      state.answers[i]=ta.value; wc.textContent=countText(ta.value, L); renderRail(); LS.set(draftKey(g), state.answers);
      clearTimeout(ctxTimer); ctxTimer = setTimeout(pushContext, 1200);
    });
    return card;
  }));

  const status = h("div",{class:"status",hidden:true});
  const submit = h("button",{class:"btn primary",type:"button"}, t.submit);
  submit.onclick = () => submitAnswer(status, submit);
  const foot = h("section",{class:"panel row between"},
    h("div",{}, h("b",{}, t.sayIt), h("div",{class:"note"}, t.stuck)),
    submit, status);

  root.replaceChildren(head, topic, steps, foot);
  if(g.chart) renderChart(fig, g.chart, L);
  renderRail();
}

async function redraw(deck){
  const g = state.guide; if(!g) return;
  const args = { lang:g.lang, deck };
  if(deck==="chart") args.chart_type = state.chartType || "any";
  if(deck===g.deck) args.avoid_index = g.idx;
  root.querySelectorAll("header button, header select").forEach(b=>b.disabled=true);
  try{
    const r = await app.callServerTool({ name:"draw_topic", arguments:args });
    const ng = r?.structuredContent?.guide;
    if(ng){ state.seenByModel = false; showGuide(ng); pushContext(); }
  }catch(e){ root.querySelectorAll("header button, header select").forEach(b=>b.disabled=false); }
}

function answerBody(){
  const g = state.guide;
  return g.steps.map((s,i)=>`[${s.label}] ${(state.answers[i]||"").trim() || "(—)"}`).join("\n");
}
async function pushContext(){
  const g = state.guide; if(!g) return;
  const zh = g.lang==="zh";
  const text = (zh ? "用户当前在练习卡上：\n" : "The user is working on this practice card:\n") + guideText(g) +
    ((state.answers||[]).some(a=>(a||"").trim()) ? (zh ? "\n草稿：\n" : "\nDraft so far:\n") + answerBody() : "");
  try{ await app.updateModelContext({ content:[{ type:"text", text }] }); }catch(e){}
}
async function submitAnswer(status, btn){
  const g = state.guide, t = T[g.lang==="zh"?"zh":"en"];
  const say = (msg, kind) => { status.hidden=false; status.className="status"+(kind==="err"?" err":""); status.replaceChildren(kind==="busy"?h("span",{class:"dot"}):"", h("span",{},msg)); };
  if(!state.answers.some(a=>(a||"").trim())){ say(t.needAnswer,"err"); return; }
  let text = t.answerMsg(g, answerBody());
  if(!state.seenByModel) text += "\n\n" + t.cardNote + "\n" + guideText(g);
  btn.disabled = true;
  try{
    const r = await app.sendMessage({ role:"user", content:[{ type:"text", text }] });
    if(r?.isError) throw new Error("rejected");
    say(t.sending, "busy");
    setTimeout(()=>{ btn.disabled=false; }, 4000);
  }catch(e){
    btn.disabled = false;
    try{ await navigator.clipboard.writeText(text); say(t.sendFail,"err"); }catch(_){ say(t.sendFailNoCopy,"err"); }
  }
}

/* ---------- charts ---------- */
function niceStep(range, n){ const raw = range/n, p = Math.pow(10, Math.floor(Math.log10(raw))); const m = raw/p; return (m<=1?1:m<=2?2:m<=2.5?2.5:m<=5?5:10)*p; }
function scaleOf(lo, hi){ if(hi<=lo) hi = lo+1; const step = niceStep(hi-lo, 4); return {lo:Math.floor(lo/step)*step, hi:Math.ceil(hi/step)*step, step}; }
function roundTop(x,y,w,hgt,r){ hgt=Math.max(hgt,0); r=Math.min(r,w/2,hgt); return `M${x},${y+hgt}V${y+r}Q${x},${y} ${x+r},${y}H${x+w-r}Q${x+w},${y} ${x+w},${y+r}V${y+hgt}Z`; }
function roundBottom(x,y,w,hgt,r){ hgt=Math.max(hgt,0); r=Math.min(r,w/2,hgt); return `M${x},${y}H${x+w}V${y+hgt-r}Q${x+w},${y+hgt} ${x+w-r},${y+hgt}H${x+r}Q${x},${y+hgt} ${x},${y+hgt-r}Z`; }
function roundRight(x,y,w,hgt,r){ r=Math.min(r,hgt/2,w); return `M${x},${y}H${x+w-r}Q${x+w},${y} ${x+w},${y+r}V${y+hgt-r}Q${x+w},${y+hgt} ${x+w-r},${y+hgt}H${x}Z`; }
function roundLeft(x,y,w,hgt,r){ r=Math.min(r,hgt/2,w); return `M${x+w},${y}H${x+r}Q${x},${y} ${x},${y+r}V${y+hgt-r}Q${x},${y+hgt} ${x+r},${y+hgt}H${x+w}Z`; }
function xText(svg, x, y, label){
  const t = sv("text",{x,y,class:"ctick","text-anchor":"middle"});
  let parts = [label];
  if(label.length>11 && label.includes(" ")){ const mid = label.length/2; let best=-1; for(let i=0;i<label.length;i++) if(label[i]===" " && (best<0 || Math.abs(i-mid)<Math.abs(best-mid))) best=i; parts=[label.slice(0,best), label.slice(best+1)]; }
  parts.forEach((p,i)=>t.append(sv("tspan",{x,dy:i?14:0},p)));
  svg.append(t);
}
function yAxis(svg, sc, X0, X1, yOf, f){
  const d = sc.step%1!==0 ? 1 : 0;
  for(let v=sc.lo; v<=sc.hi+1e-9; v+=sc.step){
    svg.append(sv("line",{x1:X0,x2:X1,y1:yOf(v),y2:yOf(v),class:Math.abs(v)<1e-9?"cax":"cgrid"}));
    svg.append(sv("text",{x:X0-8,y:yOf(v)+4,class:"ctick","text-anchor":"end"}, fmtN(f, v, d)));
  }
}
const sw = i => h("i",{class:"sw",style:`background:var(--s${i})`});

function renderChart(fig, c, lang){
  fig.replaceChildren();
  const xs = xLabels(c, lang), ty = CHART_TYPES[c.type];
  const tip = h("div",{class:"ctip",hidden:true});
  const head = h("figcaption",{class:"chead"},
    ty ? h("span",{class:"ctype"}, ty[lang], " · ", ty.cat[lang]) : null,
    h("div",{class:"ctitle"}, h("b",{}, c.title[lang]), " ", h("span",{class:"note"}, c.unit[lang])));
  let legend = null;
  if(["line","bar","stacked"].includes(c.type) && c.series.length>1) legend = c.series.map((s,i)=>[i+1, s.name[lang]]);
  if(c.type==="waterfall") legend = [[3, lang==="zh"?"增加":"Increase"],[2, lang==="zh"?"减少":"Decrease"],[1, lang==="zh"?"总计":"Total"]];
  if(c.type==="diverge") legend = [[1, lang==="zh"?"高于":"Above"],[2, lang==="zh"?"低于":"Below"]];
  if(legend) head.append(h("div",{class:"legend"}, legend.map(([k,name])=>h("span",{}, sw(k), name))));
  fig.append(head);
  const box = h("div",{class:"cbox"}); fig.append(box);
  const showTip = (evt, rows) => { tip.hidden=false; tip.replaceChildren(...rows); const r=box.getBoundingClientRect(); let x=evt.clientX-r.left+14, y=evt.clientY-r.top+14; if(x>r.width-170) x-=190; tip.style.left=x+"px"; tip.style.top=y+"px"; };
  const hideTip = () => { tip.hidden=true; };
  const hit = (el, rows) => { el.addEventListener("mousemove",e=>showTip(e,rows)); el.addEventListener("mouseleave",hideTip); };
  const tipRows = i => [h("div",{class:"tt"}, xs[i]), ...c.series.map((s,k)=>h("div",{}, c.series.length>1?sw(k+1):null, c.series.length>1? s.name[lang]+"  ":"", h("b",{}, fmtV(c,s.values[i]))))];
  const W = 640;
  let svg;

  if(c.type==="hbar"){
    const s = c.series[0], max = Math.max(...s.values), rowH = 46, H = xs.length*rowH;
    svg = sv("svg",{viewBox:`0 0 ${W} ${H}`});
    xs.forEach((lab,i)=>{
      const y = i*rowH, w = Math.max(2, (s.values[i]/max)*(W-90));
      svg.append(sv("text",{x:0,y:y+14,class:"cl"}, lab));
      svg.append(sv("path",{d:roundRight(0,y+20,w,16,4),fill:"var(--s1)"}));
      svg.append(sv("text",{x:w+8,y:y+33,class:"cv"}, fmtV(c,s.values[i])));
      const r = sv("rect",{x:0,y,width:W,height:rowH,fill:"transparent"}); hit(r, tipRows(i)); svg.append(r);
    });
  }
  else if(c.type==="funnel"){
    const v = c.series[0].values, max = v[0], rowH = 58, H = xs.length*rowH;
    svg = sv("svg",{viewBox:`0 0 ${W} ${H}`});
    xs.forEach((lab,i)=>{
      const y = i*rowH, w = Math.max(4, v[i]/max*W), x = (W-w)/2;
      const lt = sv("text",{x:0,y:y+15,class:"cl"}, lab + "  "); lt.append(sv("tspan",{class:"cv"}, fmtV(c,v[i]))); svg.append(lt);
      if(i){ const conv = v[i]/v[i-1]*100; svg.append(sv("text",{x:W,y:y+15,class:"cann","text-anchor":"end"}, (lang==="zh"?"上一步的 ":"") + conv.toFixed(conv<10?1:0) + "%" + (lang==="zh"?"":" of previous"))); }
      svg.append(sv("path",{d:`M${x+4},${y+24}H${x+w-4}Q${x+w},${y+24} ${x+w},${y+28}V${y+42}Q${x+w},${y+46} ${x+w-4},${y+46}H${x+4}Q${x},${y+46} ${x},${y+42}V${y+28}Q${x},${y+24} ${x+4},${y+24}Z`,fill:"var(--s1)"}));
      const r = sv("rect",{x:0,y,width:W,height:rowH,fill:"transparent"});
      hit(r, [h("div",{class:"tt"}, lab), h("div",{}, h("b",{}, fmtV(c,v[i]))), i ? h("div",{}, `${(v[i]/v[i-1]*100).toFixed(1)}% ${lang==="zh"?"转化自上一步":"of previous step"}`) : null].filter(Boolean));
      svg.append(r);
    });
  }
  else if(c.type==="diverge"){
    const v = c.series[0].values, maxAbs = Math.max(...v.map(Math.abs)), rowH = 46, H = xs.length*rowH, mid = W/2, half = W/2-80;
    svg = sv("svg",{viewBox:`0 0 ${W} ${H}`});
    svg.append(sv("line",{x1:mid,x2:mid,y1:0,y2:H,class:"cax"}));
    xs.forEach((lab,i)=>{
      const y = i*rowH, w = Math.max(2, Math.abs(v[i])/maxAbs*half), pos = v[i]>=0;
      svg.append(sv("text",{x:pos?mid-8:mid+8,y:y+33,class:"cl","text-anchor":pos?"end":"start"}, lab));
      svg.append(sv("path",{d:pos?roundRight(mid,y+20,w,16,4):roundLeft(mid-w,y+20,w,16,4),fill:pos?"var(--s1)":"var(--s2)"}));
      svg.append(sv("text",{x:pos?mid+w+8:mid-w-8,y:y+33,class:"cv","text-anchor":pos?"start":"end"}, fmtS(c,v[i])));
      const r = sv("rect",{x:0,y,width:W,height:rowH,fill:"transparent"}); hit(r, [h("div",{class:"tt"}, lab), h("b",{}, fmtS(c,v[i]))]); svg.append(r);
    });
  }
  else if(c.type==="donut"){
    const v = c.series[0].values, total = v.reduce((a,b)=>a+b,0), R = 100, r0 = 62, C = 120;
    svg = sv("svg",{viewBox:"0 0 240 240",class:"donut"});
    let a = -Math.PI/2;
    v.forEach((val,i)=>{
      const a2 = a + val/total*Math.PI*2, large = a2-a > Math.PI ? 1 : 0;
      const p = (rad, ang) => `${C+rad*Math.cos(ang)},${C+rad*Math.sin(ang)}`;
      const path = sv("path",{d:`M${p(R,a)}A${R},${R} 0 ${large} 1 ${p(R,a2)}L${p(r0,a2)}A${r0},${r0} 0 ${large} 0 ${p(r0,a)}Z`,fill:`var(--s${i+1})`,stroke:"var(--surface)","stroke-width":2});
      hit(path, [h("div",{class:"tt"}, xs[i]), h("b",{}, fmtV(c,val))]);
      svg.append(path); a = a2;
    });
    const top = v.indexOf(Math.max(...v));
    svg.append(sv("text",{x:C,y:C+4,class:"cbig","text-anchor":"middle"}, fmtV(c,v[top])));
    svg.append(sv("text",{x:C,y:C+24,class:"cann","text-anchor":"middle"}, xs[top]));
    const list = h("ul",{class:"dlist"}, xs.map((lab,i)=>h("li",{}, sw(i+1), h("span",{}, lab), h("b",{}, fmtV(c,v[i])))));
    box.classList.add("dwrap"); box.append(svg, list, tip);
    svg = null;
  }
  else if(c.type==="heatmap"){
    const rows = c.rows[lang], labW = 64, headH = 24, cellH = 36, cellW = (W-labW)/xs.length, H = headH + rows.length*cellH;
    const vals = allVals(c), mn = Math.min(...vals), mx = Math.max(...vals);
    svg = sv("svg",{viewBox:`0 0 ${W} ${H}`});
    xs.forEach((x,j)=>svg.append(sv("text",{x:labW+j*cellW+cellW/2,y:16,class:"ctick","text-anchor":"middle"}, x)));
    rows.forEach((rl,i)=>{
      svg.append(sv("text",{x:0,y:headH+i*cellH+cellH/2+4,class:"cl"}, rl));
      xs.forEach((x,j)=>{
        const val = c.grid[i][j], X = labW+j*cellW, Y = headH+i*cellH;
        if(val==null){ svg.append(sv("text",{x:X+cellW/2,y:Y+cellH/2+4,class:"ctick","text-anchor":"middle"},"–")); return; }
        const pct = Math.round(12 + 80*(val-mn)/(mx-mn||1));
        const cell = sv("rect",{x:X+1,y:Y+1,width:cellW-2,height:cellH-2,rx:3});
        cell.style.fill = `color-mix(in oklab, var(--s1) ${pct}%, var(--surface-2))`;
        svg.append(cell);
        const tx = sv("text",{x:X+cellW/2,y:Y+cellH/2+4,class:"cv sm","text-anchor":"middle"}, fmtV(c,val));
        tx.style.fill = pct>55 ? "#fff" : "var(--ink)"; svg.append(tx);
        hit(cell, [h("div",{class:"tt"}, `${rl} · ${x}`), h("b",{}, fmtV(c,val))]);
      });
    });
  }
  else if(c.type==="scatter"){
    const H = 300, m = {l:52,r:20,t:24,b:44}, X0=m.l, X1=W-m.r, Y0=H-m.b, Y1=m.t;
    const sx = scaleOf(0, Math.max(...c.points.map(p=>p[1]))), sy = scaleOf(0, Math.max(...c.points.map(p=>p[2])));
    const xOf = v => X0 + (v-sx.lo)/(sx.hi-sx.lo)*(X1-X0), yOf = v => Y0 - (v-sy.lo)/(sy.hi-sy.lo)*(Y0-Y1);
    svg = sv("svg",{viewBox:`0 0 ${W} ${H}`});
    yAxis(svg, sy, X0, X1, yOf, c.fmt);
    for(let v=sx.lo; v<=sx.hi+1e-9; v+=sx.step){ svg.append(sv("line",{x1:xOf(v),x2:xOf(v),y1:Y1,y2:Y0,class:"cgrid"})); svg.append(sv("text",{x:xOf(v),y:Y0+18,class:"ctick","text-anchor":"middle"}, fmtN(c.fmtX,v,0))); }
    svg.append(sv("text",{x:(X0+X1)/2,y:H-4,class:"cann","text-anchor":"middle"}, c.axes.x[lang] + " →"));
    svg.append(sv("text",{x:X0-44,y:12,class:"cann"}, "↑ " + c.axes.y[lang]));
    const n = c.points.length, mxv = c.points.reduce((a,p)=>a+p[1],0)/n, myv = c.points.reduce((a,p)=>a+p[2],0)/n;
    const b = c.points.reduce((a,p)=>a+(p[1]-mxv)*(p[2]-myv),0) / c.points.reduce((a,p)=>a+(p[1]-mxv)**2,0), a0 = myv - b*mxv;
    const xa = Math.min(...c.points.map(p=>p[1])), xb = Math.max(...c.points.map(p=>p[1]));
    svg.append(sv("line",{x1:xOf(xa),y1:yOf(a0+b*xa),x2:xOf(xb),y2:yOf(a0+b*xb),class:"cref"}));
    svg.append(sv("text",{x:xOf(xa),y:yOf(a0+b*xa)+18,class:"cann"}, lang==="zh"?"趋势线":"trend"));
    c.points.forEach(([name,x,y,lab])=>{
      svg.append(sv("circle",{cx:xOf(x),cy:yOf(y),r:5,fill:"var(--s1)",stroke:"var(--surface)","stroke-width":2}));
      if(lab) svg.append(sv("text",{x:xOf(x)+(xOf(x)>X1-120?-9:9),y:yOf(y)-8,class:"cv sm lbl","text-anchor":xOf(x)>X1-120?"end":"start"}, name));
      const r = sv("circle",{cx:xOf(x),cy:yOf(y),r:12,fill:"transparent"});
      hit(r, [h("div",{class:"tt"}, name), h("div",{}, `${c.axes.x[lang]}: `, h("b",{}, fmtN(c.fmtX,x,0))), h("div",{}, `${c.axes.y[lang]}: `, h("b",{}, fmtN(c.fmt,y,0)))]);
      svg.append(r);
    });
  }
  else {
    /* vertical charts: line, bar, stacked, hist, waterfall */
    const long = ["bar","stacked","hist","waterfall"].includes(c.type) && xs.some(x=>x.length>11 && x.includes(" "));
    const H = 280 + (long?14:0), m = {l:52,r:c.type==="line"?56:12,t:18,b:long?44:30};
    const X0=m.l, X1=W-m.r, Y0=H-m.b, Y1=m.t, n = xs.length;
    let sc;
    if(c.type==="stacked") sc = scaleOf(0, Math.max(...xs.map((_,i)=>c.series.reduce((a,s)=>a+s.values[i],0))));
    else if(c.type==="waterfall"){ let run=0, hi=0; const tot=new Set(c.totals); c.series[0].values.forEach((v,i)=>{ run = tot.has(i) ? v : run+v; hi=Math.max(hi,run); }); sc = scaleOf(0, hi); }
    else sc = scaleOf(c.type==="line" ? (c.min ?? 0) : 0, Math.max(...allVals(c).concat(c.ref?[c.ref.value]:[])));
    const yOf = v => Y0 - (v-sc.lo)/(sc.hi-sc.lo)*(Y0-Y1);
    svg = sv("svg",{viewBox:`0 0 ${W} ${H}`});
    yAxis(svg, sc, X0, X1, yOf, c.fmt);
    const labY = H - (long?22:8);
    if(c.type==="line"){
      const xOf = i => X0 + 4 + (n===1?0:(i/(n-1))*(X1-X0-8));
      const every = n>8 && box.clientWidth && box.clientWidth<520 ? 2 : 1;
      xs.forEach((lab,i)=>{ if(i%every===0 || i===n-1) svg.append(sv("text",{x:xOf(i),y:labY,class:"ctick","text-anchor":"middle"}, lab)); });
      if(c.mark){ const x=xOf(c.mark.at); svg.append(sv("line",{x1:x,x2:x,y1:Y1,y2:Y0,class:"cmark"})); svg.append(sv("text",{x:x+6,y:Y1+12,class:"cann"}, c.mark.label[lang])); }
      if(c.ref){ const y=yOf(c.ref.value); svg.append(sv("line",{x1:X0,x2:X1,y1:y,y2:y,class:"cref"})); svg.append(sv("text",{x:X0+6,y:y-6,class:"cann"}, c.ref.label[lang])); }
      c.series.forEach((s,k)=>{
        svg.append(sv("path",{d:s.values.map((v,i)=>`${i?"L":"M"}${xOf(i)},${yOf(v)}`).join(""),fill:"none",stroke:`var(--s${k+1})`,"stroke-width":2,"stroke-linejoin":"round","stroke-linecap":"round"}));
        const li=n-1; svg.append(sv("circle",{cx:xOf(li),cy:yOf(s.values[li]),r:4,fill:`var(--s${k+1})`,stroke:"var(--surface)","stroke-width":2}));
        svg.append(sv("text",{x:xOf(li)+8,y:yOf(s.values[li])+4,class:"cv"}, fmtV(c,s.values[li])));
      });
      const cross = sv("line",{class:"ccross",y1:Y1,y2:Y0,visibility:"hidden"}); svg.append(cross);
      const colW = (X1-X0)/(n-1||1);
      xs.forEach((_,i)=>{
        const r = sv("rect",{x:xOf(i)-colW/2,y:Y1,width:colW,height:Y0-Y1,fill:"transparent"});
        r.addEventListener("mousemove",e=>{ cross.setAttribute("x1",xOf(i)); cross.setAttribute("x2",xOf(i)); cross.setAttribute("visibility","visible"); showTip(e,tipRows(i)); });
        r.addEventListener("mouseleave",()=>{ cross.setAttribute("visibility","hidden"); hideTip(); });
        svg.append(r);
      });
    } else {
      const gw = (X1-X0)/n;
      xs.forEach((lab,i)=>xText(svg, X0+i*gw+gw/2, labY, lab));
      if(c.type==="bar"){
        const k = c.series.length, gap = 2, bw = Math.min(40, (gw*0.7 - gap*(k-1))/k);
        xs.forEach((_,i)=>{
          const gx = X0 + i*gw + (gw - (bw*k + gap*(k-1)))/2;
          c.series.forEach((s,j)=>{
            const v=s.values[i], x=gx+j*(bw+gap), y=yOf(v);
            svg.append(sv("path",{d:roundTop(x,y,bw,Y0-y,4),fill:`var(--s${j+1})`}));
            if(k<=2) svg.append(sv("text",{x:x+bw/2,y:y-5,class:"cv sm","text-anchor":"middle"}, fmtV(c,v)));
          });
        });
      } else if(c.type==="hist"){
        const v = c.series[0].values;
        xs.forEach((_,i)=>{ const x = X0+i*gw+1, y = yOf(v[i]); svg.append(sv("path",{d:roundTop(x,y,gw-2,Y0-y,4),fill:"var(--s1)"})); svg.append(sv("text",{x:x+gw/2-1,y:y-5,class:"cv sm","text-anchor":"middle"}, fmtV(c,v[i]))); });
      } else if(c.type==="stacked"){
        const bw = Math.min(56, gw*0.6);
        xs.forEach((_,i)=>{
          const x = X0+i*gw+(gw-bw)/2; let base = 0;
          c.series.forEach((s,j)=>{
            const top = base + s.values[i], yT = yOf(top), yB = yOf(base), last = j===c.series.length-1;
            const gapTop = last ? 0 : 2;
            svg.append(sv("path",{d: last ? roundTop(x,yT,bw,yB-yT,4) : `M${x},${yT+gapTop}H${x+bw}V${yB}H${x}Z`, fill:`var(--s${j+1})`}));
            base = top;
          });
          svg.append(sv("text",{x:x+bw/2,y:yOf(base)-6,class:"cv sm","text-anchor":"middle"}, fmtV(c,base)));
        });
      } else if(c.type==="waterfall"){
        const v = c.series[0].values, tot = new Set(c.totals), bw = Math.min(56, gw*0.62); let run = 0, prevTop = null;
        xs.forEach((_,i)=>{
          const x = X0+i*gw+(gw-bw)/2; let a, b, fill;
          if(tot.has(i)){ a=0; b=v[i]; run=v[i]; fill="var(--s1)"; }
          else { a=run; b=run+v[i]; run=b; fill = v[i]>=0 ? "var(--s3)" : "var(--s2)"; }
          const yT = yOf(Math.max(a,b)), yB = yOf(Math.min(a,b));
          svg.append(sv("path",{d: (tot.has(i)||v[i]>=0) ? roundTop(x,yT,bw,Math.max(yB-yT,2),3) : roundBottom(x,yT,bw,Math.max(yB-yT,2),3), fill}));
          if(prevTop!=null) svg.append(sv("line",{x1:prevTop.x,x2:x,y1:prevTop.y,y2:prevTop.y,class:"cmark"}));
          prevTop = {x:x+bw, y:yOf(run)};
          svg.append(sv("text",{x:x+bw/2,y:yT-6,class:"cv sm","text-anchor":"middle"}, tot.has(i)?fmtV(c,v[i]):fmtS(c,v[i])));
        });
      }
      xs.forEach((lab,i)=>{
        const r = sv("rect",{x:X0+i*gw,y:Y1,width:gw,height:Y0-Y1,fill:"transparent"});
        if(c.type==="waterfall"){ const tot=new Set(c.totals); hit(r,[h("div",{class:"tt"},lab), h("b",{}, tot.has(i)?fmtV(c,c.series[0].values[i]):fmtS(c,c.series[0].values[i]))]); }
        else if(c.type==="stacked") hit(r, [...tipRows(i), h("div",{class:"tt"}, (lang==="zh"?"合计 ":"Total ") + fmtV(c, c.series.reduce((a,s)=>a+s.values[i],0)))]);
        else hit(r, tipRows(i));
        svg.append(r);
      });
    }
  }
  if(svg){ svg.setAttribute("role","img"); svg.setAttribute("aria-label", c.title[lang]); box.append(svg, tip); }

  /* data table */
  let thead, rowsData;
  if(c.type==="scatter"){ thead = ["", c.axes.x[lang], c.axes.y[lang]]; rowsData = c.points.map(p=>[p[0], fmtN(c.fmtX,p[1],0), fmtN(c.fmt,p[2],0)]); }
  else if(c.type==="heatmap"){ thead = ["", ...xs]; rowsData = c.rows[lang].map((r,i)=>[r, ...c.grid[i].map(v=>v==null?"–":fmtV(c,v))]); }
  else if(c.type==="waterfall"){ const tot=new Set(c.totals); thead=["", c.series[0].name[lang]]; rowsData = xs.map((x,i)=>[x, tot.has(i)?fmtV(c,c.series[0].values[i]):fmtS(c,c.series[0].values[i])]); }
  else { thead = ["", ...c.series.map(s=>s.name[lang])]; rowsData = xs.map((x,i)=>[x, ...c.series.map(s=>c.type==="diverge"?fmtS(c,s.values[i]):fmtV(c,s.values[i]))]); }
  const table = h("table",{class:"ctable"}, h("thead",{}, h("tr",{}, thead.map(t=>h("th",{}, t)))), h("tbody",{}, rowsData.map(r=>h("tr",{}, r.map(v=>h("td",{}, v))))));
  if(ty) fig.append(h("p",{class:"ctip-read"}, h("b",{}, T[lang].talk), ty.tip[lang]));
  fig.append(h("details",{class:"cdata"}, h("summary",{}, T[lang].showData), h("div",{class:"tscroll"}, table)));
}

/* ---------- speech ---------- */
let rate = LS.get("fs.rate", 1);
let playToken = 0, curLang = "en";
const canSpeak = (() => { try{ return "speechSynthesis" in window && typeof SpeechSynthesisUtterance==="function"; }catch(e){ return false; } })();
const plain = s => String(s).replace(/‿/g," ").replace(/\s\/\s?/g,", ").replace(/\*+/g,"").replace(/\s+/g," ").replace(/,\s*([,.!?。，！？])/g,"$1").trim();
function pickVoice(lang){
  try{
    const vs = speechSynthesis.getVoices(); const want = lang==="zh" ? /^zh(-|_)?(CN|Hans)?/i : /^en(-|_)US/i;
    const pool = vs.filter(v=>want.test(v.lang)); const fallback = vs.filter(v=>v.lang.toLowerCase().startsWith(lang));
    const list = pool.length ? pool : fallback;
    return list.find(v=>/Samantha|Ava|Allison|Google US|Tingting|Meijia|Google 普通话/i.test(v.name)) || list.find(v=>v.localService) || list[0] || null;
  }catch(e){ return null; }
}
try{ if(canSpeak){ speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = ()=>{}; } }catch(e){}
function stopSpeech(){
  playToken++; try{ if(canSpeak) speechSynthesis.cancel(); }catch(e){}
  document.querySelectorAll(".sent.playing").forEach(x=>x.classList.remove("playing"));
  const pa = document.getElementById("playAllBtn"); if(pa) pa.textContent = T[curLang].playAll;
}
function sayOne(text, lang){
  return new Promise(res=>{
    try{
      const u = new SpeechSynthesisUtterance(text); u.lang = lang==="zh"?"zh-CN":"en-US"; u.rate = rate;
      const v = pickVoice(lang); if(v) u.voice = v;
      u.onend = res; u.onerror = res; speechSynthesis.speak(u);
    }catch(e){ res(); }
  });
}
async function playSentences(rows, from, to){
  stopSpeech(); const my = ++playToken, lang = curLang;
  if(to-from>1){ const pa=document.getElementById("playAllBtn"); if(pa) pa.textContent=T[lang].stop; }
  for(let i=from;i<to;i++){
    if(my!==playToken) return;
    rows[i].el.classList.add("playing");
    await sayOne(rows[i].text, lang);
    rows[i].el.classList.remove("playing");
  }
  if(my===playToken){ const pa=document.getElementById("playAllBtn"); if(pa) pa.textContent=T[lang].playAll; }
}
function markedNode(s){
  const span = h("span",{class:"txt"});
  String(s).split(/(\*[^*]+\*|‿|\s\/\s?)/g).forEach(part=>{
    if(!part) return;
    if(part==="‿") span.append(h("span",{class:"lk","aria-hidden":"true"},"‿"));
    else if(/^\s\/\s?$/.test(part)) span.append(h("span",{class:"ps","aria-hidden":"true"}," / "));
    else if(/^\*[^*]+\*$/.test(part)) span.append(h("strong",{class:"st"}, part.slice(1,-1)));
    else span.append(part);
  });
  return span;
}

/* ---------- feedback ---------- */
function showFeedback(f){
  stopSpeech();
  const L = f.lang==="zh" ? "zh" : "en", t = T[L]; curLang = L;
  document.documentElement.lang = L==="zh" ? "zh-CN" : "en";
  root.dataset.view = "feedback";
  const p = h("section",{class:"panel stack"});
  const sc = f.scores||{}; const keys = ["structure","clarity","vocabulary","naturalness"];
  p.append(h("div",{class:"row between"},
    h("div",{class:"brand"}, h("b",{}, "Frame ", h("span",{}, "&"), " Speak"), h("span",{class:"tag"}, t.section)),
    h("span",{class:"label"}, f.framework||"")));
  p.append(h("div",{}, h("h2",{}, t.feedback), f.topic ? h("div",{class:"note"}, f.topic) : null));
  p.append(h("div",{class:"scores"}, keys.map((k,i)=>{
    const v = Math.max(0,Math.min(5,Number(sc[k])||0));
    return h("div",{class:"score"}, h("div",{class:"label"}, t.dims[i]), h("div",{class:"v"}, v, h("small",{}," / 5")), h("div",{class:"bar"}, h("i",{style:`width:${v*20}%`})));
  })));
  if(f.summary) p.append(h("p",{style:"margin:0"}, f.summary));

  const strengths = (f.strengths||[]).map(String).filter(Boolean);
  if(strengths.length) p.append(h("div",{class:"fb-sec"}, h("h3",{}, t.worked), h("ul",{class:"clean"}, strengths.map(s=>h("li",{}, "✓ ", s)))));
  if(f.fixes?.length) p.append(h("div",{class:"fb-sec"}, h("h3",{}, t.better),
    h("ul",{class:"clean"}, f.fixes.map(x=>h("li",{class:"fix"}, h("span",{class:"old"}, x.original), h("span",{class:"new"}, "→ ", x.better), x.why?h("small",{}, x.why):null)))));
  if(f.translations?.length) p.append(h("div",{class:"fb-sec"}, h("h3",{}, t.translations),
    h("ul",{class:"clean"}, f.translations.map(x=>h("li",{class:"fix"}, h("span",{}, x.from), h("span",{class:"new"}, "→ ", x.to))))));
  if(f.polished){
    const pol = h("div",{class:"polished"});
    String(f.polished).split(/\*\*(.+?)\*\*/g).forEach((part,i)=> pol.append(i%2? h("mark",{},part) : part));
    p.append(h("div",{class:"fb-sec"}, h("h3",{}, t.polished), pol));
  }

  const speech = (Array.isArray(f.speech)?f.speech:[]).map(String).filter(s=>s.trim());
  if(speech.length){
    const rows = []; const script = h("div",{class:"script"});
    speech.forEach((s,i)=>{
      const btn = h("button",{class:"play",type:"button","aria-label":`${t.listen} ${i+1}`, disabled:!canSpeak},"▶");
      const el = h("div",{class:"sent"}, btn, markedNode(s));
      rows.push({el, text:plain(s)});
      btn.onclick = ()=>playSentences(rows, i, i+1);
      script.append(el);
    });
    const playAll = h("button",{class:"btn primary",type:"button",id:"playAllBtn",disabled:!canSpeak}, t.playAll);
    playAll.onclick = ()=>{ if(playAll.textContent===t.stop) stopSpeech(); else playSentences(rows, 0, rows.length); };
    const speedSeg = h("div",{class:"seg",role:"group","aria-label":t.speed});
    [0.75,0.9,1].forEach(r=>{
      const b = h("button",{type:"button","aria-pressed":String(rate===r)}, r+"×");
      b.onclick = ()=>{ rate=r; LS.set("fs.rate",r); speedSeg.querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed", String(x===b))); };
      speedSeg.append(b);
    });
    p.append(h("div",{class:"fb-sec"},
      h("div",{class:"row between"}, h("h3",{}, t.readAloud), h("div",{class:"row"}, h("span",{class:"label"}, t.speed), speedSeg, playAll)),
      h("div",{class:"legend"}, t.legend.map(([sym,desc])=>h("span",{}, sym==="‿"?h("b",{style:"color:var(--link)"},"‿"):sym==="/"?h("b",{},"/"):h("strong",{class:"st"},sym), " ", desc))),
      script,
      h("div",{class:"note"}, canSpeak ? t.shadow : t.noVoice)));
  }

  if(f.vocab?.length){
    p.append(h("div",{class:"fb-sec"}, h("h3",{}, t.words),
      h("div",{class:"vocab"}, f.vocab.map(v=>{
        const lis = canSpeak ? h("button",{type:"button"}, "▶ "+t.listen) : null;
        if(lis) lis.onclick = ()=>{ stopSpeech(); sayOne(`${v.word}. ${v.example||""}`, L); };
        return h("div",{class:"word"}, h("div",{class:"w"}, v.word, " ", h("span",{class:"label"}, v.pos||"")),
          h("div",{class:"m"}, v.meaning||""), v.example ? h("div",{class:"ex"}, v.example) : null,
          lis ? h("div",{class:"acts"}, lis) : null);
      }))));
  }
  if(f.next) p.append(h("div",{class:"fb-sec"}, h("h3",{}, t.next), h("p",{style:"margin:0"}, f.next)));
  const again = h("button",{class:"btn",type:"button"}, t.newTopic);
  again.onclick = async ()=>{ again.disabled = true; try{ await app.sendMessage({ role:"user", content:[{ type:"text", text:t.newTopicMsg }] }); }catch(e){ again.disabled = false; } };
  p.append(h("div",{class:"row"}, again));
  root.replaceChildren(p);
}

/* ---------- start ---------- */
showLoading();
app.connect().then(()=>{
  const ctx = app.getHostContext();
  if(ctx?.theme) applyDocumentTheme(ctx.theme);
}).catch(()=>{});

/* Local preview page (scripts/build-view.mjs writes dist/demo.html) drives the card through this hook. */
if(/[?&]demo\b/.test(location.search)) window.__fs = { showGuide, showFeedback };
