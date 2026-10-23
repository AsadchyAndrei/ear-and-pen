// Ear & Pen — the whole app: dictation, translation, progress, voice, phone layout, install, sync.
import { PROMPTS, JSON_TASKS } from "../prompts.js";
import { TOPICS, topicById, DIALOGS, SENTENCES } from "../content.js";
import { CIVICS, CIV_SECTIONS, CIV_ALIASES, CIV_ANS_RU, CIV_READ, CIV_WRITE, US_STATES } from "../civics.js";
import { API_URL, FIREBASE } from "../config.js";
import { merge, same } from "./merge.js";
import { grade as civGrade } from "./civmatch.js";
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
  sign_in_required:"Проверка и разбор от Claude доступны после входа.",
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
// Who may use Claude here: "ok", "guest" (not signed in), "no" (signed in, not on the list), "none" (no server).
// The server decides for real; this only shapes the buttons so nobody taps into an error.
let access = inClaude ? "ok" : API_URL ? "guest" : "none";
const canAI = () => access === "ok";
const LOCK = `<svg class="lk" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3.5" y="7" width="9" height="6.5" rx="1.5"/><path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7"/></svg>`;
const paidBtn = (id, label) => `<button class="btn primary" id="${id}" type="button" data-paid>${LOCK}<span class="gl">${label}</span></button>`;
function paintAccess(){
  const locked = !canAI();
  const tip = access === "guest" ? "Доступно после входа" : access === "no" ? "У этого аккаунта нет доступа к Claude" : access === "none" ? "Недоступно на этом сайте" : "";
  document.querySelectorAll("[data-paid]").forEach(b => {
    if(b.id === "trCheck") return;
    b.toggleAttribute("data-locked", locked); b.title = tip;
  });
  const gl = $("#trCheck .gl"); if(gl) gl.textContent = locked ? "Сверить с эталоном" : "Проверить";
  const note = access === "guest" ? `Claude пишет новые диалоги и предложения и разбирает ошибки — <button class="linkbtn" type="button" data-acct>после входа</button>.`
    : access === "no" ? "Этому аккаунту Claude недоступен: новые диалоги и разбор ошибок выключены." : "";
  for(const id of ["#dClaude", "#trClaude"]){ $(id).hidden = !note; $(id + " .ct").innerHTML = note; }
  document.querySelectorAll(".gen").forEach(g => { g.hidden = locked; });
  try{ paintWho(); $("#sNo").hidden = !!SR || serverSTT(); }catch{}
}
document.addEventListener("click", e => { if(e.target.closest("[data-acct]")) openAcct(""); });
function needAccess(what){
  if(canAI()) return true;
  if(access === "guest" && cloud){ openAcct(`${what} — после входа.`); return false; }
  showToast(access === "no" ? errCopy({code: "not_allowed"}) : access === "guest" ? "Вход ещё загружается — попробуйте через секунду." : NO_AI);
  return false;
}
async function refreshAccess(){
  if(inClaude || !API_URL) return;
  if(!user){ access = "guest"; paintAccess(); acctUI(); return; }
  try{
    const r = await fetch(API_URL.replace(/\/$/, "") + "/me", { headers: await authHeaders() });
    const j = await r.json();
    access = j.allowed ? "ok" : j.reason === "not_allowed" ? "no" : j.reason === "sign_in_required" ? "guest" : "ok";
  }catch{ access = "ok"; } // offline or a hiccup: let the server decide when a button is used
  paintAccess(); acctUI();
}
const live = $("#live");
// a button whose text changes keeps one width: all its texts are laid in the same spot, only one is visible
function setLabel(el, html, variants){
  if(!el) return;
  const key = variants.join("|");
  let st = el.querySelector(":scope > .stk");
  if(!st || st.dataset.v !== key){
    el.innerHTML = `<span class="stk">${variants.map(v => `<span aria-hidden="true">${v}</span>`).join("")}<span class="now"></span></span>`;
    st = el.querySelector(":scope > .stk"); st.dataset.v = key;
  }
  st.querySelector(".now").innerHTML = html;
}
function announce(msg){ live.textContent = ""; setTimeout(() => { live.textContent = msg; }, 60); }
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
    if(body.error === "sign_in_required"){ access = "guest"; paintAccess(); if(cloud) setTimeout(() => openAcct("Проверка и разбор от Claude — после входа."), 0); }
    if(body.error === "not_allowed"){ access = "no"; paintAccess(); }
    throw {code: body.error || "upstream_error"};
  }
  if(JSON_TASKS.includes(task)) return body.data;
  opts.onText?.({text: body.text});
  return body.text;
}

/* ---------- prefs: level and topic live in one sheet, shown as a chip next to "new dialogue" ---------- */
const state = {
  level: store.get("level","B1"), topic: store.get("topic","Повседневные ситуации"), custom: store.get("custom",""),
  rate: store.get("rate",0.85), voiceA: store.get("voiceA",""), voiceB: store.get("voiceB",""), view: "dict",
  dmode: store.get("dmode","write") === "speak" ? "speak" : "write"
};
$("#level").value = state.level;
// topics are ids from content.js; settings saved by the first version kept the Russian name
const OLD_TOPICS = {"Повседневные ситуации":"daily","Работа: HVAC и стройка":"hvac","Собеседование и карьера":"career","Магазины и сервисы":"shop","Школа и дети":"school","Путешествия":"travel","Врач и здоровье":"doctor"};
const normTopic = v => OLD_TOPICS[v] || (topicById(v) || v === "__custom" ? v : "daily");
$("#topic").innerHTML = TOPICS.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join("") + `<option value="__custom">Своя тема…</option>`;
state.topic = normTopic(state.topic); $("#topic").value = state.topic;
$("#topicCustom").value = state.custom;
$("#customWrap").hidden = $("#topic").value !== "__custom";
const topicText = () => $("#topic").value === "__custom" ? ($("#topicCustom").value.trim() || "everyday life") : (topicById($("#topic").value)?.prompt || "everyday life");
function setPref(k, v){ state[k] = v; store.set(k, v); store.set("prefsTs", Date.now()); cloudDirty(); }
const shortTopic = () => {
  if($("#topic").value !== "__custom") return topicById($("#topic").value)?.short || "";
  const t = $("#topicCustom").value.trim() || "своя тема";
  return t.length > 18 ? t.slice(0, 17) + "…" : t;
};
function paintSet(){ document.querySelectorAll(".setlbl").forEach(el => { el.innerHTML = `<span>${esc(state.level)}</span><span class="sl-tp"> · ${esc(shortTopic())}</span>`; }); }
$("#level").onchange = e => { setPref("level", e.target.value); paintSet(); jumpTo(); newBankQueue(); };
$("#topic").onchange = e => { setPref("topic", e.target.value); $("#customWrap").hidden = state.topic !== "__custom"; if(!$("#customWrap").hidden) $("#topicCustom").focus(); paintSet(); jumpTo(); newBankQueue(); };
$("#topicCustom").oninput = e => { setPref("custom", e.target.value); paintSet(); };
// one window: settings (gear in the header), or "what should Claude write" before a new dialogue / new sentences
let setMode_ = "settings";
function openSet(mode = "settings"){
  setMode_ = mode;
  const gen = mode !== "settings";
  $("#setSheet").classList.toggle("gen", gen);
  $("#setTitle").textContent = mode === "gen" ? "Новый диалог от Claude" : mode === "trgen" ? "Новые предложения от Claude" : "Настройки";
  $("#setNote").textContent = gen ? "Выберите уровень и тему — Claude напишет под них." : "Ваш уровень и тема: по ним подбираются предложения для перевода и пишет Claude.";
  $("#setGo").hidden = !gen; $("#setGo").textContent = mode === "gen" ? "Написать диалог" : "Подобрать предложения";
  setLabel($("#setDone"), gen ? "Отмена" : "Готово", ["Отмена", "Готово"]); $("#setDone").classList.toggle("primary", !gen);
  $("#setSheet").showModal();
}
document.addEventListener("click", e => { if(e.target.closest("[data-set]")) openSet(); });
$("#setBtn").onclick = () => openSet();
$("#setClose").onclick = $("#setDone").onclick = () => $("#setSheet").close();
$("#setGo").onclick = () => { $("#setSheet").close(); if(setMode_ === "gen") genDialog(); else if(setMode_ === "trgen") genSentences(); };
paintSet();

/* ---------- tabs ---------- */
const TABS = ["dict", "tr", "rev", "stats"];
document.querySelectorAll("nav.tabs button").forEach(b => b.onclick = () => showView(b.dataset.view));
$("nav.tabs").addEventListener("keydown", e => {
  const i = TABS.indexOf(state.view);
  const L = TABS.length;
  const to = e.key === "ArrowRight" ? TABS[(i + 1) % L] : e.key === "ArrowLeft" ? TABS[(i + L - 1) % L] : e.key === "Home" ? TABS[0] : e.key === "End" ? TABS[L - 1] : null;
  if(!to) return;
  e.preventDefault(); showView(to); $("#tab-" + to).focus();
});
function showView(v){
  state.view = v;
  document.querySelectorAll("nav.tabs button").forEach(b => { const on = b.dataset.view === v; b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1; });
  TABS.forEach(x => $("#view-"+x).hidden = x !== v);
  if(v === "stats"){ renderStats(); renderVoice(); }
  if(v === "rev"){ if(rpos >= rq.length) startRev(); else renderRev(); }
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
    player.src = src; player.playbackRate = 1;
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
// a line whose HD audio is still coming shows a spinner on its play button (and on the phone bar)
let loadT = 0;
let soundLoading = false;
function setLoading(on){
  soundLoading = !!on;
  clearTimeout(loadT);
  const apply = f => {
    document.querySelectorAll(".line.loading").forEach(l => l.classList.remove("loading"));
    if(f) $(".line.cur")?.classList.add("loading");
    $("#mbar").classList.toggle("loading", f);
    $("#rPlay")?.classList.toggle("loading", f);
  };
  if(on) loadT = setTimeout(() => apply(true), 150); else apply(false);
}
async function speak(text, who = "A", mul = 1){
  const pick = pickFor(who), tok = speakToken;
  if(pick.startsWith("g:") && hdOn){
    const rate = mul < 1 ? (HD_RATES[HD_RATES.indexOf(nearestRate(state.rate)) - 1] || HD_RATES[0]) : nearestRate(state.rate);
    try{
      setLoading(true);
      const blob = await hdBlob(text, pick.slice(2), rate);
      setLoading(false);
      if(tok !== speakToken) return;
      await playBlob(blob);
      return;
    }catch(e){
      setLoading(false);
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
let playingAll = false;
const PLAY_I = `<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4 2.5v11l9-5.5z"/></svg>`;
const PAUSE_I = `<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="3.5" y="2.5" width="3" height="11" rx="1"/><rect x="9.5" y="2.5" width="3" height="11" rx="1"/></svg>`;
const STOP_I = `<svg class="ic-stop" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="4" y="4" width="8" height="8" rx="1.5"/></svg>`;
const MIC_I = `<svg class="ic-mic" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><rect x="5.5" y="1.75" width="5" height="8" rx="2.5"/><path d="M3.25 7.5a4.75 4.75 0 0 0 9.5 0M8 12.25v2"/></svg>`;
const TURTLE = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M2.5 10.5h10a5 4.2 0 0 0-10 0z"/><path d="M12.5 9.8c.6-.9 1.4-1.3 2.2-1"/><path d="M4.5 10.5v2M10.5 10.5v2"/></svg>`;
function paintPlayAll(){
  const b = $("#dPlayAll"); b.setAttribute("aria-pressed", String(playingAll));
  const A = `${PLAY_I}<span>Слушать<span class="pl-long"> весь диалог</span></span>`, B = `${PAUSE_I}<span>Пауза</span>`;
  setLabel(b, playingAll ? B : A, [A, B]);
}
function stopSpeech(){
  speakToken++;
  playOff();
  setLoading(false);
  if(playingAll){ playingAll = false; paintPlayAll(); }
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
const lvlOf = d => d.own ? "свой" : d.level || "B1";
const BUILTIN = DIALOGS.map(d => ({ ...d, lines: d.lines.map(([s, text]) => ({ s, text })), vocab: (d.vocab || []).map(([en, ru]) => ({ en, ru })) }));
let dialogs = [...BUILTIN, ...store.get("genDialogs", [])];
// the last dialogue you opened; the first time, one that matches your topic and level
let dIdx = dialogs.findIndex(d => d.id && d.id === store.get("dId", ""));
if(dIdx < 0) dIdx = dialogs.findIndex(d => d.topic === state.topic && lvlOf(d) === state.level);
if(dIdx < 0) dIdx = Math.max(0, dialogs.findIndex(d => d.topic === state.topic));
let dChecked = false, dRecorded = false;

const topicShort = d => d.own ? "Свой текст" : d.gen ? (topicById(d.topic)?.short || "от Claude") : (topicById(d.topic)?.short || "");
function paintEyebrow(){
  const d = dialogs[dIdx];
  $("#dLevel").innerHTML = d.own ? `${esc(topicShort(d))} · ${dIdx+1}/${dialogs.length}` : `${esc(topicShort(d))} · <span class="lv">${esc(lvlOf(d))}</span>${d.gen ? " · от Claude" : ""} · ${dIdx+1}/${dialogs.length}`;
  $("#dDel").hidden = !(d.own || d.gen);
  $("#dLevel").setAttribute("aria-label", `Выбрать диалог. Сейчас: ${topicShort(d)}, уровень ${lvlOf(d)}, ${dIdx+1} из ${dialogs.length}`);
  $("#dPrev").disabled = dIdx === 0; $("#dNext").disabled = dIdx === dialogs.length-1;
}
function renderDialog(){
  const d = dialogs[dIdx];
  stopSpeech(); stopListening(); dChecked = false; dRecorded = false; sBest = []; sRecorded = false; mine = [];
  $("#view-dict").classList.remove("checked");
  $("#dCheck").textContent = "Проверить";
  paintEyebrow();
  $("#dTitle").textContent = d.title;
  $("#dContext").textContent = d.context_ru || "";
  if(civInit) civRefresh();
  const sp = d.speakers || {};
  const speakMode = state.dmode === "speak";
  $("#lines").classList.toggle("hidetext", speakMode && !$("#sText").checked);
  $("#lines").innerHTML = d.lines.map((l,i) => { const who = sp[l.s] || l.s; return `
    <div class="line${speakMode ? " sp" : ""}" data-i="${i}">
      <div class="who ${l.s==="B"?"B":""}"><b aria-hidden="true">${l.s==="B"?"B":"A"}</b><span title="${esc(who)}">${esc(who)}</span><span class="eq" aria-hidden="true"><i></i><i></i><i></i></span></div>
      <div class="ctrls">
        <button class="btn play" type="button" title="Прослушать" aria-label="Прослушать строку ${i+1}">${PLAY_I}</button>
        <button class="btn slow" type="button" title="Медленно" aria-label="Медленно, строка ${i+1}">${TURTLE}</button>
      </div>
      ${speakMode ? `<div class="sayrow"><span class="txt" lang="en">${esc(l.text)}</span><span class="txt-h">Текст скрыт — повторите на слух</span><button class="btn mic" type="button" title="Сказать" aria-label="Сказать строку ${i+1}" aria-pressed="false"${SR || CAN_REC ? "" : " disabled"}>${MIC_I}${STOP_I}</button></div>` : `<input type="text" id="dl-${dIdx}-${i}" aria-label="Строка ${i+1}, ${esc(who)}: что вы услышали" autocomplete="off" autocorrect="off" autocapitalize="sentences" spellcheck="false" lang="en" enterkeyhint="${i === d.lines.length - 1 ? "done" : "next"}" placeholder="Строка ${i+1}…">`}
    </div>`; }).join("");
  paintSpeakDone();
  $("#dSummary").hidden = $("#dExplainWrap").hidden = $("#dVocabWrap").hidden = $("#dPartial").hidden = true;
  store.set("dId", d.id || "");
  setCur(0);
  updateBar();
}
// a new topic or level in the sheet opens a matching dialogue (unless you are mid-way through this one)
function jumpTo(){
  const cur = dialogs[dIdx], t = $("#topic").value;
  if(cur.topic === t && lvlOf(cur) === state.level) return;
  const typed = [...document.querySelectorAll(".line input")].some(i => i.value.trim());
  if(typed && !dChecked) return;
  let at = dialogs.findIndex(x => x.topic === t && lvlOf(x) === state.level);
  if(at < 0) at = dialogs.findIndex(x => x.topic === t);
  if(at < 0 && t === "__custom") return;
  if(at < 0) at = dialogs.findIndex(x => lvlOf(x) === state.level);
  if(at >= 0 && at !== dIdx){ dIdx = at; renderDialog(); }
}
// all dialogues: filter by topic and level, see your best result
let pkTopic = null, pkLevel = "all";
function bestOf(id){ let b = null; if(!id) return b; for(const h of store.get("history", [])) if(h.k === "dict" && h.d === id) b = Math.max(b ?? 0, h.p); return b; }
function renderPicker(){
  const hasGen = dialogs.some(d => d.gen), hasOwn = dialogs.some(d => d.own);
  $("#pkTopic").innerHTML = `<option value="all">Все темы</option>` + (hasOwn ? `<option value="own">Мои тексты</option>` : "") + TOPICS.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join("") + (hasGen ? `<option value="gen">От Claude</option>` : "");
  if((pkTopic === "gen" && !hasGen) || (pkTopic === "own" && !hasOwn)) pkTopic = "all";
  $("#pkTopic").value = pkTopic;
  document.querySelectorAll("#pkLevel button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.l === pkLevel)));
  const items = dialogs.map((d, i) => ({ d, i })).filter(({ d }) => (pkTopic === "all" || (pkTopic === "own" ? d.own : pkTopic === "gen" ? d.gen : d.topic === pkTopic && !d.gen && !d.own)) && (pkLevel === "all" || lvlOf(d) === pkLevel));
  let last = "";
  $("#dlgList").innerHTML = items.length ? items.map(({ d, i }) => {
    const g = pkTopic === "all" ? (d.own ? "Мои тексты" : d.gen ? "От Claude" : topicById(d.topic)?.name || "") : "";
    const head = g && g !== last ? `<li class="dlggroup">${esc(g)}</li>` : ""; last = g || last;
    const b = bestOf(d.id);
    return `${head}<li><button type="button" class="dlgitem${i === dIdx ? " on" : ""}" data-i="${i}" ${i === dIdx ? 'aria-current="true"' : ""}>
      <span class="t"><b lang="en">${esc(d.title)}</b><span class="note">${esc(d.context_ru || "")}</span></span>
      <span class="m"><span class="chip">${esc(lvlOf(d))}</span>${b != null ? `<span class="best ${scClass(b)}" title="Лучший результат">${b}%</span>` : ""}</span></button></li>`;
  }).join("") : `<li class="empty">Здесь пока нет диалогов этого уровня.</li>`;
}
$("#dLevel").onclick = () => { pkTopic = dialogs[dIdx].own ? "own" : dialogs[dIdx].gen ? "gen" : (dialogs[dIdx].topic || "all"); pkLevel = "all"; renderPicker(); $("#dlgSheet").showModal(); $("#dlgList .on")?.scrollIntoView({block: "center"}); };
$("#dlgClose").onclick = () => $("#dlgSheet").close();
$("#pkTopic").onchange = e => { pkTopic = e.target.value; renderPicker(); };
$("#pkLevel").addEventListener("click", e => { const b = e.target.closest("[data-l]"); if(b){ pkLevel = b.dataset.l; renderPicker(); } });
$("#dlgList").addEventListener("click", e => { const b = e.target.closest(".dlgitem"); if(!b) return; dIdx = +b.dataset.i; renderDialog(); $("#dlgSheet").close(); if(!isPhone()) lineInput(0)?.focus(); });
// the line being worked on (phones control it from the bar above the keyboard)
let cur = 0;
function setCur(i){
  cur = Math.max(0, Math.min(i, dialogs[dIdx].lines.length - 1));
  document.querySelectorAll(".line").forEach(l => l.classList.toggle("cur", +l.dataset.i === cur));
  $("#mbPos").textContent = `${cur + 1}/${dialogs[dIdx].lines.length}`;
  setLabel($("#mbNext"), cur === dialogs[dIdx].lines.length - 1 ? "Проверить" : "Дальше", ["Проверить", "Дальше"]);
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
  if(e.target.closest(".mic")) sayLine(i);
  else if(state.dmode === "speak" && !e.target.closest("button")) setCur(i);
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
  if(playingAll){ stopSpeech(); return; }
  const d = dialogs[dIdx]; stopSpeech(); const tok = speakToken;
  playingAll = true; paintPlayAll();
  prefetch(d.lines);
  for(let i=0;i<d.lines.length;i++){
    if(tok !== speakToken) return;
    const row = $(`.line[data-i="${i}"]`); row?.classList.add("playing");
    setCur(i); mediaInfo(d, i);
    await speak(d.lines[i].text, d.lines[i].s);
    row?.classList.remove("playing");
    if(tok !== speakToken) return;
    await new Promise(r => setTimeout(r, 450));
  }
  if(tok === speakToken){ playingAll = false; paintPlayAll(); }
};
paintPlayAll();
$("#dPrev").onclick = () => { if(dIdx>0){ dIdx--; renderDialog(); } };
$("#dNext").onclick = () => { if(dIdx<dialogs.length-1){ dIdx++; renderDialog(); } };
$("#dReset").onclick = renderDialog;
// peek at the line you are on (not the whole dialogue); tap again to hide it
$("#dPeek").onclick = () => {
  const row = $(`.line[data-i="${cur}"]`); if(!row || row.querySelector(".result")) return;
  const shown = row.querySelector(".reveal");
  if(shown){ shown.remove(); return; }
  const el = document.createElement("div"); el.className = "reveal"; el.textContent = dialogs[dIdx].lines[cur].text; row.append(el);
};

// why a word was missed — a short, honest reason instead of repeating the whole sentence
const WEAK = new Set("a an the to for of and or but at in on as can could would should was were is are am be been have has had do does did you your he him her his it its we us they them their that than some there".split(" "));
function lev(a, b){
  const m = a.length, n = b.length; if(!m || !n) return m || n;
  let prev = Array.from({length: n + 1}, (_, j) => j);
  for(let i = 1; i <= m; i++){ const row = [i]; for(let j = 1; j <= n; j++) row[j] = Math.min(prev[j] + 1, row[j-1] + 1, prev[j-1] + (a[i-1] === b[j-1] ? 0 : 1)); prev = row; }
  return prev[n];
}
function whyMiss(o){
  const right = norm(o.e || "", false), yours = norm(o.w || "", false);
  if(/'/.test(o.e || "") || /'/.test(o.w || "")) return "Сокращение: 'd, 'll, 's, 're, n't звучат очень коротко.";
  if(o.t === "miss") return WEAK.has(right) ? "Пропущено короткое безударное слово — в речи его почти не слышно." : "Слово пропущено.";
  if(WEAK.has(right)) return "Безударное служебное слово звучит слабо — его легко спутать.";
  if(lev(yours, right) <= 2) return "Похожие на слух слова.";
  return "Услышано другое слово.";
}

const bare = w => String(w || "").replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, "");
let lastDict = null;
function checkDictation(force){
  stopSpeech();
  const d = dialogs[dIdx], strict = $("#strict").checked, n = d.lines.length, half = Math.ceil(n / 2);
  const rows = [...document.querySelectorAll(".line")];
  const typed = rows.map(r => r.querySelector("input").value);
  const filled = typed.filter(t => t.trim()).length;
  if(!filled){ showToast("Сначала напишите хотя бы одну строку."); lineInput(cur)?.focus(); return; }
  if(!force && filled < half){
    $("#dPartialTxt").textContent = `Заполнено ${filled} из ${n} строк.`;
    $("#dPartial").hidden = false;
    $("#dPartial").scrollIntoView({block: "nearest", behavior: "smooth"});
    return;
  }
  $("#dPartial").hidden = true; $("#intro").hidden = true;
  const results = [];
  rows.forEach((row, i) => {
    row.querySelectorAll(".reveal,.result").forEach(x => x.remove());
    const el = document.createElement("div"); el.className = "result";
    if(!typed[i].trim()){
      el.innerHTML = `<span class="sc skip">не заполнено</span><span class="skipped">${esc(d.lines[i].text)}</span>`;
    } else {
      const r = diff(d.lines[i].text, typed[i], strict);
      results.push({expected: d.lines[i].text, typed: typed[i], pct: r.pct, ops: r.ops});
      el.innerHTML = `<span class="sc ${scClass(r.pct)}">${r.pct}%</span>` + diffHTML(r.ops);
    }
    row.append(el);
  });
  const avg = Math.round(results.reduce((k, r) => k + r.pct, 0) / results.length);
  const errCount = results.reduce((k, r) => k + r.ops.filter(o => o.t !== "eq").length, 0);
  const skipped = n - results.length, counts = filled >= half;
  dChecked = true; lastDict = {d, results, avg};
  $("#view-dict").classList.add("checked");
  updateBar();
  // one result per dialogue, and only when at least half of it was done
  if(counts && !dRecorded){
    dRecorded = true;
    pushResult("dict", avg, {d: d.id || ""});
    saveMistakes(results.flatMap(r => r.ops.filter(o => o.t === "sub" || o.t === "miss")
      .map(o => ({kind: "dict", type: "listening", yours: o.t === "miss" ? "(пропуск)" : bare(o.w), better: bare(o.e), why: whyMiss(o), ctx: r.expected}))).slice(0, 12));
  }
  const verdict = avg>=95?"Отлично — почти без ошибок.":avg>=80?"Хорошо. Посмотрите на выделенные слова.":avg>=60?"Неплохо, но часть потерялась на слух. Переслушайте строки на 0.7×.":"Сложно на этой скорости. Включите 0.7× и слушайте каждую строку по 2–3 раза.";
  $("#dSummary").hidden = false;
  $("#dSummary").innerHTML = `<div class="summary">
      <div><div class="big">${avg}%</div><div class="note">точность${skipped ? `<br>по ${results.length} из ${n} строк` : ""}</div></div>
      <div style="flex:1;min-width:200px"><p style="margin:0">${verdict}</p>
      <p class="note" style="margin-top:4px">${errCount ? `Ошибок и пропусков: ${errCount}. ` : "Ошибок нет. "}${skipped ? `Не заполнено строк: ${skipped}. ` : ""}${counts ? "" : "В статистику не записано — сделано меньше половины. "}<ins class="w">жёлтым</ins> — правильное слово, <del class="w">красным</del> — что вы написали, <ins class="w miss">пунктиром</ins> — пропущено.</p></div>
      ${errCount ? paidBtn("dExplainBtn", "Разобрать ошибки с Claude") : ""}
    </div>`;
  $("#dExplainBtn") && ($("#dExplainBtn").onclick = explainDictation);
  paintAccess();
  if(d.vocab?.length){
    $("#dVocabWrap").hidden = false;
    $("#dVocab").innerHTML = d.vocab.map(v => `<li><span><b lang="en">${esc(v.en)}</b> — ${esc(v.ru)}</span>${playBtn(v.en)}</li>`).join("");
  }
  announce(`Проверено. Точность ${avg} процентов${errCount ? `, ошибок и пропусков ${errCount}` : ", ошибок нет"}.`);
  if(isPhone()) setTimeout(() => $("#dSummary").scrollIntoView({block: "start", behavior: "smooth"}), 100);
}
$("#dCheck").onclick = () => checkDictation();
$("#dPartialYes").onclick = () => checkDictation(true);
$("#dPartialNo").onclick = () => {
  $("#dPartial").hidden = true;
  const empty = [...document.querySelectorAll(".line input")].findIndex(i => !i.value.trim());
  if(empty >= 0){ lineInput(empty)?.focus(); }
};

let explainCtl = null;
async function explainDictation(){
  if(!needAccess("Разбор ошибок от Claude")) return;
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

$("#dGen").onclick = () => { if(needAccess("Новые диалоги от Claude")) openSet("gen"); };
async function genDialog(){
  const btn = $("#dGen"), gl = btn.querySelector(".gl"); btn.disabled = true; setLabel(gl, `<span class="spin" style="display:inline-block;vertical-align:-2px;margin-right:6px"></span>Пишу диалог…`, ["Новый диалог", `<span class="spin" style="display:inline-block;vertical-align:-2px;margin-right:6px"></span>Пишу диалог…`]);
  try{
    const lvl = state.level;
    const data = await ai("dialogue", {level: lvl, topic: topicText(), avoid: dialogs.map(d => d.title).slice(-12).join("; ")});
    if(!data || !Array.isArray(data.lines) || !data.lines.length) throw {code:"invalid_json"};
    const d = { id: "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at: Date.now(), level: lvl, gen: true, topic: $("#topic").value, title: String(data.title || "New dialogue"), context_ru: String(data.context_ru || ""),
      speakers: data.speakers || {A:"A",B:"B"}, lines: data.lines.filter(l => l && l.text).map(l => ({s: l.s === "B" ? "B" : "A", text: String(l.text)})),
      vocab: Array.isArray(data.vocab) ? data.vocab.slice(0,8).map(v => ({en:String(v.en||""), ru:String(v.ru||"")})) : [] };
    const gen = store.get("genDialogs", []); gen.push(d); store.set("genDialogs", gen.slice(-60)); cloudDirty();
    dialogs = [...BUILTIN, ...store.get("genDialogs", [])]; dIdx = dialogs.length - 1; renderDialog();
    $(`.line[data-i="0"] input`)?.focus();
  }catch(e){
    showToast(e.code === "unavailable" ? NO_AI : errCopy(e));
  }finally{ btn.disabled = false; setLabel(gl, "Новый диалог", ["Новый диалог", `<span class="spin" style="display:inline-block;vertical-align:-2px;margin-right:6px"></span>Пишу диалог…`]); }
}



/* ---------- your own voice: record each try and play it next to the speaker ---------- */
const CAN_REC = !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
let mine = [], recFails = 0, soloRec = null;
// Safari: MP4/AAC (it may record WebM but not always play it back); others: WebM/Opus, which our server can send to Google as is
const IS_SAFARI = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent);
const REC_TYPES = IS_SAFARI ? ["audio/mp4", "audio/aac", "audio/webm;codecs=opus", "audio/webm"] : ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm", "audio/mp4"];
// one audio context, started on the tap itself (iPhone only allows that from a tap)
let actx = null;
function audioCtx(){
  try{ actx ||= new (window.AudioContext || window.webkitAudioContext)(); if(actx.state !== "running") actx.resume().catch(() => {}); }catch{ actx = null; }
  return actx;
}
// which microphone: the one chosen in the list (computers often have several), else the system default
async function micStream(){
  const base = {echoCancellation: true, noiseSuppression: true}, id = store.get("micId", "");
  if(id){ try{ return await navigator.mediaDevices.getUserMedia({audio: {...base, deviceId: {exact: id}}}); }catch(e){ if(e?.name !== "OverconstrainedError" && e?.name !== "NotFoundError") throw e; store.set("micId", ""); } }
  return navigator.mediaDevices.getUserMedia({audio: base});
}
async function paintMics(){
  try{
    const list = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "audioinput" && d.deviceId && d.deviceId !== "communications");
    const wrap = $("#micWrap"), sel = $("#micSel");
    wrap.hidden = list.length < 2;
    if(list.length < 2) return;
    const cur = store.get("micId", "");
    sel.innerHTML = list.map((d, i) => `<option value="${esc(d.deviceId)}">${esc(d.label || `Микрофон ${i + 1}`)}</option>`).join("");
    sel.value = list.some(d => d.deviceId === cur) ? cur : (list.find(d => d.deviceId === "default") || list[0]).deviceId;
  }catch{}
}
$("#micSel").onchange = e => store.set("micId", e.target.value === "default" ? "" : e.target.value);
navigator.mediaDevices?.addEventListener?.("devicechange", paintMics);
// where to look when the microphone gives silence
function micHelp(){
  const ua = navigator.userAgent, mac = /Macintosh/.test(ua) && !(navigator.maxTouchPoints > 1), win = /Windows/.test(ua);
  const many = !$("#micWrap").hidden ? " Если микрофонов несколько — выберите другой: ⚙ рядом с «Говорить» → «микрофон»." : "";
  if(isIOS()) return "Проверьте, что сайту разрешён микрофон: Настройки → Приложения → Safari → Микрофон." + many;
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : "браузер";
  return `Микрофон присылает тишину — скорее всего, ${browser} слушает не тот микрофон или он выключен.${many} Проверьте значок микрофона в адресной строке${mac ? `, а в macOS — Системные настройки → Конфиденциальность и безопасность → Микрофон → ${browser} и уровень входа в Настройках звука` : win ? ", а в Windows — Параметры → Конфиденциальность → Микрофон и устройство ввода в Параметрах звука" : ""}.`;
}
async function startRec(){
  const stream = await micStream();
  paintMics();
  const type = REC_TYPES.find(t => MediaRecorder.isTypeSupported?.(t)) || "";
  const mr = new MediaRecorder(stream, type ? {mimeType: type} : undefined), chunks = [];
  // raw sound straight from the microphone, next to the recording: sent for recognition and used to tell silence,
  // so nothing depends on decoding the recorded file (Chrome reads its MP4 as empty, Safari may fail on its own file)
  const live = {frames: [], rate: 0}; let src = null, proc = null;
  try{
    const ctx = actx || audioCtx();
    if(ctx){
      src = ctx.createMediaStreamSource(stream); proc = ctx.createScriptProcessor(4096, 1, 1); live.rate = ctx.sampleRate;
      proc.onaudioprocess = e => live.frames.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      src.connect(proc); proc.connect(ctx.destination);
    }
  }catch{ src = proc = null; }
  mr.ondataavailable = e => { if(e.data?.size) chunks.push(e.data); };
  const done = new Promise(res => { mr.onstop = () => {
    try{ src?.disconnect(); proc?.disconnect(); }catch{}
    stream.getTracks().forEach(t => t.stop());
    const blob = chunks.length ? new Blob(chunks, {type: mr.mimeType || type || "audio/mp4"}) : null;
    if(blob){ blob.live = livePCM(live); blob.peak = blob.live ? blob.live.peak : -1; }
    res(blob);
  }; });
  mr.start(250);
  const guard = setTimeout(() => { if(mr.state !== "inactive") mr.stop(); }, 20000);
  return { stop(){ clearTimeout(guard); if(mr.state !== "inactive") mr.stop(); return done; } };
}
// raw frames → 16 kHz 16-bit PCM and the loudest sample; null when the microphone gave us nothing to measure
function livePCM({frames, rate}){
  const n = frames.reduce((k, f) => k + f.length, 0);
  if(!rate || n < rate * 0.3) return null;
  const all = new Float32Array(n); let o = 0; for(const f of frames){ all.set(f, o); o += f.length; }
  const step = rate / 16000, m = Math.floor(n / step), out = new Int16Array(m);
  let peak = 0;
  for(let k = 0; k < m; k++){
    const from = Math.floor(k * step), to = Math.max(from + 1, Math.floor((k + 1) * step));
    let v = 0; for(let j = from; j < to; j++) v += all[j];
    v /= (to - from); peak = Math.max(peak, Math.abs(v));
    out[k] = Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
  }
  return {pcm: out.buffer, peak, secs: n / rate};
}
// silent only when we could really measure it
const silent = blob => !blob || blob.size < 600 || (blob.peak >= 0 && blob.peak < 0.01);
const recInfo = blob => blob ? `${(blob.type || "?").split(";")[0]}, ${Math.round(blob.size / 1024)} КБ, уровень ${blob.peak < 0 ? "не измерен" : Math.round(blob.peak * 100) + "%"}${blob.live ? "" : `, звук с микрофона: ${actx ? actx.state : "нет"}`}` : "файла нет";
// record without recognition (no speech recognition here, or it clashes with recording): tap to start, tap to stop
async function recordOnly(i, btn, out){
  audioCtx(); stopSpeech(); stopListening();
  let rec;
  try{ rec = await startRec(); }catch(e){ out.classList.add("err"); out.textContent = e?.name === "NotAllowedError" ? SR_ERR["not-allowed"] : "Не получилось включить микрофон."; return; }
  out.classList.remove("err"); out.textContent = "Идёт запись — скажите фразу и нажмите ещё раз.";
  btn.classList.add("on", "rec-on"); btn.setAttribute("aria-pressed", "true");
  const row = btn.closest(".line"); row?.classList.add("listening");
  soloRec = rec;
  const blob = await new Promise(res => { soloRec = { stop: () => { soloRec = null; rec.stop().then(res); } }; });
  btn.classList.remove("on", "rec-on"); btn.setAttribute("aria-pressed", "false"); row?.classList.remove("listening");
  const quiet = silent(blob);
  out.classList.toggle("err", quiet);
  if(quiet) await paintMics();
  out.textContent = quiet ? `Похоже, запись беззвучная (${recInfo(blob)}). Послушайте «Я». ${micHelp()}` : "";
  if(blob && i >= 0){ setMine(i, blob); paintMine(i); playMine(i, "both"); }
  return blob;
}
const REC_LBL = ["● Записать себя", "● Записать заново", "■ Стоп"];
function setMine(i, blob){ mine[i] = blob; }
const ME_I = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="8" cy="5.5" r="2.7"/><path d="M2.8 14c.6-2.8 2.7-4.3 5.2-4.3s4.6 1.5 5.2 4.3"/></svg>`;
const BOTH_I = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5h9l-2.5-2.5M13 11H4l2.5 2.5"/></svg>`;
// buttons under a line: the speaker, me, one after the other (and a separate recorder where needed)
function paintMine(i){
  const row = $(`.line[data-i="${i}"]`); if(!row) return;
  let box = row.querySelector(".mine");
  const solo = !serverSTT() && SR && CAN_REC && $("#sRec").checked && store.get("recSolo", false);
  if(!mine[i] && !solo){ box?.remove(); return; }
  if(!box){ box = document.createElement("div"); box.className = "mine"; row.append(box); }
  box.innerHTML = `<button class="btn" type="button" data-pm="ref">${PLAY_I}Диктор</button>`
    + (mine[i] ? `<button class="btn" type="button" data-pm="me">${ME_I}Я</button><button class="btn" type="button" data-pm="both">${BOTH_I}По очереди</button>` : "")
    + (solo ? `<button class="btn" type="button" data-pm="rec"></button>` : "");
  const rb = box.querySelector('[data-pm="rec"]'); if(rb) setLabel(rb, mine[i] ? "● Записать заново" : "● Записать себя", REC_LBL);
}
async function playMine(i, what){
  const d = dialogs[dIdx], l = d.lines[i]; if(!l) return;
  stopSpeech(); const tok = speakToken;
  const row = $(`.line[data-i="${i}"]`), mark = k => row?.querySelectorAll("[data-pm]").forEach(b => b.classList.toggle("on", b.dataset.pm === k));
  if(what === "ref" || what === "both"){ mark("ref"); await speak(l.text, l.s); }
  if(tok !== speakToken){ mark(""); return; }
  if(what === "both") await new Promise(r => setTimeout(r, 350));
  if((what === "me" || what === "both") && mine[i] && tok === speakToken){ mark("me"); await playBlob(mine[i]); }
  if(tok === speakToken) mark("");
}
$("#lines").addEventListener("click", async e => {
  const b = e.target.closest("[data-pm]"); if(!b) return;
  const row = b.closest(".line"), i = +row.dataset.i;
  if(b.dataset.pm === "rec"){
    if(soloRec){ soloRec.stop(); return; }
    let heard = row.querySelector(".heard");
    if(!heard){ heard = document.createElement("div"); heard.className = "heard"; heard.setAttribute("aria-live", "polite"); row.append(heard); }
    b.classList.add("rec-on"); setLabel(b, "■ Стоп", REC_LBL);
    await recordOnly(i, b, heard);
    return;
  }
  playMine(i, b.dataset.pm);
});
$("#sRec").checked = store.get("sRec", true);
$("#sRec").onchange = e => { store.set("sRec", e.target.checked); if(e.target.checked) store.set("recSolo", false); };


/* ---------- the page under an open window does not scroll ---------- */
let lockY = 0;
function syncLock(){
  const open = [...document.querySelectorAll("dialog")].some(d => d.open);
  const html = document.documentElement, locked = html.classList.contains("locked");
  if(open && !locked){
    lockY = scrollY;
    document.body.style.top = `-${lockY}px`;
    html.classList.add("locked");
  } else if(!open && locked){
    html.classList.remove("locked");
    document.body.style.top = "";
    scrollTo(0, lockY);
  }
}
new MutationObserver(syncLock).observe(document.body, {subtree: true, attributes: true, attributeFilter: ["open"]});


/* ---------- a short tour on the first visit (and from Settings) ---------- */
const TI = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const TOUR = [
  {ic: TI('<path d="M15 4l5 5L9 20H4v-5z"/>'), t: "Диктант", x: "Слушайте строку диалога и пишите, что услышали. «Проверить» подсветит ошибки, а Claude объяснит, почему слово легко ослышать. Скорость — 0.7×, 0.85× или 1×."},
  {ic: TI('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'), t: "Говорить", x: "Переключатель «Писать / Говорить»: повторяйте строку вслух, приложение покажет слова, которые не распознались, и даст сравнить вашу запись с диктором."},
  {ic: TI('<path d="M4 6h9M8.5 4v2c0 4-2 7-5 8.5M6 10c1.5 2 3.5 3.5 6 4.5"/><path d="M13 20l4-9 4 9M14.5 17h5"/>'), t: "Перевод", x: "Русское предложение — ваш перевод на английский — разбор: оценка, исправленный и «носительский» вариант, правило для каждой ошибки."},
  {ic: TI('<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v4h-4"/>'), t: "Повтор", x: "Ваши ошибки и полезные выражения из пройденных диалогов возвращаются через 1, 3, 7, 14, 30 и 60 дней — пока не запомнятся. Число на вкладке — сколько ждёт сегодня."},
  {ic: TI('<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>'), t: "Сегодня", x: "Кольцо в шапке — цель на день и серия дней подряд. Там же цель настраивается и включаются ежедневные напоминания на телефон."},
  {ic: TI('<path d="M12 5v14M5 12h14"/>'), t: "Свой текст и аккаунт", x: "Вставьте любой английский текст — получится диктант. Войдите в аккаунт: прогресс синхронизируется между устройствами, и включатся функции Claude. Настройки — ⚙ в шапке."},
];
let tourI = 0;
function paintTour(){
  const st = TOUR[tourI];
  $("#tourIc").innerHTML = st.ic; $("#tourTitle").textContent = st.t; $("#tourText").textContent = st.x;
  $("#tourDots").innerHTML = TOUR.map((_, k) => `<i class="${k === tourI ? "on" : ""}"></i>`).join("");
  $("#tourBack").hidden = tourI === 0;
  $("#tourNext").textContent = tourI === TOUR.length - 1 ? "Начать" : "Дальше";
  $("#tourSkip").hidden = tourI === TOUR.length - 1;
}
function openTour(){ tourI = 0; paintTour(); $("#tourSheet").showModal(); $("#tourNext").focus(); }
const endTour = () => { $("#tourSheet").close(); store.set("introSeen", true); };
$("#tourNext").onclick = () => { if(tourI < TOUR.length - 1){ tourI++; paintTour(); } else endTour(); };
$("#tourBack").onclick = () => { if(tourI > 0){ tourI--; paintTour(); } };
$("#tourSkip").onclick = endTour;
$("#tourSheet").addEventListener("cancel", () => store.set("introSeen", true));
$("#tourAgain").onclick = () => { $("#setSheet").close(); openTour(); };


/* ---------- my goal: a real event with a date, readiness and today's plan ---------- */
const bestKind = (id, kind) => { let b = null; if(!id) return b; for(const h of store.get("history", [])) if(h.k === kind && h.d === id) b = Math.max(b ?? 0, h.p); return b; };
const GOAL_NAMES = {citizen: "Интервью на гражданство", career: "Собеседование на работу", local104: "Работа в Local 104", hvac: "Работа в HVAC", clinic: "Работа в клинике", electro: "Работа электрологом", court: "Иммиграционный суд", doctor: "Приём у врача", school: "Встреча в школе", travel: "Поездка", shop: "Магазины и сервисы", daily: "Английский для жизни"};
const target = () => { const t = store.get("target", null); return t && t.topic && t.date ? t : null; };
const daysLeft = t => Math.ceil((new Date(t.date + "T00:00:00") - new Date(dk() + "T00:00:00")) / DAY);
function readiness(t){
  const list = BUILTIN.filter(d => d.topic === t.topic);
  if(!list.length) return null;
  const n = list.length, voice = !!(SR || serverSTT());
  const written = list.filter(d => (bestKind(d.id, "dict") ?? 0) >= 80).length;
  const spoken = list.filter(d => (bestKind(d.id, "speak") ?? 0) >= 80).length;
  const keys = new Set(list.flatMap(d => (d.vocab || []).map(v => "w:" + wordKey(v.en))));
  const rev = revState();
  const learned = [...keys].filter(k => (rev[k]?.step || 0) >= 2).length;
  const pct = Math.round(100 * (voice ? 0.4 * written / n + 0.35 * spoken / n + 0.25 * learned / Math.max(1, keys.size) : 0.6 * written / n + 0.4 * learned / Math.max(1, keys.size)));
  const left = (n - written) + (voice ? n - spoken : 0);
  // citizenship: the civics test is half of being ready
  const civ = t.topic === "citizen" && civInit ? civStats() : null;
  const all = civ ? Math.round(pct / 2 + 50 * civ.known / Math.max(1, civ.total)) : pct;
  return {pct: all, n, written, spoken, voice, phrases: keys.size, learned, left, civ};
}
function paintGoal(){
  const t = target(), bar = $("#goalBar");
  if(!t){
    $("#gbTitle").textContent = "Поставьте цель с датой";
    $("#gbSub").textContent = "Интервью, собеседование, работа — приложение составит план";
    $("#gbPct").hidden = true; return;
  }
  const r = readiness(t), d = daysLeft(t);
  $("#gbTitle").textContent = t.title;
  $("#gbPct").hidden = !r; if(r) $("#gbPct").textContent = r.pct + "%";
  if(d < 0) $("#gbSub").textContent = "Дата прошла — как всё прошло? Поставьте следующую цель";
  else {
    const per = r && r.left ? Math.ceil(r.left / Math.max(1, d)) : 0;
    const cq = r?.civ ? Math.ceil((r.civ.total - r.civ.known) / Math.max(1, d)) : 0;
    const plan = [per ? `${per} ${plural(per, "диалог", "диалога", "диалогов")}` : "", cq ? `${cq} ${plural(cq, "вопрос", "вопроса", "вопросов")} теста` : ""].filter(Boolean).join(" и ");
    $("#gbSub").textContent = `${d === 0 ? "сегодня" : d === 1 ? "завтра" : `через ${daysWord(d)}`}${r ? ` · ${plan ? `по плану: ${plan} в день` : "всё пройдено — повторяйте"}` : ""}`;
  }
}
function goalDetail(){
  const kind = $("#goalKind").value, t = {topic: kind, title: $("#goalName").value, date: $("#goalDate").value};
  const r = readiness(t), el = $("#goalDetail");
  el.hidden = !r || !t.date;
  if(el.hidden) return;
  const d = daysLeft(t);
  el.innerHTML = `<div class="row"><b>Готовность</b><b>${r.pct}%</b></div><div class="meter"><i style="width:${r.pct}%"></i></div>
    <div>Диалоги письменно: ${r.written} из ${r.n}${r.voice ? ` · голосом: ${r.spoken} из ${r.n}` : ""}</div>
    <div>Выражения выучены: ${r.learned} из ${r.phrases}</div>
    ${r.civ ? `<div>Вопросы теста USCIS: выучено ${r.civ.known} из ${r.civ.total}</div>` : ""}
    ${d >= 0 && r.left ? `<div class="note">Осталось ${r.left} ${plural(r.left, "задание", "задания", "заданий")} — примерно ${Math.ceil(r.left / Math.max(1, d))} в день. Каждый день — «Начать занятие».</div>` : ""}`;
}
function openGoal(){
  const t = target();
  $("#goalKind").innerHTML = TOPICS.map(x => `<option value="${x.id}">${esc(GOAL_NAMES[x.id] || x.name)}</option>`).join("");
  $("#goalKind").value = t?.topic || (TOPICS.some(x => x.id === state.topic) ? state.topic : "citizen");
  $("#goalName").value = t?.title || GOAL_NAMES[$("#goalKind").value] || "";
  const soon = new Date(Date.now() + 30 * DAY);
  $("#goalDate").value = t?.date || dk(soon.getTime());
  $("#goalDate").min = dk();
  $("#goalRemove").hidden = !t;
  goalDetail();
  $("#goalSheet").showModal();
}
$("#gbGoal").onclick = openGoal;
$("#goalClose").onclick = () => $("#goalSheet").close();
$("#goalKind").onchange = e => { const prev = Object.values(GOAL_NAMES); if(!$("#goalName").value || prev.includes($("#goalName").value)) $("#goalName").value = GOAL_NAMES[e.target.value] || ""; goalDetail(); };
$("#goalDate").onchange = goalDetail;
$("#goalSave").onclick = () => {
  const topic = $("#goalKind").value, date = $("#goalDate").value;
  if(!date){ $("#goalDate").focus(); return; }
  setPref("target", {topic, title: $("#goalName").value.trim() || GOAL_NAMES[topic] || topicById(topic)?.name || "Моя цель", date, at: Date.now()});
  // practise that topic from now on
  if(state.topic !== topic){ setPref("topic", topic); $("#topic").value = topic; $("#customWrap").hidden = true; paintSet(); jumpTo(); newBankQueue(); }
  $("#goalSheet").close(); paintGoal();
  showToast("Цель сохранена. Каждый день — «Начать занятие».");
};
$("#goalRemove").onclick = () => { setPref("target", null); $("#goalSheet").close(); paintGoal(); };

/* ---------- start a session: one button, a short practice put together for you ---------- */
let sess = null;
function pickDialog(topic){
  const lv = LV.indexOf(state.level), near = d => Math.abs(LV.indexOf(lvlOf(d)) - lv);
  const list = BUILTIN.filter(d => d.topic === topic);
  if(!list.length) return dialogs[dIdx];
  const unwritten = list.filter(d => (bestKind(d.id, "dict") ?? 0) < 80).sort((a, b) => near(a) - near(b));
  if(unwritten.length) return unwritten[0];
  const unspoken = list.filter(d => (bestKind(d.id, "speak") ?? 0) < 80).sort((a, b) => near(a) - near(b));
  if(unspoken.length) return unspoken[0];
  return [...list].sort((a, b) => (bestKind(a.id, "speak") ?? 0) - (bestKind(b.id, "speak") ?? 0))[0];
}
function startSession(){
  const topic = target()?.topic || state.topic;
  const d = pickDialog(topic);
  const steps = [];
  const due = dueItems().length;
  if(due) steps.push({k: "rev", label: `Повтор: ${due} ${plural(due, "карточка", "карточки", "карточек")}`});
  const voice = !!(SR || serverSTT());
  if((bestKind(d.id, "dict") ?? 0) < 80 || !voice) steps.push({k: "dict", d: d.id, label: `Диалог на слух: «${d.title}»`});
  if(voice) steps.push({k: "speak", d: d.id, label: `Тот же диалог — вслух`});
  if(topic === "citizen") steps.push({k: "civ", n: 5, label: "Тест USCIS: 5 вопросов"});
  steps.push({k: "tr", n: 3, label: "Перевод: 3 предложения"});
  if(CAN_REC && !voiceLog().some(v => v.w === weekKey())) steps.push({k: "voice", label: "Запись голоса этой недели"});
  sess = {steps, i: 0, tr: 0};
  goStep();
}
function goStep(){
  const st = sess.steps[sess.i]; if(!st) return finishSession();
  if(st.k === "rev"){ rq = []; rpos = 0; showView("rev"); }
  if(st.k === "dict" || st.k === "speak"){
    const at = dialogs.findIndex(x => x.id === st.d);
    if(at >= 0 && at !== dIdx){ dIdx = at; }
    if(state.dmode !== (st.k === "speak" ? "speak" : "write")) setMode(st.k === "speak" ? "speak" : "write"); else renderDialog();
    showView("dict"); scrollTo({top: 0, behavior: "smooth"});
  }
  if(st.k === "tr"){ sess.tr = 0; showView("tr"); }
  if(st.k === "civ"){ sess.civ = 0; openCiv("q"); }
  if(st.k === "voice"){ showView("stats"); setTimeout(() => $("#voiceCard").scrollIntoView({block: "center", behavior: "smooth"}), 150); }
  paintSess();
}
function paintSess(){
  const bar = $("#sessBar");
  bar.hidden = !sess; document.body.classList.toggle("has-sess", !!sess);
  if(!sess) return;
  const st = sess.steps[sess.i];
  $("#sbStep").textContent = `Занятие · шаг ${sess.i + 1} из ${sess.steps.length}`;
  $("#sbLbl").textContent = st.done ? "Готово! " + st.label : st.label;
  $("#sbDots").innerHTML = sess.steps.map((x, k) => `<i class="${x.done ? "done" : k === sess.i ? "now" : ""}"></i>`).join("");
  bar.classList.toggle("ready", !!st.done);
  setLabel($("#sbNext"), sess.i === sess.steps.length - 1 ? "Завершить" : "Дальше →", ["Дальше →", "Завершить"]);
}
function sessHit(kind, d){
  if(!sess) return;
  const st = sess.steps[sess.i]; if(!st || st.done) return;
  const ok = (kind === st.k && (st.k === "dict" || st.k === "speak") && d === st.d) || (st.k === "rev" && kind === "revdone") || (st.k === "voice" && kind === "voice")
    || (st.k === "tr" && kind === "tr" && ++sess.tr >= st.n) || (st.k === "civ" && kind === "civ" && ++sess.civ >= st.n);
  if(ok){ st.done = true; paintSess(); announce("Шаг выполнен"); }
}
function finishSession(){
  const done = sess ? sess.steps.filter(x => x.done).length : 0, all = sess ? sess.steps.length : 0;
  sess = null; paintSess();
  if(all) showToast(done === all ? "Занятие завершено — отличная работа!" : `Занятие завершено: выполнено ${done} из ${all}.`);
  paintGoal(); checkGoal();
}
$("#sessStart").onclick = startSession;
$("#sbNext").onclick = () => { sess.i++; goStep(); };
$("#sbSkip").onclick = () => { sess.i++; goStep(); };
$("#sbClose").onclick = finishSession;

/* ---------- how I sound: the same phrase once a week, kept on this device ---------- */
const VOICE_TEXT = "The weather in the north is usually colder, but this Thursday it was warmer than we thought.";
function weekKey(ts = Date.now()){ const d = new Date(ts); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return dk(d.getTime()); }
const voiceLog = () => store.get("voiceLog", []);
const VC_LBL = ["● Записать эту неделю", "● Перезаписать эту неделю", "■ Стоп"];
function renderVoice(){
  const log = voiceLog(), w = weekKey(), has = log.some(v => v.w === w);
  $("#vcText").textContent = VOICE_TEXT; $("#vcRef").dataset.say = VOICE_TEXT;
  $("#vcWhen").textContent = has ? "эта неделя записана ✓" : log.length ? "пора записать эту неделю" : "";
  $("#vcRec").disabled = !CAN_REC;
  if(!$("#vcRec").classList.contains("rec-on") && !$("#vcRec").classList.contains("on")) setLabel($("#vcRec"), has ? "● Перезаписать эту неделю" : "● Записать эту неделю", VC_LBL);
  $("#vcCompare").hidden = log.length < 2;
  $("#vcList").innerHTML = [...log].reverse().map(v => `<li><span class="d">Неделя с ${new Date(v.w + "T12:00:00").toLocaleDateString("ru-RU", {day: "numeric", month: "long"})}</span>${v.pct != null ? `<span class="p">${v.pct}%</span>` : ""}<button class="btn icon" type="button" data-vplay="${v.w}" aria-label="Послушать запись"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.5v11l9-5.5z"/></svg></button></li>`).join("");
}
$("#vcRec").onclick = async () => {
  if(listening){ stopListening(true); return; }
  if(soloRec){ soloRec.stop(); return; }
  const btn = $("#vcRec"), out = $("#vcOut");
  let blob = null, pct = null;
  if(serverSTT()){
    setLabel(btn, "■ Стоп", VC_LBL);
    const r = await hearServer(VOICE_TEXT, btn, out);
    blob = r?.blob || null; if(r && !r.failed) pct = r.pct;
    if(r && !r.failed) out.innerHTML = `<span class="sc ${scClass(r.pct)}">${r.pct}%</span> ${diffHTML(r.ops)}`;
  } else if(CAN_REC){
    setLabel(btn, "■ Стоп", VC_LBL);
    blob = await recordOnly(-1, btn, out);
  }
  if(blob && !silent(blob)){
    const w = weekKey();
    await idb.put("voice:" + w, blob);
    const log = voiceLog().filter(v => v.w !== w); log.push({w, t: Date.now(), pct}); log.sort((a, b) => a.w < b.w ? -1 : 1);
    store.set("voiceLog", log.slice(-52));
    if(pct == null) out.textContent = "Сохранено. Послушайте себя рядом с диктором.";
    sessHit("voice");
  }
  btn.classList.remove("rec-on", "on");
  renderVoice();
};
document.addEventListener("click", async e => {
  const b = e.target.closest("[data-vplay]"); if(!b) return;
  const blob = await idb.get("voice:" + b.dataset.vplay); if(blob) playBlob(blob);
});
$("#vcCompare").onclick = async () => {
  const log = voiceLog(); if(log.length < 2) return;
  const a = await idb.get("voice:" + log[0].w), z = await idb.get("voice:" + log[log.length - 1].w);
  const tok = speakToken;
  if(a) await playBlob(a);
  if(tok !== speakToken) return;
  await new Promise(r => setTimeout(r, 500));
  if(z && tok === speakToken) await playBlob(z);
};

/* ---------- your own text: paste English, it becomes a dictation ---------- */
const NO_SPLIT = new Set("mr mrs ms dr st jr sr vs etc e.g i.e u.s u.k no fig approx inc ltd co corp dept ave blvd rd mt ft lb oz jan feb mar apr jun jul aug sep sept oct nov dec mon tue wed thu fri sat sun".split(" "));
// sentences, with abbreviations like Dr. and a.m. kept inside
function sentences(text){
  const out = []; let start = 0;
  const re = /[.!?…]+["'”’)\]]*\s+(?=["'“‘(\[]?[A-Z0-9])/g; let m;
  while((m = re.exec(text))){
    const before = text.slice(start, m.index + 1).trim();
    const last = (before.match(/([A-Za-z.]+)\.$/) || [])[1]?.toLowerCase();
    if(last && (NO_SPLIT.has(last) || /^[a-z]$/i.test(last))) continue;
    out.push(text.slice(start, m.index + m[0].length).trim()); start = m.index + m[0].length;
  }
  const rest = text.slice(start).trim(); if(rest) out.push(rest);
  return out;
}
// long sentences are split at a comma or semicolon near the middle, so a line is easy to hold in memory
const MAX_W = 20;
function shorten(s){
  const words = s.split(/\s+/);
  if(words.length <= MAX_W) return [s];
  const mid = s.length / 2; let best = -1;
  const re = /[,;:—–]\s+/g; let m;
  while((m = re.exec(s))){ const at = m.index + m[0].length; const left = s.slice(0, at).split(/\s+/).length; if(left < 4 || words.length - left < 4) continue; if(best < 0 || Math.abs(at - mid) < Math.abs(best - mid)) best = at; }
  if(best < 0){
    // no comma: a conjunction near the middle
    const cj = /\s(?=(?:and|but|because|so|which|when|while|before|after|if|until|although)\s)/g;
    while((m = cj.exec(s))){ const at = m.index + 1; const left = s.slice(0, at).split(/\s+/).length - 1; if(left < 5 || words.length - left < 5) continue; if(best < 0 || Math.abs(at - mid) < Math.abs(best - mid)) best = at; }
  }
  if(best < 0) return [s];
  return [...shorten(s.slice(0, best).trim()), ...shorten(s.slice(best).trim())];
}
const OWN_LINES = 15, OWN_PARTS = 6;
function parseOwn(raw){
  const rows = String(raw).replace(/\r/g, "").split(/\n+/).map(l => l.replace(/^\s*(?:[-•*▪●]|\d+[.)])\s+/, "").replace(/\s+/g, " ").trim()).filter(l => /[A-Za-z]/.test(l));
  const spRe = /^([A-Z][A-Za-z.'’ -]{0,24}):\s+(.+)$/;
  const named = rows.filter(l => spRe.test(l)).length;
  const units = [], names = [];
  if(named >= 2 && named >= rows.length * 0.6){
    for(const l of rows){
      const m = l.match(spRe);
      if(m){ let i = names.indexOf(m[1]); if(i < 0){ names.push(m[1]); i = names.length - 1; } units.push({s: i % 2 ? "B" : "A", text: m[2]}); }
      else if(units.length) units[units.length - 1].text += " " + l;
    }
  } else {
    // a line broken in the middle of a sentence (copied from a PDF) continues the previous one
    for(const l of rows){
      const prev = units[units.length - 1];
      if(prev && !/[.!?:;,"”)…]$/.test(prev.text) && /^[a-z]/.test(l)) prev.text += " " + l;
      else units.push({s: "A", text: l});
    }
  }
  const lines = [];
  for(const u of units){
    // a very short sentence ("Almost.") goes together with the next one
    const sn = sentences(u.text), merged = [];
    for(let i = 0; i < sn.length; i++){
      if(sn[i].split(/\s+/).length < 3 && i + 1 < sn.length){ sn[i + 1] = sn[i] + " " + sn[i + 1]; continue; }
      merged.push(sn[i]);
    }
    for(const x of merged) for(const part of shorten(x)) lines.push({s: u.s, text: part});
  }
  const cyr = (raw.match(/[А-Яа-яЁё]/g) || []).length, lat = (raw.match(/[A-Za-z]/g) || []).length;
  return {lines, names, mostlyRu: cyr > lat};
}
function ownInfo(){
  const {lines, names, mostlyRu} = parseOwn($("#ownText").value);
  const parts = Math.ceil(lines.length / OWN_LINES);
  $("#ownMake").disabled = !lines.length || mostlyRu;
  $("#ownInfo").classList.toggle("ownwarn", mostlyRu || parts > OWN_PARTS);
  $("#ownInfo").textContent = mostlyRu ? "Похоже, текст на русском. Вставьте английский текст." : !lines.length ? ""
    : `${lines.length} ${plural(lines.length, "фраза", "фразы", "фраз")}${names.length ? `, голоса: ${names.slice(0, 2).join(" и ")}${names.length > 2 ? " (и другие по очереди)" : ""}` : ""}${parts > 1 ? ` · будет ${Math.min(parts, OWN_PARTS)} ${plural(Math.min(parts, OWN_PARTS), "часть", "части", "частей")} по ${Math.ceil(Math.min(lines.length, OWN_PARTS * OWN_LINES) / Math.min(parts, OWN_PARTS))} строк` : ""}${parts > OWN_PARTS ? `. Длинный текст: войдут первые ${OWN_PARTS * OWN_LINES} фраз` : ""}.${canAI() ? "" : " Озвучка — голосом браузера; HD-голос для своих текстов — после входа."}`;
}
$("#ownBtn").onclick = () => { $("#ownText").value = ""; $("#ownName").value = ""; ownInfo(); $("#ownSheet").showModal(); $("#ownText").focus(); };
$("#pkOwn").onclick = () => { $("#dlgSheet").close(); $("#ownBtn").click(); };
$("#ownClose").onclick = $("#ownCancel").onclick = () => $("#ownSheet").close();
$("#ownText").addEventListener("input", ownInfo);
$("#ownMake").onclick = () => {
  const {lines, names} = parseOwn($("#ownText").value);
  if(!lines.length) return;
  const words = lines.map(l => l.text).join(" ").split(/\s+/);
  const base = $("#ownName").value.trim() || words.slice(0, 5).join(" ").replace(/[.,;:!?]+$/, "") + (words.length > 5 ? "…" : "");
  // equal parts of up to OWN_LINES lines
  const use = lines.slice(0, OWN_PARTS * OWN_LINES), n = Math.ceil(use.length / OWN_LINES), size = Math.ceil(use.length / n);
  const parts = [];
  for(let i = 0; i < use.length; i += size) parts.push(use.slice(i, i + size));
  const t = Date.now(), made = parts.map((ls, k) => ({
    id: "o" + t.toString(36) + k + Math.random().toString(36).slice(2, 5), at: t + k, own: true, topic: "own",
    title: base + (parts.length > 1 ? ` · ${k + 1}/${parts.length}` : ""),
    context_ru: `Ваш текст · ${ls.length} ${plural(ls.length, "фраза", "фразы", "фраз")}`,
    speakers: {A: names[0] || "Диктор", B: names[1] || "B"}, lines: ls, vocab: []
  }));
  const gen = store.get("genDialogs", []); gen.push(...made); store.set("genDialogs", gen.slice(-60)); cloudDirty();
  dialogs = [...BUILTIN, ...store.get("genDialogs", [])];
  dIdx = dialogs.findIndex(d => d.id === made[0].id);
  $("#ownSheet").close(); renderDialog();
  showToast(made.length > 1 ? `Готово: ${made.length} ${plural(made.length, "часть", "части", "частей")}. Следующая — кнопкой →.` : "Готово — можно начинать.");
};
// delete your own text or a dialogue from Claude (on every device)
$("#dDel").onclick = () => {
  const d = dialogs[dIdx]; if(!(d.own || d.gen)) return;
  showToast(`Удалить «${d.title}»?`, {label: "Удалить", fn: () => {
    store.set("genDialogs", store.get("genDialogs", []).filter(x => x.id !== d.id));
    if(d.id) store.set("gone", [...store.get("gone", []), d.id].slice(-300));
    cloudDirty();
    dialogs = [...BUILTIN, ...store.get("genDialogs", [])];
    dIdx = Math.max(0, Math.min(dIdx - 1, dialogs.length - 1)); renderDialog();
  }}, 7000);
};

/* ---------- translation ---------- */
const LV = ["A2", "B1", "B2", "C1"];
/* ---------- speaking: repeat a line aloud, the browser's speech recognition checks the words ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
const SPEAK_PASS = 85;
let sBest = [], sRecorded = false, listening = null;
// numbers are written in many ways: compare "$40", "forty dollars", "2:40" and "two forty" fairly
const ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split(" ");
const TENS = "  twenty thirty forty fifty sixty seventy eighty ninety".split(" ");
function card(n, and){
  if(n < 20) return ONES[n];
  if(n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : "");
  if(n < 1000) return ONES[Math.floor(n / 100)] + " hundred" + (n % 100 ? (and ? " and " : " ") + card(n % 100) : "");
  if(n < 1e6) return card(Math.floor(n / 1000), and) + " thousand" + (n % 1000 ? (and && n % 1000 < 100 ? " and " : " ") + card(n % 1000, and) : "");
  return String(n);
}
// "two forty", "nineteen eighty five", "fourteen eighty", "one oh five"
function pairs(n){
  if(n >= 2000 && n < 2010) return "two thousand" + (n % 10 ? " " + ONES[n % 10] : "");
  if(n >= 100 && n < 10000){
    const hi = Math.floor(n / 100), lo = n % 100;
    return card(hi) + (lo === 0 ? " hundred" : lo < 10 ? " oh " + ONES[lo] : " " + card(lo));
  }
  return card(n);
}
const ORD = {one: "first", two: "second", three: "third", five: "fifth", eight: "eighth", nine: "ninth", twelve: "twelfth"};
const ordinal = w => w.replace(/(\w+)$/, x => ORD[x] || (x.endsWith("y") ? x.slice(0, -1) + "ieth" : x + "th"));
const ABBR = [[/\ba\.\s?m\b\.?/g, "am"], [/\bp\.\s?m\b\.?/g, "pm"], [/\bdr\./g, "doctor"], [/\bmr\./g, "mister"], [/\bmrs\./g, "missus"], [/\bms\./g, "miz"], [/\bok\b/g, "okay"], [/\bst\./g, "street"], [/\bave\./g, "avenue"], [/\btv\b/g, "tv"]];
// "there's" and "there is" are the same thing said (recognition writes either)
const CONTR = [[/\bwon't\b/g, "will not"], [/\bcan't\b/g, "can not"], [/\bcannot\b/g, "can not"], [/\bshan't\b/g, "shall not"], [/\blet's\b/g, "let us"],
  [/n't\b/g, " not"], [/'re\b/g, " are"], [/'ve\b/g, " have"], [/'ll\b/g, " will"], [/'m\b/g, " am"], [/'d\b/g, " would"],
  [/\b(it|that|there|here|what|where|who|how|he|she|this|that)'s\b/g, "$1 is"]];
function spNorm(text, style){
  let s = String(text).replace(/[’‘`´]/g, "'").toLowerCase();
  for(const [re, to] of ABBR) s = s.replace(re, to);
  for(const [re, to] of CONTR) s = s.replace(re, to);
  s = s.replace(/(\d),(\d{3})/g, "$1$2")
    .replace(/\$(\d+(?:\.\d+)?)/g, "$1 dollars")
    .replace(/(\d)\s?%/g, "$1 percent")
    .replace(/\b(\d{1,2}):(\d{2})\b/g, (m, h, mm) => h + (mm === "00" ? "" : mm[0] === "0" ? " oh " + Number(mm) : " " + mm))
    .replace(/\b(\d+)(st|nd|rd|th)\b/g, (m, n) => ordinal(card(Number(n))))
    .replace(/\d+(?:\.\d+)?/g, m => {
      const [a, b] = m.split("."), n = Number(a);
      const w = style === "pairs" ? pairs(n) : card(n, style === "and");
      return b ? w + " point " + [...b].map(x => ONES[x]).join(" ") : w;
    })
    .replace(/[-–—/&]/g, m => m === "&" ? " and " : " ");
  return s;
}
// best match over the recognizer's alternatives and the ways numbers can be written
function scoreSpeech(expected, alts){
  let best = null;
  for(const heard of alts) for(const style of ["plain", "and", "pairs"]){
    const r = diff(spNorm(expected, style), spNorm(heard, style), false);
    if(!best || r.pct > best.pct) best = {...r, heard, style};
  }
  if(!best) return {ops: [], pct: 0, heard: ""};
  best.ops = toOwnWords(expected, best.style, best.ops) || best.ops;
  return best;
}
// show the line's own words (capitals, punctuation, "there's") instead of the normalised ones:
// each original word owns the normalised words it became ("there's" → "there is", "$40" → "forty dollars")
function toOwnWords(expected, style, ops){
  const orig = toks(String(expected).replace(/[-–—/]/g, " ")).filter(w => norm(w, false));
  const owner = [];
  orig.forEach((w, k) => { for(const x of toks(spNorm(w, style))) if(norm(x, false)) owner.push(k); });
  const total = toks(spNorm(expected, style)).filter(w => norm(w, false)).length;
  if(owner.length !== total) return null;
  const out = []; let j = 0, cur = null;
  const flush = () => {
    if(!cur) return;
    const word = orig[cur.k], parts = cur.parts;
    if(parts.every(o => o.t === "eq")) out.push({t: "eq", e: word, w: word});
    else { const heard = parts.filter(o => o.w).map(o => o.w).join(" "); out.push(heard ? {t: "sub", e: word, w: heard} : {t: "miss", e: word}); }
    cur = null;
  };
  // which original word the next expected-side op belongs to
  const nextOwner = (i, jj) => { for(let x = i; x < ops.length; x++) if(ops[x].t !== "extra") return owner[jj]; return -1; };
  for(let i = 0; i < ops.length; i++){
    const o = ops[i];
    if(o.t === "extra"){ if(cur && nextOwner(i + 1, j) === cur.k) cur.parts.push(o); else { flush(); out.push(o); } continue; }
    const k = owner[j++];
    if(!cur || cur.k !== k){ flush(); cur = {k, parts: []}; }
    cur.parts.push(o);
  }
  flush();
  return out;
}
const SR_ERR = {
  "not-allowed": "Нет доступа к микрофону. Разрешите микрофон для этого сайта в настройках браузера.",
  "service-not-allowed": "Распознавание речи недоступно. На iPhone проверьте, что включена диктовка: Настройки → Основные → Клавиатура → Диктовка.",
  "audio-capture": "Микрофон не найден.",
  "network": "Для распознавания речи нужен интернет.",
  "language-not-supported": "Этот браузер не распознаёт английскую речь."
};
function stopListening(keep){ if(!listening) return; const r = listening; if(!keep) listening = null; try{ keep ? r.stop() : r.abort(); }catch{} }
// one utterance → list of alternative transcripts (empty if nothing was heard)
function listen(onInterim){
  return new Promise((resolve, reject) => {
    let r;
    try{ r = new SR(); }catch(e){ reject("start"); return; }
    listening = r;
    r.lang = state.accent || "en-US"; r.interimResults = true; r.maxAlternatives = 5; r.continuous = false;
    let alts = [], err = "";
    const guard = setTimeout(() => { try{ r.stop(); }catch{} }, 15000);
    r.onresult = e => {
      const res = [...e.results];
      onInterim?.(res.map(x => x[0].transcript).join(" ").trim());
      if(res.every(x => x.isFinal)){
        alts = res.length === 1 ? [...res[0]].map(a => a.transcript) : [res.map(x => x[0].transcript).join(" ")];
      }
    };
    r.onerror = e => { err = e.error || "error"; };
    r.onend = () => {
      clearTimeout(guard); if(listening === r) listening = null;
      if(alts.length) resolve(alts.filter(Boolean));
      else if(err && err !== "no-speech" && err !== "aborted") reject(err);
      else resolve([]);
    };
    try{ r.start(); }catch(e){ clearTimeout(guard); listening = null; reject("start"); }
  });
}
// listen for one line: the button shows it is recording, live text goes to `out`
// recognition on our server (Google): one microphone user — the recording — so it works the same on every phone
const serverSTT = () => canAI() && CAN_REC && !!API_URL;
async function toPCM16(blob){
  const C = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  let ctx; try{ ctx = new C(1, 16000, 16000); }catch{ ctx = new C(1, 48000, 48000); }
  const data = await blob.arrayBuffer();
  const a = await new Promise((res, rej) => { const p = ctx.decodeAudioData(data, res, rej); if(p?.then) p.then(res, rej); });
  const L = a.getChannelData(0), R = a.numberOfChannels > 1 ? a.getChannelData(1) : null;
  const step = a.sampleRate / 16000, n = Math.floor(L.length / step), out = new Int16Array(n);
  let peak = 0;
  for(let k = 0; k < n; k++){
    const from = Math.floor(k * step), to = Math.max(from + 1, Math.floor((k + 1) * step));
    let v = 0; for(let j = from; j < to; j++) v += R ? (L[j] + R[j]) / 2 : L[j];
    v /= (to - from); peak = Math.max(peak, Math.abs(v));
    out[k] = Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
  }
  return {pcm: out.buffer, peak};
}
const STT_ERR = {sign_in_required: "Распознавание на сервере — после входа.", not_allowed: "Распознавание на сервере доступно не всем аккаунтам.", daily_limit: "На сегодня лимит распознавания исчерпан.", rate_limited: "Слишком часто — подождите минуту.", too_short: "Слишком коротко — скажите фразу целиком.", too_large: "Слишком длинная запись — скажите одну фразу.", stt_failed: "Сервис распознавания сейчас недоступен.", stt_not_configured: "Распознавание на сервере ещё не подключено."};
// tap: record; tap again: stop, send, compare
async function hearServer(expected, btn, out){
  audioCtx(); stopSpeech();
  let rec;
  try{ rec = await startRec(); }catch(e){ out.classList.add("err"); out.textContent = e?.name === "NotAllowedError" ? SR_ERR["not-allowed"] : "Не получилось включить микрофон."; return null; }
  btn.classList.add("on"); btn.setAttribute("aria-pressed", "true");
  out.classList.remove("err"); out.textContent = "Говорите… Когда закончите — нажмите на микрофон ещё раз.";
  const row = btn.closest(".line"); row?.classList.add("listening");
  let aborted = false;
  const blob = await new Promise(res => { listening = { stop(){ listening = null; rec.stop().then(res); }, abort(){ listening = null; aborted = true; rec.stop().then(res); } }; });
  btn.classList.remove("on"); btn.setAttribute("aria-pressed", "false"); row?.classList.remove("listening");
  if(aborted) { out.textContent = ""; return null; }
  if(silent(blob)){ out.classList.add("err"); await paintMics(); out.textContent = `Запись беззвучная (${recInfo(blob)}). ${micHelp()}`; return null; }
  out.textContent = "Распознаю…";
  let alts;
  try{
    // raw sound if we have it; otherwise WebM/Ogg Opus as is; otherwise decode the file here
    let body, enc;
    if(blob.live){ body = blob.live.pcm; enc = "l16"; }
    else if(/webm|ogg/.test(blob.type)){ body = blob; enc = blob.type.includes("ogg") ? "ogg" : "webm"; }
    else {
      try{ body = (await toPCM16(blob)).pcm; enc = "l16"; }
      catch(e){ throw {code: "decode", detail: `${e?.name || "ошибка"}: ${recInfo(blob)}`}; }
    }
    let res;
    try{ res = await fetch(API_URL.replace(/\/$/, "") + `/stt?l=${encodeURIComponent(state.accent || "en-US")}&enc=${enc}`, { method: "POST", headers: { ...(await authHeaders()), "Content-Type": "application/octet-stream" }, body }); }
    catch(e){ throw {code: "network", detail: e?.message || ""}; }
    const j = await res.json().catch(() => ({}));
    if(!res.ok) throw {code: j.error || "stt_failed", detail: j.upstream ? `${j.upstream.status} ${j.upstream.message || ""}` : `HTTP ${res.status}`};
    alts = j.alts || [];
  }catch(e){
    out.classList.add("err");
    out.textContent = e?.code === "decode" ? `Не получилось обработать запись (${e.detail}).`
      : e?.code === "network" ? "Не получилось распознать — нет связи с сервером."
      : (STT_ERR[e?.code] || "Не получилось распознать: " + (e?.code || e?.message || "ошибка")) + (e?.detail && !STT_ERR[e?.code] ? ` (${e.detail})` : "");
    const r0 = {ops: [], pct: 0, heard: "", blob, failed: true}; return r0;
  }
  if(!alts.length){ out.classList.add("err"); out.textContent = "Речь не распознана. Скажите фразу чуть громче и чётче."; return {ops: [], pct: 0, heard: "", blob, failed: true}; }
  if(expected == null){ out.textContent = "«" + alts[0] + "»"; return {alts, blob}; }
  const r = scoreSpeech(expected, alts); r.blob = blob;
  out.textContent = r.pct < 100 ? "Распознано: «" + r.heard + "»" : "";
  return r;
}
async function hearLine(expected, btn, out){
  if(serverSTT()) { const r = await hearServer(expected, btn, out); return r && !r.failed ? r : null; }
  if(!SR){ out.textContent = "Этот браузер не умеет распознавать речь."; return null; }
  stopSpeech();
  btn.classList.add("on"); btn.setAttribute("aria-pressed", "true");
  out.classList.remove("err"); out.textContent = "Говорите…";
  const row = btn.closest(".line"); row?.classList.add("listening");
  let alts;
  try{ alts = await listen(t => { if(t) out.textContent = "«" + t + "»"; }); }
  catch(e){ out.classList.add("err"); out.textContent = SR_ERR[e] || "Не получилось включить микрофон. Попробуйте ещё раз."; alts = null; }
  btn.classList.remove("on"); btn.setAttribute("aria-pressed", "false"); row?.classList.remove("listening");
  if(!alts) return null;
  if(!alts.length){ out.classList.add("err"); out.textContent = "Ничего не услышал. Нажмите на микрофон и скажите фразу целиком."; return null; }
  if(expected == null){ out.textContent = "«" + alts[0] + "»"; return {alts}; }
  const r = scoreSpeech(expected, alts);
  out.textContent = r.pct < 100 ? "Распознано: «" + r.heard + "»" : "";
  return r;
}
async function sayInto(text, btn, out){
  const r = await hearLine(text, btn, out); if(!r) return;
  out.innerHTML = `<span class="sc ${scClass(r.pct)}">${r.pct}%</span> ${diffHTML(r.ops)}${r.pct >= SPEAK_PASS ? `<b class="ok-msg">Хорошо!</b>` : ""}`;
}
async function sayLine(i){
  if(listening){ stopListening(true); return; }
  if(soloRec){ soloRec.stop(); return; }
  const d = dialogs[dIdx], row = $(`.line[data-i="${i}"]`); if(!row) return;
  setCur(i);
  let heard = row.querySelector(".heard");
  if(!heard){ heard = document.createElement("div"); heard.className = "heard"; heard.setAttribute("aria-live", "polite"); row.append(heard); }
  if(serverSTT()){
    const r = await hearServer(d.lines[i].text, row.querySelector(".mic"), heard);
    if(r?.blob && !silent(r.blob)){ setMine(i, r.blob); paintMine(i); }
    if(r && !r.failed) showSaid(i, r, row, heard);
    return;
  }
  // no recognition here: just record yourself and compare
  if(!SR){ await recordOnly(i, row.querySelector(".mic"), heard); return; }
  const withRec = $("#sRec").checked && CAN_REC && !store.get("recSolo", false);
  const rec = withRec ? await startRec().catch(() => null) : null;
  const r = await hearLine(d.lines[i].text, row.querySelector(".mic"), heard);
  const blob = rec ? await rec.stop() : null;
  if(blob && !silent(blob)) setMine(i, blob);
  if(rec){
    // the phone gave the microphone to speech recognition and recorded silence: record separately from now on
    if(r && silent(blob)){ store.set("recSolo", true); recFails = 0; }
    // or recognition hears nothing while recording: after two such tries, the same
    else if(!r){ recFails++; if(recFails >= 2){ store.set("recSolo", true); recFails = 0; } }
    else recFails = 0;
    if(store.get("recSolo", false)){ paintMine(i); if(!r) heard.textContent = "На этом телефоне запись мешает распознаванию. Скажите фразу ещё раз, а свой голос запишите кнопкой «● Записать себя»."; }
  }
  if(!r) return;
  showSaid(i, r, row, heard);
  if(rec && silent(blob)) heard.textContent = `Распознано. Записать голос одновременно с распознаванием этот телефон не даёт (${recInfo(blob)}) — нажмите «● Записать себя» и скажите фразу ещё раз, чтобы сравнить.`;
}
function showSaid(i, r, row, heard){
  const d = dialogs[dIdx];
  const prev = sBest[i];
  sBest[i] = {...(prev && prev.pct > r.pct ? prev : r), tries: (prev?.tries || 0) + 1};
  row.classList.add("done");
  row.querySelector(".result")?.remove();
  const el = document.createElement("div"); el.className = "result";
  el.innerHTML = `<span class="sc ${scClass(r.pct)}">${r.pct}%</span>${diffHTML(r.ops)}${r.pct >= SPEAK_PASS ? `<span class="ok-msg">✓</span>` : ""}${sBest[i].tries > 1 ? `<span class="tries">лучшая попытка: ${sBest[i].pct}%</span>` : ""}`;
  row.insertBefore(el, heard);
  paintMine(i);
  announce(`${r.pct} процентов. ${r.pct >= SPEAK_PASS ? "Хорошо." : "Попробуйте ещё раз."}`);
  paintSpeakDone();
  if(r.pct >= SPEAK_PASS && i + 1 < d.lines.length){
    setCur(i + 1);
    if(isPhone()) setTimeout(() => $(`.line[data-i="${i + 1}"]`)?.scrollIntoView({block: "center", behavior: "smooth"}), 300);
  }
}
function paintSpeakDone(){
  const n = dialogs[dIdx].lines.length, k = sBest.filter(Boolean).length;
  setLabel($("#sDone"), k ? `Итог · ${k} из ${n}` : "Итог", ["Итог", `Итог · ${n} из ${n}`]);
}
function whySay(o){
  const right = norm(o.e || "", false), yours = norm(o.w || "", false);
  if(o.t === "miss") return WEAK.has(right) ? "Короткое слово «проглочено» — произнесите его чуть чётче." : "Слово не распозналось — проговорите его отдельно, потом во фразе.";
  if(lev(yours, right) <= 2) return "Распозналось как похожее слово — проверьте гласные и окончание.";
  return "Распозналось как другое слово — послушайте, как его произносит диктор.";
}
function finishSpeak(){
  stopListening();
  const d = dialogs[dIdx], n = d.lines.length, half = Math.ceil(n / 2);
  const done = sBest.map((r, i) => r && {...r, i}).filter(Boolean);
  if(!done.length){ showToast("Сначала скажите хотя бы одну строку: нажмите на микрофон."); return; }
  const avg = Math.round(done.reduce((k, r) => k + r.pct, 0) / done.length);
  const counts = done.length >= half;
  const misses = done.flatMap(r => r.ops.filter(o => o.t === "sub" || o.t === "miss").map(o => ({o, ctx: d.lines[r.i].text})));
  if(counts && !sRecorded){
    sRecorded = true;
    pushResult("speak", avg, {d: d.id || ""});
    saveMistakes(misses.map(({o, ctx}) => ({kind: "speak", type: "pronunciation", yours: o.t === "miss" ? "(не распознано)" : bare(o.w), better: bare(o.e), why: whySay(o), ctx})).slice(0, 12));
  }
  const verdict = avg >= 95 ? "Отлично — почти всё распознано." : avg >= 80 ? "Хорошо. Повторите строки с подсвеченными словами." : avg >= 60 ? "Неплохо. Послушайте строки на 0.7× и повторите медленнее, чётко проговаривая окончания." : "Пока сложно. Слушайте строку, повторяйте по половинке, потом целиком.";
  $("#dSummary").hidden = false;
  $("#dSummary").innerHTML = `<div class="summary">
      <div><div class="big">${avg}%</div><div class="note">распознано${done.length < n ? `<br>по ${done.length} из ${n} строк` : ""}</div></div>
      <div style="flex:1;min-width:200px"><p style="margin:0">${verdict}</p>
      <p class="note" style="margin-top:4px">${misses.length ? `Не распознано слов: ${misses.length}. ` : ""}${counts ? (misses.length ? "Они вернутся в «Повтор». " : "") : "В статистику не записано — сказано меньше половины строк. "}Распознавание — не экзаменатор: имена и редкие слова оно может не узнать. Смотрите на слова, которые не получаются несколько раз.</p></div>
    </div>`;
  if(d.vocab?.length){
    $("#dVocabWrap").hidden = false;
    $("#dVocab").innerHTML = d.vocab.map(v => `<li><span><b lang="en">${esc(v.en)}</b> — ${esc(v.ru)}</span>${playBtn(v.en)}</li>`).join("");
  }
  announce(`Итог: распознано ${avg} процентов.`);
  setTimeout(() => $("#dSummary").scrollIntoView({block: "nearest", behavior: "smooth"}), 50);
}
function paintWho(){
  const el = $("#sWho"); if(!el) return;
  el.innerHTML = serverSTT() ? "Нажмите 🎤, скажите фразу и нажмите ещё раз — слова, которые не распознались, подсветятся."
    : SR ? "Нажмите 🎤 и скажите фразу — слова, которые не распознались, подсветятся." + (access === "guest" ? ` <button class="linkbtn" type="button" data-acct>После входа</button> распознаёт сервер — точнее и с записью вашего голоса.` : "")
    : CAN_REC ? "Нажмите 🎤, скажите фразу и нажмите ещё раз, чтобы сравнить себя с диктором." : "";
}
$("#sOptsBtn").onclick = () => { const open = $("#sOpts").hidden; $("#sOpts").hidden = !open; $("#sOptsBtn").setAttribute("aria-expanded", String(open)); if(open) paintMics(); };
function setMode(m){
  stopListening();
  state.dmode = m; store.set("dmode", m);
  $("#view-dict").classList.toggle("speak", m === "speak");
  document.querySelectorAll("#modeSeg button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.m === m)));
  $("#sNo").hidden = !!SR || serverSTT();
  paintWho();
  if(m === "speak") paintMics();
  if(!SR && !CAN_REC) $("#sNo").textContent = "Этот браузер не умеет ни распознавать речь, ни записывать звук. Откройте сайт в Chrome, Edge или Safari.";
  renderDialog(); updateBar();
}
$("#modeSeg").addEventListener("click", e => { const b = e.target.closest("[data-m]"); if(b && b.dataset.m !== state.dmode) setMode(b.dataset.m); });
$("#sText").checked = store.get("sText", true);
$("#sText").onchange = e => { store.set("sText", e.target.checked); $("#lines").classList.toggle("hidetext", !e.target.checked); };
$("#sDone").onclick = finishSpeak;

// sentences of the chosen topic, closest level first; then the same level from other topics
function bankQueue(){
  const t = $("#topic").value, li = Math.max(0, LV.indexOf(state.level));
  const near = s => Math.abs(LV.indexOf(s.level) - li);
  const mine = shuffle(SENTENCES.filter(s => t === "__custom" || s.topic === t)).sort((a, b) => near(a) - near(b));
  const more = t === "__custom" ? [] : shuffle(SENTENCES.filter(s => s.topic !== t && s.level === state.level));
  return [...mine, ...more].map(({ru, en, focus, hint_ru, topic, level}) => ({ru, en, focus, hint_ru, topic, level}));
}
function newBankQueue(){ trQueue = bankQueue(); trIdx = 0; renderTr(); saveTr(); }
let trQueue = store.get("trQueue", null) || bankQueue();
let trIdx = Math.min(store.get("trIdx", 0), trQueue.length-1);
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
let trRecorded = false;
function renderTr(){
  const it = trQueue[trIdx];
  const tt = topicById(it.topic)?.short;
  $("#trCounter").textContent = `Предложение ${trIdx+1} из ${trQueue.length}${tt ? ` · ${tt}` : ""}${it.level ? ` · ${it.level}` : ""}${it.review ? " · повторение" : ""}`;
  $("#trFocus").textContent = it.focus || ""; $("#trFocus").hidden = !it.focus;
  $("#trRu").textContent = it.ru;
  $("#trIn").value = store.get("trDraft:"+it.ru, "");
  $("#trHintBox").hidden = true; $("#trHint").setAttribute("aria-expanded", "false");
  $("#trHintText").textContent = it.hint_ru || "Подсказки нет — попробуйте по смыслу.";
  $("#trResult").hidden = true; $("#trResult").innerHTML = "";
  $("#trSkip").hidden = false;
  trRecorded = false;
  store.set("trIdx", trIdx);
}
function saveTr(){ store.set("trQueue", trQueue); store.set("trIdx", trIdx); store.set("trTs", Date.now()); cloudDirty(); }
$("#trIn").addEventListener("input", e => store.set("trDraft:"+trQueue[trIdx].ru, e.target.value));
$("#trIn").addEventListener("keydown", e => { if(e.key === "Enter" && (e.ctrlKey || e.metaKey)){ e.preventDefault(); checkTr(); } });
$("#trHint").onclick = () => { const open = $("#trHintBox").hidden; $("#trHintBox").hidden = !open; $("#trHint").setAttribute("aria-expanded", String(open)); };
$("#trSkip").onclick = () => { trIdx = (trIdx + 1) % trQueue.length; renderTr(); saveTr(); if(!isPhone()) $("#trIn").focus(); };
$("#trCheck").onclick = () => checkTr();

$("#trGen").onclick = () => { if(needAccess("Новые предложения от Claude")) openSet("trgen"); };
async function genSentences(){
  const btn = $("#trGen"), gl = btn.querySelector(".gl"); btn.disabled = true; setLabel(gl, `<span class="spin" style="display:inline-block;vertical-align:-2px;margin-right:6px"></span>Подбираю…`, ["Новые предложения", `<span class="spin" style="display:inline-block;vertical-align:-2px;margin-right:6px"></span>Подбираю…`]);
  try{
    const arr = await ai("sentences", {level: state.level, topic: topicText()});
    const list = (Array.isArray(arr) ? arr : []).filter(x => x && x.ru && x.en).map(x => ({ru:String(x.ru), en:String(x.en), focus:String(x.focus||""), hint_ru:String(x.hint_ru||""), topic: $("#topic").value, level: state.level}));
    if(!list.length) throw {code:"invalid_json"};
    trQueue = list; trIdx = 0; renderTr(); saveTr(); if(!isPhone()) $("#trIn").focus();
  }catch(e){
    showToast(e.code === "unavailable" ? NO_AI : errCopy(e));
  }finally{ btn.disabled = false; setLabel(gl, "Новые предложения", ["Новые предложения", `<span class="spin" style="display:inline-block;vertical-align:-2px;margin-right:6px"></span>Подбираю…`]); }
}


/* ---------- every play button is also a stop button ---------- */
// press once: it plays (the button shows ■); press again at any moment: it stops
const PLAY_SEL = ".line .play, .line .slow, .say, #rPlay, #rSlow, [data-pm]:not([data-pm=rec]), #mbReplay, #mbSlow, [data-dplay], [data-vplay], #vcCompare";
var playBtn_ = null, playWatch = null;
function playOff(){
  clearInterval(playWatch); playWatch = null;
  if(playBtn_){ playBtn_.classList.remove("pl-on"); playBtn_.removeAttribute("aria-pressed"); playBtn_ = null; }
}
const sounding = () => soundLoading || (!player.paused && !player.ended && !!player.src) || !!(synth && (synth.speaking || synth.pending));
document.addEventListener("click", e => {
  const b = e.target.closest(PLAY_SEL);
  if(b && b === playBtn_){ e.preventDefault(); e.stopImmediatePropagation(); stopSpeech(); }
}, true);
document.addEventListener("click", e => {
  const b = e.target.closest(PLAY_SEL); if(!b || b.disabled) return;
  // mark it after its own handler has started the sound
  setTimeout(() => {
    if(b === playBtn_) return;
    if(playBtn_) playBtn_.classList.remove("pl-on");
    playBtn_ = b; b.classList.add("pl-on"); b.setAttribute("aria-pressed", "true");
    const started = Date.now(); let quiet = 0;
    clearInterval(playWatch);
    playWatch = setInterval(() => {
      if(sounding()) { quiet = 0; return; }
      // the gap between "Диктор" and "Я", or the first moments of fetching, are not the end
      if(Date.now() - started < 1500) return;
      if(++quiet >= 3) playOff();
    }, 200);
  }, 0);
});

const playBtn = (text) => `<button class="btn icon say" data-say="${esc(text)}" title="Озвучить" aria-label="Озвучить"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.5v11l9-5.5z"/></svg></button>`;
document.addEventListener("click", e => { const b = e.target.closest(".say"); if(b){ stopSpeech(); speak(b.dataset.say, "A"); } });

let trCtl = null;
async function checkTr(){
  const it = trQueue[trIdx], mine = $("#trIn").value.trim(), box = $("#trResult");
  if(!mine){ $("#trIn").focus(); return; }
  box.hidden = false;
  if(!canAI()){ localTr(it, mine); return; }
  box.innerHTML = `<span class="status"><span class="spin"></span>Claude проверяет перевод — обычно 10–30 секунд…</span>`;
  $("#trCheck").disabled = true;
  try{
    trCtl = new AbortController();
    const r = await ai("check", {level: state.level, ru: it.ru, en: it.en, mine}, { signal: trCtl.signal });
    if(!r || typeof r !== "object") throw {code:"invalid_json"};
    renderTrResult(it, mine, r);
    if(!trRecorded){
      trRecorded = true;
      pushResult("tr", Number(r.score) || 0);
      saveMistakes((r.mistakes || []).map(m => ({kind:"tr", yours:m.yours, better:m.better, why:m.why_ru, type:m.type, ru: it.ru, en: r.natural || it.en})));
    }
    announce(`Оценка ${Math.round(Number(r.score) || 0)} из 100.`);
  }catch(e){
    if(e.code === "cancelled") return;
    if(["unavailable", "sign_in_required", "not_allowed"].includes(e.code)) localTr(it, mine);
    else box.innerHTML = `<p class="err-msg">${esc(errCopy(e))}</p>`;
  }finally{ $("#trCheck").disabled = false; }
}
// without Claude: compare with the reference word by word
function localTr(it, mine){
  const d = diff(it.en, mine, false);
  const why = access === "guest" ? "Подробный разбор от Claude — после входа." : access === "no" ? "У этого аккаунта нет доступа к разбору от Claude." : "Разбор от Claude сейчас недоступен.";
  $("#trResult").hidden = false;
  $("#trResult").innerHTML = `<div style="display:flex;flex-direction:column;gap:12px">
    <div class="verdict"><div class="big">${d.pct}%</div><div><p><b>Сверка с эталоном.</b> ${why} Сравниваю слово в слово, поэтому другие верные варианты тоже могут подсветиться.</p></div></div>
    <div class="ver natural"><span class="eyebrow">Эталон</span><div class="row"><span class="en" lang="en" style="flex:1;min-width:0">${esc(it.en)}</span>${playBtn(it.en)}</div></div>
    <div class="ver"><span class="eyebrow">Отличия</span><div style="font-family:var(--f-mono);font-size:14px;line-height:1.9">${diffHTML(d.ops)}</div></div>
    <div class="row"><button class="btn primary" id="trNext" type="button">Следующее предложение →</button><button class="btn" id="trRetry" type="button">Попробовать ещё раз</button></div></div>`;
  wireTrNext();
  if(!trRecorded){ trRecorded = true; pushResult("tr", d.pct); }
  announce(`Совпадение с эталоном ${d.pct} процентов.`);
}
function wireTrNext(){
  $("#trSkip").hidden = true;
  $("#trNext").onclick = () => $("#trSkip").click();
  $("#trRetry").onclick = () => { $("#trResult").hidden = true; $("#trSkip").hidden = false; $("#trIn").focus(); };
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
  wireTrNext();
}

/* ---------- stats & mistakes ---------- */
function pushResult(kind, pct, extra){
  const h = store.get("history", []); h.push({k:kind, p:Math.round(pct), t:Date.now(), ...(extra || {})}); store.set("history", h.slice(-500)); cloudDirty();
  if((kind === "dict" || kind === "speak") && addWords()) paintBadge();
  setTimeout(() => { sessHit(kind, extra?.d); paintGoal(); }, 0);
  setTimeout(checkGoal, 0);
  try{ navigator.storage?.persist?.(); }catch{}
}
function saveMistakes(list){
  if(!list.length) return;
  const t = Date.now();
  const m = store.get("mistakes", []); list.forEach((x, i) => m.unshift({...x, t: t + i})); store.set("mistakes", m.slice(0, 300)); cloudDirty(); paintBadge();
}
const TYPE_RU = {pronunciation:"произношение", listening:"на слух", grammar:"грамматика", tense:"время", articles:"артикли", prepositions:"предлоги", "word order":"порядок слов", vocabulary:"слова", spelling:"орфография", punctuation:"пунктуация", style:"стиль", meaning:"смысл"};
const plural = (n, one, few, many) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; };
// older dictation mistakes kept the whole sentence in "why"; show it as context instead
const ctxOf = x => x.ctx || (x.kind === "dict" && /^Ослышка: «/.test(x.why || "") ? x.why.slice(10, -1) : "");
const whyOf = x => x.kind === "dict" && /^Ослышка/.test(x.why || "") ? "" : (x.why || "");
let mShown = [];
function renderStats(){
  const h = store.get("history", []);
  const part = k => h.filter(x => x.k === k);
  const avg = a => a.length ? Math.round(a.reduce((s,x) => s + x.p, 0) / a.length) : null;
  const d = part("dict"), t = part("tr"), sp = part("speak");
  const sk = streakInfo();
  $("#stats").classList.toggle("k4", sp.length > 0);
  $("#stats").innerHTML = `
    <div class="kpi"><div class="lbl">Диктанты</div><div class="big">${d.length}</div><div class="note">${d.length ? `точность ${avg(d)}%` : "пока нет"}</div></div>
    ${sp.length ? `<div class="kpi"><div class="lbl">Речь</div><div class="big">${sp.length}</div><div class="note">распознано ${avg(sp)}%</div></div>` : ""}
    <div class="kpi"><div class="lbl">Переводы</div><div class="big">${t.length}</div><div class="note">${t.length ? `балл ${avg(t)}/100` : "пока нет"}</div></div>
    <div class="kpi"><div class="lbl">Серия</div><div class="big">${sk.n}</div><div class="note">${plural(sk.n, "день", "дня", "дней")}${sk.best > sk.n ? ` · рекорд ${sk.best}` : ""}</div></div>`;
  const bars = (a, label) => `<div><div class="lbl">${label}, последние ${Math.min(24, a.length)}</div><div class="bars" role="img" aria-label="${label}: от ${Math.min(...a.slice(-24).map(x => x.p))} до ${Math.max(...a.slice(-24).map(x => x.p))} процентов">${a.slice(-24).map(x => `<span class="${x.p<65?"lo":""}" style="height:${Math.max(4,x.p)}%" title="${x.p}%"></span>`).join("")}</div></div>`;
  const trend = [];
  if(d.length >= 5) trend.push(bars(d, "Диктанты"));
  if(t.length >= 5) trend.push(bars(t, "Переводы"));
  if(sp.length >= 5) trend.push(bars(sp, "Речь"));
  $("#trend").className = trend.length ? "trend" : "";
  $("#trend").innerHTML = trend.join("") || (h.length ? `<p class="note">График появится после пяти занятий одного вида.</p>` : "");
  const f = $("#mFilter").value;
  // one card per sentence: all the words missed in it together (the review works the same way)
  const groups = new Map();
  for(const x of store.get("mistakes", [])){
    if(f !== "all" && x.kind !== f) continue;
    const key = idOf(x) || `${x.kind}:${x.t}`;
    const g = groups.get(key) || {x, items: []};
    if(!g.items.some(it => it.better === x.better && it.yours === x.yours)) g.items.push(x);
    groups.set(key, g);
  }
  mShown = [...groups.values()].slice(0, 40);
  const KIND_RU = {dict: "диктант", speak: "произношение", tr: "перевод"};
  $("#mList").innerHTML = mShown.length ? mShown.map((g, i) => {
    const x = g.x, ctx = ctxOf(x);
    return `<li class="mcard" data-i="${i}">
      <div class="head"><span class="chip">${esc(KIND_RU[x.kind] || "")}</span>${whenOf(x) ? `<span class="when">${whenOf(x)}</span>` : ""}</div>
      ${ctx ? `<div class="ctx main"><span lang="en">${esc(ctx)}</span>${playBtn(ctx)}</div>` : x.ru ? `<div class="ctx main"><span lang="ru">${esc(x.ru)}</span></div>` : ""}
      <div class="pairs">${g.items.slice(0, 8).map(it => { const why = whyOf(it); return `<div><div class="pair"><del class="w" lang="en">${esc(it.yours)}</del><span aria-hidden="true">→</span><ins class="w" lang="en">${esc(it.better)}</ins>${it.kind === "tr" && it.type ? `<span class="chip">${esc(TYPE_RU[it.type] || it.type)}</span>` : ""}</div>${why ? `<div class="why">${esc(why)}</div>` : ""}</div>`; }).join("")}${g.items.length > 8 ? `<div class="why">и ещё ${g.items.length - 8}</div>` : ""}</div>
      ${ctx && x.kind === "speak" ? `<div class="acts"><button class="btn" type="button" data-sdrill${SR || serverSTT() ? "" : " disabled"}>${MIC_I}${STOP_I}Сказать ещё раз</button></div>` : ctx ? `<div class="acts"><button class="btn" type="button" data-drill>Повторить на слух</button></div>` : x.ru ? `<div class="acts"><button class="btn" type="button" data-again>Перевести снова</button></div>` : ""}
    </li>`; }).join("")
    : `<li class="empty">Здесь появятся ваши ошибки после первых проверок — по ним удобно повторять.</li>`;
}
// practise a mistake right here: hear the sentence again and type it, or translate the sentence again
$("#mList").addEventListener("click", e => {
  const card = e.target.closest(".mcard"); if(!card) return;
  const g = mShown[+card.dataset.i]; if(!g) return;
  const x = g.x;
  const ctx = ctxOf(x);
  if(e.target.closest("[data-drill]")){
    const box = document.createElement("div"); box.className = "drill";
    box.innerHTML = `<input type="text" aria-label="Напишите фразу, которую услышите" placeholder="Напишите, что услышали" autocomplete="off" autocorrect="off" autocapitalize="sentences" spellcheck="false" lang="en">
      <div class="row"><button class="btn primary" type="button" data-dcheck>Проверить</button><button class="btn" type="button" data-dplay>${PLAY_I}Ещё раз</button></div><div class="out" aria-live="polite"></div>`;
    card.querySelector(".ctx").hidden = true; card.querySelector(".acts").hidden = true;
    card.append(box); box.querySelector("input").focus();
    box.querySelector("input").addEventListener("keydown", k => { if(k.key === "Enter"){ k.preventDefault(); box.querySelector("[data-dcheck]").click(); } });
    stopSpeech(); speak(ctx, "A");
  }
  if(e.target.closest("[data-dplay]")){ stopSpeech(); speak(ctx, "A"); }
  const sd = e.target.closest("[data-sdrill]");
  if(sd){
    let out = card.querySelector(".drill .out");
    if(!out){ const box = document.createElement("div"); box.className = "drill"; box.innerHTML = `<div class="out" aria-live="polite"></div>`; card.append(box); out = box.querySelector(".out"); }
    if(listening){ stopListening(true); return; }
    sayInto(ctx, sd, out);
  }
  if(e.target.closest("[data-dcheck]")){
    const r = diff(ctx, card.querySelector(".drill input").value, false);
    card.querySelector(".drill .out").innerHTML = `<span class="sc ${scClass(r.pct)}">${r.pct}%</span> ${diffHTML(r.ops)}${r.pct === 100 ? ` <b class="ok-msg">Верно!</b>` : ""}`;
    card.querySelector(".ctx").hidden = false;
  }
  if(e.target.closest("[data-again]")){
    const betters = [...new Set(g.items.map(it => it.better).filter(Boolean))];
    trQueue.splice(trIdx, 0, {ru: x.ru, en: g.items.find(it => it.en)?.en || x.better, focus: "", hint_ru: [betters.length && `Обратите внимание: ${betters.join(", ")}.`, x.why].filter(Boolean).join(" "), review: true});
    renderTr(); saveTr(); showView("tr");
  }
});
$("#mFilter").onchange = renderStats;
$("#mClear").onclick = () => $("#mConfirm").hidden = false;
$("#mNo").onclick = () => $("#mConfirm").hidden = true;
$("#mYes").onclick = () => { store.set("history", []); store.set("mistakes", []); store.set("rev", {}); store.set("days", {}); store.set("words", {}); store.set("cleared", Date.now()); rq = []; rpos = 0; paintBadge(); paintToday(); $("#mConfirm").hidden = true; renderStats(); cloudDirty(); };

/* ---------- review: mistakes come back after 1, 3, 7, 14, 30, 60 days ---------- */
const DAY = 864e5, STEPS = [1, 3, 7, 14, 30, 60];
const normPhrase = t => String(t || "").toLowerCase().replace(/[’‘`´]/g, "'").replace(/[^\p{L}\p{N}' ]+/gu, " ").replace(/\s+/g, " ").trim();
const idOf = x => x.kind === "dict" && ctxOf(x) ? "d:" + ctxOf(x) : x.kind === "speak" && x.ctx ? "s:" + x.ctx : x.kind === "tr" && x.ru ? "t:" + x.ru : "";
// one card per sentence: several mistakes in the same sentence are practised together
function reviewItems(){
  const map = new Map();
  for(const x of store.get("mistakes", [])){
    const id = idOf(x); if(!id) continue;
    const it = map.get(id) || (x.kind === "dict" || x.kind === "speak" ? {id, kind: x.kind, text: ctxOf(x), frags: [], t: x.t} : {id, kind: "tr", ru: x.ru, en: x.en || "", frags: [], t: x.t});
    if(x.better && !it.frags.some(f => f.better === x.better)) it.frags.push({yours: x.yours, better: x.better, why: whyOf(x)});
    it.t = Math.min(it.t || x.t, x.t || it.t);
    if(it.kind === "tr" && !it.en && x.en) it.en = x.en;
    map.set(id, it);
  }
  for(const [k, w] of Object.entries(store.get("words", {}))) map.set("w:" + k, {id: "w:" + k, kind: "word", en: w.en, ru: w.ru, d: w.d, t: w.a});
  return [...map.values()];
}
const revState = () => store.get("rev", {});
// a new card comes back the next day; after that, its own schedule
const dueOf = (it, rev = revState()) => rev[it.id]?.due ?? ((it.t || 0) + (it.kind === "word" ? -60e3 : 20 * 3600e3));
function dueItems(now = Date.now()){ const rev = revState(); return reviewItems().filter(it => dueOf(it, rev) <= now).sort((a, b) => dueOf(a, rev) - dueOf(b, rev)); }
function grade(it, pass){
  const rev = revState(), r = rev[it.id] || {step: 0};
  const days = pass ? STEPS[Math.min(r.step || 0, STEPS.length - 1)] : 1;
  rev[it.id] = {step: pass ? Math.min((r.step || 0) + 1, STEPS.length) : 0, due: Date.now() + days * DAY - 2 * 3600e3, last: Date.now()};
  store.set("rev", rev); cloudDirty(); paintBadge(); setTimeout(checkGoal, 0); renderWords();
  return days;
}
const daysWord = n => `${n} ${plural(n, "день", "дня", "дней")}`;
function dayTxt(ts){
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const d = Math.floor((ts - start) / DAY);
  if(d <= 0) return `сегодня в ${new Date(ts).toLocaleTimeString("ru-RU", {hour: "2-digit", minute: "2-digit"})}`;
  if(d === 1) return "завтра";
  return `через ${daysWord(d)} (${new Date(ts).toLocaleDateString("ru-RU", {day: "numeric", month: "long"})})`;
}
function whenOf(x){
  const id = idOf(x); if(!id) return "";
  const rev = revState(), r = rev[id], due = r?.due ?? ((x.t || 0) + 20 * 3600e3);
  if((r?.step || 0) >= 4) return `Выучено · следующий повтор ${dayTxt(due)}`;
  return due <= Date.now() ? "Ждёт повторения" : `Повтор ${dayTxt(due)}`;
}
function paintBadge(){
  const n = dueItems().length, b = $("#revBadge");
  b.hidden = !n; b.textContent = n > 99 ? "99+" : String(n);
  try{ n ? navigator.setAppBadge?.(n) : navigator.clearAppBadge?.(); }catch{}
  $("#tab-rev").setAttribute("aria-label", n ? `Повтор, ждут повторения: ${n}` : "Повтор");
}
// the sentence is spoken by the same voice as in its dialogue (that audio is usually saved already)
function speakCtx(text, mul = 1){
  let who = "A";
  for(const d of dialogs){ const l = d.lines.find(l => l.text === text); if(l){ who = l.s; break; } }
  stopSpeech(); return speak(text, who, mul);
}

let rq = [], rpos = 0, rdone = 0, rtotal = 0, rretry = new Set();
function startRev(){
  addWords();
  const rev0 = revState();
  // a phrase seen for the first time is shown first, then asked at the end of the session
  rq = dueItems().map(it => it.kind === "word" && !rev0[it.id] ? {...it, learn: true} : it);
  rpos = 0; rdone = 0; rtotal = rq.length; rretry = new Set();
  rq.filter(it => it.kind !== "tr").slice(0, 6).forEach(it => {
    let who = "A"; for(const d of dialogs){ const l = d.lines.find(l => l.text === it.text); if(l){ who = l.s; break; } }
    const pick = pickFor(who); if(hdOn && pick.startsWith("g:")) hdBlob(it.text, pick.slice(2), nearestRate(state.rate)).catch(() => {});
  });
  renderRev();
}
function renderRev(){
  if(rpos >= rq.length){ revEmpty(); return; }
  const it = rq[rpos], card = $("#revCard");
  $("#revSub").textContent = `Сегодня: ${rtotal} ${plural(rtotal, "карточка", "карточки", "карточек")}`;
  $("#revPos").textContent = `${rpos + 1} / ${rq.length}`;
  $("#revBar").hidden = false; $("#revFill").style.width = `${Math.round(rpos / rq.length * 100)}%`;
  if(it.kind === "word"){ renderWord(it, card); return; }
  if(it.kind === "dict"){
    card.innerHTML = `<div class="rcard">
      <div class="kind"><span class="chip">на слух</span><span class="note">Прослушайте и напишите фразу целиком.</span></div>
      <div class="listen"><button class="btn primary big" id="rPlay" type="button">${PLAY_I}Слушать</button><button class="btn big" id="rSlow" type="button">${TURTLE}Медленно</button></div>
      <input type="text" id="rIn" aria-label="Что вы услышали" placeholder="Что вы услышали?" autocomplete="off" autocorrect="off" autocapitalize="sentences" spellcheck="false" lang="en" enterkeyhint="done">
      <div class="row" id="rActs"><button class="btn primary" id="rCheck" type="button">Проверить</button><button class="btn ghost" id="rSkip" type="button">Пропустить</button></div>
      <div id="rRes"></div></div>`;
    $("#rPlay").onclick = () => speakCtx(it.text);
    $("#rSlow").onclick = () => speakCtx(it.text, 0.75);
  } else if(it.kind === "speak" && SR){
    card.innerHTML = `<div class="rcard">
      <div class="kind"><span class="chip">вслух</span><span class="note">Послушайте и повторите фразу вслух.</span></div>
      <div class="en" lang="en">${esc(it.text)}</div>
      ${it.frags.length ? `<div class="focus">В прошлый раз не распознались: ${it.frags.map(f => `<ins class="w" lang="en">${esc(f.better)}</ins>`).join(", ")}</div>` : ""}
      <div class="listen"><button class="btn big" id="rPlay" type="button">${PLAY_I}Слушать</button><button class="btn big" id="rSlow" type="button">${TURTLE}Медленно</button></div>
      <div class="row" id="rActs"><button class="btn mic big" id="rMic" type="button" aria-pressed="false">${MIC_I}${STOP_I}Сказать</button><button class="btn ghost" id="rSkip" type="button">Пропустить</button></div>
      <div class="heard" id="rHeard" aria-live="polite"></div>
      <div id="rRes"></div></div>`;
    $("#rPlay").onclick = () => speakCtx(it.text);
    $("#rSlow").onclick = () => speakCtx(it.text, 0.75);
    $("#rMic").onclick = async () => {
      if(listening){ stopListening(true); return; }
      const r = await hearLine(it.text, $("#rMic"), $("#rHeard"));
      if(r) checkRev(it, r);
    };
    $("#rSkip").onclick = () => { stopListening(); rpos++; renderRev(); };
    return;
  } else if(it.kind === "speak"){
    // no speech recognition here: practise it by ear instead
    card.innerHTML = `<div class="rcard">
      <div class="kind"><span class="chip">на слух</span><span class="note">Прослушайте и напишите фразу целиком.</span></div>
      <div class="listen"><button class="btn primary big" id="rPlay" type="button">${PLAY_I}Слушать</button><button class="btn big" id="rSlow" type="button">${TURTLE}Медленно</button></div>
      <input type="text" id="rIn" aria-label="Что вы услышали" placeholder="Что вы услышали?" autocomplete="off" autocorrect="off" autocapitalize="sentences" spellcheck="false" lang="en" enterkeyhint="done">
      <div class="row" id="rActs"><button class="btn primary" id="rCheck" type="button">Проверить</button><button class="btn ghost" id="rSkip" type="button">Пропустить</button></div>
      <div id="rRes"></div></div>`;
    $("#rPlay").onclick = () => speakCtx(it.text);
    $("#rSlow").onclick = () => speakCtx(it.text, 0.75);
  } else {
    card.innerHTML = `<div class="rcard">
      <div class="kind"><span class="chip">перевод</span><span class="note">Переведите ещё раз.</span></div>
      <div class="ru" lang="ru">${esc(it.ru)}</div>
      ${it.frags.length ? `<div class="focus">В прошлый раз ошибка была здесь: ${it.frags.map(f => `<del class="w" lang="en">${esc(f.yours)}</del>`).join(", ")}</div>` : ""}
      <textarea id="rIn" aria-label="Ваш перевод на английском" placeholder="Напишите перевод на английском…" spellcheck="false" autocapitalize="sentences" autocorrect="off" lang="en"></textarea>
      <div class="row" id="rActs"><button class="btn primary" id="rCheck" type="button">Проверить</button><button class="btn ghost" id="rSkip" type="button">Пропустить</button></div>
      <div id="rRes"></div></div>`;
  }
  $("#rCheck").onclick = () => checkRev(it);
  $("#rSkip").onclick = () => { rpos++; renderRev(); };
  $("#rIn").addEventListener("keydown", e => {
    if(e.key !== "Enter" || (it.kind === "tr" && !(e.ctrlKey || e.metaKey))) return;
    e.preventDefault(); $("#rNext") ? $("#rNext").click() : checkRev(it);
  });
  if(!isPhone()) $("#rIn").focus();
}
function checkRev(it, said){
  const v = said ? "" : $("#rIn").value.trim(); if(!said && !v){ $("#rIn").focus(); return; }
  const before = revState()[it.id];
  let pass, body;
  if(it.kind === "word"){
    ({pass, body} = wordResult(it, said, v));
  } else if(said){
    pass = said.pct >= SPEAK_PASS;
    body = `<div class="diffline"><span class="sc ${scClass(said.pct)}">${said.pct}%</span> ${diffHTML(said.ops)}</div>`;
  } else if(it.kind !== "tr"){
    const d = diff(it.text, v, false);
    pass = d.pct >= 90;
    body = `<div class="diffline"><span class="sc ${scClass(d.pct)}">${d.pct}%</span> ${diffHTML(d.ops)}</div>`;
  } else {
    // the point is the corrected words: they must be there (other wording is fine)
    const got = " " + normPhrase(v) + " ";
    const hits = it.frags.map(f => ({f, ok: got.includes(" " + normPhrase(f.better) + " ")}));
    pass = hits.length ? hits.every(h => h.ok) : diff(it.en, v, false).pct >= 80;
    body = `${hits.length ? `<div>${hits.map(h => `<div>${h.ok ? "✓" : "✗"} <ins class="w" lang="en">${esc(h.f.better)}</ins>${h.f.why ? ` <span class="note">— ${esc(h.f.why)}</span>` : ""}</div>`).join("")}</div>` : ""}
      ${it.en ? `<div class="ver natural"><span class="eyebrow">Эталон</span><div class="row"><span class="en" lang="en" style="flex:1;min-width:0">${esc(it.en)}</span>${playBtn(it.en)}</div></div>` : ""}`;
  }
  const days = grade(it, pass);
  pushResult("rev", pass ? 100 : 0);
  const retry = !pass && !rretry.has(it.id);
  if(retry){ rretry.add(it.id); rq.push(it); }
  rdone++;
  $("#rActs").hidden = true; if($("#rIn")) $("#rIn").readOnly = true;
  const res = ok => `<div class="rres ${ok ? "pass" : "fail"}"><div class="head">${ok ? "Верно!" : "Пока не получилось"}</div>${body}
    <div class="next">${ok ? `Следующий повтор — через ${daysWord(ok === true ? days : ok)}.` : retry ? "Повторим ещё раз в конце и завтра." : "Вернёмся к этой карточке завтра."}</div>
    <div class="row"><button class="btn primary" id="rNext" type="button">${rpos + 1 < rq.length ? "Дальше →" : "Готово"}</button>${!ok && (it.kind === "tr" || (it.kind === "word" && !said?.giveUp)) ? `<button class="btn" id="rOk" type="button">Я ответил верно</button>` : ""}</div></div>`;
  $("#rRes").innerHTML = res(pass);
  const wire = () => {
    $("#rNext").onclick = () => { rpos++; renderRev(); };
    // other wording can be right too: the person decides
    if($("#rOk")) $("#rOk").onclick = () => {
      const rev = revState(); if(before) rev[it.id] = before; else delete rev[it.id]; store.set("rev", rev);
      if(retry){ rq.pop(); rretry.delete(it.id); }
      const d2 = grade(it, true);
      $("#rRes").innerHTML = res(d2); $("#rRes .head").textContent = "Засчитано"; wire();
    };
    if(!isPhone()) $("#rNext").focus();
  };
  wire();
  announce(pass ? "Верно" : "Пока не получилось");
}
function revEmpty(){
  setTimeout(() => sessHit("revdone"), 0);
  const items = reviewItems(), rev = revState();
  const next = items.map(it => dueOf(it, rev)).filter(d => d > Date.now()).sort((a, b) => a - b)[0];
  const learned = items.filter(it => (rev[it.id]?.step || 0) >= 4).length;
  $("#revPos").textContent = "";
  $("#revBar").hidden = !rtotal; if(rtotal) $("#revFill").style.width = "100%";
  $("#revSub").textContent = items.length ? `Карточек: ${items.length} · выучено: ${learned}` : "";
  renderWords();
  $("#revCard").innerHTML = !items.length
    ? `<div class="revdone"><p>Здесь будут ваши ошибки из диктанта и перевода и выражения из пройденных диалогов. Они возвращаются через 1, 3, 7, 14, 30 и 60 дней — пока не запомнятся.</p><button class="btn primary" type="button" data-go="dict">К диктанту</button></div>`
    : `<div class="revdone">${rtotal ? `<div class="big">Готово!</div><p>Повторено карточек: ${rdone}.</p>` : `<p><b>На сегодня всё повторено.</b></p>`}${next ? `<p class="note">Следующее повторение — ${dayTxt(next)}.</p>` : ""}<button class="btn" type="button" data-go="dict">К диктанту</button></div>`;
}
document.addEventListener("click", e => { const g = e.target.closest("[data-go]"); if(g) showView(g.dataset.go); });
setInterval(paintBadge, 10 * 60e3);


/* ---------- phrase cards: expressions from the dialogues you have done ---------- */
const wordKey = en => normPhrase(en);
// the dialogues you finished, oldest first: their phrases come in that order
function doneDialogs(){
  const seen = new Set(), out = [];
  for(const h of store.get("history", [])) if((h.k === "dict" || h.k === "speak") && h.d && !seen.has(h.d)){ seen.add(h.d); out.push(h.d); }
  return out.map(id => dialogs.find(d => d.id === id)).filter(d => d?.vocab?.length);
}
// add today's new phrases (up to the daily number); true when something was added
function addWords(){
  const n = goalCfg().w ?? 8; if(!n) return false;
  const words = store.get("words", {}), today = dk();
  let room = n - Object.values(words).filter(w => dk(w.a) === today).length;
  if(room <= 0) return false;
  let added = 0; const t = Date.now();
  for(const d of doneDialogs()){
    for(const v of d.vocab){
      const k = wordKey(v.en); if(!k || words[k]) continue;
      words[k] = {en: v.en, ru: v.ru, d: d.id, a: t + added}; added++;
      if(--room <= 0) break;
    }
    if(room <= 0) break;
  }
  if(added){ store.set("words", words); cloudDirty(); }
  return added > 0;
}
// accepted answers: "freeze / put on hold" → both; "the GC (general contractor)" → with or without the brackets
function wordAnswers(en){
  const out = new Set();
  for(const part of String(en).split(/\s+\/\s+/)){
    out.add(normPhrase(part));
    const noPar = part.replace(/\s*\([^)]*\)\s*/g, " ");
    out.add(normPhrase(noPar));
  }
  return [...out].filter(Boolean);
}
function checkWordText(it, v){
  const got = normPhrase(v), ans = wordAnswers(it.en);
  if(ans.includes(got)) return {pass: true};
  const near = ans.find(a => lev(a, got) <= (a.length >= 10 ? 2 : 1));
  return near ? {pass: true, typo: true} : {pass: false};
}
// the dialogue line where the phrase was used, with the phrase marked
function wordCtx(it){
  const d = dialogs.find(x => x.id === it.d); if(!d) return null;
  const words = wordAnswers(it.en).sort((a, b) => b.length - a.length);
  for(const l of d.lines){
    const low = l.text.toLowerCase().replace(/[’‘]/g, "'");
    for(const w of words){
      const at = low.indexOf(w); if(at < 0 || w.length < 3) continue;
      return {text: l.text, html: esc(l.text.slice(0, at)) + "<mark>" + esc(l.text.slice(at, at + w.length)) + "</mark>" + esc(l.text.slice(at + w.length))};
    }
  }
  return null;
}
const ctxHTML = c => c ? `<div class="ctxline"><span lang="en">${c.html}</span>${playBtn(c.text)}</div>` : "";
function renderWord(it, card){
  const rev = revState();
  if(it.learn){
    const c = wordCtx(it);
    card.innerHTML = `<div class="rcard">
      <div class="kind"><span class="chip">новое выражение</span><span class="note">Послушайте и запомните — в конце его нужно будет вспомнить.</span></div>
      <div class="learn"><div class="ru" lang="ru">${esc(it.ru)}</div><div class="row"><span class="en" lang="en">${esc(it.en)}</span>${playBtn(it.en)}</div>${ctxHTML(c)}</div>
      <div class="row" id="rActs"><button class="btn primary" id="rNext" type="button">Запомнил →</button></div></div>`;
    stopSpeech(); speak(it.en.split(/\s+\/\s+/)[0], "A");
    $("#rNext").onclick = () => { rq.push({...it, learn: false}); rtotal = Math.max(rtotal, rq.length - rdone); rpos++; renderRev(); };
    if(!isPhone()) $("#rNext").focus();
    return;
  }
  card.innerHTML = `<div class="rcard">
    <div class="kind"><span class="chip">выражение</span><span class="note">Как это по-английски?</span></div>
    <div class="ru big" lang="ru">${esc(it.ru)}</div>
    <div class="answer"><input type="text" id="rIn" aria-label="Выражение на английском" placeholder="По-английски…" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" lang="en" enterkeyhint="done">${SR ? `<button class="btn mic" id="rMic" type="button" title="Сказать" aria-label="Сказать вслух" aria-pressed="false">${MIC_I}${STOP_I}</button>` : ""}</div>
    <div class="heard" id="rHeard" aria-live="polite"></div>
    <div class="row" id="rActs"><button class="btn primary" id="rCheck" type="button">Проверить</button><button class="btn" id="rGive" type="button">Не помню</button><button class="btn ghost" id="rSkip" type="button">Пропустить</button></div>
    <div id="rRes"></div></div>`;
  $("#rCheck").onclick = () => checkRev(it);
  $("#rGive").onclick = () => checkRev(it, {giveUp: true});
  $("#rSkip").onclick = () => { stopListening(); rpos++; renderRev(); };
  $("#rIn").addEventListener("keydown", e => { if(e.key !== "Enter") return; e.preventDefault(); $("#rNext") ? $("#rNext").click() : checkRev(it); });
  if($("#rMic")) $("#rMic").onclick = async () => {
    if(listening){ stopListening(true); return; }
    let best = null;
    const r = await hearLine(it.en, $("#rMic"), $("#rHeard"));
    if(!r) return;
    for(const a of wordAnswers(it.en)){ const x = scoreSpeech(a, [r.heard]); if(!best || x.pct > best.pct) best = x; }
    checkRev(it, best);
  };
  if(!isPhone()) $("#rIn").focus();
}
function wordResult(it, said, v){
  let pass, note = "";
  if(said?.giveUp){ pass = false; }
  else if(said){ pass = said.pct >= SPEAK_PASS; note = `<div class="diffline"><span class="sc ${scClass(said.pct)}">${said.pct}%</span> ${diffHTML(said.ops)}</div>`; }
  else { const r = checkWordText(it, v); pass = r.pass; note = r.typo ? `<div class="note">Засчитано, но с опечаткой: <del class="w" lang="en">${esc(v)}</del></div>` : (!r.pass ? `<div>Ваш ответ: <del class="w" lang="en">${esc(v)}</del></div>` : ""); }
  const c = wordCtx(it);
  const body = `${note}<div class="row"><ins class="w" lang="en" style="font-size:18px">${esc(it.en)}</ins>${playBtn(it.en.split(/\s+\/\s+/)[0])}<span class="note">— ${esc(it.ru)}</span></div>${ctxHTML(c)}`;
  return {pass, body};
}
function renderWords(){
  const words = Object.entries(store.get("words", {})).map(([k, w]) => ({k, ...w})).sort((a, b) => b.a - a.a);
  $("#wordsBox").hidden = !words.length;
  if(!words.length) return;
  const rev = revState();
  const learned = words.filter(w => (rev["w:" + w.k]?.step || 0) >= 4).length;
  $("#wordsSum").textContent = `Мой словарь · ${words.length} ${plural(words.length, "выражение", "выражения", "выражений")}${learned ? ` · выучено ${learned}` : ""}`;
  if(!$("#wordsBox").open) return;
  $("#wordsList").innerHTML = words.map(w => {
    const r = rev["w:" + w.k], due = r?.due ?? w.a;
    const st = !r ? "новое" : (r.step || 0) >= 4 ? "выучено" : due <= Date.now() ? "пора повторить" : `повтор ${dayTxt(due)}`;
    return `<li><span class="t"><b lang="en">${esc(w.en)}</b> — ${esc(w.ru)}</span><span class="st${(r?.step || 0) >= 4 ? " ok" : ""}">${st}</span>${playBtn(w.en.split(/\s+\/\s+/)[0])}</li>`;
  }).join("");
}
$("#wordsBox").addEventListener("toggle", renderWords);

/* ---------- habit: daily goal, streak, reminders ---------- */
const dk = (ts = Date.now()) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const goalCfg = () => ({ d: 1, t: 5, r: true, w: 8, ...(store.get("goal", null) || {}) });
function todayCounts(){
  const today = dk(), c = {dict: 0, tr: 0, rev: 0};
  for(const h of store.get("history", [])){ const k = h.k === "speak" ? "dict" : h.k; if(dk(h.t) === today && k in c) c[k]++; }
  return c;
}
function goalState(){
  const g = goalCfg(), c = todayCounts(), due = g.r ? dueItems().length : 0;
  const parts = [];
  if(g.d) parts.push({key: "dict", label: `${plural(g.d, "Диалог", "Диалога", "Диалогов")}`, have: Math.min(c.dict, g.d), need: g.d, go: "dict"});
  if(g.t) parts.push({key: "tr", label: `${plural(g.t, "Перевод", "Перевода", "Переводов")}`, have: Math.min(c.tr, g.t), need: g.t, go: "tr"});
  if(g.r) parts.push({key: "rev", label: "Повторение", have: due ? 0 : 1, need: 1, go: "rev", note: due ? `осталось ${due} ${plural(due, "карточка", "карточки", "карточек")}` : (c.rev ? `повторено: ${c.rev}` : "на сегодня карточек нет")});
  const total = parts.reduce((k, p) => k + p.need, 0), done = parts.reduce((k, p) => k + p.have, 0);
  const met = parts.length > 0 && done >= total && (c.dict + c.tr + c.rev) > 0;
  return {g, c, parts, frac: total ? done / total : 0, met};
}
const daysMet = () => store.get("days", {});
function streakInfo(){
  const days = daysMet(), set = new Set(Object.keys(days));
  let n = 0, d = new Date();
  if(!set.has(dk(d))) d.setDate(d.getDate() - 1);
  while(set.has(dk(d))){ n++; d.setDate(d.getDate() - 1); }
  let best = 0, run = 0, prev = null;
  for(const k of [...set].sort()){
    const t = new Date(k + "T12:00:00");
    run = prev && Math.round((t - prev) / DAY) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = t;
  }
  return {n, best, today: set.has(dk())};
}
function paintToday(){
  const st = goalState(), sk = streakInfo(), b = $("#todayBtn");
  st.met = st.met || sk.today; // once today's goal is done, it stays done even if the goal is raised later
  $("#todayRing").style.strokeDasharray = `${Math.round((st.met ? 1 : st.frac) * 100)} 100`;
  $("#streakN").textContent = sk.n;
  b.classList.toggle("met", st.met); b.classList.toggle("lit", sk.n > 0);
  b.setAttribute("aria-label", `Сегодня: ${st.met ? "цель выполнена" : `выполнено ${Math.round(st.frac * 100)}%`}. Серия: ${sk.n} ${plural(sk.n, "день", "дня", "дней")}`);
  if($("#todaySheet").open) renderTodaySheet();
}
function checkGoal(){
  const st = goalState(), today = dk(), days = daysMet();
  if(st.met && !days[today]){
    days[today] = Date.now(); store.set("days", days); cloudDirty();
    const sk = streakInfo();
    showToast(`Цель на сегодня выполнена! Серия: ${sk.n} ${plural(sk.n, "день", "дня", "дней")}.`);
    announce("Цель на сегодня выполнена");
  }
  paintToday(); reportStatus();
}
function renderTodaySheet(){
  const st = goalState(), sk = streakInfo();
  st.met = st.met || sk.today;
  $("#goalList").innerHTML = st.parts.length ? st.parts.map(p => `<li class="${p.have >= p.need ? "done" : ""}"><span>${p.label}${p.note ? ` <span class="note">· ${p.note}</span>` : ""}</span>
      ${p.have >= p.need ? `<b>✓${p.key === "rev" ? "" : ` ${p.have}/${p.need}`}</b>` : `<span class="row"><b>${p.key === "rev" ? "" : `${p.have}/${p.need}`}</b><button class="btn" type="button" data-go="${p.go}" data-close>Начать</button></span>`}</li>`).join("")
    : `<li>Цель не задана — выберите ниже, сколько заниматься в день.</li>`;
  $("#streakLine").innerHTML = st.met ? `<b>Цель выполнена.</b> Серия: ${sk.n} ${plural(sk.n, "день", "дня", "дней")}${sk.best > sk.n ? ` · рекорд ${sk.best}` : ""}.`
    : sk.n ? `Серия: <b>${sk.n} ${plural(sk.n, "день", "дня", "дней")}</b> — выполните цель сегодня, чтобы её продолжить.${sk.best > sk.n ? ` Рекорд: ${sk.best}.` : ""}`
    : `Выполняйте цель каждый день — так появится серия.${sk.best ? ` Рекорд: ${sk.best}.` : ""}`;
  $("#gD").textContent = st.g.d; $("#gT").textContent = st.g.t; $("#gW").textContent = st.g.w; $("#gR").checked = !!st.g.r;
  const rm = remCfg(); $("#remOn").checked = rm.on; $("#remTime").value = rm.time; $("#remTest").hidden = !rm.on;
}
$("#todayBtn").onclick = () => { renderTodaySheet(); $("#todaySheet").showModal(); };
$("#todayClose").onclick = $("#todayDone").onclick = () => $("#todaySheet").close();
$("#todaySheet").addEventListener("click", e => {
  const st = e.target.closest("[data-step]");
  if(st){ const [k, d] = st.dataset.step.split(":"); const g = goalCfg(); g[k] = Math.max(0, Math.min(k === "d" ? 5 : k === "w" ? 20 : 30, g[k] + Number(d))); store.set("goal", g); if(k === "w" && addWords()) paintBadge(); store.set("prefsTs", Date.now()); cloudDirty(); checkGoal(); renderTodaySheet(); }
  if(e.target.closest("[data-close]")) $("#todaySheet").close();
});
$("#gR").onchange = e => { const g = goalCfg(); g.r = e.target.checked; store.set("goal", g); store.set("prefsTs", Date.now()); cloudDirty(); checkGoal(); renderTodaySheet(); };

// reminders: a daily push from the Ear & Pen server at the chosen time, skipped when today's goal is done
const remCfg = () => ({ on: false, time: "19:00", ...(store.get("remind", null) || {}) });
const pushOK = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const b64ToBytes = s => { s = s.replace(/-/g, "+").replace(/_/g, "/"); const bin = atob(s + "===".slice((s.length + 3) % 4)); return Uint8Array.from(bin, c => c.charCodeAt(0)); };
async function api(path, method = "GET", body){
  const r = await fetch(API_URL.replace(/\/$/, "") + path, { method, headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if(!r.ok) throw { code: j.error || "upstream_error" };
  return j;
}
function remNote(msg, err){ $("#remNote").textContent = msg; $("#remNote").classList.toggle("err-msg", !!err); }
async function turnRemindersOn(){
  const rm = remCfg();
  if(!user){ $("#remOn").checked = false; $("#todaySheet").close(); openAcct("Напоминания приходят после входа в аккаунт."); return; }
  if(isIOS() && !standalone()){ $("#remOn").checked = false; remNote("На iPhone напоминания работают в установленном приложении: Safari → Поделиться → На экран «Домой», затем откройте Ear & Pen с иконки.", true); return; }
  if(!pushOK()){ $("#remOn").checked = false; remNote("Этот браузер не умеет присылать напоминания. Попробуйте Chrome или установленное приложение.", true); return; }
  const perm = await Notification.requestPermission();
  if(perm !== "granted"){ $("#remOn").checked = false; remNote("Уведомления запрещены. Разрешите их для earandpen.net в настройках браузера или телефона.", true); return; }
  remNote("Включаю…");
  try{
    const reg = await navigator.serviceWorker.ready;
    const { key } = await api("/vapid");
    let sub = await reg.pushManager.getSubscription();
    if(sub){ const k = sub.options?.applicationServerKey; const same = k && btoa(String.fromCharCode(...new Uint8Array(k))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"") === key; if(!same){ await sub.unsubscribe().catch(() => {}); sub = null; } }
    sub = sub || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
    await api("/push", "POST", { sub: sub.toJSON(), time: rm.time, tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
    store.set("remind", { on: true, time: rm.time });
    lastStatus = ""; await reportStatus(true);
    remNote(`Готово: напоминание каждый день в ${rm.time}, если цель ещё не выполнена.`);
    $("#remTest").hidden = false;
  }catch(e){
    $("#remOn").checked = false; store.set("remind", { ...rm, on: false });
    remNote(e && e.code ? errCopy(e) : "Не получилось включить напоминания. Попробуйте ещё раз.", true);
  }
}
async function turnRemindersOff(){
  const rm = remCfg(); store.set("remind", { ...rm, on: false }); $("#remTest").hidden = true;
  try{
    const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription();
    if(sub){ await api("/push", "DELETE", { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe().catch(() => {}); }
  }catch{}
  remNote("Напоминания выключены.");
}
$("#remOn").onchange = e => e.target.checked ? turnRemindersOn() : turnRemindersOff();
$("#remTime").onchange = e => {
  const v = /^\d{2}:\d{2}$/.test(e.target.value) ? e.target.value : "19:00";
  store.set("remind", { ...remCfg(), time: v });
  if(remCfg().on) turnRemindersOn();
};
$("#remTest").onclick = async () => {
  const b = $("#remTest"); b.disabled = true;
  try{ const r = await api("/push/test", "POST", {}); remNote(r.sent ? "Отправлено — уведомление придёт через несколько секунд." : "Не удалось доставить. Выключите и снова включите напоминания.", !r.sent); }
  catch(e){ remNote(errCopy(e), true); }
  finally{ b.disabled = false; }
};
// tell the server what tomorrow's reminder should say (only when it changed)
let lastStatus = "", lastStatusAt = 0;
async function reportStatus(force){
  if(!remCfg().on || !user || !API_URL || !navigator.onLine) return;
  const rev = revState(), now = Date.now(), sk = streakInfo();
  const dues = reviewItems().map(it => dueOf(it, rev)).filter(t => t < now + 30 * DAY).sort((a, b) => a - b).slice(0, 300);
  const g = goalCfg();
  const body = { goalDay: daysMet()[dk()] ? dk() : "", dues, goal: g, streak: sk.n };
  const sig = JSON.stringify({ ...body, dues: dues.map(t => Math.round(t / 6e5)) });
  if(!force && sig === lastStatus && now - lastStatusAt < 6 * 3600e3) return;
  lastStatus = sig; lastStatusAt = now;
  try{ await api("/push/status", "POST", body); }catch{ lastStatus = ""; }
}

/* ---------- citizenship test (USCIS): civics questions, reading, writing ---------- */
var civInit = false;
const CIV = CIVICS.map(([n, en, ru, answers, f = ""]) => ({n, en, ru, official: answers, officialRu: CIV_ANS_RU[n] || [], answers: [...answers, ...(CIV_ALIASES[n] || [])], star: f.includes("*"), state: f.includes("S"), need: Number(f.replace(/\D/g, "")) || 1}));
const civSec = n => [...CIV_SECTIONS].reverse().find(s => n >= s.from);
const civLog = () => store.get("civ", {}) || {};
const civMine = () => store.get("civMine", {}) || {};
const civKnown = r => !!r && (r.s || 0) >= 2;
const civSetAll = () => store.get("civSet", "all") !== "6520";
const civPool = () => CIV.filter(q => civSetAll() || q.star);
// the four questions about your state take their answers from "Мой штат"
function civQ(q){
  if(!q.state) return q;
  const m = civMine(), st = US_STATES.find(x => x[0] === m.st);
  const names = s => String(s || "").split(/[,;]|\band\b/).map(x => x.trim()).filter(Boolean);
  const full = q.n === 23 ? names(m.sen) : q.n === 29 ? names(m.rep) : q.n === 61 ? names(m.gov) : q.n === 62 && st ? [st[2]] : [];
  const answers = full.flatMap(x => { const p = x.split(/\s+/); return p.length > 1 ? [x, p[p.length - 1]] : [x]; });
  return {...q, official: full, officialRu: [], answers};
}
const civReady = q => !q.state || civQ(q).answers.length > 0;
function civStats(){
  const log = civLog(), pool = civPool();
  return {known: pool.filter(q => civKnown(log[q.n])).length, total: pool.length};
}
function civMark(n, ok){
  const log = civLog(), r = {s: 0, ok: 0, bad: 0, ...(log[n] || {})};
  r.last = Date.now();
  if(ok){ r.ok++; r.s++; } else { r.bad++; r.s = 0; }
  log[n] = r; store.set("civ", log); cloudDirty();
}
let civMode = "learn", civCur = null, civRecent = [], civEx = null, civAnsweredNow = false;
const RU_LBL = ["Перевод вопроса", "Скрыть перевод"];
const CIV_MIC = [`${MIC_I}<span>Ответить голосом</span>`, `${STOP_I}<span>Готово</span>`];
const RD_MIC = [`${MIC_I}<span>Прочитать вслух</span>`, `${STOP_I}<span>Готово</span>`];
const canHear = () => !!(SR || serverSTT());

function civRefresh(){
  const d = dialogs[dIdx], on = d?.topic === "citizen" || state.topic === "citizen" || target()?.topic === "citizen";
  $("#civEntry").hidden = !on;
  const s = civStats();
  $("#civEntrySub").textContent = s.known ? `Выучено ${s.known} из ${s.total} · чтение и письмо` : `${s.total} вопросов, чтение и письмо — как на интервью`;
  if($("#civSheet").open) civPaintProg();
}
function civPaintProg(){
  const s = civStats();
  $("#civKnown").textContent = s.known;
  $("#civKnownOf").textContent = `из ${s.total} выучено`;
  $("#civHint").hidden = s.known >= 3;
  $("#civMeter").style.width = Math.round(100 * s.known / Math.max(1, s.total)) + "%";
}
function civPick(){
  const log = civLog(), pool = civPool().filter(civReady);
  const fresh = pool.filter(q => !civKnown(log[q.n]) && !civRecent.includes(q.n));
  if(fresh.length){
    // the ones you missed come back first, then the ones you have not seen yet
    const missed = fresh.filter(q => log[q.n]?.bad && !(log[q.n].s));
    const list = missed.length && Math.random() < 0.6 ? missed : fresh;
    return list[Math.floor(Math.random() * list.length)];
  }
  const old = pool.filter(q => !civRecent.includes(q.n)).sort((a, b) => (log[a.n]?.last || 0) - (log[b.n]?.last || 0)).slice(0, 10);
  return old[Math.floor(Math.random() * old.length)] || pool[0];
}
function civShow(q){
  civCur = q; civAnsweredNow = false;
  civRecent = [q.n, ...civRecent.filter(x => x !== q.n)].slice(0, Math.min(8, Math.floor(civPool().length / 2)));
  const log = civLog()[q.n];
  $("#civMeta").textContent = `Вопрос ${q.n}${q.star ? " ★" : ""} · ${civSec(q.n).name}`;
  $("#civStat").textContent = civEx ? `${civEx.i + 1} из ${civEx.qs.length} · верно ${civEx.ok} · ошибок ${civEx.bad}` : log ? (civKnown(log) ? "выучен ✓" : log.s ? `верно ${log.s} раз подряд` : "была ошибка") : "новый";
  $("#civText").textContent = q.en;
  $("#civText").classList.toggle("hid", !$("#civShow").checked);
  $("#civText").title = $("#civShow").checked ? "" : "Текст скрыт — как на интервью. Нажмите, чтобы показать.";
  $("#civPlay").dataset.say = q.en;
  const always = $("#civRuOn").checked;
  $("#civRu").textContent = q.ru; $("#civRu").hidden = !always;
  $("#civRuBtn").hidden = always; $("#civRuBtn").setAttribute("aria-expanded", "false"); setLabel($("#civRuBtn"), "Перевод вопроса", RU_LBL);
  const ready = civReady(q);
  $("#civNeed").hidden = q.need < 2 && ready;
  $("#civNeed").innerHTML = !ready ? `Это вопрос про ваш штат. <button class="btn ghost" type="button" id="civToState">Указать мой штат</button>` : `Нужно назвать ${q.need}.`;
  $("#civAns").hidden = false; $("#civIn").value = ""; $("#civIdk").hidden = !ready;
  $("#civMic").hidden = !canHear() || !ready; $("#civForm").hidden = !ready;
  setLabel($("#civMic"), CIV_MIC[0], CIV_MIC);
  $("#civOut").textContent = ""; $("#civOut").classList.remove("err");
  $("#civRes").hidden = true; $("#civNextRow").hidden = !(!ready && !civEx);
  $("#civNext").textContent = "Следующий вопрос →";
  $("#civSum").hidden = true; $("#civCard").hidden = false;
  stopSpeech();
}
$("#civText").onclick = () => $("#civText").classList.remove("hid");
document.addEventListener("click", e => { if(e.target.closest("#civToState")) civOpenOpts(true); });
document.addEventListener("click", e => { if(e.target.closest("#civSessGo")){ $("#civSheet").close(); if(sess){ sess.i++; goStep(); } } });
const civSpeakable = a => a.replace(/\[[^\]]*\]/g, "").replace(/[()]/g, "").replace(/\s+/g, " ").trim();
function civAnswer(alts, idk){
  if(civAnsweredNow || !civCur) return;
  const q = civQ(civCur);
  let best = {ok: false, hits: [], count: 0, heard: alts[0] || ""};
  if(!idk) for(const style of ["plain", "pairs"]){
    const r = civGrade(q, alts, t => spNorm(String(t).replace(/(\d+)(st|nd|rd|th)\b/gi, "$1"), style));
    if(r.ok && !best.ok || (r.count || 0) > (best.count || 0)) best = r;
    if(best.ok) break;
  }
  civAnsweredNow = true; stopListening();
  civMark(q.n, best.ok);
  sessHit("civ");
  const hit = new Set(best.hits);
  const list = q.official.map((a, k) => `<li class="${hit.has(a) ? "hit" : ""}">${playBtn(civSpeakable(a))}<span>${esc(a)}${q.officialRu[k] ? `<small class="civtr" lang="ru">${esc(q.officialRu[k])}</small>` : ""}</span></li>`);
  const shown = list.length > 8 ? list.slice(0, 8).join("") + `<li class="more"><details><summary>ещё ${list.length - 8}</summary><ul class="civlist">${list.slice(8).join("")}</ul></details></li>` : list.join("");
  $("#civRes").innerHTML = `<div class="civverdict ${best.ok ? "ok" : idk ? "idk" : "bad"}">${best.ok ? "✓ Засчитано" : idk ? "Запомните ответ" : "✗ Не засчитано"}</div>
    ${!idk && best.heard ? `<p class="note">Ваш ответ: «${esc(best.heard)}»${!best.ok && q.need > 1 && best.count ? ` — назвали ${best.count} из ${q.need}` : ""}</p>` : ""}
    <p class="lbl">${q.official.length > 1 ? `Правильные ответы — ${q.need > 1 ? `назовите ${q.need} любых` : "любой из них"}` : "Правильный ответ"}</p>
    <ul class="civlist">${shown}</ul>`;
  $("#civRes").hidden = false; $("#civAns").hidden = true; $("#civOut").textContent = "";
  $("#civText").classList.remove("hid");
  if(civEx){
    civEx[best.ok ? "ok" : "bad"]++; civEx.log.push({n: q.n, ok: best.ok});
    $("#civStat").textContent = `${civEx.i + 1} из ${civEx.qs.length} · верно ${civEx.ok} · ошибок ${civEx.bad}`;
    const end = civEx.ok >= civEx.pass || civEx.bad > civEx.qs.length - civEx.pass || civEx.i >= civEx.qs.length - 1;
    $("#civNext").textContent = end ? "Итог интервью →" : "Следующий вопрос →";
  }
  const sst = sess?.steps[sess.i];
  if(sst?.k === "civ" && sst.done && !sst.told){ sst.told = true; $("#civRes").insertAdjacentHTML("beforeend", `<div class="civsess"><span>Шаг занятия выполнен.</span><button class="btn primary" type="button" id="civSessGo">Продолжить занятие →</button></div>`); }
  $("#civNextRow").hidden = false;
  civPaintProg(); civRefresh();
  announce(best.ok ? "Засчитано" : "Не засчитано");
}
$("#civForm").onsubmit = e => { e.preventDefault(); const v = $("#civIn").value.trim(); if(!v){ $("#civIn").focus(); return; } civAnswer([v]); };
$("#civIdk").onclick = () => civAnswer([], true);
$("#civMic").onclick = async () => {
  if(listening){ stopListening(true); return; }
  const btn = $("#civMic");
  setLabel(btn, CIV_MIC[1], CIV_MIC); $("#civCard").classList.add("listening");
  const r = await hearLine(null, btn, $("#civOut"));
  setLabel(btn, CIV_MIC[0], CIV_MIC); $("#civCard").classList.remove("listening");
  if(r?.alts?.length) civAnswer(r.alts);
};
$("#civNext").onclick = () => {
  if(civEx){
    const end = civEx.ok >= civEx.pass || civEx.bad > civEx.qs.length - civEx.pass || civEx.i >= civEx.qs.length - 1;
    if(end) return civSummary();
    civEx.i++; return civShow(civEx.qs[civEx.i]);
  }
  civShow(civPick());
};
function civStartExam(){
  const all = civSetAll(), pool = civPool().filter(civReady).sort(() => Math.random() - 0.5);
  const n = all ? 20 : 10;
  civEx = {qs: pool.slice(0, n), i: 0, ok: 0, bad: 0, pass: all ? 12 : 6, log: []};
  civShow(civEx.qs[0]);
}
function civSummary(){
  const x = civEx, passed = x.ok >= x.pass;
  stopSpeech();
  $("#civCard").hidden = true; $("#civSum").hidden = false;
  $("#civSheet").scrollTo({top: 0, behavior: "smooth"});
  $("#civSum").innerHTML = `<div class="civverdict ${passed ? "ok" : "bad"}">${passed ? "✓ Тест сдан" : "✗ Пока не сдан"}</div>
    <p>Верно ${x.ok}, ошибок ${x.bad}. ${passed ? `Офицер останавливается, как только набрано ${x.pass} правильных ответов.` : `Нужно ${x.pass} правильных из ${x.qs.length}; при ${x.qs.length - x.pass + 1} ошибках интервью по истории заканчивается.`}</p>
    <ul class="civlog">${x.log.map(l => { const q = CIV.find(c => c.n === l.n); return `<li class="${l.ok ? "hit" : "miss"}"><span>${l.ok ? "✓" : "✗"}</span> ${l.n}. ${esc(q.en)}</li>`; }).join("")}</ul>
    <div class="row"><button class="btn primary" type="button" id="civAgain">Ещё одно интервью</button><button class="btn" type="button" id="civToLearn">К тренировке</button></div>`;
  civEx = null;
}
document.addEventListener("click", e => {
  if(e.target.closest("#civAgain")) civStartExam();
  if(e.target.closest("#civToLearn")) civSetMode("learn");
});
function civSetMode(m){
  civMode = m;
  document.querySelectorAll("#civMode button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.m === m)));
  civEx = null;
  $("#civOpts").hidden = true; $("#civOptsBtn").setAttribute("aria-expanded", "false");
  if(m === "exam") civStartExam(); else civShow(civPick());
}
$("#civMode").onclick = e => { const b = e.target.closest("button"); if(b && b.dataset.m !== civMode) civSetMode(b.dataset.m); else if(b && b.dataset.m === "exam") civSetMode("exam"); };
function civOpenOpts(toState){
  $("#civOpts").hidden = false; $("#civOptsBtn").setAttribute("aria-expanded", "true");
  if(toState) setTimeout(() => { $(".civstate").scrollIntoView({block: "start", behavior: "smooth"}); $("#civSt").focus(); }, 50);
}
$("#civOptsBtn").onclick = () => { const open = $("#civOpts").hidden; $("#civOpts").hidden = !open; $("#civOptsBtn").setAttribute("aria-expanded", String(open)); };
$("#civSt").innerHTML += US_STATES.map(([c, n]) => `<option value="${c}">${n}</option>`).join("");
function civPaintMine(){ const m = civMine(); $("#civSt").value = m.st || ""; $("#civSen").value = m.sen || ""; $("#civRep").value = m.rep || ""; $("#civGov").value = m.gov || ""; }
const civSaveMine = () => {
  setPref("civMine", {st: $("#civSt").value, sen: $("#civSen").value.trim(), rep: $("#civRep").value.trim(), gov: $("#civGov").value.trim()});
  if(civCur?.state && !civAnsweredNow && !civEx) civShow(civCur);
};
["#civSt", "#civSen", "#civRep", "#civGov"].forEach(s => $(s).addEventListener("change", civSaveMine));
$("#civSet").onchange = e => { setPref("civSet", e.target.value); civPaintProg(); civRefresh(); civSetMode(civMode); };
try{ $("#civShow").checked = store.get("civShow", true); $("#civRuOn").checked = store.get("civRuAlways", false); }catch{}
$("#civShow").onchange = e => { store.set("civShow", e.target.checked); if(civCur && !civAnsweredNow) $("#civText").classList.toggle("hid", !e.target.checked); };
$("#civRuOn").onchange = e => { store.set("civRuAlways", e.target.checked); $("#civRu").hidden = !e.target.checked; $("#civRuBtn").hidden = e.target.checked; };
$("#civRuBtn").onclick = () => { const open = $("#civRu").hidden; $("#civRu").hidden = !open; $("#civRuBtn").setAttribute("aria-expanded", String(open)); setLabel($("#civRuBtn"), open ? "Скрыть перевод" : "Перевод вопроса", RU_LBL); };

// reading and writing: one of three sentences right passes
const shuffle3 = list => [...list].sort(() => Math.random() - 0.5).slice(0, 3);
let rd = null, wr = null;
function rdRound(){ rd = {list: shuffle3(CIV_READ), i: 0, pass: false}; rdShow(); }
function rdShow(){
  const t = rd.list[rd.i];
  $("#rdMeta").textContent = `Предложение ${rd.i + 1} из 3`;
  $("#rdStat").textContent = rd.pass ? "сдано ✓" : "";
  $("#rdText").textContent = t; $("#rdHear").dataset.say = t;
  $("#rdMic").hidden = !canHear(); setLabel($("#rdMic"), RD_MIC[0], RD_MIC);
  $("#rdOut").classList.remove("err");
  $("#rdOut").textContent = canHear() ? "" : "Этот браузер не распознаёт речь — прочитайте вслух и сравните с «Как звучит».";
  $("#rdNextRow").hidden = !!canHear();
  $("#rdNext").textContent = rd.i < 2 ? "Следующее предложение →" : "Новый раунд";
}
$("#rdMic").onclick = async () => {
  if(listening){ stopListening(true); return; }
  const t = rd.list[rd.i], btn = $("#rdMic"), out = $("#rdOut");
  const card = btn.closest(".civcard");
  setLabel(btn, RD_MIC[1], RD_MIC); card.classList.add("listening");
  const r = await hearLine(t, btn, out);
  setLabel(btn, RD_MIC[0], RD_MIC); card.classList.remove("listening");
  if(!r) return;
  const ok = r.pct >= 85;
  if(ok) rd.pass = true;
  sessHit("civ");
  out.innerHTML = `<span class="sc ${scClass(r.pct)}">${r.pct}%</span> ${diffHTML(r.ops)}<br>${ok ? `<b class="okc">✓ Прочитано — тест на чтение сдан.</b>` : rd.i < 2 ? "Не засчитано — попробуйте ещё раз или перейдите к следующему." : "Не засчитано."}`;
  $("#rdStat").textContent = rd.pass ? "сдано ✓" : "";
  $("#rdNextRow").hidden = false;
  $("#rdNext").textContent = ok || rd.i >= 2 ? "Новый раунд" : "Следующее предложение →";
};
$("#rdNext").onclick = () => { if(rd.pass || rd.i >= 2) rdRound(); else { rd.i++; rdShow(); } };
function wrRound(){ wr = {list: shuffle3(CIV_WRITE), i: 0, pass: false}; wrShow(); }
function wrShow(){
  const t = wr.list[wr.i];
  $("#wrMeta").textContent = `Предложение ${wr.i + 1} из 3`;
  $("#wrStat").textContent = wr.pass ? "сдано ✓" : "";
  $("#wrHear").dataset.say = t;
  $("#wrIn").value = ""; $("#wrIn").disabled = false; $("#wrCheck").disabled = false;
  $("#wrOut").textContent = ""; $("#wrNextRow").hidden = true;
  stopSpeech();
  if(!isPhone()) setTimeout(() => $("#wrIn").focus(), 150);
}
const wrNorm = t => spNorm(t).replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean).join(" ");
$("#wrForm").onsubmit = e => {
  e.preventDefault();
  const t = wr.list[wr.i], v = $("#wrIn").value.trim();
  if(!v){ $("#wrIn").focus(); return; }
  const ok = wrNorm(v) === wrNorm(t);
  if(ok) wr.pass = true;
  sessHit("civ");
  const d = diff(t, v, false);
  $("#wrOut").innerHTML = `${ok ? `<b class="okc">✓ Написано верно${wr.pass ? " — тест на письмо сдан" : ""}.</b>` : `<b class="errc">✗ Не засчитано.</b>`}<br>${diffHTML(d.ops)}<br><span class="note">Нужно было: ${esc(t)}</span>`;
  $("#wrIn").disabled = true; $("#wrCheck").disabled = true;
  $("#wrStat").textContent = wr.pass ? "сдано ✓" : "";
  $("#wrNextRow").hidden = false;
  $("#wrNext").textContent = ok || wr.i >= 2 ? "Новый раунд" : "Следующее предложение →";
};
$("#wrNext").onclick = () => { if(wr.pass || wr.i >= 2) wrRound(); else { wr.i++; wrShow(); } };

function civTab(t){
  document.querySelectorAll("#civTabs button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.t === t)));
  $("#civQ").hidden = t !== "q"; $("#civR").hidden = t !== "r"; $("#civW").hidden = t !== "w";
  stopSpeech(); stopListening();
  if(t === "q" && !civCur) civSetMode(civMode);
  if(t === "r" && !rd) rdRound();
  if(t === "w") { if(!wr) wrRound(); else if(!$("#wrIn").disabled) wrShow(); }
}
$("#civTabs").onclick = e => { const b = e.target.closest("button"); if(b) civTab(b.dataset.t); };
function openCiv(tab = "q"){
  civPaintMine(); $("#civSet").value = store.get("civSet", "all");
  $("#civOpts").hidden = true; $("#civOptsBtn").setAttribute("aria-expanded", "false");
  civPaintProg();
  $("#civSheet").showModal();
  civCur = null; civEx = null; civMode = "learn";
  document.querySelectorAll("#civMode button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.m === "learn")));
  civTab(tab);
}
$("#civEntry").onclick = () => openCiv();
$("#civClose").onclick = () => $("#civSheet").close();
$("#civSheet").addEventListener("close", () => { stopSpeech(); stopListening(); civRefresh(); paintGoal(); });
civInit = true; civRefresh();

/* ---------- toast ---------- */
let toastEl;
function showToast(msg, action, ms = 4500){
  if(!toastEl){ toastEl = document.createElement("div"); toastEl.className = "toast"; toastEl.setAttribute("role","status"); document.body.append(toastEl); }
  toastEl.textContent = msg;
  if(action){ const b = document.createElement("button"); b.className = "toastbtn"; b.textContent = action.label; b.onclick = () => { toastEl.hidden = true; action.fn(); }; toastEl.append(b); }
  toastEl.hidden = false; clearTimeout(toastEl._t); if(ms) toastEl._t = setTimeout(() => toastEl.hidden = true, ms);
}

/* ---------- phone layout: bar above the keyboard ---------- */
function isPhone(){ return matchMedia("(max-width:560px), (pointer:coarse)").matches; }
function updateBar(){
  document.body.classList.toggle("phone", isPhone());
  const show = state.view === "dict" && isPhone() && !dChecked && state.dmode !== "speak";
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
  const key = ["warm", BUILTIN.length, pickFor("A"), pickFor("B"), state.accent, nearestRate(state.rate)].join("|");
  if(store.get("warm", "") === key) return;
  const go = async () => {
    const t = $("#topic").value;
    const jobs = [...BUILTIN.filter(d => d.topic === t), ...BUILTIN.filter(d => d.topic !== t)].flatMap(d => d.lines).filter(l => pickFor(l.s).startsWith("g:"))
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
const bootAt = Date.now();
// nothing would be lost by reloading now: no typed lines, no recording, no open window
const idle = () => ![...document.querySelectorAll(".line input, #trIn, #rIn, #ownText")].some(i => i.value.trim()) && !listening && ![...document.querySelectorAll("dialog")].some(d => d.open);
// a window in the middle of the screen (the page behind is blurred); "Позже" brings it back next time
function updateBanner(w, apply){
  const d = $("#updSheet"); if(d.open) return;
  $("#updGo").onclick = () => { d.close(); apply(); };
  $("#updLater").onclick = () => d.close();
  // never on top of another window: wait until it is closed
  const show = () => { if([...document.querySelectorAll("dialog")].some(x => x.open)) return setTimeout(show, 1500); d.showModal(); $("#updGo").focus(); };
  show();
}
if("serviceWorker" in navigator && location.protocol === "https:"){
  let askedReload = false;
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then(reg => {
    const apply = w => { askedReload = true; w.postMessage("skip"); };
    // found right after opening (or while nothing is in progress): update straight away
    const offer = w => (Date.now() - bootAt < 20000 && idle()) ? apply(w) : updateBanner(w, () => apply(w));
    if(reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      w?.addEventListener("statechange", () => { if(w.state === "installed" && navigator.serviceWorker.controller) offer(w); });
    });
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    // an app on the home screen can stay open for days: look for a new version whenever it comes back
    document.addEventListener("visibilitychange", () => { if(document.visibilityState === "visible") reg.update().catch(() => {}); });
  }).catch(() => {});
  navigator.serviceWorker.addEventListener("controllerchange", () => { if(askedReload) location.reload(); });
}

/* ---------- account & sync (Firebase, like Pip's Sky Islands) ---------- */
const PREF_KEYS = ["level", "topic", "custom", "rate", "voiceA", "voiceB", "accent", "goal", "target", "civMine", "civSet"];
function snapshot(){
  const prefs = {};
  for(const k of PREF_KEYS){ const v = store.get(k, null); if(v !== null) prefs[k] = v; }
  return merge({
    prefs, prefsTs: store.get("prefsTs", 0),
    tr: { queue: store.get("trQueue", null), idx: store.get("trIdx", 0) }, trTs: store.get("trTs", 0),
    history: store.get("history", []), mistakes: store.get("mistakes", []),
    dialogs: store.get("genDialogs", []), rev: store.get("rev", {}), days: store.get("days", {}), words: store.get("words", {}), civ: store.get("civ", {}), gone: store.get("gone", []), cleared: store.get("cleared", 0),
  }, {});
}
function applySnapshot(x){
  const before = snapshot();
  for(const k of PREF_KEYS) if(k in x.prefs) store.set(k, x.prefs[k]);
  store.set("prefsTs", x.prefsTs);
  store.set("history", x.history); store.set("mistakes", x.mistakes); store.set("cleared", x.cleared);
  store.set("genDialogs", x.dialogs);
  store.set("rev", x.rev || {});
  store.set("days", x.days || {});
  store.set("words", x.words || {});
  store.set("civ", x.civ || {});
  store.set("gone", x.gone || []);
  if(x.tr && x.tr.queue && x.tr.queue.length){ store.set("trQueue", x.tr.queue); store.set("trIdx", x.tr.idx || 0); store.set("trTs", x.trTs); }
  // show the new values
  if(!same(before.prefs, x.prefs)){
    Object.assign(state, x.prefs); state.topic = normTopic(state.topic);
    $("#level").value = state.level; $("#topic").value = state.topic; $("#topicCustom").value = state.custom || "";
    $("#customWrap").hidden = state.topic !== "__custom"; $("#accent").value = state.accent || "en-US";
    loadVoices(); setRate(state.rate); paintSet();
  }
  if(!same(before.dialogs, x.dialogs)){
    const keep = dialogs[dIdx];
    dialogs = [...BUILTIN, ...x.dialogs];
    const at = dialogs.findIndex(d => d === keep || (keep.id && d.id === keep.id));
    if(at >= 0) dIdx = at; else { dIdx = Math.min(dIdx, dialogs.length - 1); renderDialog(); }
    paintEyebrow();
  }
  if(!same(before.tr, x.tr) && x.tr && x.tr.queue && x.tr.queue.length){
    trQueue = x.tr.queue; trIdx = Math.min(x.tr.idx || 0, trQueue.length - 1);
    if($("#trResult").hidden) renderTr();
  }
  if(state.view === "stats") renderStats();
  addWords(); paintBadge(); paintToday(); paintGoal(); if(civInit) civRefresh();
  if(state.view === "rev" && rpos >= rq.length) revEmpty();
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
  const name = user ? (user.name || user.email.split("@")[0] || "Аккаунт") : "Войти";
  const st = !cloud ? "прогресс только здесь" : !user ? "сохранять в облаке" : syncing ? "синхронизация…" : lastSync ? "синхронизировано" : "в облаке";
  if(user) $("#acctAv").textContent = ((user.name || user.email || "?").trim()[0] || "?").toUpperCase();
  else $("#acctAv").innerHTML = `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="8" cy="5.5" r="2.8"/><path d="M2.8 14c.6-2.8 2.6-4.3 5.2-4.3s4.6 1.5 5.2 4.3"/></svg>`;
  $("#acctName").textContent = name; $("#acctSt").textContent = st;
  b.dataset.sync = !user ? "off" : syncing || !lastSync ? "busy" : "ok";
  b.setAttribute("aria-label", user ? `Аккаунт: ${name}, ${st}` : "Войти и сохранять прогресс в облаке");
  $("#acctOut").hidden = !!user; $("#acctIn").hidden = !user;
  $("#accessInfo").textContent = !user ? "" : access === "ok" ? "Проверка и разбор от Claude включены." : access === "no" ? "У этого аккаунта нет доступа к Claude: работают встроенные диалоги, уже озвученные фразы и сверка с эталоном." : "";
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
async function paintVersion(){
  try{ const v = (await caches.keys()).filter(k => /^ep-v\d+$/.test(k)).map(k => +k.slice(4)).sort((a, b) => b - a)[0]; $("#verInfo").textContent = v ? `Версия приложения: ${v}` : ""; }catch{}
}
function openAcct(why){
  paintVersion();
  if(!cloud){ showToast(FIREBASE ? "Вход загружается…" : "Вход и синхронизация скоро появятся."); return; }
  $("#acctWhy").hidden = !why; $("#acctWhy").textContent = why || "";
  acctMsg(); acctUI(); if(!$("#acctSheet").open) $("#acctSheet").showModal();
}
$("#acctBtn").onclick = () => openAcct("");
$("#acctClose").onclick = () => $("#acctSheet").close();
const busy = async (btn, fn) => { btn.disabled = true; acctMsg(); try{ await fn(); }catch(e){ acctMsg(authCopy(e)); } finally{ btn.disabled = false; } };
$("#gSignIn").onclick = () => busy($("#gSignIn"), () => cloud.signInGoogle());
const creds = () => [$("#emIn").value.trim(), $("#pwIn").value];
$("#emailForm").addEventListener("submit", e => { e.preventDefault(); busy($("#emSignIn"), () => cloud.signInEmail(...creds())); });
$("#emSignUp").onclick = () => { if(!$("#emailForm").reportValidity()) return; busy($("#emSignUp"), async () => { await cloud.signUpEmail(...creds()); acctMsg("", "Аккаунт создан. Мы отправили письмо для подтверждения почты."); }); };
$("#emReset").onclick = () => { const em = $("#emIn").value.trim(); if(!em){ acctMsg("Сначала введите почту."); return; } busy($("#emReset"), async () => { await cloud.resetPassword(em); acctMsg("", "Письмо для смены пароля отправлено."); }); };
$("#signOut").onclick = async () => { await cloud.signOut(); acctMsg(); };
$("#syncNow").onclick = () => syncNow();
addEventListener("visibilitychange", () => { if(document.visibilityState === "visible"){ syncNow(); paintBadge(); paintToday(); } else reportStatus(); });

async function bootCloud(){
  if(!FIREBASE) { acctUI(); return; }
  try{ cloud = await (await import("./cloud.js")).startCloud(FIREBASE); }catch(e){ console.warn("cloud", e); cloud = null; }
  acctUI();
  if(!cloud) return;
  cloud.redirect.then(r => { if(r && r.code && authCopy(r)){ acctMsg(authCopy(r)); $("#acctSheet").showModal(); } });
  cloud.onAuth(u => {
    user = u; unwatch?.(); unwatch = null;
    refreshAccess();
    if(u){
      if($("#acctSheet").open) $("#acctSheet").close();
      syncNow().then(() => {
        checkGoal(); reportStatus(true);
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
setMode(state.dmode); renderTr();
paintAccess();
addWords();
paintBadge();
paintGoal();
paintToday();
const openFromHash = () => { const h = location.hash.slice(1); if(TABS.includes(h) && h !== state.view) showView(h); };
openFromHash(); addEventListener("hashchange", openFromHash);
if(!store.get("introSeen", false)) setTimeout(() => { if(![...document.querySelectorAll("dialog")].some(d => d.open)) openTour(); }, 400);
$("#introClose").onclick = () => { $("#intro").hidden = true; store.set("introSeen", true); };
netState();
bootCloud();
}
