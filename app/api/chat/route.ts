import { NextResponse } from "next/server";
import { retrieveContext } from "@/lib/rag";
import { askLLM } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const userMessage: string = body?.message;

    if (!userMessage || !userMessage.trim()) {
      return NextResponse.json(
        { error: "No message provided" },
        { status: 400 }
      );
    }

    /* ---------------- RETRIEVE CONTEXT ---------------- */

    const context = retrieveContext(userMessage);

    /* ---------------- BUILD SYSTEM PROMPT ---------------- */

    let prompt: string;

    // If retriever found nothing → FORCE SAFE RESPONSE
    if (context === "STRICT_NO_CONTEXT") {
      prompt = `
You are a strict knowledge base assistant.

The database does NOT contain information to answer the question.

You MUST reply exactly:
"I don't have information about that."

Do NOT explain.
Do NOT guess.
Do NOT add extra words.
`;
    } else {
      // Normal RAG mode
      prompt = `
You are a knowledge-base assistant.

Answer ONLY using the provided context.

Rules:
- Do NOT invent information
- Do NOT use outside knowledge
- If the answer is not explicitly written in the context, reply:
"I don't have information about that."
- Be concise and clear

CONTEXT:
${context}

QUESTION:
${userMessage}
`;
    }

    /* ---------------- ASK LLM ---------------- */

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