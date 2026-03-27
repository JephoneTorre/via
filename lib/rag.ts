const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://127.0.0.1:11434"; 
const EMBEDDING_MODEL = process.env.OLLAMA_MODEL || "nomic-embed-text:latest";
import OpenAI from "openai";
import { createInternalClient } from "@/supabase/server";
 
export type SopDocument = {
  id?: number;
  content: string;
  metadata?: {
    source?: string;
    type?: string;
    [key: string]: any;
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

    // 1. TRY OPENAI (Preferred for production/Vercel)
    if (openaiKey) {
      console.log(`[RAG] Using OpenAI for production embedding...`);
      const openai = new OpenAI({ apiKey: openaiKey });
      const embedding = await openai.embeddings.create({
        model: "text-embedding-3-small", // High efficiency + low cost
        input: text,
      });
      return embedding.data[0].embedding;
    }

    // 2. FALLBACK TO OLLAMA (Local default)
    const targetUrl = process.env.EMBEDDING_URL || `${OLLAMA_HOST}/api/embeddings`;
    
    // Safety: If on Vercel and targetting 127.0.0.1, we KNOW it will fail.
    if (isVercel && targetUrl.includes("127.0.0.1")) {
      console.error("[RAG] ERROR: Vercel cannot connect to local Ollama (127.0.0.1). Please provide OPENAI_API_KEY or a public EMBEDDING_URL.");
      throw new Error("Local Ollama is unreachable from Vercel. Please configure OPENAI_API_KEY in your Vercel Dashboard.");
    }

    console.log(`[RAG] Embedding Request to: ${targetUrl}`);
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: text }),
    });

    if (!res.ok) {
      console.error(`[RAG] Fetch Error (${res.status}): ${res.statusText}`);
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

const N8N_FETCH_URL = "https://n8n.heysnaply.com/webhook/fetch-all-data";

export async function retrieveContext(query: string): Promise<RetrievalResult> {
  try {
    console.log("RAG: Fetching consolidated data from n8n...");
    const res = await fetch(N8N_FETCH_URL);
    if (!res.ok) throw new Error("n8n data fetch failed");
    
    const rootData = await res.json();
    
    // N8N often returns an array if using "All Incoming Items"
    const actualData = Array.isArray(rootData) ? rootData[0] : rootData;
    
    // Now look for the "data" or "clients" array within that object
    // Handle both direct "data" key and nested data under "Merge All Data1" or "clients"
    let clients = Array.isArray(actualData?.data) ? actualData.data : (actualData?.clients || []);
    if (clients.length === 0 && actualData["Merge All Data1"]?.data) {
      clients = actualData["Merge All Data1"].data;
    }
    
    // Check if the "data" array actually contains SOP documents instead of clients
    const allItems = Array.isArray(actualData?.data) ? (actualData.data as SopDocument[]) : [];
    const sopFromData = allItems.filter((i: SopDocument) => i.metadata?.type === "sop_document");
    // If "data" is purely SOPs, then reset clients if they were wrongly guessed
    if (sopFromData.length > 0 && clients === allItems && !(allItems[0] as any)?.name) {
       clients = [];
    }
    
    const queryLower = query.toLowerCase();
    const words = queryLower.split(/\s+/).filter(w => w.length > 2);
    
    const contextParts: string[] = [];

    // Helper: Match record against keywords with simple normalization
    const isMatch = (record: Record<string, unknown> | SopDocument) => {
      const target = JSON.stringify(record).toLowerCase();
      if (words.length === 0) return true;
      
      const normalizedTarget = target.replace(/(.)\1+/g, '$1');
      return words.some(w => {
        if (target.includes(w)) return true;
        const normalizedW = w.replace(/(.)\1+/g, '$1');
        return normalizedTarget.includes(normalizedW);
      });
    };

    // PROCESS CONSOLIDATED CLIENT DATA
    const matchedClients = clients
      .filter(isMatch)
      .sort((a: any, b: any) => {
        // Prioritize clients with analysis data (face/body)
        const aScore = (a.face_data ? 1 : 0) + (a.body_data ? 1 : 0) + (a.persona_details ? 1 : 0);
        const bScore = (b.face_data ? 1 : 0) + (b.body_data ? 1 : 0) + (b.persona_details ? 1 : 0);
        return bScore - aScore;
      })
      .slice(0, 5);

    for (const c of matchedClients) {
      const clientName = c.name || c.client || "Unknown Client";
      let clientContext = `[CLIENT DATA]:\nName: ${clientName}\nStatus: ${c.isActive ? 'Active' : 'Inactive'}\nTracking: ${c.tracker || 'N/A'}`;
      
      if (c.clickup_id) clientContext += `\nClickUp: ${c.clickup_id}`;
      if (c.vps) clientContext += `\nProject: ${c.vps}`;

      // Append Nested Details if they exist (New Workflow Structure)
      if (c.persona_details) clientContext += `\nPERSONA: ${c.persona_details}`;
      if (c.face_data?.face_analysis) clientContext += `\nFACE ANALYSIS: ${c.face_data.face_analysis}`;
      if (c.body_data?.body_analysis) clientContext += `\nBODY ANALYSIS: ${c.body_data.body_analysis}`;
      
      if (Array.isArray(c.broll_tags) && c.broll_tags.length > 0) {
        const tags = c.broll_tags.map((b: Record<string, unknown>) => b.tags).join(", ");
        clientContext += `\nB-ROLL TAGS: ${tags}`;
      }

      if (Array.isArray(c.sop_docs) && c.sop_docs.length > 0) {
        const docs = c.sop_docs.map((s: Record<string, unknown>) => s.content).join("\n");
        clientContext += `\nSOP DOCUMENTS:\n${docs}`;
      }

      contextParts.push(clientContext);
    }

    // DIRECT SUPABASE FALLBACK FOR SOP (if n8n is missing it)
    if (sopFromData.length === 0) {
      try {
        const supabase = createInternalClient();
        const { data: directSOP } = await supabase
          .from("SOP")
          .select("content, metadata")
          .order("id") // Ensure chunks are in order
          .limit(50); // Fetch more to allow matching across full docs

        if (directSOP && Array.isArray(directSOP)) {
          const matchingSources = new Set<string>();

          // Identify which documents (sources) match
          directSOP.forEach((s: SopDocument) => {
             if (isMatch(s)) {
               const source = s.metadata?.source;
               if (source) matchingSources.add(source);
             }
          });

          // Fetch ALL chunks for the matched sources to avoid truncation
          const completeSOPs = directSOP.filter((s: SopDocument) =>
            s.metadata?.source && matchingSources.has(s.metadata.source)
          );

          if (completeSOPs.length > 0) {
            contextParts.push(...completeSOPs.map((s: SopDocument) => `[SOP CONTENT - ${s.metadata?.source || 'Unknown Source'}]: ${s.content}`));
            console.log(`RAG: Found ${completeSOPs.length} total chunks from ${matchingSources.size} matching sources.`);
          }
        }
      } catch (e) {
        console.error("Supabase fallback failed:", e);
      }
    }

    // Handle standalone SOP if not nested (Fallback for old structure)
    // We check rootData, actualData, and specific keys like "SOP" or "Wrap SOP"
    const standaloneSOPItems: SopDocument[] = [
      ...(Array.isArray(rootData.SOP) ? rootData.SOP : []),
      ...(Array.isArray(actualData.SOP) ? actualData.SOP : []),
      ...(Array.isArray(actualData["Wrap SOP"]?.data) ? actualData["Wrap SOP"].data : []),
      ...(Array.isArray(actualData["Wrap SOP"]) ? actualData["Wrap SOP"] : []),
      ...sopFromData // Already extracted from actualData.data if type was sop_document
    ];

    if (standaloneSOPItems.length > 0) {
      const standaloneSOP = standaloneSOPItems.filter(isMatch).slice(0, 5);
      contextParts.push(...standaloneSOP.map((s: Record<string, unknown>) => `[SOP CONTENT]: ${s.content}`));
      console.log(`RAG: Found ${standaloneSOP.length} matching standalone SOP docs.`);
    }

    // NEW: FETCH ASSISTANT/TEAM DATA
    try {
      const supabase = createInternalClient();
      const { data: assistantData } = await supabase
        .from("assistant")
        .select("*")
        .limit(100);
        
      if (assistantData && Array.isArray(assistantData)) {
        const matchedAssistants = assistantData.filter(isMatch).slice(0, 3);
        for (const a of matchedAssistants) {
          contextParts.push(`[TEAM MEMBER]:\nName: ${a.name}\nEmail: ${a.email}\nStatus: ${a.is_active ? 'Active' : 'Inactive'}\nType: ${a.employment_type || 'N/A'}\nClickUp ID: ${a.clickup_id || 'N/A'}\nDaily Schedule: ${a.daily_schedule_sheet || 'N/A'}\nSalary Sheet: ${a.salary_sheet || 'N/A'}`);
        }
        if (matchedAssistants.length > 0) {
          console.log(`RAG: Found ${matchedAssistants.length} matching assistant records.`);
        }
      }
    } catch (e) {
      console.error("Assistant Fetch Error:", e);
    }

    const context = contextParts.join("\n\n---\n\n");
    console.log(`RAG: Found ${matchedClients.length} matching client profiles.`);

    return { 
      context: context || "NO_CONTEXT_FOUND",
      detectedTopic: words[0] || null
    };

  } catch (err) {
    console.error("n8n RAG ERROR:", err);
    return { context: "NO_CONTEXT_FOUND", detectedTopic: null };
  }
}

export function chunkText(text: string, size = 1000): string[] {
  const chunks: string[] = [];
  const words = text.split(/\s+/);
  let current = "";

  for (const word of words) {
    if ((current + word).length > size) {
      chunks.push(current.trim());
      current = word + " ";
    } else {
      current += word + " ";
    }
  }
  if (current) chunks.push(current.trim());
  return chunks;
}
