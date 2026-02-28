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
      return NextResponse.json({
        reply: "I don't have information about that.",
      });
    }

    /* SAVE TOPIC */
    if (detectedTopic) setTopic(sessionId, detectedTopic as string);

    const prompt = `
You are a helpful knowledge-base assistant named Lia Satella.

GUIDELINES:
- Answer the user's question using ONLY the provided CONTEXT below.
- FORMATTING: Use clear spacing, bullet points for lists, and **bold text** for important terms or titles.
- TONE: Be professional, friendly, and conversational (human-like). Greet the user naturally.
- CLARITY: Break down complex information into short, readable paragraphs.
- UNKNOWN: If information is missing from the context, say: "I don't have information about that."
- FLEXIBILITY: Ignore casing/punctuation differences in the query.
- SEARCH: Check both titles and content in the data for relevant answers.
CONTEXT:
${context}

QUESTION:
${message}
`;

    const reply = await askLLM(prompt);

    return NextResponse.json({ reply });

  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server crashed" }, { status: 500 });
  }
}