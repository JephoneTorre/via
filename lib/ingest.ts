"use server";
import { createInternalClient } from "@/supabase/server";
import { getEmbedding, chunkText } from "./rag";

/**
 * Handle direct text ingestion into the SOP table (after client-side PDF parsing).
 */
export async function ingestText(text: string, filename: string) {
  try {
    if (!text) throw new Error("No text provided");

    const chunks = chunkText(text, 1000);
    const supabase = createInternalClient();

    let uploadedCount = 0;
    for (const chunk of chunks) {
      const embedding = await getEmbedding(chunk);

      // Store primarily in SOP table per user request
      const { error } = await supabase.from("SOP").insert({
        content: chunk, 
        embedding: embedding,
        metadata: { 
          source: filename, 
          type: "sop_document",
          date: new Date().toISOString()
        }
      });

      if (error) {
        console.error("Chunk Insert Error:", error);
        throw new Error(error.message);
      }
      else uploadedCount++;
    }

    return { success: true, chunks: uploadedCount };
  } catch (err: any) {
    console.error("INGESTION ERROR:", err);
    return { error: err.message || "Failed to process content" };
  }
}
