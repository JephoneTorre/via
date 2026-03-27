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
    // Ingestion is now handled by the n8n webhook
    const INGEST_WEBHOOK_URL = process.env.INGEST_WEBHOOK_URL || "https://n8n.heysnaply.com/webhook/ingest-knowledge";
    
    const batchSize = 10;
    let uploadedCount = 0;

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      console.log(`[Ingest] Triggering n8n batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(chunks.length/batchSize)}...`);
      
      const batchTasks = batch.map(async (chunk) => {
        const res = await fetch(INGEST_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: chunk,
            filename: filename,
            date: new Date().toISOString()
          }),
        });

        if (!res.ok) {
          throw new Error(`n8n Ingestion Webhook failed: ${res.statusText}`);
        }
        
        return true;
      });

      await Promise.all(batchTasks);
      uploadedCount += batch.length;
    }

    return { success: true, chunks: uploadedCount };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("INGESTION ERROR:", err);
    return { error: errorMsg || "Failed to process content" };
  }
}

/**
 * Update an existing SOP document and its embedding.
 */
export async function updateSOP(id: number, content: string) {
  try {
    const supabase = createInternalClient();
    const embedding = await getEmbedding(content);

    const { error } = await supabase
      .from("SOP")
      .update({ 
        content, 
        embedding,
        metadata: { 
          updated_at: new Date().toISOString(),
          is_edited: true
        }
      })
      .eq("id", id);

    if (error) throw error;
    return { success: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("UPDATE SOP ERROR:", err);
    return { error: errorMsg };
  }
}

/**
 * Delete an SOP document.
 */
export async function deleteSOP(id: number) {
  try {
    const supabase = createInternalClient();
    const { error } = await supabase.from("SOP").delete().eq("id", id);
    if (error) throw error;
    return { success: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("DELETE SOP ERROR:", err);
    return { error: errorMsg };
  }
}

/**
 * Update an Assistant/Team Member.
 */
export async function updateAssistant(id: string, data: Partial<{ name: string; email: string; is_active: boolean; employment_type: string }>) {
  try {
    const supabase = createInternalClient();
    const { error } = await supabase
      .from("assistant")
      .update(data)
      .eq("id", id);

    if (error) throw error;
    return { success: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("UPDATE ASSISTANT ERROR:", err);
    return { error: errorMsg };
  }
}

/**
 * Delete a Team Member.
 */
export async function deleteAssistant(id: string) {
  try {
    const supabase = createInternalClient();
    const { error } = await supabase.from("assistant").delete().eq("id", id);
    if (error) throw error;
    return { success: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("DELETE ASSISTANT ERROR:", err);
    return { error: errorMsg };
  }
}

/**
 * Create a new team member.
 */
export async function createAssistant(data: { name: string; email: string; is_active: boolean; employment_type: string }) {
  try {
    const supabase = createInternalClient();
    const { error } = await supabase.from("assistant").insert(data);
    if (error) throw error;
    return { success: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("CREATE ASSISTANT ERROR:", err);
    return { error: errorMsg };
  }
}
