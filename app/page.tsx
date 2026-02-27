"use client";

import { useEffect, useRef, useState } from "react";

// --- TYPES ---
type Msg = {
  role: "user" | "assistant";
  text: string;
};

export default function Home() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  // auto scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage() {
    if (!input.trim() || loading) return;

    const userText = input;
    setInput("");
    setLoading(true);

    setMessages(prev => [...prev, { role: "user", text: userText }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userText }),
      });

      // If API crashed (500/404 etc)
      if (!res.ok) {
        const txt = await res.text();
        setMessages(prev => [
          ...prev,
          { role: "assistant", text: `❌ Server error:\n${txt}` },
        ]);
        setLoading(false);
        return;
      }

      const data = await res.json();

      // ⭐ FIX: use data.reply instead of data.answer
      const reply =
        data.reply ??
        `❌ ERROR:\n${data.error ?? "Unknown error"}`;

      setMessages(prev => [...prev, { role: "assistant", text: reply }]);

    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        { role: "assistant", text: "❌ Network error: " + err.message },
      ]);
    }

    setLoading(false);
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") sendMessage();
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-black to-zinc-900 text-white flex flex-col">
      
      {/* HEADER */}
      <div className="border-b border-white/10 backdrop-blur-xl bg-white/5">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-lg">🤖</div>
          <div>
            <h1 className="font-semibold text-lg">VIA</h1>
            <p className="text-xs text-white/60">RAG Powered Knowledge Chat</p>
          </div>
        </div>
      </div>

      {/* CHAT AREA */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">

          {messages.length === 0 && (
            <div className="text-center text-white/40 pt-24">
              <p className="text-2xl mb-2">Ask anything</p>
              <p className="text-sm">
                The AI will answer using your uploaded knowledge base
              </p>
            </div>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[75%] px-4 py-3 rounded-2xl whitespace-pre-wrap leading-relaxed shadow-lg
                ${
                  m.role === "user"
                    ? "bg-white text-black rounded-br-sm"
                    : "bg-white/10 backdrop-blur-xl border border-white/10 rounded-bl-sm"
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-white/10 border border-white/10 px-4 py-3 rounded-2xl rounded-bl-sm flex gap-1">
                <span className="animate-bounce">•</span>
                <span className="animate-bounce delay-150">•</span>
                <span className="animate-bounce delay-300">•</span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* INPUT */}
      <div className="border-t border-white/10 bg-black/40 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex gap-3 bg-white/5 border border-white/10 rounded-2xl p-2 focus-within:border-white/30 transition">

            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask about Dr. Melinda Willingham..."
              className="flex-1 bg-transparent outline-none px-3 py-2 text-sm placeholder:text-white/40"
            />

            <button
              onClick={sendMessage}
              disabled={loading}
              className="px-5 rounded-xl bg-white text-black font-medium hover:bg-white/90 disabled:opacity-40 transition"
            >
              Send
            </button>

          </div>
        </div>
      </div>

    </div>
  );
}