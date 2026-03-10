"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";

// --- TYPES ---
type Msg = {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: Date;
};

export default function Home() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [botStatus, setBotStatus] = useState<"idle" | "waiting" | "seen" | "analyzing" | "typing">("idle");
  const [lastMessageSeen, setLastMessageSeen] = useState(false);
  const [lastReplyAt, setLastReplyAt] = useState<number>(0);
  const [isHydrated, setIsHydrated] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  // HYDRATE FROM CACHE ON MOUNT
  useEffect(() => {
    if (typeof window !== "undefined" && !isHydrated) {
      const saved = sessionStorage.getItem("lia_chat_history");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          const hydrated = parsed.map((m: Msg) => ({
            ...m,
            timestamp: new Date(m.timestamp)
          }));
          setMessages(hydrated);
        } catch (e) {
          console.error("Failed to load history:", e);
        }
      }
      setIsHydrated(true);
    }
  }, [isHydrated]);

  // SAVE TO CACHE ON CHANGE
  useEffect(() => {
    if (isHydrated && messages.length > 0) {
      sessionStorage.setItem("lia_chat_history", JSON.stringify(messages));
    }
  }, [messages, isHydrated]);

  // auto scroll to bottom when new messages appear
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, botStatus]);

  const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };



  async function sendMessage() {
    if (!input.trim() || botStatus !== "idle") return;

    const userText = input;
    const userMsgId = Math.random().toString(36).substring(7);
    setInput("");
    
    const newUserMsg: Msg = { 
      id: userMsgId,
      role: "user", 
      text: userText, 
      timestamp: new Date() 
    };

    setMessages(prev => [...prev, newUserMsg]);
    setLastMessageSeen(false);
    
    const now = Date.now();
    const timeSinceLastLiaMsg = now - lastReplyAt;
    const isLiveConversation = lastReplyAt !== 0 && timeSinceLastLiaMsg < 120000; // 2 minute "live" window

    const baseWaitMin = isLiveConversation ? 3000 : 10000;
    const baseWaitMax = isLiveConversation ? 7000 : 30000;
    const analyzeTime = isLiveConversation ? 1500 : 4000;

    // PHASE 1: BEFORE SEEN (Delivered status)
    setBotStatus("waiting");
    const waitTime = Math.floor(Math.random() * (baseWaitMax - baseWaitMin + 1)) + baseWaitMin;
    await sleep(waitTime);
    
    // PHASE 2: SEEN NOTICE & ANALYZE
    setLastMessageSeen(true);
    setBotStatus("analyzing");
    
    // Start fetching while "analyzing" to be ready
    const apiPromise = fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: userText }),
    });

    await sleep(analyzeTime);
    
    setBotStatus("typing");

    try {
      const res = await apiPromise;

      if (!res.ok) {
        const txt = await res.text();
        setMessages(prev => [
          ...prev,
          { 
            id: Math.random().toString(36).substring(7),
            role: "assistant", 
            text: `❌ ERROR: Brain link severed.\n${txt}`,
            timestamp: new Date()
          },
        ]);
        setBotStatus("idle");
        return;
      }

      const data = await res.json();
      const reply = data.reply ?? `❌ ERROR: Memory corruption.`;

      const typingTime = Math.min(reply.length * 15, 2000); 
      await sleep(typingTime);

      setMessages(prev => [...prev, { 
        id: Math.random().toString(36).substring(7),
        role: "assistant", 
        text: reply,
        timestamp: new Date()
      }]);
      setLastReplyAt(Date.now());

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setMessages(prev => [
        ...prev,
        { 
          id: Math.random().toString(36).substring(7),
          role: "assistant", 
          text: "❌ Connection error: " + errorMessage,
          timestamp: new Date()
        },
      ]);
    }

    setBotStatus("idle");
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") sendMessage();
  }

  return (
    <div className="h-screen bg-[#050505] text-white flex flex-col font-sans selection:bg-neon/30 relative overflow-hidden">
      
      {/* SCANLINE EFFECT */}
      <div className="scanline pointer-events-none opacity-20" />
      
      {/* HEADER */}
      <div className="sticky top-0 z-20 border-b border-white/5 backdrop-blur-md bg-black/80">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 rounded-full overflow-hidden border border-white/10 shadow-lg">
              <Image 
                src="/icon/via.png" 
                alt="VIA Icon" 
                fill
                className="object-cover"
              />
            </div>
            <div>
              <h1 className="text-lg tracking-tight text-white">Lia Satella</h1>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 bg-neon rounded-full shadow-[0_0_8px_#39ff14]" />
                <span className="text-[10px] text-white/50 font-normal tracking-wider">Active now</span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* CHAT AREA */}
      <div className="flex-1 overflow-y-auto scroll-smooth relative px-4 md:px-0">
        {/* Subtle background grid */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(57,255,20,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(57,255,20,0.03)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />
        
        <div className="max-w-3xl mx-auto py-8 relative z-10">

          {messages.length === 0 && (
            <div className="text-center pt-20 flex flex-col items-center">
              <div className="relative w-24 h-24 mb-6 rounded-full overflow-hidden border-2 border-white/10 shadow-2xl">
                <Image 
                  src="/icon/via.png" 
                  fill
                  className="object-cover"
                  alt="VIA Logo"
                />
              </div>
              <h2 className="text-2xl mb-1 text-white">Lia Satella</h2>
              <p className="text-sm text-white/40 mb-8 uppercase tracking-widest text-[10px]">Xfinite Team Manager</p>
              <div className="bg-white/5 rounded-2xl p-6 border border-white/10 max-w-xs">
                <p className="text-xs text-white/60 leading-relaxed italic">
                  &quot;I&apos;m here to help you with your Xfinite journey po! Tanong lang kayo anytime.&quot;
                </p>
              </div>
            </div>
          )}

          <div className="space-y-6">
            {messages.map((m, i) => {
              const isLastUserMsg = m.role === "user" && i === messages.length - 1;
              const isLastInGroup = i === messages.length - 1 || messages[i + 1].role !== m.role;

              return (
                <div key={m.id} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
                  
                  {/* DATE SEPARATOR (Mock logic) */}
                  {(i === 0 || m.timestamp.getDate() !== messages[i-1].timestamp.getDate()) && (
                    <div className="w-full text-center my-6">
                      <span className="text-[10px] text-white/30 uppercase tracking-[0.2em]">
                        {m.timestamp.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                  )}

                  <div className={`flex items-end gap-2 max-w-[85%] ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                    
                    {/* AVATAR FOR ASSISTANT */}
                    {m.role === "assistant" && (
                      <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 border border-white/10 mb-1">
                        <Image src="/icon/via.png" alt="Lia" width={28} height={28} className="object-cover" />
                      </div>
                    )}

                    <div className="flex flex-col">
                      <div
                        className={`px-4 py-2.5 rounded-2xl text-[14px] leading-relaxed shadow-sm
                        ${
                          m.role === "user"
                            ? "bg-neon text-black rounded-tr-sm"
                            : "bg-[#262626] text-white/90 rounded-tl-sm"
                        }`}
                      >
                        {m.role === "assistant" ? <div className="prose prose-invert prose-sm"><ReactMarkdown>{m.text}</ReactMarkdown></div> : m.text}
                      </div>
                      
                      {/* TIMESTAMP UNDER MESSAGE (Only if last in group or shows after 5 mins) */}
                      {isLastInGroup && (
                        <span className={`text-[9px] text-white/30 mt-1 ${m.role === "user" ? "text-right" : "text-left ml-1"}`}>
                          {formatTime(m.timestamp)}
                        </span>
                      )}
                    </div>
                  </div>
  {/* MESSENGER STYLE STATUS INDICATORS */}
                  {/* MESSENGER STYLE STATUS INDICATORS */}
                  {isLastUserMsg && (
                    <div className="mt-1 mr-1 flex flex-col items-end">
                      {lastMessageSeen ? (
                        <div className="flex flex-col items-end gap-1">
                          <div className="w-3.5 h-3.5 rounded-full overflow-hidden border border-white/20 shadow-sm opacity-80">
                            <Image src="/icon/via.png" alt="Seen" width={14} height={14} className="object-cover" />
                          </div>
                          <span className="text-[9px] text-white/30 font-normal">Seen {formatTime(new Date())}</span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-white/40 font-normal tracking-tight">Delivered</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {botStatus === "typing" && (
              <div className="flex items-end gap-2">
                <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 border border-white/10 mb-1">
                  <Image src="/icon/via.png" alt="Lia" width={28} height={28} className="object-cover" />
                </div>
                <div className="bg-[#262626] rounded-2xl rounded-tl-sm px-4 py-3 flex gap-1 items-center">
                  <div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" />
                  <div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:0.2s]" />
                  <div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
              </div>
            )}
          </div>

          <div ref={bottomRef} className="h-10" />
        </div>
      </div>

      {/* INPUT AREA (Messenger Style) */}
      <div className="p-4 bg-black border-t border-white/5">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          
          {/* PILL INPUT */}
          <div className="flex-1 relative flex items-center">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Chat with me"
              className="w-full bg-[#262626] text-white rounded-full py-2.5 px-6 outline-none border-none text-[15px] placeholder:text-white/30"
            />
          </div>

          {/* SEND ICON (AIRPLANE NEON) */}
          <button
            onClick={sendMessage}
            disabled={botStatus !== "idle" || !input.trim()}
            className={`transition-all duration-200 ${botStatus !== "idle" || !input.trim() ? "opacity-20 translate-x-1" : "text-neon hover:scale-110 active:scale-95 translate-x-0"}`}
          >
            <svg 
              className="w-7 h-7 transform rotate-12" 
              fill="currentColor" 
              viewBox="0 0 24 24"
            >
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
      </div>

    </div>
  );
}
