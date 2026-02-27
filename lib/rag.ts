import melinda from "@/app/data/melinda.json";
import xfinite from "@/app/data/xfinite.json";
import { rememberTopic, getLastTopic } from "./chatMemory";

type KBItem = { title: string; content: string };

const KB = [
  ...melinda.map(x => ({ ...x, source: "melinda" })),
  ...xfinite.map(x => ({ ...x, source: "xfinite" })),
] as (KBItem & { source: string })[];

/* ---------------- STOPWORDS ---------------- */

const STOPWORDS = new Set([
  "what","is","are","the","a","an","for","to","of","in","on","at","about",
  "do","does","did","can","could","should","would","tell","me","i","you",
  "how","much","many","there","their","them"
]);

function cleanWords(query: string) {
  return query
    .toLowerCase()
    .split(/\W+/)
    .filter(w => w && !STOPWORDS.has(w));
}

/* ---------------- TOPIC DETECTION ---------------- */

function detectTopic(query: string) {
  const q = query.toLowerCase();

  if (q.includes("xfinite") || q.includes("xfnite") || q.includes("labeling"))
    return "xfinite";

  if (q.includes("melinda") || q.includes("doctor") || q.includes("physician"))
    return "melinda";

  return "any";
}

/* ---------------- INTENT DETECTION ---------------- */

const intents: Record<string, string[]> = {
  requirements: ["requirement","requirements","qualifications","specs","specifications","needed","prerequisite"],
  apply: ["apply","application","join","register","enroll","start","signup","sign"],
  pay: ["salary","pay","income","earn","earnings","rate","payment","compensation","wage"],
  hours: ["time","hours","schedule","shift","duration","workload"],
  training: ["training","orientation","lesson","course","tutorial","practice"],
  contact: ["contact","email","facebook","instagram","link","reach"],
};

function detectIntent(query: string) {
  const words = cleanWords(query).join(" ");

  for (const key in intents) {
    if (intents[key].some(w => words.includes(w)))
      return key;
  }
  return null;
}

/* ---------------- SCORING ---------------- */

function scoreItem(item: KBItem, query: string, intent: string | null) {
  let score = 0;
  const text = `${item.title} ${item.content}`.toLowerCase();

  // keyword overlap
  for (const word of cleanWords(query)) {
    if (text.includes(word)) score += 3;
  }

  // intent semantic boost
  if (intent) {
    const synonyms = intents[intent];
    if (synonyms.some(w => text.includes(w))) score += 12;
  }

  // title priority
  if (intent && item.title.toLowerCase().includes(intent)) score += 15;

  return score;
}

/* ---------------- MAIN RETRIEVER ---------------- */

export function retrieveContext(query: string): string {

  // topic + memory
  let topic = detectTopic(query);

  if (topic === "any") {
    const memory = getLastTopic();
    if (memory) topic = memory;
  }

  rememberTopic(topic);

  // intent
  const intent = detectIntent(query);

  // filter by topic
  let filtered = KB;
  if (topic !== "any") {
    filtered = KB.filter(x => x.source === topic);
  }

  // ranking
  const ranked = filtered
    .map(item => ({
      item,
      score: scoreItem(item, query, intent),
    }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (!ranked.length)
    return "STRICT_NO_CONTEXT";

  return ranked
    .map(x => `${x.item.title}: ${x.item.content}`)
    .join("\n");
}