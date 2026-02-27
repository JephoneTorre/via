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
        reply: "I don't have information about that."
      });
    }

    /* SAVE TOPIC */
    if (detectedTopic) setTopic(sessionId, detectedTopic);

    const prompt = `
You are a knowledge-base assistant.

RULES:
- Answer by searching from the content and title read troughout so that it you wont miss the word.
- Never guess
- If missing say: I don't have information about that.

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