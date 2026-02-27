import melinda from "@/app/data/melinda.json";
import xfinite from "@/app/data/xfinite.json";

type KBItem = { title: string; content: string; };

const KB = [
  ...melinda.map(x => ({ ...x, source: "melinda" })),
  ...xfinite.map(x => ({ ...x, source: "xfinite" })),
] as (KBItem & { source: string })[];


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
  requirements: ["requirement","requirements","need","needed","prerequisite","qualifications"],
  apply: ["apply","application","join","register","enroll","start"],
  pay: ["salary","pay","income","earn","earnings","rate","payment"],
  hours: ["time","hours","schedule","shift","workload"],
  training: ["training","orientation","lesson","course","tutorial"],
  contact: ["contact","email","facebook","instagram","link"],
};

function detectIntent(query: string) {
  const q = query.toLowerCase();

  for (const key in intents) {
    if (intents[key].some(w => q.includes(w)))
      return key;
  }
  return null;
}


/* ---------------- SCORING ---------------- */

function scoreItem(item: KBItem, query: string, intent: string | null) {
  let score = 0;
  const text = `${item.title} ${item.content}`.toLowerCase();

  // keyword overlap
  for (const word of query.split(/\s+/)) {
    if (text.includes(word)) score += 2;
  }

  // intent boost
  if (intent && text.includes(intent)) score += 6;

  // title priority
  if (intent && item.title.toLowerCase().includes(intent)) score += 10;

  return score;
}


/* ---------------- MAIN RETRIEVER ---------------- */

export function retrieveContext(query: string): string {

  const topic = detectTopic(query);
  const intent = detectIntent(query);

  let filtered = KB;

  // filter by topic
  if (topic !== "any") {
    filtered = KB.filter(x => x.source === topic);
  }

  // score all items
  const ranked = filtered
    .map(item => ({
      item,
      score: scoreItem(item, query.toLowerCase(), intent),
    }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (!ranked.length)
    return "No relevant knowledge found.";

  return ranked
    .map(x => `${x.item.title}: ${x.item.content}`)
    .join("\n");
}