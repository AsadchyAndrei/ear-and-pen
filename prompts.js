// Prompt templates shared by the web page (when opened inside Claude) and the Cloudflare Worker.
// Each function takes plain params and returns the full prompt string.

const lineMax = level => (level === "A2" ? 14 : level === "B1" ? 18 : 24);
const clip = (s, n) => String(s ?? "").slice(0, n);

export const PROMPTS = {
  dialogue({ level = "B1", topic = "everyday life", avoid = "" }) {
    return `Write a natural spoken English dialogue for a dictation exercise for an adult native Russian speaker at CEFR level ${clip(level, 4)}.
Topic: ${clip(topic, 120)}.
Rules: two speakers, 6–8 lines, each line 6–${lineMax(level)} words. Realistic everyday speech with contractions and natural phrasing typical for the US. Include a few things that are hard to hear for Russian speakers (contractions, weak forms, linked words, phrasal verbs) appropriate to the level. No names of real people or brands. Do not repeat these existing titles: ${clip(avoid, 800)}.
Reply with only JSON in this shape:
{"title":"short English title","context_ru":"одно предложение по-русски о ситуации","speakers":{"A":"role","B":"role"},"lines":[{"s":"A","text":"..."},{"s":"B","text":"..."}],"vocab":[{"en":"phrase from the dialogue","ru":"перевод"}]}
vocab: 4–6 useful phrases taken from the dialogue.`;
  },

  sentences({ level = "B1", topic = "everyday life" }) {
    return `Create 6 Russian sentences for an adult native Russian speaker to translate into English. CEFR level: ${clip(level, 4)}. Topic: ${clip(topic, 120)}.
Each sentence should be natural spoken Russian and target a typical difficulty for Russian speakers at this level (articles, tense choice, prepositions, word order, conditionals, modal verbs, phrasal verbs, reported speech, gerund vs infinitive, collocations). Vary the targets. US English context.
Reply with only a JSON array:
[{"ru":"русское предложение","focus":"short English grammar label","hint_ru":"короткая подсказка по-русски, не выдающая ответ","en":"one natural American English translation"}]`;
  },

  check({ level = "B1", ru = "", en = "", mine = "" }) {
    return `You are a meticulous English writing tutor for an adult native Russian speaker (CEFR level ${clip(level, 4)}).
Russian source sentence: "${clip(ru, 600)}"
Learner's English translation: "${clip(mine, 800)}"
A reference translation (one of many acceptable): "${clip(en, 600)}"

Evaluate the learner's translation: accuracy of meaning, grammar, word choice, articles, prepositions, word order, tense, spelling, punctuation and naturalness for American English. Do not penalize valid alternatives just because they differ from the reference.
Reply with only JSON:
{"score":0-100,
 "verdict_ru":"1–2 предложения: общая оценка",
 "meaning_ok":true,
 "corrected":"the learner's sentence with the minimal edits needed to be correct and faithful",
 "natural":"how a native speaker would most naturally say it",
 "alternatives":[{"en":"another good version","note_ru":"чем отличается (тон, регистр)"}],
 "mistakes":[{"yours":"exact fragment from learner","better":"corrected fragment","type":"grammar|tense|articles|prepositions|word order|vocabulary|spelling|punctuation|style|meaning","why_ru":"подробное объяснение по-русски","rule_ru":"правило или шаблон, коротко"}],
 "tip_ru":"один практический совет на будущее"}
Give 1–3 alternatives. If there are no mistakes, return an empty mistakes array and still show the natural version. Explanations in Russian, clear and specific.`;
  },

  explain({ level = "B1", items = [] }) {
    const body = (Array.isArray(items) ? items : []).slice(0, 12)
      .map(r => `Original: ${clip(r.expected, 300)}\nLearner wrote: ${clip(r.typed, 300) || "(nothing)"}`).join("\n\n");
    return `You are an English listening tutor for an adult native Russian speaker (CEFR level ${clip(level, 4)}). The learner did a dictation: they listened to spoken English lines and typed what they heard. Below are the lines with mistakes.

${body}

Explain the mistakes IN RUSSIAN. For each line with a real mistake: show the correct fragment vs. what was written, then explain why it was likely misheard or misspelled (weak forms, contractions like I'd/I'll, linking between words, silent letters, similar-sounding words, grammar the ear "fills in"), and give one short practical tip. Ignore pure capitalization and punctuation differences unless they change meaning. Group repeated patterns. Finish with 2–3 sentences: the main pattern in this learner's errors and what to practice next.
Format: plain text, no markdown headings or asterisks. Use "•" for list items and put English words in quotes. Keep it compact.`;
  },
};

// Tasks whose answer is JSON (the rest return plain text).
export const JSON_TASKS = ["dialogue", "sentences", "check"];
