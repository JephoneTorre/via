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
- MISSION: You are VIA, the VIP Scale automated assistant. Provide direct, factual, and highly structured information.
- INTRODUCTION: Do NOT introduce yourself or state your name/identity/purpose unless explicitly asked "Who are you?" or similar. Jump directly to the answer.
- Use ONLY the context below to answer questions about VIP Scale. Do not use outside knowledge.

CONTEXT:
----------------
${context}
----------------

QUESTION:
${message}

If the answer is not in the context, just ask politely for more info about VIP Scale.

GUIDELINES:
- LANGUAGE: Professional English.
- FORMATTING: Use "·" (middle dot) for bullet points. 
- SPACING: Use double newlines (\n\n) between paragraphs.
- LIST FORMAT: Every single bullet point MUST be on its own separate line. 
- NO HORIZONTAL LISTS: Do NOT separate list items with dots or spaces on the same line. Use vertical rows only.
- LIST SPACING: Include a blank line before starting any bulleted list.
- PERSONALITY: Analytical, precise, and automated.

EXAMPLES:
- DIRECT: 
System Report: [Subject]

Data Points:
· Field A: [Value]
· Field B: [Value]
· Field C: [Value]

- AVOID: "· Point A: [X] · Point B: [Y]"
`;

    const reply = await askLLM(prompt);

    return NextResponse.json({ reply });

  } catch (err) { 
    console.error(err);
    return NextResponse.json({ error: "Server crashed" }, { status: 500 });
  }
}