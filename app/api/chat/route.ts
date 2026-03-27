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
    let detectedTopic = retrieval.detectedTopic;

    /* MEMORY RETRY */
    if (context === "NO_CONTEXT_FOUND" && lastTopic) {
      const retry = await retrieveContext(lastTopic + " " + message);
      context = retry.context;
      detectedTopic = retry.detectedTopic || lastTopic;
    }

    /* SAVE TOPIC */
    if (detectedTopic) setTopic(sessionId, detectedTopic as string);

    // 4. ASK N8N CHATBOT WORKFLOW (RAG)
    try {
      const n8nWebhook = process.env.CHAT_WEBHOOK_URL || "https://n8n.heysnaply.com/webhook/101ed314-1e34-4b9b-a0e7-2bfafc9300f5";
      
      const prompt = `
- MISSION: You are VIA, the VIP Scale technical interface. Your objective is to extract and display SPECIFIC requested data from the provided context.
- CRITICAL: NO CONVERSATION. NO INTRODUCTIONS ("According to...", "Here is...", etc.). NO OUTRO.
- CRITICAL: SELECTIVITY. If the user asks for a specific SOP or Protocol, output ONLY that SOP content. If they ask for a Client, output ONLY that Client profile. Do NOT mix unrelated context items.
- CRITICAL: NO SUMMARIZATION. If the user asks for an SOP, you MUST provide the FULL, RAW text, every step, and every detail found in the context.
- CRITICAL: FORMATTING. Use double newlines for spacing. Use bold headers for section titles.

ENTITY RULES:
1. CLIENTS: Display using the vertical template below.
2. SOPS/PROTOCOLS: Display the Title followed by the RAW content.
3. TEAM: Display Name, Email, and Department details.

CLIENT DATA TEMPLATE (Use ONLY for client requests):
[Client Name]

Status: [Value]
Tracking: [Value]
ClickUp: [Value]
Project: [Value]

--- RAW ANALYSIS & EXTENDED DETAILS ---
[Value if asking for everything, else N/A]

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
      const n8nResult = (await response.json()) as N8nWebhookResponse;
      
      // Extraction logic for n8n chatbot output
      const reply = 
        n8nResult.content || 
        n8nResult.output || 
        n8nResult.reply || 
        n8nResult.text || 
        (Array.isArray(n8nResult) && (n8nResult[0]?.content || n8nResult[0]?.output || n8nResult[0]?.text)) || 
        JSON.stringify(n8nResult);

      return NextResponse.json({ reply: typeof reply === 'string' ? reply.trim() : reply });
    } catch (whError: unknown) { // Use 'unknown' for caught errors
      console.error("N8N WEBHOOK ERROR:", whError);
      
      // Fallback to local LLM if webhook fails (optional, but safer)
      const prompt = `
- MISSION: You are VIA, the VIP Scale technical interface. Extract SPECIFIC requested data from the provided context.
- CRITICAL: NO CONVERSATION. NO INTRODUCTIONS. Output ONLY the requested information.
- SELECTIVITY: Do NOT mix unrelated context items (e.g. don't show clients when asking for SOPs).
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