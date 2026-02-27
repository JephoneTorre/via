import melinda from "@/app/data/melinda.json";
import xfinite from "@/app/data/xfinite.json";

type KBItem = {
title: string;
content: string;
source: string;
};

/* ---------------- BUILD KB ---------------- */

const KB: KBItem[] = [
...melinda.map(x => ({ ...x, source: "melinda" })),
...xfinite.map(x => ({ ...x, source: "xfinite" })),
];

/* ---------------- TEXT NORMALIZATION ---------------- */

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

/* ---------------- STOPWORDS ---------------- */

const STOPWORDS = new Set([
"what","is","are","the","a","an","do","you","know","about","tell","me",
"can","i","how","to","of","for","in","on","at","with","and","or"
]);

function meaningfulTokens(tokens: string[]) {
return tokens.filter(t => !STOPWORDS.has(t) && t.length > 2);
}

/* ---------------- SYNONYMS ---------------- */

const SYNONYMS: Record<string,string[]> = {
requirements: ["requirement","req","reqs","needs","needed","qualifications","prerequisite"],
apply: ["apply","application","join","register","enroll","signup"],
training: ["training","orientation","lesson","course","tutorial"],
pay: ["salary","income","earnings","rate","payment"],
hours: ["time","schedule","shift","workload"],
};

function expandQuery(tokens: string[]) {
const expanded = new Set(tokens);

for (const token of tokens) {
for (const key in SYNONYMS) {
if (SYNONYMS[key].includes(token)) {
expanded.add(key);
}
}
}

return [...expanded];
}

/* ---------------- FUZZY MATCH ---------------- */

function similarity(a: string, b: string) {
if (a === b) return 1;
if (a.includes(b) || b.includes(a)) return 0.8;

let matches = 0;
for (let i = 0; i < Math.min(a.length, b.length); i++) {
if (a[i] === b[i]) matches++;
}
return matches / Math.max(a.length, b.length);
}

/* ---------------- SCORING ---------------- */

function scoreItem(item: KBItem, queryTokens: string[]) {
const text = normalize(item.title + " " + item.content);
const words = text.split(" ");

let score = 0;

for (const q of queryTokens) {
for (const w of words) {
const sim = similarity(q, w);

```
  if (sim > 0.9) score += 12;      // exact
  else if (sim > 0.75) score += 6; // fuzzy
  else if (sim > 0.6) score += 3;  // weak
}
```

}

// title bonus
const title = normalize(item.title);
for (const q of queryTokens) {
if (title.includes(q)) score += 10;
}

return score;
}

/* ---------------- MAIN RETRIEVER ---------------- */

export function retrieveContext(query: string, forcedTopic?: string) {

const tokens = meaningfulTokens(tokenize(query));
const expanded = expandQuery(tokens);

let candidates = KB;

// if memory topic exists, prioritize it
if (forcedTopic) {
candidates = [
...KB.filter(x => x.source === forcedTopic),
...KB.filter(x => x.source !== forcedTopic),
];
}

const ranked = candidates
.map(item => ({
item,
score: scoreItem(item, expanded),
}))
.filter(r => r.score > 8)
.sort((a,b)=>b.score-a.score)
.slice(0,6);

if (!ranked.length)
return { context: "NO_CONTEXT_FOUND" };

/* detect topic */
const topicCount: Record<string, number> = {};
for (const r of ranked) {
topicCount[r.item.source] = (topicCount[r.item.source] || 0) + 1;
}

const detectedTopic =
Object.entries(topicCount).sort((a,b)=>b[1]-a[1])[0]?.[0];

return {
context: ranked.map(r => `${r.item.title}: ${r.item.content}`).join("\n"),
detectedTopic
};
}
