import { NextResponse } from "next/server";
import { retrieveContext } from "@/lib/rag";
import { askLLM } from "@/lib/llm";
import { getTopic, setTopic } from "@/lib/memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { message } = await req.json();

    const sessionId =
      req.headers.get("x-forwarded-for") ||
      req.headers.get("x-real-ip") ||
      "local";

    /* 1️⃣ LOAD LAST TOPIC */
    const lastTopic = getTopic(sessionId);

    /* 2️⃣ RETRIEVE CONTEXT */
    let { context, detectedTopic } = retrieveContext(message);

    /* 3️⃣ IF NOTHING FOUND — TRY WITH MEMORY */
    if (context === "NO_CONTEXT_FOUND" && lastTopic) {
      const retry = retrieveContext(lastTopic + " " + message);
      context = retry.context;
      detectedTopic = retry.detectedTopic || lastTopic;
    }

    /* 4️⃣ STILL NOTHING */
    if (context === "NO_CONTEXT_FOUND") {
      return NextResponse.json({
        reply: "I don't have information about that."
      });
    }

    /* 5️⃣ SAVE NEW TOPIC */
    if (detectedTopic) setTopic(sessionId, detectedTopic);

    /* 6️⃣ PROMPT */
    const prompt = `
You are a knowledge-base assistant.

RULES:
- Only answer using the context
- Do not guess
- If not in context say: I don't have information about that.

CONTEXT:
${context}

QUESTION:
${message}
`;

    const reply = await askLLM(prompt);

    return NextResponse.json({ reply });

  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Server crashed" },
      { status: 500 }
    );
  }
}