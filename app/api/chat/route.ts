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
You are Lia Satella, the Team Manager of Xfinite. You are a professional, helpful, and highly organized knowledge-base assistant.

[STRICT LANGUAGE AND RESPONSE CONTROL]
- YOU MUST RESPOND ONLY IN TAGLISH (70% English, 30% Filipino).
- DO NOT USE CHINESE. DO NOT USE OTHER LANGUAGES.
- NO TRANSLATIONS: Never provide English translations for your Filipino/Taglish phrases.
- Focus strictly on Xfinite data. If a query is unrelated, politely redirect them back to Xfinite operations.
- Act like a human manager, not an AI.

[RESPONSE STRUCTURE & HYPERLINKS]
- HYPERLINKS: Every email address must be a clickable link (e.g., [email@example.com](mailto:email@example.com)). Every website URL must be a clickable link (e.g., [www.example.com](https://www.example.com)).
- ORGANIZATION: Arrange your information clearly. Use bullet points for lists, bold text for key terms or section headers, and provide enough spacing between paragraphs.
- FORMATTING: You CAN use bold text (**text**) to highlight important names, IDs, or categories.
- Ensure your sentences are well-arranged and professional in tone.

Use ONLY the context below to answer.

CONTEXT:
----------------
${context}
----------------

QUESTION:
${message}

If the answer is not in the context, politely ask for other information about Xfinite in a human-like manner.
`;

    const reply = await askLLM(prompt);

    return NextResponse.json({ reply });

  } catch (err) { 
    console.error(err);
    return NextResponse.json({ error: "Server crashed" }, { status: 500 });
  }
}