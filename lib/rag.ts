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
const N8N_SOP_FETCH_URL = "https://n8n.heysnaply.com/webhook/FETCH-SOP";

export async function retrieveContext(query: string): Promise<RetrievalResult> {
  try {
    const queryLower = query.toLowerCase();
    const sopKeywords = ["sop", "protocol", "manual", "guide", "procedure", "steps", "step", "how to", "instruction", "checklist", "policy", "briefing", "workflow", "process", "setup", "optimize", "task", "section"];
    const isSopRequest = sopKeywords.some(kw => queryLower.includes(kw));

    const targetUrl = isSopRequest ? N8N_SOP_FETCH_URL : N8N_FETCH_URL;
    console.log(`RAG: Query is ${isSopRequest ? 'SOP' : 'GENERAL'} related. Routing to: ${targetUrl}`);

    const res = await fetch(targetUrl);
    if (!res.ok) throw new Error("n8n data fetch failed");
    
    const rootData = await res.json();
    
    // N8N often returns an array if using "All Incoming Items"
    const actualData = Array.isArray(rootData) ? rootData[0] : rootData;
    
    // Now look for the "data" or "clients" array within that object
    // Handle both direct "data" key and nested data under "Merge All Data1" or "clients"
    const allItems = Array.isArray(actualData?.data) ? actualData.data : [];
    
    // Determine context parts based on request type
    const contextParts: string[] = [];
    const words = queryLower.split(/\s+/).filter(w => w.length > 2);
    
    // Match record against keywords (Improved to handle specific phrases)
    const isMatch = (record: Record<string, unknown> | SopDocument) => {
      const target = JSON.stringify(record).toLowerCase();
      if (words.length === 0) return true;
      
      // Check for exact phrase matches (e.g. "Step 6")
      if (queryLower.includes("step") || queryLower.includes("section")) {
        const match = words.every(w => target.includes(w));
        if (match) return true;
      }

      const normalizedTarget = target.replace(/(.)\1+/g, '$1');
      const matchCount = words.filter(w => {
        if (target.includes(w)) return true;
        const normalizedW = w.replace(/(.)\1+/g, '$1');
        return normalizedTarget.includes(normalizedW);
      }).length;
      return matchCount >= Math.min(words.length, 2);
    };

    // 1. PROCESS SOP DATA (If SOP request, prioritize this)
    if (isSopRequest) {
      const matchedSOPs = allItems.filter(isMatch).slice(0, 15);
      for (const s of matchedSOPs) {
        const title = s.ai_title || s.title || "SOP Procedure";
        contextParts.push(`[SOP DOCUMENT: ${title}]\n${s.content}`);
      }
      console.log(`RAG: Injected ${matchedSOPs.length} SOPs from dedicated workflow.`);
    }

    // 2. PROCESS CLIENT DATA (If general request, or as fallback)
    const clients = !isSopRequest ? allItems : [];
    const matchedClients = clients
      .filter(isMatch)
      .sort((a: any, b: any) => {
        // Prioritize clients with analysis data (face/body)
        const aScore = (a.face_data ? 1 : 0) + (a.body_data ? 1 : 0) + (a.persona_details ? 1 : 0);
        const bScore = (b.face_data ? 1 : 0) + (b.body_data ? 1 : 0) + (b.persona_details ? 1 : 0);
        return bScore - aScore;
      })
      .slice(0, 15);

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

    // 2. SEARCH SOP DOCUMENTS (Vector Search Fallback)
    try {
      const supabase = createInternalClient();
      console.log("RAG: Performing vector search for SOPs...");
      
      const queryEmbedding = await getEmbedding(query);
      
      const { data: matchedSOPs, error: rpcError } = await supabase.rpc('match_sop', {
        query_embedding: queryEmbedding,
        match_threshold: 0.35,
        match_count: 15
      });

      if (rpcError) throw rpcError;

      if (matchedSOPs && matchedSOPs.length > 0) {
        const sourceNames = new Set<string>();
        // Rank sources by match density and only take the top 3 to prevent noise
        const sourceScores: Record<string, number> = {};
        matchedSOPs.forEach((m: any) => {
          if (m.source_name) sourceScores[m.source_name] = (sourceScores[m.source_name] || 0) + 1;
        });
        const topSources = Object.entries(sourceScores)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(e => e[0]);

        // FETCH ALL CHUNKS FOR THE TOP SOURCES IN ORDER
        const { data: allChunks, error: fetchError } = await supabase
          .from("SOP")
          .select("content, source_name, id, ai_title")
          .in("source_name", topSources)
          .order("id", { ascending: true });

        if (fetchError) throw fetchError;

        if (allChunks && allChunks.length > 0) {
          const docs: Record<string, { title: string, content: string[] }> = {};
          allChunks.forEach(c => {
            const name = c.source_name || "Unknown Source";
            if (!docs[name]) {
              docs[name] = { 
                title: c.ai_title || name, 
                content: [] 
              };
            }
            docs[name].content.push(c.content);
          });

          for (const source in docs) {
            contextParts.push(`[SOP DOCUMENT: ${docs[source].title}]\n${docs[source].content.join("\n")}`);
          }
          console.log(`RAG: Injected ${allChunks.length} chunks from ${sourceNames.size} matching SOP documents.`);
        }
      }
    } catch (e) {
      console.error("Vector retrieval failed, trying keyword fallback:", e);
      // Keyword fallback logic (old simplified version)
      try {
        const supabase = createInternalClient();
        const { data: simpleSearch } = await supabase
          .from("SOP")
          .select("content, source_name")
          .ilike("content", `%${query.replace(/\s+/g, '%')}%`)
          .limit(10);
        
        if (simpleSearch) {
          contextParts.push(...simpleSearch.map(s => `[SOP CONTENT]: ${s.content}`));
        }
      } catch (innerE) {
        console.error("Keyword fallback also failed:", innerE);
      }
    }

    // 4. FETCH ASSISTANT/TEAM DATA (Always check team context)
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

/**
 * Generate a punchy title from text content.
 */
export async function generateTitle(text: string): Promise<string> {
  try {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) throw new Error("Missing API Key");

    const openai = new OpenAI({ apiKey: openaiKey });
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Summarize the text into a functional, professional title (max 5 words). Examples: 'Output in Task History', 'PDF Rebranding', 'SOP: Meta Ad Creation'. Return ONLY the title text without quotes or punctuation."
        },
        {
          role: "user",
          content: text.slice(0, 3000)
        }
      ],
      max_tokens: 20
    });

    return response.choices[0].message.content?.replace(/["']/g, "").trim() || "Vectorized Protocol";
  } catch (err: any) {
    console.warn(`[RAG] Title generation failed: ${err.message}. Using extraction fallback.`);
    // FALLBACK: Extract the first meaningful line (e.g., heading or first sentence)
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 5);
    const firstLine = lines[0]?.slice(0, 50).replace(/[#*•○[\]]/g, "").trim();
    return firstLine || "New SOP Protocol";
  }
}
