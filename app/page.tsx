"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

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

  // auto scroll to bottom when new messages appear
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
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
    <div className="h-screen bg-[#050505] text-white flex flex-col font-sans selection:bg-neon/30 selection:text-neon relative overflow-hidden">
      
      {/* SCANLINE EFFECT */}
      <div className="scanline pointer-events-none" />
      
      {/* HEADER */}
      <div className="sticky top-0 z-20 border-b border-neon/20 backdrop-blur-md bg-black/80">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative w-12 h-12 p-[2px] bg-gradient-to-tr from-neon-dark via-neon to-glow rounded-full shadow-[0_0_15px_rgba(57,255,20,0.3)]">
              <div className="relative w-full h-full rounded-full overflow-hidden bg-black">
                <Image 
                  src="/icon/via.png" 
                  alt="VIA Icon" 
                  fill
                  className="object-cover"
                />
              </div>
            </div>
            <div>
              <h1 className="font-black text-xl tracking-tighter text-neon uppercase italic text-glow">LIA SATELLA</h1>
              <p className="text-[9px] text-neon/60 uppercase tracking-[0.2em] font-bold">Chat with Lia!</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2">
            <div className="w-2 h-2 bg-neon rounded-full animate-pulse shadow-[0_0_8px_#39FF14]" />
            <span className="text-[10px] text-neon/60 font-mono tracking-widest uppercase">online</span>
          </div>
        </div>
      </div>

      {/* CHAT AREA */}
      <div className="flex-1 overflow-y-auto scroll-smooth relative">
        {/* Subtle background grid */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(57,255,20,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(57,255,20,0.03)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

        <div className="max-w-4xl mx-auto px-6 py-12 space-y-10 relative z-10">

          {messages.length === 0 && (
            <div className="text-center pt-16 flex flex-col items-center">
              <div className="relative w-32 h-32 mb-8 p-1 bg-neon/10 rounded-full shadow-[0_0_40px_rgba(57,255,20,0.15)] group">
                <div className="absolute inset-0 rounded-full border border-neon/30 animate-[spin_10s_linear_infinite]" />
                <div className="absolute inset-2 rounded-full border border-neon/10 animate-[spin_15s_linear_infinite_reverse]" />
                <Image 
                  src="/icon/via.png" 
                  fill
                  className="rounded-full object-cover blur-[1px] group-hover:blur-0 transition-all duration-700 opacity-60"
                  alt="VIA Logo"
                />
              </div>
              <h2 className="text-4xl font-black mb-4 tracking-tighter italic text-white uppercase">Initialize Interface</h2>
              <p className="text-sm max-w-sm mx-auto text-neon/40 leading-relaxed font-mono tracking-tight uppercase">
                Awaiting connection...
              </p>
            </div>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex items-start gap-5 ${m.role === "user" ? "flex-row-reverse" : "flex-row"} group`}
            >
              {/* Message Icon */}
              <div className="flex-shrink-0 mt-1">
                {m.role === "assistant" ? (
                  <div className="relative w-10 h-10 p-[1.5px] bg-neon/30 rounded-lg transform rotate-45 overflow-hidden shadow-[0_0_10px_rgba(57,255,20,0.2)]">
                    <div className="relative w-full h-full transform -rotate-45 scale-125">
                      <Image 
                        src="/icon/via.png" 
                        alt="VIA" 
                        fill
                        className="object-cover" 
                      />
                    </div>
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-lg border border-neon/20 bg-neon/5 flex items-center justify-center text-[9px] font-black text-neon shadow-[inset_0_0_10px_rgba(57,255,20,0.1)]">
                    USER
                  </div>
                )}
              </div>

              <div
                className={`max-w-[85%] px-6 py-4 rounded-sm relative border-l-2 leading-relaxed shadow-2xl
                ${
                  m.role === "user"
                    ? "bg-white/5 border-white/20 text-white rounded-tr-lg"
                    : "bg-neon/[0.03] border-neon backdrop-blur-sm text-neon/90 rounded-bl-lg"
                }`}
              >
                {/* Decorative corner for AI messages */}
                {m.role === "assistant" && (
                  <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-neon/50" />
                )}
                <div className={`${m.role === "assistant" ? "font-mono text-[13px] tracking-tight" : "font-sans text-sm"}`}>
                  {m.text}
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex items-start gap-5">
              <div className="relative w-10 h-10 p-[1.5px] bg-neon/50 rounded-lg rotate-45 animate-pulse shadow-[0_0_20px_rgba(57,255,20,0.4)]" />
              <div className="bg-neon/10 border-l-2 border-neon px-5 py-4 flex gap-2 items-center">
                <div className="w-1 h-3 bg-neon animate-[bounce_1s_infinite]" />
                <div className="w-1 h-3 bg-neon animate-[bounce_1s_infinite_0.2s]" />
                <div className="w-1 h-3 bg-neon animate-[bounce_1s_infinite_0.4s]" />
                <span className="text-[10px] text-neon uppercase font-black tracking-widest ml-2 opacity-60">Processing...</span>
              </div>
            </div>
          )}

          <div ref={bottomRef} className="h-12" />
        </div>
      </div>

      {/* INPUT AREA */}
      <div className="sticky bottom-0 z-20 border-t border-neon/20 bg-black/95 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="relative group">
            {/* Outer glow effect */}
            <div className="absolute -inset-1 bg-neon/20 rounded-xl blur opacity-25 group-focus-within:opacity-50 transition duration-500" />
            
            <div className="relative flex items-center gap-3 bg-black border border-neon/30 rounded-lg p-2 shadow-[0_0_30px_rgba(0,0,0,1)] focus-within:border-neon transition-all duration-300">
              <div className="pl-4 text-neon/40 font-mono text-xs hidden sm:block">Chat {">"}</div>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="message here"
                className="flex-1 bg-transparent border-none outline-none focus:ring-0 px-2 py-3 text-sm text-neon font-mono placeholder:text-neon/20 caret-neon"
              />

              <button
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                className="px-8 py-3 rounded-md bg-neon text-black text-[10px] font-black uppercase tracking-[0.2em] hover:bg-glow disabled:opacity-10 transition-all duration-300 active:scale-95 shadow-[0_0_20px_rgba(57,255,20,0.2)]"
              >
                SEND
              </button>
            </div>
          </div>
          <div className="flex justify-end mt-4 px-2">
            <p className="text-[8px] text-neon/40 tracking-[0.3em] uppercase font-bold">
              Status: ACTIVE
            </p>
          </div>
        </div>
      </div>

    </div>
  );
}