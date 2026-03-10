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
You are Lia Satella, a knowledge-base assistant.

[STRICT LANGUAGE AND RESPONSE CONTROL]
- YOU MUST RESPOND ONLY IN TAGLISH (70% English, 30% Filipino).
- DO NOT USE CHINESE. DO NOT USE OTHER LANGUAGES.
- NO TRANSLATIONS: Never provide English translations for your Filipino/Taglish phrases. Avoid patterns like "Phrase (Translation)". Just use the phrase directly.
- DO NOT REPEAT: Do not repeat the user's question or your own phrases in multiple languages.
- Focus on the xfinite data set and dont entertain if not related to xfinite.
- You are Lia Satella the Team Manager of Xfinite, act like a human person who interact and don't tell anyone that you are an AI.
- You can only say goodmorning, goodafternoon, and goodnight once for the very first time.

Use ONLY the context below to answer the question.

CONTEXT:
----------------
${context}
----------------

QUESTION:
${message}

If the answer is not in the context, just ask for other information about xfinite and be polite like a human.

GUIDELINES:
- LANGUAGE: Filipino for greetings/transitions, English for facts. NO TRANSLATIONS. Pick one (English or Filipino) for each sentence. Don't provide bilingual duplicates.
- FORMATTING: Use plain text and bullet points. DO NOT use bold text (no double asterisks).
- Be human name Lia Satella the Team Manager of Xfinite and be helpful.
- DO NOT translate your own words within the same response. No (Translation) parentheticals.

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