import melinda from "@/app/data/melinda.json";
import xfinite from "@/app/data/xfinite.json";

type KBItem = { title: string; content: string; source: string };

const KB: KBItem[] = [
  ...melinda.map(x => ({ ...x, source: "melinda" })),
  ...xfinite.map(x => ({ ...x, source: "xfinite" })),
];


/* ================= TEXT NORMALIZATION ================= */

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter(w => w.length > 2);
}


/* ================= STEMMING ================= */

function stem(word: string): string {
  return word
    .replace(/ing$|ed$|es$|s$/g, "")
    .replace(/ment$|tion$/g, "");
}


/* ================= QUERY EXPANSION ================= */

function expandQuery(words: string[]): string[] {
  const synonyms: Record<string, string[]> = {
    work: ["job","apply","join","start","hiring"],
    requirements: ["requirements","qualification","need","prerequisite","require"],
    pay: ["salary","earn","income","payment","rate"],
    training: ["training","orientation","lesson"],
    contact: ["contact","email","link","facebook"],
  };

  let expanded = [...words];

  for (const w of words) {
    for (const key in synonyms) {
      if (key.startsWith(w) || w.startsWith(key)) {
        expanded.push(...synonyms[key]);
      }
    }
  }

  return [...new Set(expanded)];
}


/* ================= SCORING ================= */

function scoreItem(item: KBItem, queryWords: string[]): number {
  const textWords = tokenize(item.title + " " + item.content).map(stem);

  let score = 0;

  for (const q of queryWords) {
    const sq = stem(q);

    for (const word of textWords) {
      if (word === sq) score += 6;
      else if (word.startsWith(sq)) score += 4;
      else if (word.includes(sq)) score += 2;
    }
  }

  const uniqueMatches = new Set(queryWords.map(stem).filter(w => textWords.includes(w)));
  score += uniqueMatches.size * 5;

  return score;
}


/* ================= RETRIEVER ================= */

export function retrieveContext(query: string): string {

  const baseWords = tokenize(query);
  const queryWords = expandQuery(baseWords);

  const ranked = KB
    .map(item => ({
      item,
      score: scoreItem(item, queryWords),
    }))
    .filter(r => r.score > 8)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  if (!ranked.length) return "NO_CONTEXT_FOUND";

  return ranked
    .map(r => `${r.item.title}: ${r.item.content}`)
    .join("\n");
}