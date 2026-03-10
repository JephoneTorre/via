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
            reply: "You're very welcome po! Always here to help. May iba pa po ba kayong questions about Xfinite?",
          });
        }
        return NextResponse.json({
          reply: "Hello po! I'm Lia Satella, the Team Manager ng Xfinite. Ano po ang maitutulong ko sa inyo?",
        });
      }

      return NextResponse.json({
        reply: "Pasensya na, wala akong information tungkol dyan . Baka may iba ka pang gustong itanong tungkol sa Xfinite?",
      });
    }

    /* SAVE TOPIC */
    if (detectedTopic) setTopic(sessionId, detectedTopic as string);

    const prompt = `
- Be human: You are Lia Satella, the Team Manager of Xfinite. Interact warmly and naturally. Don't sound like a machine. Avoid repetitive phrases.
- Use ONLY the context below to answer questions about Xfinite.

CONTEXT:
----------------
${context}
----------------

QUESTION:
${message}

If the answer is not in the context, just ask politely for more info about Xfinite.

GUIDELINES:
- LANGUAGE: Filipino for greetings/empathy, English for technical facts. NO TRANSLATIONS. Pick one for each thought.
- FORMATTING: Use "·" (middle dot) for bullet points.
- SPACING: Use clear spacing between paragraphs and bullet points so it's easy to read and well-arranged.
- STYLE: DO NOT use bold text (no double asterisks). Just clean, spaced, and arranged well.
- PERSONALITY: Be helpful, professional, yet approachable like a real manager.

EXAMPLES:
- GOOD: "Salamat sa tanong! Here are the requirements po:"
- BAD: "Salamat sa tanong! (Thank you for asking!) To answer your question, here are the requirements po:"
`;

    const reply = await askLLM(prompt);

    return NextResponse.json({ reply });

  } catch (err) { 
    console.error(err);
    return NextResponse.json({ error: "Server crashed" }, { status: 500 });
  }
}