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

RULES:
- Answer the user's question using ONLY the provided CONTEXT below.
- You must ignore casing and punctuation differences. (e.g., "MELINDA" is the same as "Melinda").
- Provide a helpful, professional, and accurate response based on the context.
- If the information is not in the context, politely state: "I don't have information about that."
- Be professional and conversational like a normal virtual assistant (you may greet the user such as “Hi” or “Good morning”).
- When searching the dataset, check both the title and the content to allow flexible knowledge retrieval. 
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