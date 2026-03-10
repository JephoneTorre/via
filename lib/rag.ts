import xfinite from "@/app/data/xfinite.json";

type KBItem = {
  title: string;
  content: string;
  source: string;
};

/* ================= BUILD KB ================= */

const KB: KBItem[] = [
  ...xfinite.map(x => ({ ...x, source: "xfinite" })),
];

const MEANING: Record<string,string[]> = {
  pay: ["salary","income","earn","earnings","rate","payout","paid","money","cash","salary","payment"],
  monthly: ["month","4","weeks","cycle"],
  requirements: ["requirement","needs","needed","qualification","prerequisite","specs","system"],
  training: ["orientation","lesson","course","session","video","hands-on"],
  install: ["setup","installation","installing","ginger","software"],
  time: ["hours","schedule","shift","duration","time"],
  apply: ["hiring","join","start","application","enroll","slots","register","apply","joining","started"],
  contact: ["inquiry","email","facebook","social","reached","reach","inquiries","ig","instagram","linkedIn","fb"],
  xfinite: ["xf", "xfnite", "project", "label", "labeling", "building", "roof", "satellite", "map", "ginger", "bitmappro", "cedrick"],
};

/* ================= NORMALIZATION ================= */

function normalize(text: string) {
  return text
    .toLowerCase()
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
  return tokens.filter(t => !STOPWORDS.has(t.toLowerCase()) && t.length >= 2);
}

/* ================= SIMILARITY ================= */

function similarity(a: string, b: string) {
  if (a === b) return 1;
  
  // Fuzzy inclusion check
  if (a.includes(b) || b.includes(a)) {
    const shorter = a.length < b.length ? a : b;
    // Only high score if word is substantial or is a prefix
    if (shorter.length >= 3) return 0.85;
    if (a.startsWith(b) || b.startsWith(a)) return 0.85;
  }

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
    const words = meaningful(tokenize(s));
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

  // Brand boost: if query contains source name
  if (queryTokens.includes(item.source)) {
    bestSentenceScore += 50;
  }

  // Explicit check for common keywords in content
  for (const q of queryTokens) {
    if (q === "xfinite" && item.source === "xfinite") bestSentenceScore += 10;
  }

  // title hint
  const title = normalize(item.title);
  for (const q of queryTokens) {
    if (title.includes(q)) bestSentenceScore += 25; // Increased boost for title matches
    if (q === item.source) bestSentenceScore += 10;
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
    .filter(r => r.score > 0)
    .sort((a,b)=>b.score-a.score)
    .slice(0,10); // Increased from 5 to 10 context items

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
