const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://127.0.0.1:11434"; 
const EMBEDDING_MODEL = process.env.OLLAMA_MODEL || "nomic-embed-text:latest";
import OpenAI from "openai";
import { createInternalClient } from "@/supabase/server";
import { createClient as createDocployClient } from "@supabase/supabase-js";
 
export type SopDocument = {
  id?: number;
  content: string;
  metadata?: {
    source?: string;
    type?: string;
    [key: string]: unknown;
  };
};

export type RetrievalResult = {
  context: string;
  detectedTopic: string | null;
};

export async function getEmbedding(text: string): Promise<number[]> {
  try {
    const isVercel = !!process.env.VERCEL;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (openaiKey && openaiKey.startsWith("sk-")) {
      try {
        console.log(`[RAG] Attempting OpenAI embedding...`);
        const openai = new OpenAI({ apiKey: openaiKey });
        const embedding = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: text,
        });
        return embedding.data[0].embedding;
      } catch (err: any) {
        console.warn(`[RAG] OpenAI Embedding failed (${err.status || err.message}). Falling back to local...`);
      }
    }

    const targetUrl = process.env.EMBEDDING_URL || `${OLLAMA_HOST}/api/embeddings`;
    if (isVercel && targetUrl.includes("127.0.0.1")) {
      console.error("[RAG] ERROR: Vercel cannot connect to local Ollama (127.0.0.1).");
      throw new Error("Local Ollama is unreachable from Vercel.");
    }

    console.log(`[RAG] Embedding Request to: ${targetUrl}`);
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: text }),
    });

    if (!res.ok) {
      throw new Error(`Embedding service unavailable (${res.status})`);
    }

    const data = await res.json();
    const vector = data.embedding || (Array.isArray(data) ? data : (data[0]?.embedding || data[0]));
    if (!vector || !Array.isArray(vector)) {
      throw new Error("No valid vector data returned from API");
    }
    return vector;
  } catch (err: any) {
    console.error(`[RAG] GET_EMBEDDING_EXCEPTION:`, err.message);
    throw err;
  }
}

const N8N_SOP_FETCH_URL = "https://n8n.heysnaply.com/webhook/FETCH-SOP";

export async function retrieveContext(query: string): Promise<RetrievalResult> {
  try {
    const queryLower = query.toLowerCase();
    const words = queryLower.replace(/[?.!,;:]/g, "").split(/\s+/).filter(w => w.length >= 2);
    
    // Keyword Definitions
    const sopKeywords = ["sop", "SOP", "standard operating procedure", "protocol", "manual", "guide", "procedure", "workflow", "process", "steps", "step", "step-by-step", "instruction", "instructions", "checklist", "policy", "how to", "how-to", "setup", "task", "optimize", "system", "framework", "playbook", "documentation"];
    const personaKeywords = ["persona", "target audience", "target market", "demographic", "audience", "avatar", "ideal client", "ideal customer", "age", "gender", "location", "income", "job", "occupation", "lifestyle", "interests", "behavior", "pain point", "problem", "challenge", "goal", "desire", "needs", "motivation", "frustration", "niche", "industry", "market", "customer profile", "user profile", "buyer persona"];
    const faceKeywords = ["face", "facial", "face analysis", "face data", "face_shape", "shape", "outline", "oval", "round", "square", "heart", "diamond", "eyes", "nose", "lips", "jaw", "chin", "forehead", "cheekbones", "skin", "symmetry"];
    const bodyKeywords = ["body", "physique", "posture", "body analysis", "body data", "ectomorph", "mesomorph", "endomorph", "slim", "athletic", "muscular", "curvy", "lean", "height", "weight"];
    const brollKeywords = ["broll", "b-roll", "b roll", "footage", "clips", "visuals", "walking", "standing", "sitting", "talking", "typing", "scrolling", "working", "posing", "looking", "smiling", "holding", "aesthetic", "cinematic", "tags"];
    const clientKeywords = ["client", "clients", "brand", "brands", "customer", "account", "project status", "name", "email", "employee", "staff", "team member", "user", "intern", "active", "salary", "schedule", "tracker", "kyc link", "clickup", "clockify id"];

    // 1. ROUTING
    let targetUrl = "https://n8n.heysnaply.com/webhook/clientschat";
    let requestType = "GENERAL";

    if (sopKeywords.some(kw => queryLower.includes(kw))) { targetUrl = N8N_SOP_FETCH_URL; requestType = "SOP"; }
    else if (personaKeywords.some(kw => queryLower.includes(kw))) { targetUrl = "https://n8n.heysnaply.com/webhook/persona"; requestType = "PERSONA"; }
    else if (faceKeywords.some(kw => queryLower.includes(kw))) { targetUrl = "https://n8n.heysnaply.com/webhook/face"; requestType = "FACE"; }
    else if (bodyKeywords.some(kw => queryLower.includes(kw))) { targetUrl = "https://n8n.heysnaply.com/webhook/body"; requestType = "BODY"; }
    else if (brollKeywords.some(kw => queryLower.includes(kw))) { targetUrl = "https://n8n.heysnaply.com/webhook/broll"; requestType = "BROLL"; }
    else if (clientKeywords.some(kw => queryLower.includes(kw))) { targetUrl = "https://n8n.heysnaply.com/webhook/clientschat"; requestType = "CLIENT"; }

    console.log(`RAG: Query Type: ${requestType} -> Fetching: ${targetUrl}`);

    // 2. FETCHING
    const response = await fetch(targetUrl);
    if (!response.ok) throw new Error("n8n fetch failed");
    const rootData = await response.json();

    let allItems: any[] = [];
    if (Array.isArray(rootData)) allItems = rootData;
    else if (rootData && Array.isArray(rootData.data)) allItems = rootData.data;
    else if (rootData?.[0]?.data && Array.isArray(rootData[0].data)) allItems = rootData[0].data;
    else if (rootData && typeof rootData === 'object') allItems = [rootData];

    const contextParts: string[] = [];

    // Helper: Weighted Scoring logic
    const scoreItem = (item: any) => {
      const itemStr = JSON.stringify(item).toLowerCase();
      const nameStr = (item.name || item.client || "").toLowerCase();
      
      let score = 0;
      for (const word of words) {
        // High priority: Name matches
        if (nameStr.includes(word)) score += 10;
        // Normal priority: Other field matches
        else if (itemStr.includes(word)) score += 1;
      }
      
      const metadataScore = (item.face_data ? 1 : 0) + (item.body_data ? 1 : 0) + (item.persona_details ? 1 : 0);
      return { item, score, metadataScore };
    };

    // 3. PROCESSING - CLIENTS & GENERAL
    if (requestType === "CLIENT" || requestType === "GENERAL") {
      const scoredItems = allItems.map(scoreItem);
      const filtered = scoredItems
        .filter(entry => entry.score > 0)
        .sort((a, b) => b.score - a.score || b.metadataScore - a.metadataScore)
        .slice(0, 15);

      console.log(`RAG: Filtered Top ${filtered.length} matching clients.`);
      for (const { item: c } of filtered) {
        let clientContext = `[CLIENT]: ${c.name || "N/A"} | Status: ${c.isActive ? 'Active' : 'Inactive'}`;
        if (c.email || c.contact_email) clientContext += ` | Email: ${c.email || c.contact_email}`;
        if (c.clickup_id) clientContext += ` | ClickUp: ${c.clickup_id}`;
        if (c.kyc_link) clientContext += ` | KYC Link: ${c.kyc_link}`;
        if (c.vps) clientContext += ` | Project: ${c.vps}`;
        if (c.tracker) clientContext += ` | Tracker: ${c.tracker}`;
        if (c.persona_details && (queryLower.includes("persona") || queryLower.includes("audience"))) clientContext += `\n- PERSONA: ${c.persona_details}`;
        if (c.face_data?.face_analysis && (queryLower.includes("face") || queryLower.includes("look"))) clientContext += `\n- FACE: ${c.face_data.face_analysis}`;
        contextParts.push(clientContext);
      }
    } 
    
    if (requestType === "SOP" || requestType === "GENERAL") {
      // 3b. SOURCE EXPANSION STRATEGY (Send Whole PDF based on best match)
      const scoredItems = allItems.map(item => {
        const title = (item.ai_title || item.title || item.source_name || "").toLowerCase();
        const content = (item.content || "").toLowerCase();
        let score = 0;
        for (const word of words) {
          if (title.includes(word)) score += 20;
          if (content.includes(word)) score += 5;
        }
        return { item, score };
      });

      const topMatch = scoredItems
        .filter(e => e.score > 0)
        .sort((a, b) => b.score - a.score)[0];

      if (topMatch && (requestType === "SOP" || topMatch.score > 25)) {
        const bestSource = topMatch.item.source_name || topMatch.item.title;
        const allSegments = allItems.filter(i => (i.source_name === bestSource) || (i.title === bestSource));

        console.log(`RAG: Found strong SOP match in "${bestSource}". Expanding to ${allSegments.length} segments.`);
        
        const combinedContent = allSegments
          .map(s => s.content || s.text || JSON.stringify(s))
          .join("\n\n");
          
        contextParts.push(`[FULL DOCUMENT: ${bestSource?.toUpperCase() || "Protocol"}]\n${combinedContent}`);
        
        // If we found a very strong SOP match, we don't need general client data cluttering if the user asked an SOP question
        if (requestType === "SOP") return { context: contextParts.join("\n\n"), detectedTopic: "SOP" };
      }
    }

    if (["PERSONA", "FACE", "BODY", "BROLL"].includes(requestType)) {
      // 3c. PROCESSING - OTHER DATA (General Filter)
      const matched = allItems.map(scoreItem)
        .filter(e => e.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
      for (const { item } of matched) {
        contextParts.push(`[${requestType} DATA]:\n${JSON.stringify(item, null, 2)}`);
      }
    }

    // 4. VECTOR SOP FALLBACK (Search against Supabase Docploy)
    if ((requestType === "GENERAL" || requestType === "SOP") && contextParts.length < 5) {
      try {
        const docployUrl = process.env.NEXT_PUBLIC_DOCPLOY_SUPABASE_URL;
        const docployKey = process.env.NEXT_PUBLIC_DOCPLOY_ANON_KEY;
        if (docployUrl && docployKey) {
          const supabase = createDocployClient(docployUrl, docployKey);
          const queryEmbedding = await getEmbedding(query);
          const { data: vectorMatch } = await supabase.rpc('match_sop', {
            query_embedding: queryEmbedding,
            match_threshold: 0.35,
            match_count: 2
          });
          if (vectorMatch) {
            vectorMatch.forEach((m: any) => contextParts.push(`[SOP DOCUMENT: ${m.ai_title || "Procedure"}]\n${m.content}`));
          }
        }
      } catch (e) { console.warn("Vector search skipped:", (e as Error).message); }
    }

    // 5. TEAM DATA CHECK
    try {
      const supabase = createInternalClient();
      const { data: team } = await supabase.from("assistant").select("*").limit(50);
      if (team) {
        const matchedTeam = team
          .map(scoreItem)
          .filter(e => e.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3)
          .map(e => e.item);

        for (const t of matchedTeam) {
          contextParts.push(`[TEAM MEMBER]: ${t.name}\nEmail: ${t.email}\nDepartment: ${t.department || 'N/A'}`);
        }
      }
    } catch (e) {}

    return { 
      context: contextParts.join("\n\n---\n\n") || "NO_CONTEXT_FOUND",
      detectedTopic: requestType 
    };
  } catch (err) {
    console.error("RAG Error:", err);
    return { context: "RAG_ERROR", detectedTopic: null };
  }
}

export function chunkText(text: string, size = 1000): string[] {
  const chunks: string[] = [];
  const words = text.split(/\s+/);
  let current = "";
  for (const word of words) {
    if ((current + word).length > size) { chunks.push(current.trim()); current = word + " "; }
    else { current += word + " "; }
  }
  if (current) chunks.push(current.trim());
  return chunks;
}

export async function generateTitle(text: string): Promise<string> {
  try {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) throw new Error();
    const openai = new OpenAI({ apiKey: openaiKey });
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: "Short professional title (max 5 words). No punctuation." }, { role: "user", content: text.slice(0, 3000) }],
      max_tokens: 15
    });
    return response.choices[0].message.content?.trim() || "SOP Protocol";
  } catch { return text.split('\n')[0]?.slice(0, 40) || "New SOP"; }
}
