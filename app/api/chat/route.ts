import { NextResponse } from "next/server";
import { retrieveContext } from "@/lib/rag";
import { askLLM } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { message } = await req.json();

    if (!message) {
      return NextResponse.json(
        { error: "No message provided" },
        { status: 400 }
      );
    }

    /* 1️⃣ RETRIEVE */
    const context = retrieveContext(message);

    /* 2️⃣ IF NOTHING FOUND — DO NOT CALL LLM */
    if (context === "NO_CONTEXT_FOUND") {
      return NextResponse.json({
        reply: "I don't have information about that."
      });
    }

    /* 3️⃣ BUILD STRICT RAG PROMPT */
    const prompt = `
You are a knowledge-base assistant.

RULES:
- ONLY answer using the provided context
- DO NOT use outside knowledge
- DO NOT guess
- If the answer is not inside the context, say:
"I don't have information about that."

CONTEXT:
${context}

QUESTION:
${message}

ANSWER:
`;

    /* 4️⃣ ASK MODEL */
    const reply = await askLLM(prompt);

    return NextResponse.json({ reply });

  } catch (err) {
    console.error("CHAT API ERROR:", err);
    return NextResponse.json(
      { error: "Server crashed" },
      { status: 500 }
    );
  }
}