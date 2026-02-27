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

    // Retrieve context from knowledge base
    const context = retrieveContext(message);

    // Build augmented prompt
    const prompt = `
You are a knowledge-base assistant.

ONLY answer using the provided context.
If not found, say: "I don't have information about that."

Context:
${context}

Question:
${message}
`;

    // Ask LLM
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