const OLLAMA_HOST = "http://127.0.0.1:11434"; 
const EMBEDDING_MODEL = "nomic-embed-text:latest";
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
    const res = await fetch(`${OLLAMA_HOST}/api/embeddings`, {
      method: "POST",
      body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: text }),
    });
    if (!res.ok) throw new Error("Ollama embedding failed");
    const data = await res.json();
    return data.embedding;
  } catch (err) {
    console.error("Embedding Error:", err);
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
    const words = queryLower.split(/\s+/).filter(w => w.length > 3);
    
    const contextParts: string[] = [];

    // Helper: Match record against keywords
    const isMatch = (record: Record<string, unknown> | SopDocument) => {
      const target = JSON.stringify(record).toLowerCase();
      return words.length === 0 || words.some(w => target.includes(w));
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
        .limit(10);
        
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
