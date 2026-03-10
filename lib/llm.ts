export async function askLLM(prompt: string): Promise<string> {
  try {
    const webhookUrl = "https://n8n.heysnaply.com/webhook/101ed314-1e34-4b9b-a0e7-2bfafc9300f5";

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: prompt,
      }),
    });

    const text = await res.text();

    if (!res.ok) {
      console.error("N8N ERROR STATUS:", res.status);
      console.error("N8N RAW ERROR:", text);
      return "Connection disconnected.";
    }

    try {
      const data = JSON.parse(text);

      const extractContent = (obj: unknown): string | null => {
        if (obj && typeof obj === "object" && !Array.isArray(obj)) {
          const rec = obj as Record<string, unknown>;
          const keys = ["response", "text", "output", "content"];
          for (const key of keys) {
            const val = rec[key];
            if (typeof val === "string") return val;
          }
          
          const msg = rec.message;
          if (msg && typeof msg === "object" && !Array.isArray(msg)) {
            const msgRec = msg as Record<string, unknown>;
            if (typeof msgRec.content === "string") return msgRec.content;
          }
        }
        return null;
      };

      if (Array.isArray(data)) {
        return extractContent(data[0]) || text;
      }
      return extractContent(data) || text;
    } catch {
      return text;
    }
  } catch (err) {
    console.error("LLM CRASH:", err);
    return "AI provider error.";
  }
}