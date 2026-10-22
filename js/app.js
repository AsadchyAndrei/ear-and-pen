// Ear & Pen — the whole app: dictation, translation, progress, voice, phone layout, install, sync.
import { PROMPTS, JSON_TASKS } from "../prompts.js";
import { API_URL, FIREBASE } from "../config.js";
import { merge, same } from "./merge.js";
{
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const store = {
  get(k, d){ try{ const v = localStorage.getItem("ep:"+k); return v ? JSON.parse(v) : d; }catch{ return d; } },
  set(k, v){ try{ localStorage.setItem("ep:"+k, JSON.stringify(v)); }catch{} }
};

/* ---------- Claude ---------- */
// Inside claude.ai the page talks to Claude directly; on the public site it goes through the Worker (config.js).
const inClaude = !!(window.claude && window.claude.use);
const sampleP = inClaude ? window.claude.use("sample").catch(() => null) : Promise.resolve(null);
const errCopy = e => ({
  not_granted:"Доступ к Claude не разрешён для этой страницы.", sampling_disabled:"Claude недоступен для этого аккаунта.",
  rate_limited:"Слишком много запросов. Подождите минуту и попробуйте снова.", session_expired:"Сессия истекла — войдите в Claude заново.",
  invalid_json:"Ответ пришёл в неожиданном виде. Нажмите ещё раз.", refused:"Claude не стал отвечать на этот запрос. Измените текст.",
  not_configured:"Сервер Claude ещё не настроен (нет ключа API).", no_credit:"На балансе Anthropic API закончились деньги — пополните его в консоли Anthropic (Billing).", bad_key:"Сервер не принял ключ Anthropic API — проверьте ключ в настройках Cloudflare.", network:"Нет связи с сервером. Проверьте интернет и попробуйте снова.",
  sign_in_required:"Проверка и разбор от Claude доступны после входа. Нажмите «Войти» вверху страницы.",
  not_allowed:"У этого аккаунта пока нет доступа к Claude. Встроенные диалоги и сверка с эталоном работают и без него.",
  daily_limit:"Дневной лимит на сегодня исчерпан. Продолжим завтра.",
  token_expired:"Вход устарел. Выйдите и войдите снова.", bad_token:"Вход не подтвердился. Выйдите и войдите снова.",
  auth_unavailable:"Не удалось проверить вход. Попробуйте через минуту.", access_not_configured:"Доступ к Claude ещё настраивается.",
}[e && e.code] || "Не удалось получить ответ. Попробуйте ещё раз.");
const NO_AI = "Функции Claude ещё не подключены на этом сайте.";
// The sign-in token goes with every paid request; the server checks it and the list of allowed emails.
async function authHeaders(force = false){
  try{
    if(cloud && user && cloud.token){ const t = await cloud.token(force); if(t) return { Authorization: "Bearer " + t }; }
  }catch{}
  return {};
}
// ai(task, params, {onText, signal}) → parsed JSON for JSON tasks, text otherwise
async function ai(task, params, opts = {}){
  const prompt = PROMPTS[task](params);
  const s = await sampleP;
  if(s){
    if(JSON_TASKS.includes(task)) return s.json(prompt, { cache:false, signal: opts.signal });
    const r = await s(prompt, { cache:false, signal: opts.signal, onText: opts.onText });
    return r.text;
  }
  if(!API_URL) throw {code:"unavailable"};
  const call = async force => {
    try{
      return await fetch(API_URL, { method:"POST", headers:{"Content-Type":"application/json", ...(await authHeaders(force))}, body: JSON.stringify({task, params}), signal: opts.signal });
    }catch(err){
      throw {code: err && err.name === "AbortError" ? "cancelled" : "network"};
    }
  };
  let res = await call(false);
  let body = await res.json().catch(() => ({}));
  if(body.error === "token_expired"){ res = await call(true); body = await res.json().catch(() => ({})); }
  if(!res.ok){
    if(body.error === "sign_in_required" && cloud) setTimeout(() => $("#acctBtn").click(), 0);
    throw {code: body.error || "upstream_error"};
  }
  if(JSON_TASKS.includes(task)) return body.data;
  opts.onText?.({text: body.text});
  return body.text;
}

/* ---------- prefs ---------- */
const state = {
  level: store.get("level","B1"), topic: store.get("topic","Повседневные ситуации"), custom: store.get("custom",""),
  rate: store.get("rate",0.85), voiceA: store.get("voiceA",""), voiceB: store.get("voiceB",""), view: "dict"
};
$("#level").value = state.level;
$("#topic").value = [...$("#topic").options].some(o=>o.value===state.topic) ? state.topic : "Повседневные ситуации";
$("#topicCustom").value = state.custom;
$("#customWrap").hidden = $("#topic").value !== "__custom";
const topicText = () => $("#topic").value === "__custom" ? ($("#topicCustom").value.trim() || "everyday life") : $("#topic").value;
function setPref(k, v){ state[k] = v; store.set(k, v); store.set("prefsTs", Date.now()); cloudDirty(); }
$("#level").onchange = e => setPref("level", e.target.value);
$("#topic").onchange = e => { setPref("topic", e.target.value); $("#customWrap").hidden = state.topic !== "__custom"; if(!$("#customWrap").hidden) $("#topicCustom").focus(); };
$("#topicCustom").oninput = e => setPref("custom", e.target.value);

/* ---------- tabs ---------- */
document.querySelectorAll("nav.tabs button").forEach(b => b.onclick = () => showView(b.dataset.view));
function showView(v){
  state.view = v;
  document.querySelectorAll("nav.tabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.view === v));
  ["dict","tr","stats"].forEach(x => $("#view-"+x).hidden = x !== v);
  if(v === "stats") renderStats();
  if(v === "tr" && !isPhone()) setTimeout(() => $("#trIn").focus(), 0);
  stopSpeech();
  updateBar();
}

/* ---------- speech ---------- */
// HD voices (Google Chirp 3 HD via the Worker) with the browser's own voices as a fallback.
const HD = [
  ["Puck","мужской, живой"], ["Charon","мужской, спокойный"], ["Fenrir","мужской, энергичный"], ["Orus","мужской, низкий"], ["Achird","мужской, мягкий"],
  ["Kore","женский, уверенный"], ["Aoede","женский, лёгкий"], ["Leda","женский, молодой"], ["Zephyr","женский, яркий"], ["Sulafat","женский, тёплый"]];
const HD_RATES = [0.6, 0.7, 0.85, 1];
const hdOn = !!API_URL;
const synth = "speechSynthesis" in window ? window.speechSynthesis : null;
let voices = [];
state.accent = store.get("accent", "en-US");
$("#accent").value = state.accent;
const isPick = v => /^(g|b):/.test(v || "");
if(!isPick(state.voiceA)) state.voiceA = hdOn ? "g:Puck" : "";
if(!isPick(state.voiceB)) state.voiceB = hdOn ? "g:Kore" : "";
function loadVoices(){
  voices = synth ? synth.getVoices().filter(v => /^en(-|_|$)/i.test(v.lang)) : [];
  const score = v => (/natural|neural|enhanced|premium|google/i.test(v.name)?10:0) + (/en-US/i.test(v.lang)?3:0) + (/en-GB/i.test(v.lang)?2:0);
  voices.sort((a,b) => score(b) - score(a));
  const hdOpts = hdOn ? `<optgroup label="HD-голоса (Google)">${HD.map(([n,d]) => `<option value="g:${n}">${n} — ${d}</option>`).join("")}</optgroup>` : "";
  const brOpts = voices.length ? `<optgroup label="Голоса браузера">${voices.map(v => `<option value="b:${esc(v.voiceURI)}">${esc(v.name)} · ${esc(v.lang)}</option>`).join("")}</optgroup>` : "";
  const fill = (sel, cur, idx) => {
    sel.innerHTML = hdOpts + brOpts || `<option value="">Голос по умолчанию</option>`;
    const opts = [...sel.options].map(o => o.value);
    sel.value = opts.includes(cur) ? cur : (opts.filter(v => v.startsWith("b:"))[idx] || opts[0] || "");
  };
  fill($("#voiceA"), state.voiceA, 0);
  fill($("#voiceB"), state.voiceB, 1);
}
loadVoices();
synth?.addEventListener?.("voiceschanged", loadVoices);
$("#voiceA").onchange = e => { setPref("voiceA", e.target.value); stopSpeech(); speak("Hi! This is how I sound.", "A"); };
$("#voiceB").onchange = e => { setPref("voiceB", e.target.value); stopSpeech(); speak("And this is my voice.", "B"); };
$("#accent").onchange = e => { setPref("accent", e.target.value); stopSpeech(); speak("Let's practise some listening.", "A"); };
const pickFor = who => $(who === "B" ? "#voiceB" : "#voiceA").value || "";

// audio kept on this device (IndexedDB), so a line is fetched once per device
const idb = (() => {
  let dbp;
  const open = () => dbp ||= new Promise((res, rej) => { const r = indexedDB.open("ep-audio", 1); r.onupgradeneeded = () => r.result.createObjectStore("a"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  return {
    async get(k){ try{ const db = await open(); return await new Promise(res => { const q = db.transaction("a").objectStore("a").get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); }catch{ return null; } },
    async put(k, v){ try{ const db = await open(); db.transaction("a", "readwrite").objectStore("a").put(v, k); }catch{} }
  };
})();
const hdMem = new Map();
const nearestRate = x => HD_RATES.reduce((a, b) => Math.abs(b - x) < Math.abs(a - x) ? b : a);
function hdUrl(text, voice, rate){
  const q = new URLSearchParams({ t: text.replace(/\s+/g, " ").trim(), v: voice, l: state.accent, r: String(rate) });
  return API_URL.replace(/\/$/, "") + "/tts?" + q;
}
async function hdBlob(text, voice, rate){
  const url = hdUrl(text, voice, rate);
  if(hdMem.has(url)) return hdMem.get(url);
  const p = (async () => {
    const kept = await idb.get(url);
    if(kept) return kept;
    const r = await fetch(url, { headers: await authHeaders() });
    if(!r.ok){ const b = await r.json().catch(() => ({})); throw {code: b.error || "tts_failed", status: r.status}; }
    const blob = await r.blob();
    idb.put(url, blob);
    return blob;
  })();
  hdMem.set(url, p);
  p.catch(() => hdMem.delete(url));
  return p;
}
let hdWarned = false;
const player = new Audio();
player.preload = "auto";
let playing = null; // {resolve}
function playBlob(blob){
  return new Promise(res => {
    const src = URL.createObjectURL(blob);
    const done = () => { player.onended = player.onerror = null; URL.revokeObjectURL(src); if(playing && playing.res === res) playing = null; res(); };
    playing = { res: done };
    player.onended = player.onerror = done;
    player.src = src;
    player.play().catch(done);
  });
}
function speakBrowser(text, pick, rate){
  return new Promise(res => {
    if(!synth){ res(); return; }
    const u = new SpeechSynthesisUtterance(text);
    const v = voices.find(x => "b:" + x.voiceURI === pick) || voices[0];
    if(v){ u.voice = v; u.lang = v.lang; } else u.lang = "en-US";
    u.rate = rate;
    u.onend = u.onerror = () => res();
    synth.speak(u);
  });
}
let speakToken = 0;
async function speak(text, who = "A", mul = 1){
  const pick = pickFor(who), tok = speakToken;
  if(pick.startsWith("g:") && hdOn){
    const rate = mul < 1 ? (HD_RATES[HD_RATES.indexOf(nearestRate(state.rate)) - 1] || HD_RATES[0]) : nearestRate(state.rate);
    try{
      const blob = await hdBlob(text, pick.slice(2), rate);
      if(tok !== speakToken) return;
      await playBlob(blob);
      return;
    }catch(e){
      if(tok !== speakToken) return;
      if(!hdWarned){ hdWarned = true; showToast(e.code === "tts_not_configured" ? "HD-голоса ещё не подключены — пока звучит голос браузера." : e.code === "sign_in_required" ? "Новые фразы HD-голосом — после входа. Пока звучит голос браузера." : e.code === "not_allowed" ? "HD-голос для новых фраз доступен не всем аккаунтам — звучит голос браузера." : "HD-голос сейчас недоступен — звучит голос браузера."); }
    }
  }
  const bPick = pick.startsWith("b:") ? pick : (voices[who === "B" ? 1 : 0] ? "b:" + voices[who === "B" ? 1 : 0].voiceURI : "");
  return speakBrowser(text, bPick, state.rate * mul);
}
// fetch the next lines ahead so playback has no gaps
function prefetch(lines){
  if(!hdOn) return;
  lines.forEach(l => { const pick = pickFor(l.s); if(pick.startsWith("g:")) hdBlob(l.text, pick.slice(2), nearestRate(state.rate)).catch(() => {}); });
}
function stopSpeech(){
  speakToken++;
  if(synth) synth.cancel();
  try{ player.pause(); }catch{}
  playing?.res();
  document.querySelectorAll(".line.playing").forEach(l => l.classList.remove("playing"));
}
function setRate(r, user){ state.rate = r; if(user) setPref("rate", r); document.querySelectorAll("#rateSeg button").forEach(b => b.setAttribute("aria-pressed", Number(b.dataset.r) === r)); }
document.querySelectorAll("#rateSeg button").forEach(b => b.onclick = () => setRate(Number(b.dataset.r), true));
setRate(state.rate);

/* ---------- diff ---------- */
const toks = s => String(s).replace(/[’‘`´]/g,"'").replace(/[“”]/g,'"').split(/\s+/).filter(Boolean);
const norm = (w, strict) => strict ? w : w.toLowerCase().replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu,"").replace(/^'+|'+$/g,"");
function diff(expected, typed, strict){
  const a = toks(expected).map(w => ({w, n:norm(w,strict)})).filter(x => x.n);
  const b = toks(typed).map(w => ({w, n:norm(w,strict)})).filter(x => x.n);
  const m = a.length, n = b.length, dp = Array.from({length:m+1}, () => new Uint16Array(n+1));
  for(let i=m-1;i>=0;i--) for(let j=n-1;j>=0;j--) dp[i][j] = a[i].n === b[j].n ? dp[i+1][j+1]+1 : Math.max(dp[i+1][j], dp[i][j+1]);
  const raw = []; let i=0, j=0;
  while(i<m && j<n){
    if(a[i].n === b[j].n){ raw.push({t:"eq", e:a[i].w, w:b[j].w}); i++; j++; }
    else if(dp[i+1][j] >= dp[i][j+1]){ raw.push({t:"miss", e:a[i].w}); i++; }
    else { raw.push({t:"extra", w:b[j].w}); j++; }
  }
  while(i<m) raw.push({t:"miss", e:a[i++].w});
  while(j<n) raw.push({t:"extra", w:b[j++].w});
  const ops = []; let k = 0;
  while(k < raw.length){
    if(raw[k].t === "eq"){ ops.push(raw[k++]); continue; }
    const miss = [], extra = [];
    while(k < raw.length && raw[k].t !== "eq"){ (raw[k].t === "miss" ? miss : extra).push(raw[k]); k++; }
    for(let x=0; x<Math.max(miss.length, extra.length); x++){
      if(miss[x] && extra[x]) ops.push({t:"sub", e:miss[x].e, w:extra[x].w});
      else if(miss[x]) ops.push(miss[x]); else ops.push(extra[x]);
    }
  }
  const correct = ops.filter(o => o.t === "eq").length;
  const total = Math.max(a.length, 1);
  const pct = Math.max(0, Math.round(100 * (correct - ops.filter(o=>o.t==="extra").length*0.5) / total));
  return {ops, pct: a.length ? Math.min(100,pct) : 100};
}
function diffHTML(ops){
  return ops.map(o => o.t === "eq" ? `<span class="w-ok">${esc(o.w)}</span>`
    : o.t === "sub" ? `<del class="w">${esc(o.w)}</del> <ins class="w">${esc(o.e)}</ins>`
    : o.t === "miss" ? `<ins class="w miss" title="пропущено">${esc(o.e)}</ins>`
    : `<del class="w" title="лишнее">${esc(o.w)}</del>`).join(" ");
}
const scClass = p => p >= 90 ? "good" : p >= 65 ? "mid" : "bad";

/* ---------- data: built-in dialogues ---------- */
const BUILTIN = [
  { level:"A2", title:"Ordering at a café", context_ru:"Вы заказываете кофе и выпечку в кафе.", speakers:{A:"Barista", B:"Customer"},
    lines:[
      {s:"A", text:"Hi there! What can I get for you today?"},
      {s:"B", text:"Can I get a medium latte with oat milk, please?"},
      {s:"A", text:"Sure. Would you like anything to eat with that?"},
      {s:"B", text:"Maybe a blueberry muffin. Are they fresh?"},
      {s:"A", text:"They came out of the oven about twenty minutes ago."},
      {s:"B", text:"Perfect, I'll take one. Can I pay with my phone?"},
      {s:"A", text:"Of course. Just tap it on the reader when you're ready."}],
    vocab:[{en:"What can I get for you?",ru:"Что вам предложить?"},{en:"oat milk",ru:"овсяное молоко"},{en:"came out of the oven",ru:"только из духовки"},{en:"tap it on the reader",ru:"приложите к терминалу"}] },
  { level:"B1", title:"A service call", context_ru:"Техник приехал к хозяину дома, у которого плохо работает кондиционер.", speakers:{A:"Technician", B:"Homeowner"},
    lines:[
      {s:"B", text:"Thanks for coming out so quickly. The upstairs bedrooms just won't cool down."},
      {s:"A", text:"No problem. When did you first notice the issue?"},
      {s:"B", text:"About three days ago. The fan is running, but the air coming out feels warm."},
      {s:"A", text:"Have you changed the air filter recently?"},
      {s:"B", text:"Honestly, I can't remember the last time I did."},
      {s:"A", text:"Let's start there. A clogged filter can restrict airflow and cause the coil to freeze."},
      {s:"B", text:"Is that something I could have fixed myself?"},
      {s:"A", text:"The filter, yes. But I'd still like to check the refrigerant pressure while I'm here."}],
    vocab:[{en:"won't cool down",ru:"никак не охлаждаются"},{en:"clogged filter",ru:"забитый фильтр"},{en:"restrict airflow",ru:"ограничивать поток воздуха"},{en:"could have fixed",ru:"мог бы починить (в прошлом)"},{en:"while I'm here",ru:"раз уж я здесь"}] },
  { level:"B2", title:"An apprenticeship interview", context_ru:"Собеседование на программу ученичества (apprenticeship).", speakers:{A:"Interviewer", B:"Candidate"},
    lines:[
      {s:"A", text:"So, tell me why you're interested in this apprenticeship program."},
      {s:"B", text:"I've been working as an install helper, and I'd like to build a long-term career in the trade."},
      {s:"A", text:"What would you say is the most valuable thing you've learned on the job?"},
      {s:"B", text:"Probably that a clean, well-planned install saves a lot of trouble down the road."},
      {s:"A", text:"How do you handle it when a senior installer asks you to do something you think is wrong?"},
      {s:"B", text:"I'd ask about it respectfully. Sometimes there's a reason I hadn't considered."},
      {s:"A", text:"That's a good answer. Do you have any questions for us?"},
      {s:"B", text:"Yes. How is the time split between classroom training and work in the field?"}],
    vocab:[{en:"the trade",ru:"ремесло, профессия"},{en:"down the road",ru:"в будущем, потом"},{en:"hadn't considered",ru:"не учёл"},{en:"in the field",ru:"на объектах, «в поле»"}] }
];
let dialogs = [...BUILTIN, ...store.get("genDialogs", [])];
let dIdx = Math.min(store.get("dIdx", 0), dialogs.length-1);
let dChecked = false;

function renderDialog(){
  const d = dialogs[dIdx];
  stopSpeech(); dChecked = false;
  $("#dLevel").textContent = `${d.level || state.level} · ${dIdx+1} из ${dialogs.length}${d.gen ? " · сгенерирован" : ""}`;
  $("#dTitle").textContent = d.title;
  $("#dContext").textContent = d.context_ru || "";
  $("#lines").innerHTML = d.lines.map((l,i) => `
    <div class="line" data-i="${i}">
      <div class="who ${l.s==="B"?"B":""}"><b>${l.s==="B"?"B":"A"}</b>${esc((d.speakers||{})[l.s] || "")}</div>
      <div class="ctrls">
        <button class="btn play" title="Прослушать строку" aria-label="Прослушать строку ${i+1}"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.5v11l9-5.5z"/></svg></button>
        <button class="btn slow" title="Медленно" aria-label="Медленно строку ${i+1}"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.2 1.6"/></svg></button>
      </div>
      <input type="text" id="dl-${dIdx}-${i}" autocomplete="off" autocorrect="off" autocapitalize="sentences" spellcheck="false" enterkeyhint="${i === d.lines.length - 1 ? "done" : "next"}" placeholder="Строка ${i+1}…">
    </div>`).join("");
  $("#dSummary").hidden = $("#dExplainWrap").hidden = $("#dVocabWrap").hidden = true;
  $("#dPrev").disabled = dIdx === 0; $("#dNext").disabled = dIdx === dialogs.length-1;
  store.set("dIdx", dIdx);
  setCur(0);
  updateBar();
}
// the line being worked on (phones control it from the bar above the keyboard)
let cur = 0;
function setCur(i){
  cur = Math.max(0, Math.min(i, dialogs[dIdx].lines.length - 1));
  document.querySelectorAll(".line").forEach(l => l.classList.toggle("cur", +l.dataset.i === cur));
  $("#mbPos").textContent = `${cur + 1}/${dialogs[dIdx].lines.length}`;
  $("#mbNext").textContent = cur === dialogs[dIdx].lines.length - 1 ? "Проверить" : "Дальше";
}
async function playLine(i, mul = 1){
  const d = dialogs[dIdx]; stopSpeech(); const tok = speakToken;
  setCur(i); mediaInfo(d, i);
  const row = $(`.line[data-i="${i}"]`); row?.classList.add("playing");
  prefetch(d.lines.slice(i + 1, i + 3));
  await speak(d.lines[i].text, d.lines[i].s, mul);
  if(tok === speakToken) row?.classList.remove("playing");
}
$("#lines").addEventListener("click", e => {
  const row = e.target.closest(".line"); if(!row) return; const i = +row.dataset.i;
  if(e.target.closest(".play")) playLine(i);
  if(e.target.closest(".slow")) playLine(i, 0.75);
});
$("#lines").addEventListener("keydown", e => {
  const row = e.target.closest(".line"); if(!row || e.target.tagName !== "INPUT") return; const i = +row.dataset.i;
  if(e.key === "Escape"){ e.preventDefault(); playLine(i); }
  if(e.key === "Enter"){
    e.preventDefault();
    const next = $(`.line[data-i="${i+1}"] input`);
    if(next){ next.focus(); playLine(i+1); } else { e.target.blur(); checkDictation(); }
  }
});
$("#lines").addEventListener("focusin", e => {
  const row = e.target.closest(".line");
  if(e.target.tagName === "INPUT" && row){
    setCur(+row.dataset.i);
    if(isPhone()) setTimeout(() => row.scrollIntoView({block: "center", behavior: "smooth"}), 250);
  }
});
$("#dPlayAll").onclick = async () => {
  const d = dialogs[dIdx]; stopSpeech(); const tok = speakToken;
  prefetch(d.lines);
  for(let i=0;i<d.lines.length;i++){
    if(tok !== speakToken) return;
    const row = $(`.line[data-i="${i}"]`); row?.classList.add("playing");
    setCur(i); mediaInfo(d, i);
    await speak(d.lines[i].text, d.lines[i].s);
    row?.classList.remove("playing");
    await new Promise(r => setTimeout(r, 450));
  }
};
$("#dStop").onclick = stopSpeech;
$("#dPrev").onclick = () => { if(dIdx>0){ dIdx--; renderDialog(); } };
$("#dNext").onclick = () => { if(dIdx<dialogs.length-1){ dIdx++; renderDialog(); } };
$("#dReset").onclick = renderDialog;
$("#dReveal").onclick = () => {
  const d = dialogs[dIdx];
  document.querySelectorAll(".line").forEach(row => {
    if(row.querySelector(".reveal, .result")) return;
    const el = document.createElement("div"); el.className = "reveal"; el.textContent = d.lines[+row.dataset.i].text; row.append(el);
  });
};

let lastDict = null;
function checkDictation(){
  stopSpeech();
  const d = dialogs[dIdx], strict = $("#strict").checked;
  let sum = 0, results = [];
  document.querySelectorAll(".line").forEach(row => {
    const i = +row.dataset.i, typed = row.querySelector("input").value;
    row.querySelectorAll(".reveal,.result").forEach(x => x.remove());
    const r = diff(d.lines[i].text, typed, strict); sum += r.pct;
    results.push({expected:d.lines[i].text, typed, pct:r.pct, ops:r.ops});
    const el = document.createElement("div"); el.className = "result";
    el.innerHTML = `<span class="sc ${scClass(r.pct)}">${r.pct}%</span>` + (typed.trim() ? diffHTML(r.ops) : `<ins class="w miss">${esc(d.lines[i].text)}</ins>`);
    row.append(el);
  });
  const avg = Math.round(sum / d.lines.length);
  const wrongs = results.flatMap(r => r.ops.filter(o => o.t === "sub").map(o => ({yours:o.w, better:o.e, why:"Ослышка: «"+r.expected+"»"})));
  const wasChecked = dChecked; dChecked = true; lastDict = {d, results, avg};
  updateBar();
  if(isPhone()) setTimeout(() => $("#dSummary").scrollIntoView({block: "start", behavior: "smooth"}), 100);
  if(!wasChecked){
    pushResult("dict", avg);
    saveMistakes(wrongs.slice(0, 12).map(w => ({...w, kind:"dict", type:"listening"})));
  }
  const errCount = results.reduce((n,r) => n + r.ops.filter(o => o.t !== "eq").length, 0);
  $("#dSummary").hidden = false;
  $("#dSummary").innerHTML = `<div class="summary">
      <div><div class="big">${avg}%</div><div class="note">точность</div></div>
      <div style="flex:1;min-width:200px"><p style="margin:0">${avg>=95?"Отлично — почти без ошибок.":avg>=80?"Хорошо. Посмотрите на выделенные слова.":avg>=60?"Неплохо, но многое потерялось на слух. Переслушайте строки на 0.7×.":"Сложно на этой скорости. Включите 0.7× и слушайте каждую строку по 2–3 раза."}</p>
      <p class="note" style="margin-top:4px">Ошибок и пропусков: ${errCount}. <ins class="w">жёлтым</ins> — правильное слово, <del class="w">красным</del> — что вы написали, <ins class="w miss">пунктиром</ins> — пропущено.</p></div>
      ${errCount ? `<button class="btn primary" id="dExplainBtn">Разобрать ошибки с Claude</button>` : ""}
    </div>`;
  $("#dExplainBtn") && ($("#dExplainBtn").onclick = explainDictation);
  if(d.vocab?.length){
    $("#dVocabWrap").hidden = false;
    $("#dVocab").innerHTML = d.vocab.map(v => `<li><b>${esc(v.en)}</b> — ${esc(v.ru)}</li>`).join("");
  }
}
$("#dCheck").onclick = checkDictation;

let explainCtl = null;
async function explainDictation(){
  const out = $("#dExplain"); $("#dExplainWrap").hidden = false;
  const btn = $("#dExplainBtn"); if(btn) btn.disabled = true;
  out.innerHTML = `<span class="status"><span class="spin"></span>Claude разбирает ошибки…</span>`;
  try{
    const items = lastDict.results.filter(r => r.pct < 100).map(r => ({expected:r.expected, typed:r.typed}));
    explainCtl = new AbortController(); $("#dExplainStop").hidden = false;
    out.textContent = await ai("explain", {level: state.level, items}, { signal: explainCtl.signal, onText: ({text}) => { out.textContent = text; } });
  }catch(e){
    if(e.code === "cancelled") return;
    out.innerHTML = e.code === "unavailable" ? `<span class="err-msg">${NO_AI}</span>` : `${esc(e.text || "")}<p class="err-msg">${esc(errCopy(e))}</p>`;
  }finally{ $("#dExplainStop").hidden = true; if(btn) btn.disabled = false; }
}
$("#dExplainStop").onclick = () => explainCtl?.abort();

$("#dGen").onclick = async () => {
  const btn = $("#dGen"); btn.disabled = true; const old = btn.textContent; btn.innerHTML = `<span class="spin"></span>Пишу диалог…`;
  try{
    const lvl = state.level;
    const data = await ai("dialogue", {level: lvl, topic: topicText(), avoid: dialogs.map(d => d.title).slice(-12).join("; ")});
    if(!data || !Array.isArray(data.lines) || !data.lines.length) throw {code:"invalid_json"};
    const d = { id: "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at: Date.now(), level: lvl, gen: true, title: String(data.title || "New dialogue"), context_ru: String(data.context_ru || ""),
      speakers: data.speakers || {A:"A",B:"B"}, lines: data.lines.filter(l => l && l.text).map(l => ({s: l.s === "B" ? "B" : "A", text: String(l.text)})),
      vocab: Array.isArray(data.vocab) ? data.vocab.slice(0,8).map(v => ({en:String(v.en||""), ru:String(v.ru||"")})) : [] };
    const gen = store.get("genDialogs", []); gen.push(d); store.set("genDialogs", gen.slice(-40)); cloudDirty();
    dialogs = [...BUILTIN, ...store.get("genDialogs", [])]; dIdx = dialogs.length - 1; renderDialog();
    $(`.line[data-i="0"] input`)?.focus();
  }catch(e){
    showToast(e.code === "unavailable" ? NO_AI : errCopy(e));
  }finally{ btn.disabled = false; btn.textContent = old; }
};

/* ---------- translation ---------- */
const BANK = [
  {ru:"Я работаю в этой компании с весны.", en:"I've been working at this company since spring.", focus:"Present Perfect Continuous", hint_ru:"Действие началось в прошлом и продолжается сейчас."},
  {ru:"Если бы я знал об этом раньше, я бы тебе позвонил.", en:"If I had known about it earlier, I would have called you.", focus:"Third conditional", hint_ru:"Нереальное условие в прошлом."},
  {ru:"Кондиционер не включается, хотя термостат работает.", en:"The AC won't turn on, even though the thermostat is working.", focus:"won't · even though", hint_ru:"«Не включается» о технике часто передают через won't."},
  {ru:"Мне нужно, чтобы ты проверил давление в системе.", en:"I need you to check the pressure in the system.", focus:"need someone to do", hint_ru:"Без that и без would: need + кто + to + глагол."},
  {ru:"Сколько времени у тебя ушло на установку?", en:"How long did it take you to finish the installation?", focus:"it takes … to", hint_ru:"Конструкция it take(s) someone time to do something."},
  {ru:"Я привык рано вставать, но мне это до сих пор не нравится.", en:"I'm used to getting up early, but I still don't like it.", focus:"be used to + -ing", hint_ru:"Не путайте be used to (привык) и used to (раньше делал)."},
  {ru:"Ей посоветовали не подписывать договор, пока юрист его не прочитает.", en:"She was advised not to sign the contract until a lawyer reads it.", focus:"Passive · until", hint_ru:"После until в английском нет отрицания и нет will."},
  {ru:"Чем больше практикуешься, тем легче становится.", en:"The more you practice, the easier it gets.", focus:"the more … the …", hint_ru:"Обе части начинаются с the."},
  {ru:"Мы опоздали, потому что застряли в пробке на 101-м.", en:"We were late because we got stuck in traffic on the 101.", focus:"get stuck · articles", hint_ru:"Калифорнийские шоссе называют с артиклем: the 101."},
  {ru:"Не могли бы вы говорить чуть медленнее? Я понимаю не всё.", en:"Could you speak a little more slowly? I don't understand everything.", focus:"Polite requests", hint_ru:"Вежливая просьба начинается с Could you…"},
  {ru:"Я уже отправил документы, но ответа пока нет.", en:"I've already sent the documents, but I haven't heard back yet.", focus:"Present Perfect · hear back", hint_ru:"«Ответа нет» естественнее через hear back."},
  {ru:"Лучше позвони заранее, а то их может не быть на месте.", en:"You'd better call ahead, or they might not be there.", focus:"had better · might", hint_ru:"«Лучше сделай» — had better без to."}
];
let trQueue = store.get("trQueue", null) || shuffle(BANK.slice());
let trIdx = Math.min(store.get("trIdx", 0), trQueue.length-1);
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function renderTr(){
  const it = trQueue[trIdx];
  $("#trCounter").textContent = `Предложение ${trIdx+1} из ${trQueue.length}`;
  $("#trFocus").textContent = it.focus || "Перевод";
  $("#trRu").textContent = it.ru;
  $("#trIn").value = store.get("trDraft:"+it.ru, "");
  $("#trHintText").hidden = true; $("#trHintText").textContent = it.hint_ru || "Подсказки нет.";
  $("#trResult").hidden = true; $("#trResult").innerHTML = "";
  store.set("trIdx", trIdx);
}
function saveTr(){ store.set("trQueue", trQueue); store.set("trIdx", trIdx); store.set("trTs", Date.now()); cloudDirty(); }
$("#trIn").addEventListener("input", e => store.set("trDraft:"+trQueue[trIdx].ru, e.target.value));
$("#trIn").addEventListener("keydown", e => { if(e.key === "Enter" && (e.ctrlKey || e.metaKey)){ e.preventDefault(); checkTr(); } });
$("#trHint").onclick = () => $("#trHintText").hidden = !$("#trHintText").hidden;
$("#trSkip").onclick = () => { trIdx = (trIdx + 1) % trQueue.length; renderTr(); saveTr(); if(!isPhone()) $("#trIn").focus(); };
$("#trCheck").onclick = () => checkTr();

$("#trGen").onclick = async () => {
  const btn = $("#trGen"); btn.disabled = true; const old = btn.textContent; btn.innerHTML = `<span class="spin"></span>Подбираю…`;
  try{
    const arr = await ai("sentences", {level: state.level, topic: topicText()});
    const list = (Array.isArray(arr) ? arr : []).filter(x => x && x.ru && x.en).map(x => ({ru:String(x.ru), en:String(x.en), focus:String(x.focus||""), hint_ru:String(x.hint_ru||"")}));
    if(!list.length) throw {code:"invalid_json"};
    trQueue = list; trIdx = 0; renderTr(); saveTr(); $("#trIn").focus();
  }catch(e){
    showToast(e.code === "unavailable" ? NO_AI : errCopy(e));
  }finally{ btn.disabled = false; btn.textContent = old; }
};

const playBtn = (text) => `<button class="btn icon say" data-say="${esc(text)}" title="Озвучить" aria-label="Озвучить"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.5v11l9-5.5z"/></svg></button>`;
document.addEventListener("click", e => { const b = e.target.closest(".say"); if(b){ stopSpeech(); speak(b.dataset.say, "A"); } });

let trCtl = null;
async function checkTr(){
  const it = trQueue[trIdx], mine = $("#trIn").value.trim(), box = $("#trResult");
  if(!mine){ $("#trIn").focus(); return; }
  box.hidden = false;
  box.innerHTML = `<span class="status"><span class="spin"></span>Claude проверяет перевод — обычно 10–30 секунд…</span>`;
  $("#trCheck").disabled = true;
  try{
    trCtl = new AbortController();
    const r = await ai("check", {level: state.level, ru: it.ru, en: it.en, mine}, { signal: trCtl.signal });
    if(!r || typeof r !== "object") throw {code:"invalid_json"};
    renderTrResult(it, mine, r);
    pushResult("tr", Number(r.score) || 0);
    saveMistakes((r.mistakes || []).map(m => ({kind:"tr", yours:m.yours, better:m.better, why:m.why_ru, type:m.type})));
  }catch(e){
    if(e.code === "cancelled") return;
    if(e.code === "unavailable"){
      const d = diff(it.en, mine, false);
      box.innerHTML = `<div class="verdict"><div class="big">${d.pct}%</div><div><p><b>Сверка с эталоном.</b> Подробный разбор от Claude ещё не подключён, поэтому сравниваю слово в слово — другие верные варианты тоже могут подсветиться.</p></div></div>
        <div class="ver natural"><span class="eyebrow">Эталон</span><div class="row"><span class="en" style="flex:1;min-width:0">${esc(it.en)}</span>${playBtn(it.en)}</div></div>
        <div class="ver"><span class="eyebrow">Отличия</span><div style="font-family:var(--f-mono);font-size:14px;line-height:1.9">${diffHTML(d.ops)}</div></div>`;
      pushResult("tr", d.pct);
    } else box.innerHTML = `<p class="err-msg">${esc(errCopy(e))}</p>`;
  }finally{ $("#trCheck").disabled = false; }
}
function renderTrResult(it, mine, r){
  const score = Math.max(0, Math.min(100, Math.round(Number(r.score) || 0)));
  const cd = r.corrected ? diff(r.corrected, mine, true) : null;
  const ms = Array.isArray(r.mistakes) ? r.mistakes : [];
  const alts = Array.isArray(r.alternatives) ? r.alternatives : [];
  $("#trResult").innerHTML = `
    <div style="display:flex;flex-direction:column;gap:16px">
      <div class="verdict">
        <div class="big" style="color:var(--${score>=90?"ok":score>=65?"miss":"err"})">${score}</div>
        <div><b>${score>=90?"Отлично":score>=75?"Хорошо":score>=55?"Есть ошибки":"Нужно поработать"}</b>${r.meaning_ok === false ? ` · <span class="err-msg">смысл передан неточно</span>` : ""}<p>${esc(r.verdict_ru)}</p></div>
      </div>
      <div class="versions">
        ${cd && r.meaning_ok !== false && cd.pct >= 40 && cd.ops.some(o => o.t !== "eq") ? `<div class="ver"><span class="eyebrow">Ваш вариант с исправлениями</span><div class="en" style="font-family:var(--f-mono);font-size:15px;line-height:1.9">${diffHTML(cd.ops)}</div></div>` : `<div class="ver"><span class="eyebrow">Ваш вариант</span><div class="en">${esc(mine)}</div></div>`}
        ${r.natural ? `<div class="ver natural"><span class="eyebrow">Как сказал бы носитель</span><div class="row"><span class="en" style="flex:1;min-width:0">${esc(r.natural)}</span>${playBtn(r.natural)}</div></div>` : ""}
      </div>
      ${ms.length ? `<div><h3 style="margin-bottom:10px">Разбор ошибок</h3><ul class="mlist">${ms.map(m => `
        <li class="mist">
          <div class="pair"><del class="w">${esc(m.yours)}</del><span aria-hidden="true">→</span><ins class="w">${esc(m.better)}</ins>${m.type ? `<span class="chip">${esc(m.type)}</span>` : ""}</div>
          <div>${esc(m.why_ru)}</div>
          ${m.rule_ru ? `<div class="rule">Правило: ${esc(m.rule_ru)}</div>` : ""}
        </li>`).join("")}</ul></div>` : `<p class="note">Грамматических ошибок нет.</p>`}
      ${alts.length ? `<div><h3 style="margin-bottom:8px">Другие хорошие варианты</h3><ul class="alts">${alts.map(a => `<li><span class="row" style="gap:8px"><span>${esc(a.en)}</span>${playBtn(a.en)}</span><span class="note">${esc(a.note_ru)}</span></li>`).join("")}</ul></div>` : ""}
      ${r.tip_ru ? `<p style="margin:0"><b>Совет:</b> ${esc(r.tip_ru)}</p>` : ""}
      <div class="row"><button class="btn primary" id="trNext">Следующее предложение →</button><button class="btn" id="trRetry">Попробовать ещё раз</button></div>
    </div>`;
  $("#trNext").onclick = () => $("#trSkip").click();
  $("#trRetry").onclick = () => { $("#trResult").hidden = true; $("#trIn").focus(); };
}

/* ---------- stats & mistakes ---------- */
function pushResult(kind, pct){
  const h = store.get("history", []); h.push({k:kind, p:Math.round(pct), t:Date.now()}); store.set("history", h.slice(-500)); cloudDirty();
  try{ navigator.storage?.persist?.(); }catch{}
}
function saveMistakes(list){
  if(!list.length) return;
  const t = Date.now();
  const m = store.get("mistakes", []); list.forEach((x, i) => m.unshift({...x, t: t + i})); store.set("mistakes", m.slice(0, 300)); cloudDirty();
}
function renderStats(){
  const h = store.get("history", []);
  const part = k => h.filter(x => x.k === k);
  const avg = a => a.length ? Math.round(a.reduce((s,x) => s + x.p, 0) / a.length) : null;
  const d = part("dict"), t = part("tr");
  const week = h.filter(x => Date.now() - x.t < 7*864e5).length;
  const bars = a => a.slice(-24).map(x => `<span class="${x.p<65?"lo":""}" style="height:${Math.max(4,x.p)}%" title="${x.p}%"></span>`).join("");
  $("#stats").innerHTML = `
    <div class="stat"><div class="lbl">Диктанты</div><div class="big">${d.length}</div><div class="note">средняя точность ${avg(d) ?? "—"}${avg(d)!=null?"%":""}</div><div class="bars">${bars(d)}</div></div>
    <div class="stat"><div class="lbl">Переводы</div><div class="big">${t.length}</div><div class="note">средний балл ${avg(t) ?? "—"}</div><div class="bars">${bars(t)}</div></div>
    <div class="stat"><div class="lbl">За 7 дней</div><div class="big">${week}</div><div class="note">упражнений</div></div>`;
  const f = $("#mFilter").value;
  const m = store.get("mistakes", []).filter(x => f === "all" || x.kind === f).slice(0, 60);
  $("#mBody").innerHTML = m.length ? m.map(x => `<tr><td><del class="w">${esc(x.yours)}</del></td><td><ins class="w">${esc(x.better)}</ins></td><td>${x.type ? `<span class="chip">${esc(x.type)}</span> ` : ""}${esc(x.why)}</td></tr>`).join("")
    : `<tr><td colspan="3" class="empty">Здесь появятся ваши ошибки после первых проверок — по ним удобно повторять.</td></tr>`;
}
$("#mFilter").onchange = renderStats;
$("#mClear").onclick = () => $("#mConfirm").hidden = false;
$("#mNo").onclick = () => $("#mConfirm").hidden = true;
$("#mYes").onclick = () => { store.set("history", []); store.set("mistakes", []); store.set("cleared", Date.now()); $("#mConfirm").hidden = true; renderStats(); cloudDirty(); };

/* ---------- toast ---------- */
let toastEl;
function showToast(msg, action, ms = 4500){
  if(!toastEl){ toastEl = document.createElement("div"); toastEl.setAttribute("role","status");
    toastEl.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);bottom:calc(96px + env(safe-area-inset-bottom,0px));background:var(--fg);color:var(--bg);padding:10px 16px;border-radius:8px;font-size:15px;max-width:calc(100% - 32px);z-index:30;box-shadow:0 6px 24px rgba(0,0,0,.2);display:flex;align-items:center";
    document.body.append(toastEl); }
  toastEl.textContent = msg;
  if(action){ const b = document.createElement("button"); b.className = "toastbtn"; b.textContent = action.label; b.onclick = () => { toastEl.hidden = true; action.fn(); }; toastEl.append(b); }
  toastEl.hidden = false; clearTimeout(toastEl._t); if(ms) toastEl._t = setTimeout(() => toastEl.hidden = true, ms);
}

/* ---------- phone layout: bar above the keyboard ---------- */
function isPhone(){ return matchMedia("(max-width:560px), (pointer:coarse)").matches; }
function updateBar(){
  const show = state.view === "dict" && isPhone() && !dChecked;
  $("#mbar").hidden = !show;
  document.body.classList.toggle("has-mbar", show);
}
const lineInput = i => $(`.line[data-i="${i}"] input`);
// keep the keyboard open: tapping the bar must not take focus from the line being typed
$("#mbar").addEventListener("mousedown", e => e.preventDefault());
$("#mbReplay").onclick = () => { const i = cur; lineInput(i)?.focus(); playLine(i); };
$("#mbSlow").onclick = () => { const i = cur; lineInput(i)?.focus(); playLine(i, 0.75); };
$("#mbNext").onclick = () => {
  const n = dialogs[dIdx].lines.length, next = cur + 1;
  if(next < n){ lineInput(next)?.focus(); playLine(next); }
  else { document.activeElement?.blur?.(); checkDictation(); }
};
if(window.visualViewport){
  const place = () => {
    const vv = visualViewport, kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    $("#mbar").style.transform = kb > 40 ? `translateY(${-kb}px)` : "";
  };
  visualViewport.addEventListener("resize", place);
  visualViewport.addEventListener("scroll", place);
}
matchMedia("(max-width:560px), (pointer:coarse)").addEventListener?.("change", updateBar);

/* ---------- sound on phones ---------- */
// iPhone plays sound only after a tap; one silent play on the first touch unlocks the player for later lines
function silentWav(){
  const n = 800, b = new ArrayBuffer(44 + n * 2), v = new DataView(b), w = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([b], {type: "audio/wav"}));
}
let unlocked = false;
addEventListener("pointerdown", () => {
  if(unlocked) return; unlocked = true;
  if(playing) return;
  player.src = silentWav(); player.play().catch(() => {});
}, {capture: true});
// lock screen and headphone buttons
function mediaInfo(d, i){
  if(!("mediaSession" in navigator) || !window.MediaMetadata) return;
  try{ navigator.mediaSession.metadata = new MediaMetadata({ title: d.title, artist: "Ear & Pen", album: `Строка ${i + 1} из ${d.lines.length}` }); }catch{}
}
if("mediaSession" in navigator){
  const on = (a, f) => { try{ navigator.mediaSession.setActionHandler(a, f); }catch{} };
  on("play", () => playLine(cur));
  on("pause", stopSpeech);
  on("previoustrack", () => playLine(Math.max(0, cur - 1)));
  on("nexttrack", () => playLine(Math.min(dialogs[dIdx].lines.length - 1, cur + 1)));
}

/* ---------- offline ---------- */
function netState(){
  $("#offline").hidden = navigator.onLine;
  if(navigator.onLine){ syncNow(); warmOffline(); }
}
addEventListener("online", netState);
addEventListener("offline", netState);
// save the built-in dialogues' audio on this device, so dictation works on a plane
function warmOffline(){
  if(!hdOn || !navigator.onLine) return;
  const key = ["warm", pickFor("A"), pickFor("B"), state.accent, nearestRate(state.rate)].join("|");
  if(store.get("warm", "") === key) return;
  const go = async () => {
    const jobs = BUILTIN.flatMap(d => d.lines).filter(l => pickFor(l.s).startsWith("g:"))
      .map(l => () => hdBlob(l.text, pickFor(l.s).slice(2), nearestRate(state.rate)));
    for(const j of jobs){ try{ await j(); }catch{ return; } }
    store.set("warm", key);
  };
  (window.requestIdleCallback || (f => setTimeout(f, 3000)))(go);
}

/* ---------- install ---------- */
const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
let installEvt = null;
addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; $("#installBtn").hidden = standalone(); });
addEventListener("appinstalled", () => { $("#installBtn").hidden = true; installEvt = null; showToast("Приложение установлено"); });
$("#installBtn").hidden = standalone() || !isIOS();
$("#installBtn").onclick = async () => {
  if(installEvt){ installEvt.prompt(); try{ await installEvt.userChoice; }catch{} installEvt = null; $("#installBtn").hidden = true; return; }
  $("#iosSheet").showModal();
};
$("#iosClose").onclick = () => $("#iosSheet").close();
if(standalone()) try{ navigator.storage?.persist?.(); }catch{}

/* ---------- updates ---------- */
if("serviceWorker" in navigator && location.protocol === "https:"){
  let askedReload = false;
  navigator.serviceWorker.register("sw.js").then(reg => {
    const offer = w => showToast("Доступна новая версия", { label: "Обновить", fn: () => { askedReload = true; w.postMessage("skip"); } }, 0);
    if(reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      w?.addEventListener("statechange", () => { if(w.state === "installed" && navigator.serviceWorker.controller) offer(w); });
    });
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
  }).catch(() => {});
  navigator.serviceWorker.addEventListener("controllerchange", () => { if(askedReload) location.reload(); });
}

/* ---------- account & sync (Firebase, like Pip's Sky Islands) ---------- */
const PREF_KEYS = ["level", "topic", "custom", "rate", "voiceA", "voiceB", "accent"];
function snapshot(){
  const prefs = {};
  for(const k of PREF_KEYS){ const v = store.get(k, null); if(v !== null) prefs[k] = v; }
  return merge({
    prefs, prefsTs: store.get("prefsTs", 0),
    tr: { queue: store.get("trQueue", null), idx: store.get("trIdx", 0) }, trTs: store.get("trTs", 0),
    history: store.get("history", []), mistakes: store.get("mistakes", []),
    dialogs: store.get("genDialogs", []), cleared: store.get("cleared", 0),
  }, {});
}
function applySnapshot(x){
  const before = snapshot();
  for(const k of PREF_KEYS) if(k in x.prefs) store.set(k, x.prefs[k]);
  store.set("prefsTs", x.prefsTs);
  store.set("history", x.history); store.set("mistakes", x.mistakes); store.set("cleared", x.cleared);
  store.set("genDialogs", x.dialogs);
  if(x.tr && x.tr.queue && x.tr.queue.length){ store.set("trQueue", x.tr.queue); store.set("trIdx", x.tr.idx || 0); store.set("trTs", x.trTs); }
  // show the new values
  if(!same(before.prefs, x.prefs)){
    Object.assign(state, x.prefs);
    $("#level").value = state.level; $("#topic").value = state.topic; $("#topicCustom").value = state.custom || "";
    $("#customWrap").hidden = state.topic !== "__custom"; $("#accent").value = state.accent || "en-US";
    loadVoices(); setRate(state.rate);
  }
  if(!same(before.dialogs, x.dialogs)){
    const keep = dialogs[dIdx];
    dialogs = [...BUILTIN, ...x.dialogs];
    const at = dialogs.findIndex(d => d === keep || (keep.id && d.id === keep.id));
    if(at >= 0) dIdx = at; else { dIdx = Math.min(dIdx, dialogs.length - 1); renderDialog(); }
    $("#dLevel").textContent = `${dialogs[dIdx].level || state.level} · ${dIdx+1} из ${dialogs.length}${dialogs[dIdx].gen ? " · сгенерирован" : ""}`;
    $("#dPrev").disabled = dIdx === 0; $("#dNext").disabled = dIdx === dialogs.length-1;
  }
  if(!same(before.tr, x.tr) && x.tr && x.tr.queue && x.tr.queue.length){
    trQueue = x.tr.queue; trIdx = Math.min(x.tr.idx || 0, trQueue.length - 1);
    if($("#trResult").hidden) renderTr();
  }
  if(state.view === "stats") renderStats();
}

let cloud = null, user = null, syncing = false, again = false, syncTimer = null, lastSync = 0, unwatch = null;
function cloudDirty(){ if(!user) return; clearTimeout(syncTimer); syncTimer = setTimeout(syncNow, 2500); }
async function syncNow(){
  if(!cloud || !user || !navigator.onLine) return;
  if(syncing){ again = true; return; }
  syncing = true; acctUI();
  try{
    const remote = await cloud.load();
    const local = snapshot();
    const m = merge(local, remote);
    if(!same(m, local)) applySnapshot(m);
    if(!remote || !same(m, merge(remote, {}))) await cloud.save(m);
    lastSync = Date.now();
  }catch(e){ console.warn("sync", e); }
  syncing = false; acctUI();
  if(again){ again = false; syncNow(); }
}
function acctUI(){
  const b = $("#acctBtn");
  b.classList.toggle("out", !user);
  $("#acctAv").textContent = user ? ((user.name || user.email || "?").trim()[0] || "?").toUpperCase() : "?";
  $("#acctName").textContent = user ? (user.name || user.email.split("@")[0] || "Аккаунт") : "Войти";
  $("#acctSt").textContent = !cloud ? "прогресс только здесь" : !user ? "сохранять в облаке" : syncing ? "синхронизация…" : lastSync ? "синхронизировано" : "в облаке";
  $("#acctOut").hidden = !!user; $("#acctIn").hidden = !user;
  if(user){
    $("#acctEmail").textContent = user.email || user.name;
    $("#syncInfo").textContent = lastSync ? `Последняя синхронизация: ${new Date(lastSync).toLocaleTimeString("ru-RU", {hour: "2-digit", minute: "2-digit"})}. Прогресс, ошибки, ваши диалоги и настройки одинаковы на всех устройствах.` : "Синхронизация…";
  }
}
const authCopy = e => ({
  "auth/invalid-email": "Проверьте адрес почты.",
  "auth/missing-password": "Введите пароль.",
  "auth/weak-password": "Пароль должен быть не короче 6 символов.",
  "auth/email-already-in-use": "Такой аккаунт уже есть — нажмите «Войти».",
  "auth/invalid-credential": "Неверная почта или пароль.",
  "auth/wrong-password": "Неверная почта или пароль.",
  "auth/user-not-found": "Аккаунта с такой почтой нет — нажмите «Создать аккаунт».",
  "auth/too-many-requests": "Слишком много попыток. Подождите немного.",
  "auth/popup-closed-by-user": "",
  "auth/cancelled-popup-request": "",
  "auth/network-request-failed": "Нет связи. Проверьте интернет.",
  "auth/unauthorized-domain": "Вход с этого адреса ещё не разрешён в настройках Firebase.",
}[e && e.code] ?? "Не получилось войти. Попробуйте ещё раз.");
function acctMsg(err, ok){
  $("#acctErr").hidden = !err; $("#acctErr").textContent = err || "";
  $("#acctOk").hidden = !ok; $("#acctOk").textContent = ok || "";
}
$("#acctBtn").onclick = () => {
  if(!cloud){ showToast(FIREBASE ? "Вход загружается…" : "Вход и синхронизация скоро появятся."); return; }
  acctMsg(); acctUI(); $("#acctSheet").showModal();
};
$("#acctClose").onclick = () => $("#acctSheet").close();
const busy = async (btn, fn) => { btn.disabled = true; acctMsg(); try{ await fn(); }catch(e){ acctMsg(authCopy(e)); } finally{ btn.disabled = false; } };
$("#gSignIn").onclick = () => busy($("#gSignIn"), () => cloud.signInGoogle());
const creds = () => [$("#emIn").value.trim(), $("#pwIn").value];
$("#emailForm").addEventListener("submit", e => { e.preventDefault(); busy($("#emSignIn"), () => cloud.signInEmail(...creds())); });
$("#emSignUp").onclick = () => { if(!$("#emailForm").reportValidity()) return; busy($("#emSignUp"), async () => { await cloud.signUpEmail(...creds()); acctMsg("", "Аккаунт создан. Мы отправили письмо для подтверждения почты."); }); };
$("#emReset").onclick = () => { const em = $("#emIn").value.trim(); if(!em){ acctMsg("Сначала введите почту."); return; } busy($("#emReset"), async () => { await cloud.resetPassword(em); acctMsg("", "Письмо для смены пароля отправлено."); }); };
$("#signOut").onclick = async () => { await cloud.signOut(); acctMsg(); };
$("#syncNow").onclick = () => syncNow();
addEventListener("visibilitychange", () => { if(document.visibilityState === "visible") syncNow(); });

async function bootCloud(){
  if(!FIREBASE) { acctUI(); return; }
  try{ cloud = await (await import("./cloud.js")).startCloud(FIREBASE); }catch(e){ console.warn("cloud", e); cloud = null; }
  acctUI();
  if(!cloud) return;
  cloud.redirect.then(r => { if(r && r.code && authCopy(r)){ acctMsg(authCopy(r)); $("#acctSheet").showModal(); } });
  cloud.onAuth(u => {
    user = u; unwatch?.(); unwatch = null;
    if(u){
      if($("#acctSheet").open) $("#acctSheet").close();
      syncNow().then(() => {
        unwatch = cloud.watch(remote => {
          if(!remote || syncing) return;
          const local = snapshot(), m = merge(local, remote);
          if(!same(m, local)){ applySnapshot(m); lastSync = Date.now(); acctUI(); }
          if(!same(m, merge(remote, {}))) cloudDirty();
        });
      });
    } else lastSync = 0;
    acctUI();
  });
}

if(!synth) showToast("Этот браузер не умеет озвучивать текст. Откройте страницу в Chrome или Safari.");
renderDialog(); renderTr();
netState();
bootCloud();
}
