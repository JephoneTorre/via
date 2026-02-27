import melinda from "@/app/data/melinda.json";
import xfinite from "@/app/data/xfinite.json";

type KBItem = {
  title: string;
  content: string;
  source: string;
};

/* ================= BUILD KB ================= */

const KB: KBItem[] = [
  ...melinda.map(x => ({ ...x, source: "melinda" })),
  ...xfinite.map(x => ({ ...x, source: "xfinite" })),
];

/* ================= NORMALIZATION ================= */

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[$]/g, " dollar ")
    .replace(/[0-9]+/g, n => ` ${n} `)
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string) {
  return normalize(text).split(" ");
}

/* ================= STOPWORDS ================= */

const STOPWORDS = new Set([
  "what","is","are","the","a","an","do","you","know","about","tell","me",
  "can","i","how","to","of","for","in","on","at","with","and","or","if",
  "does","it","they","their","there"
]);

function meaningful(tokens: string[]) {
  return tokens.filter(t => !STOPWORDS.has(t) && t.length > 2);
}

/* ================= SEMANTIC SYNONYMS ================= */

const MEANING: Record<string,string[]> = {
  pay: ["salary","income","earn","earnings","rate","payout","paid","money"],
  monthly: ["month","4","weeks","cycle"],
  requirements: ["requirement","needs","needed","qualification","prerequisite"],
  training: ["orientation","lesson","course","session"],
  install: ["setup","installation","installing"],
  time: ["hours","schedule","shift","duration"],
};

function expandMeaning(tokens: string[]) {
  const expanded = new Set(tokens);

  for (const token of tokens) {
    for (const key in MEANING) {
      if (MEANING[key].includes(token)) expanded.add(key);
      if (token === key) MEANING[key].forEach(w => expanded.add(w));
    }
  }

  return [...expanded];
}

/* ================= SIMILARITY ================= */

function similarity(a: string, b: string) {
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.85;

  let match = 0;
  for (let i = 0; i < Math.min(a.length,b.length); i++) {
    if (a[i] === b[i]) match++;
  }
  return match / Math.max(a.length,b.length);
}

/* ================= SENTENCE SPLITTER ================= */

function sentences(text: string) {
  return text.split(/(?<=[.!?])/);
}

/* ================= DEEP SCORING ================= */

function scoreItem(item: KBItem, queryTokens: string[]) {

  const allSentences = sentences(item.content);
  let bestSentenceScore = 0;

  for (const s of allSentences) {
    const words = tokenize(s);
    let score = 0;

    for (const q of queryTokens) {
      for (const w of words) {
        const sim = similarity(q, w);

        if (sim > 0.9) score += 6;
        else if (sim > 0.75) score += 3;
        else if (sim > 0.6) score += 1;
      }
    }

    bestSentenceScore = Math.max(bestSentenceScore, score);
  }

  // small title hint only
  const title = normalize(item.title);
  for (const q of queryTokens) {
    if (title.includes(q)) bestSentenceScore += 2;
  }

  return bestSentenceScore;
}

/* ================= RETRIEVER ================= */

export function retrieveContext(query: string, forcedTopic?: string) {

  let tokens = meaningful(tokenize(query));
  tokens = expandMeaning(tokens);

  let candidates = KB;

  if (forcedTopic) {
    candidates = [
      ...KB.filter(x => x.source === forcedTopic),
      ...KB.filter(x => x.source !== forcedTopic),
    ];
  }

  const ranked = candidates
    .map(item => ({
      item,
      score: scoreItem(item, tokens)
    }))
    .filter(r => r.score > 4)
    .sort((a,b)=>b.score-a.score)
    .slice(0,6);

  if (!ranked.length)
    return { context: "NO_CONTEXT_FOUND" };

  const topicCount: Record<string,number> = {};
  for (const r of ranked) {
    topicCount[r.item.source] = (topicCount[r.item.source]||0)+1;
  }

  const detectedTopic =
    Object.entries(topicCount).sort((a,b)=>b[1]-a[1])[0]?.[0];

  return {
    context: ranked.map(r => `${r.item.title}: ${r.item.content}`).join("\n"),
    detectedTopic
  };
}