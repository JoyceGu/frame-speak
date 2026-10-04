// Pure helpers shared by the server (worker.js) and the view (view/main.js). No DOM here.
import { FRAMEWORKS, FW_PH, DECK, CHART_TYPES, DATA_STEP_PH, MONTHS } from "./data.js";

export function guideFromDeck(lang, deck, idx){
  const row = DECK[deck][idx]; const F = FRAMEWORKS[row[2]][lang];
  return {source:"deck", fw:row[2], deck, idx, lang, topic: lang==="en"?row[0]:row[1], context:"", framework:F.name, why:F.use,
    steps:F.steps.map(([label,prompt],k)=>({label,prompt,phrases: row[2]==="DATA" && row[3] ? (DATA_STEP_PH[lang][k] || CHART_TYPES[row[3].type]?.ph[lang] || []) : (FW_PH[row[2]]?.[lang]?.[k] || [])})),
    chart: row[3]||null};
}

export function deckPool(deck, chartType){
  return DECK[deck].map((_,i)=>i).filter(i=>deck!=="chart" || !chartType || chartType==="any" || DECK.chart[i][3].type===chartType);
}

export function drawIndex(deck, chartType, avoid){
  const pool = deckPool(deck, chartType);
  if(!pool.length) return null;
  let i, tries = 0;
  do{ i = pool[Math.floor(Math.random()*pool.length)]; }while(pool.length>1 && i===avoid && ++tries<20);
  return i;
}

export function xLabels(c, lang){
  if(c.x==="months") return MONTHS[lang];
  if(c.x==="months6") return MONTHS[lang].slice(0,6);
  if(typeof c.x==="string" && c.x.startsWith("weeks")) return Array.from({length:+c.x.slice(5)},(_,i)=> lang==="zh" ? `第${i+1}周` : `W${i+1}`);
  if(!c.x) return [];
  return Array.isArray(c.x) ? c.x : c.x[lang];
}
export function allVals(c){
  if(c.points) return c.points.map(p=>p[2]);
  if(c.grid) return c.grid.flat().filter(v=>v!=null);
  return c.series.flatMap(s=>s.values);
}
export const decOf = (c, vals) => (vals||allVals(c)).some(v=>v%1!==0) ? 1 : 0;
export const fmtN = (f, v, d) => (f?.pre||"") + Number(v).toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d}) + (f?.suf||"");
export const fmtV = (c,v) => fmtN(c.fmt, v, decOf(c));
export const fmtS = (c,v) => (v>0?"+":v<0?"−":"") + fmtN(c.fmt, Math.abs(v), decOf(c));

export function chartText(c, lang){
  const ty = CHART_TYPES[c.type];
  let out = `${c.title[lang]} (${ty ? ty[lang]+", " : ""}${c.unit[lang]})\n`;
  const xs = xLabels(c, lang);
  if(c.type==="scatter"){
    out += `x = ${c.axes.x[lang]}, y = ${c.axes.y[lang]}\n` + c.points.map(p=>`${p[0]}: x ${fmtN(c.fmtX,p[1],0)}, y ${fmtN(c.fmt,p[2],0)}`).join("; ") + "\n";
  } else if(c.type==="heatmap"){
    c.rows[lang].forEach((r,i)=>{ out += `${r}: ` + xs.map((x,j)=>`${x} ${c.grid[i][j]==null?"n/a":fmtV(c,c.grid[i][j])}`).join(", ") + "\n"; });
  } else if(c.type==="waterfall"){
    const tot = new Set(c.totals); out += xs.map((x,i)=>`${x} ${tot.has(i)?fmtV(c,c.series[0].values[i]):fmtS(c,c.series[0].values[i])}`).join(", ") + "\n";
  } else {
    c.series.forEach(s=>{ out += `${s.name[lang]}: ` + xs.map((x,i)=>`${x} ${c.type==="diverge"?fmtS(c,s.values[i]):fmtV(c,s.values[i])}`).join(", ") + "\n"; });
  }
  if(c.ref) out += `${c.ref.label[lang]}\n`;
  if(c.mark) out += `${c.mark.label[lang]}: ${xs[c.mark.at]}\n`;
  return out;
}

/* Plain-text version of a guide, for the model's side of the conversation. */
export function guideText(g){
  const zh = g.lang==="zh";
  let out = `${zh?"题目":"Topic"}: ${g.topic}\n`;
  if(g.context) out += `${zh?"场景":"Setting"}: ${g.context}\n`;
  out += `${zh?"框架":"Framework"}: ${g.framework}${g.why?` (${g.why})`:""}\n`;
  g.steps.forEach((s,i)=>{ out += `${i+1}. ${s.label}: ${s.prompt}${s.phrases?.length?`  [${s.phrases.join(" | ")}]`:""}\n`; });
  if(g.chart) out += `\n${zh?"图表数据":"Chart data"}:\n${chartText(g.chart, g.lang)}${zh?"怎么讲这类图":"How to talk about this chart type"}: ${CHART_TYPES[g.chart.type]?.tip[g.lang]||""}\n`;
  return out;
}
