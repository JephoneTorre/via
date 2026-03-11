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
    let { context, detectedTopic } = retrieveContext(message);

    /* MEMORY RETRY */
    if (context === "NO_CONTEXT_FOUND" && lastTopic) {
      const retry = retrieveContext(lastTopic + " " + message, lastTopic);
      context = retry.context;
      detectedTopic = retry.detectedTopic || lastTopic;
    }

    if (context === "NO_CONTEXT_FOUND") {
      const tokens = message.toLowerCase().split(/\s+/);
      const socialPhrases = ["hi", "hello", "hey", "kamusta", "kumusta", "thanks", "thank you", "salamat", "thankyou"];
      const isSocial = socialPhrases.some(p => message.toLowerCase().includes(p)) || tokens.some((t: string) => socialPhrases.includes(t));
      
      if (isSocial) {
        const lowerMsg = message.toLowerCase();
        if (lowerMsg.includes("thank") || lowerMsg.includes("salamat")) {
          return NextResponse.json({
            reply: "Acknowledgment received. I am here to assist with VIP Scale inquiries.",
          });
        }
        return NextResponse.json({
          reply: "System Ready. I am VIA, the VIP Scale automated assistant. Please state your inquiry.",
        });
      }

      return NextResponse.json({
        reply: "No matching information found in the VIP Scale database. Please refine your query.",
      });
    }

    /* SAVE TOPIC */
    if (detectedTopic) setTopic(sessionId, detectedTopic as string);

    const prompt = `
- MISSION: You are VIA, the VIP Scale automated assistant. Your goal is to provide data in a pure, structured vertical format.
- CRITICAL: NO INTRODUCTIONS. Never start with "Here is the information", "Client X is listed as", or "According to the context". 
- CRITICAL: NO CONVERSATIONAL FILLER. Just the data.
- GUIDELINES:
  1. Use only the provided context.
  2. For client details, follow the EXACT template below.
  3. Use DOUBLE NEWLINES tokens between every single line of text to ensure maximum vertical spacing.

CLIENT DATA TEMPLATE:
[Client Name]

Status: [Value]

Tracking: [Value]

ClickUp: [Value]

Project: [Value]

----------------
CONTEXT:
${context}
----------------

QUESTION:
${message}

If no data is found, respond only with: "Inquiry yields no results in VIP Scale database."
`;

    const reply = await askLLM(prompt);

    return NextResponse.json({ reply });

  } catch (err) { 
    console.error(err);
    return NextResponse.json({ error: "Server crashed" }, { status: 500 });
  }
}