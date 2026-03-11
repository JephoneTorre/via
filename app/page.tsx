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
  const [isHydrated, setIsHydrated] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // HYDRATE FROM CACHE ON MOUNT
  useEffect(() => {
    if (typeof window !== "undefined" && !isHydrated) {
      const saved = sessionStorage.getItem("via_chat_history");
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
      sessionStorage.setItem("via_chat_history", JSON.stringify(messages));
    }
  }, [messages, isHydrated]);

  // auto scroll to bottom when new messages appear
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, botStatus]);

  // BACKGROUND ANIMATION
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const particles: { x: number; y: number; vx: number; vy: number; size: number }[] = [];
    const particleCount = 100;
    const connectionRadius = 150;
    let mouse = { x: -1000, y: -1000 };

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", resize);
    resize();

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        size: Math.random() * 1.5 + 1
      });
    }

    const onMouseMove = (e: MouseEvent) => { mouse = { x: e.clientX, y: e.clientY }; };
    window.addEventListener("mousemove", onMouseMove);

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(219, 39, 119, 0.15)";
      ctx.strokeStyle = "rgba(219, 39, 119, 0.08)";

      particles.forEach((p, i) => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        const dxMouse = mouse.x - p.x;
        const dyMouse = mouse.y - p.y;
        const distMouse = Math.sqrt(dxMouse * dxMouse + dyMouse * dyMouse);
        if (distMouse < 200) {
          p.x -= dxMouse * 0.015;
          p.y -= dyMouse * 0.015;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();

        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < connectionRadius) {
            ctx.lineWidth = 1 - dist / connectionRadius;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y); ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        }
      });
      requestAnimationFrame(animate);
    };
    animate();
    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
    };
  }, []);

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
    setLastMessageSeen(true);
    setBotStatus("typing");
    
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userText }),
      });

      if (!res.ok) throw new Error("Connection failed");

      const data = await res.json();
      const reply = data.reply ?? "I encountered an error processing your request.";

      setMessages(prev => [...prev, { 
        id: Math.random().toString(36).substring(7),
        role: "assistant", 
        text: reply,
        timestamp: new Date()
      }]);

    } catch {
      setMessages(prev => [
        ...prev,
        { 
          id: Math.random().toString(36).substring(7),
          role: "assistant", 
          text: "I'm having trouble connecting to the system. Please try again in a moment.",
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
    <div className="h-screen flex selection:bg-primary/30 relative overflow-hidden">
      {/* SIDEBAR */}
      <aside className="hidden md:flex w-20 flex-col items-center py-8 gap-10 z-40 border-r border-slate-200/60 bg-white/40 backdrop-blur-xl">
        <div className="relative w-10 h-10 transition-all duration-500 hover:scale-110">
           <Image src="/icon/vip.png" alt="VIA" fill className="object-contain" />
        </div>
        
        <div className="flex-1 flex flex-col items-center gap-6">
          <div className="w-8 h-[1px] bg-slate-200" />
          
          <a 
            href="https://docs.google.com/spreadsheets/d/1koB3El_dRHnXDqgNfEP8e04oFf4s7DiMAhrogZ7blXA/edit?gid=968444285#gid=968444285"
            target="_blank"
            rel="noopener noreferrer"
            className="w-12 h-12 rounded-2xl glass-card flex items-center justify-center text-slate-400 hover:text-primary hover:bg-white transition-all group relative border-slate-100 shadow-sm"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            
            {/* Tooltip */}
            <div className="absolute left-16 px-4 py-2 bg-slate-900 text-white text-[10px] rounded-xl opacity-0 group-hover:opacity-100 transition-all translate-x-[-10px] group-hover:translate-x-0 whitespace-nowrap pointer-events-none uppercase tracking-widest font-black shadow-2xl z-50">
              Edit Dataset
              <div className="absolute left-[-4px] top-1/2 -translate-y-1/2 w-2 h-2 bg-slate-900 rotate-45" />
            </div>
          </a>
        </div>

        <div className="mt-auto flex flex-col items-center gap-6">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        </div>
      </aside>

      <div className="flex-1 flex flex-col relative overflow-hidden">
        {/* ANIMATED BACKGROUND */}
        <canvas 
          ref={canvasRef} 
          className="fixed top-0 left-0 w-full h-full pointer-events-none z-[-1]"
          style={{ opacity: 0.6 }}
        />
        
        {/* HEADER */}
        <header className="sticky top-4 z-30 mx-auto w-[95%] max-w-5xl">
          <div className="glass-panel rounded-full px-6 py-3 flex items-center justify-between shadow-lg border-white/50">
            <div className="flex items-center gap-4">
              <div className="relative h-8 w-32">
                <Image 
                  src="/icon/header.png" 
                  alt="VIP Logo" 
                  fill
                  className="object-contain"
                />
              </div>

            </div>
            
            <div className="hidden md:flex items-center gap-3">
              <div className="bg-slate-50 px-4 py-1.5 rounded-full text-[10px] text-slate-400 uppercase tracking-wider font-bold border border-slate-100">
                Secure Protocol Active
              </div>
            </div>
          </div>
        </header>

        {/* CHAT AREA */}
        <main className="flex-1 overflow-y-auto scroll-smooth relative">
          <div className="max-w-3xl mx-auto py-12 px-6 relative z-10">

            {messages.length === 0 && (
              <div className="text-center pt-24 space-y-10 animate-float">
                <div className="inline-flex items-center gap-6 px-10 py-4 rounded-full border border-slate-200 bg-white shadow-md mb-8">
                  <div className="relative w-24 h-12">
                    <Image 
                      src="/icon/header.png" 
                      alt="VIP" 
                      fill
                      className="object-contain"
                    />
                  </div>
                  <div className="w-[1px] h-8 bg-slate-200" />
                  <span className="text-xl uppercase tracking-[0.4em] font-black text-slate-500">VIA</span>
                </div>
                <div className="space-y-4">
                  <h2 className="text-5xl md:text-6xl font-display font-black tracking-tight text-slate-900">
                    We craft <span className="text-primary italic">intelligence</span> <br />
                    and digital strategy
                  </h2>
                  <p className="max-w-lg mx-auto text-slate-500 text-sm font-medium leading-relaxed">
                    I am VIA, your specialized company assistant. I provide detailed insights about operations, internal protocols, and strategic digital activations.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-xl mx-auto pt-8">
                  {["Client Portfolio Details", "Company Policy Search", "Project Status Updates", "Departmental Contacts"].map((prompt) => (
                    <button 
                      key={prompt}
                      onClick={() => setInput(prompt)}
                      className="glass-card hover:bg-white text-left p-5 rounded-[2rem] text-sm font-bold text-slate-600 hover:text-primary hover:border-primary/30 transition-all border-slate-100 shadow-sm flex items-center justify-between group"
                    >
                      {prompt}
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity text-primary">→</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-8">
              {messages.map((m, i) => {
                const isLastUserMsg = m.role === "user" && i === messages.length - 1;

                return (
                  <div key={m.id} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
                    
                    <div className={`flex items-start gap-4 max-w-[90%] md:max-w-[80%] ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                      
                      {m.role === "assistant" && (
                        <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 glass-card mt-1 border border-white/10 shadow-lg p-1.5">
                          <Image src="/icon/vip.png" alt="VIA" width={32} height={32} className="object-contain" />
                        </div>
                      )}

                      <div className="flex flex-col">
                        <div
                          className={`px-6 py-4 rounded-[2rem] text-[15px] leading-relaxed
                          ${
                            m.role === "user"
                              ? "message-user text-white rounded-tr-sm"
                              : "message-assistant text-slate-800 rounded-tl-sm bg-white border border-slate-100 font-medium"
                          }`}
                        >
                          {m.role === "assistant" ? 
                            <div className="prose prose-sm max-w-none markdown-content font-sans">
                              <ReactMarkdown>{m.text}</ReactMarkdown>
                            </div> : 
                            <span>{m.text}</span>
                          }
                        </div>
                        
                        <span className={`text-[9px] text-slate-400 mt-2 font-bold tracking-widest uppercase px-2 ${m.role === "user" ? "text-right" : "text-left"}`}>
                          {formatTime(m.timestamp)}
                        </span>
                      </div>
                    </div>

                    {isLastUserMsg && (
                      <div className="mt-2 flex flex-col items-end px-2">
                         <span className="text-[10px] text-primary/60 font-semibold tracking-widest">
                            {lastMessageSeen ? (botStatus === "idle" ? "Confirmed" : botStatus.charAt(0).toUpperCase() + botStatus.slice(1)) : "Transmitting"}
                         </span>
                      </div>
                    )}
                  </div>
                );
              })}

              {botStatus === "typing" && (
                <div className="flex items-start gap-4 animate-pulse">
                  <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 glass-card border border-white/10 p-1.5">
                    <Image src="/icon/vip.png" alt="VIA" width={32} height={32} className="object-contain" />
                  </div>
                  <div className="glass-card rounded-2xl rounded-tl-sm px-5 py-4 flex gap-1.5 items-center bg-white/5">
                    <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce shadow-[0_0_8px_var(--primary-glow)]" />
                    <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:0.2s] shadow-[0_0_8px_var(--primary-glow)]" />
                    <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:0.4s] shadow-[0_0_8px_var(--primary-glow)]" />
                  </div>
                </div>
              )}
            </div>

            <div ref={bottomRef} className="h-20" />
          </div>
        </main>

        {/* INPUT AREA */}
        <footer className="p-8 relative">
          <div className="max-w-4xl mx-auto flex items-center gap-4 bg-white p-2 rounded-full border border-slate-200 shadow-xl">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Type your strategic inquiry here..."
              className="flex-1 bg-transparent text-slate-900 py-3 px-8 outline-none border-none text-[15px] placeholder:text-slate-300 font-semibold"
            />
            <button
              onClick={sendMessage}
              disabled={botStatus !== "idle" || !input.trim()}
              className={`flex items-center gap-2 px-6 py-3.5 rounded-full font-black text-sm uppercase tracking-widest transition-all duration-300 shadow-md ${
                botStatus !== "idle" || !input.trim() 
                ? "bg-slate-50 text-slate-200 cursor-not-allowed" 
                : "bg-primary text-white hover:bg-primary/90 hover:scale-[1.02] active:scale-95 shadow-primary/20"
              }`}
            >
              Send
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          <div className="max-w-4xl mx-auto mt-4">
            <p className="text-[9px] text-center text-slate-400 uppercase tracking-[0.3em] font-black">
              VIA &copy; 2026 VIP scale
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
