import { NextResponse } from "next/server";
import { retrieveContext } from "@/lib/rag";
import { askLLM } from "@/lib/llm";
import { getTopic, setTopic } from "@/lib/chatMemory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { message } = await req.json();

    const sessionId =
      req.headers.get("x-forwarded-for") ||
      req.headers.get("x-real-ip") ||
      "local";

    /* LOAD MEMORY */
    const lastTopic = getTopic(sessionId);

    /* RETRIEVE */
    const retrieval = await retrieveContext(message);
    let { context } = retrieval;
    let detectedTopic = (retrieval as any).detectedTopic;

    /* MEMORY RETRY */
    if (context === "NO_CONTEXT_FOUND" && lastTopic) {
      const retry = await retrieveContext(lastTopic + " " + message);
      context = retry.context;
      detectedTopic = (retry as any).detectedTopic || lastTopic;
    }

    /* SAVE TOPIC */
    if (detectedTopic) setTopic(sessionId, detectedTopic as string);

    // 4. ASK N8N CHATBOT WORKFLOW (RAG)
    try {
      const n8nWebhook = "https://n8n.heysnaply.com/webhook/101ed314-1e34-4b9b-a0e7-2bfafc9300f5";
      
      const prompt = `
- MISSION: You are VIA, the VIP Scale automated assistant. Your goal is to provide accurate information from the Supabase dataset.
- CRITICAL: NO INTRODUCTIONS. Output ONLY the information requested.
- CRITICAL: NO HALLUCINATIONS. Use ONLY the provided context. If information is missing, output "N/A" or "NO_INFO_FOUND".
- CRITICAL: STRICT DATASET. If the user asks about something not in the context, inform them that you do not have that data in your secure protocols.
- GUIDELINES:
  1. For CLIENT profiles, use the vertical structured format below.
  2. For TEAM MEMBERS (Assistants), use a structured list based on the provided context labels.
  3. For GENERAL QUESTIONS (Policies, SOPs, Tasks), provide a clear, professional conversational response based ONLY on the context.
  4. Use double newlines between every single line for clarity.

CLIENT DATA TEMPLATE (Use ONLY if asking for client details):
[Client Name]

Status: [Value]

Tracking: [Value]

ClickUp: [Value]

Project: [Value]

--- RAW ANALYSIS & EXTENDED DETAILS ---

[Value if asking for everything, else N/A]

B-Roll Tags: [Value]

SOP Documents: [Value]

----------------
CONTEXT:
${context}
----------------

QUESTION:
${message}
`;

      const response = await fetch(n8nWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt, // Use the prompt format your n8n expects
          sessionId: sessionId
        }),
      });

      if (!response.ok) throw new Error("Webhook to n8n failed");

      // Define an interface for the n8n webhook response
      interface N8nWebhookResponse {
        content?: string;
        output?: string;
        reply?: string;
        text?: string;
        [key: string]: any; // Allow for other properties or array access like n8nResult[0]?.output
      }
      const n8nResult: N8nWebhookResponse = await response.json();
      
      // Extraction logic for n8n chatbot output
      const reply = n8nResult.content || n8nResult.output || n8nResult.reply || n8nResult.text || (Array.isArray(n8nResult) && n8nResult[0]?.output) || JSON.stringify(n8nResult);

      return NextResponse.json({ reply: typeof reply === 'string' ? reply.trim() : reply });
    } catch (whError: unknown) { // Use 'unknown' for caught errors
      console.error("N8N WEBHOOK ERROR:", whError);
      
      // Fallback to local LLM if webhook fails (optional, but safer)
      const prompt = `
- MISSION: You are VIA, the VIP Scale automated assistant. Your goal is to provide data in a pure, structured vertical format.
- CRITICAL: NO INTRODUCTIONS.
- GUIDELINES: Use provided context below.
- CONTEXT: ${context}
- QUESTION: ${message}
`;
      const fallbackReply = await askLLM(prompt);
      return NextResponse.json({ reply: fallbackReply });
    }

  } catch (err) { 
    console.error(err);
    return NextResponse.json({ error: "Server crashed" }, { status: 500 });
  }
}