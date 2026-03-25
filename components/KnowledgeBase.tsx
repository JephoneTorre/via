"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/supabase/client";

type SOPDoc = {
  id: number;
  content: string;
  metadata: any;
  created_at: string;
};

type Assistant = {
  id: string;
  name: string;
  email: string;
  is_active: boolean;
  employment_type: string;
};

export default function KnowledgeBase() {
  const [sops, setSops] = useState<SOPDoc[]>([]);
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"sop" | "team">("sop");

  const supabase = createClient();

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const [sopRes, assistantRes] = await Promise.all([
          supabase.from("SOP").select("*").order("created_at", { ascending: false }),
          supabase.from("assistant").select("*").order("name")
        ]);

        if (sopRes.data) setSops(sopRes.data);
        if (assistantRes.data) setAssistants(assistantRes.data);
      } catch (err) {
        console.error("Fetch Error:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50/50">
      {/* HEADER */}
      <div className="px-10 py-8 border-b border-slate-200 bg-white/40 backdrop-blur-sm">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
          <span className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </span>
          SECURE KNOWLEDGE BASE
        </h1>
        <p className="text-slate-500 text-sm mt-2 font-medium">Internal protocol datasets and documentation for the VIA strategic assistant.</p>
        
        {/* TABS */}
        <div className="flex gap-4 mt-8">
          <button 
            onClick={() => setActiveTab("sop")}
            className={`px-6 py-2.5 rounded-full text-xs font-black uppercase tracking-widest transition-all ${activeTab === "sop" ? "bg-primary text-white shadow-lg shadow-primary/20" : "bg-white text-slate-400 hover:text-slate-600 border border-slate-200"}`}
          >
            SOP Documents
          </button>
          <button 
            onClick={() => setActiveTab("team")}
            className={`px-6 py-2.5 rounded-full text-xs font-black uppercase tracking-widest transition-all ${activeTab === "team" ? "bg-primary text-white shadow-lg shadow-primary/20" : "bg-white text-slate-400 hover:text-slate-600 border border-slate-200"}`}
          >
            Team Members
          </button>
        </div>
      </div>

      {/* CONTENT */}
      <div className="flex-1 overflow-y-auto p-10">
        {loading ? (
          <div className="flex items-center justify-center h-64">
             <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {activeTab === "sop" ? (
              sops.length > 0 ? (
                sops.map((doc) => (
                  <div key={doc.id} className="glass-card bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-md transition-all group">
                    <div className="flex justify-between items-start mb-4">
                      <span className="text-[10px] font-black uppercase tracking-widest text-primary/60 bg-primary/5 px-3 py-1 rounded-full border border-primary/10">
                        {String(doc.metadata?.type || "Document").replace("_", " ")}
                      </span>
                      <span className="text-[10px] text-slate-300 font-bold uppercase tracking-tighter">
                        {new Date(doc.created_at).toLocaleDateString()} • ID: {doc.id}
                      </span>
                    </div>
                    <p className="text-slate-700 text-[14px] leading-relaxed line-clamp-3 group-hover:line-clamp-none transition-all">
                      {doc.content}
                    </p>
                    <div className="mt-4 pt-4 border-t border-slate-50 flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                       <span>Source: {doc.metadata?.source || "Unknown"}</span>
                       <span className="text-green-500">Vectorized</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-20 bg-white/40 rounded-[3rem] border-2 border-dashed border-slate-200">
                  <p className="text-slate-400 font-bold uppercase tracking-widest">No documentation found in secure storage.</p>
                </div>
              )
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {assistants.map((a) => (
                    <div key={a.id} className="glass-card bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-md transition-all">
                       <div className="flex items-center gap-4 mb-4">
                          <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 font-black text-xl">
                            {a.name.charAt(0)}
                          </div>
                          <div>
                            <h3 className="font-black text-slate-900 leading-tight uppercase tracking-tight">{a.name}</h3>
                            <p className="text-[10px] text-primary font-bold uppercase tracking-widest">{a.employment_type || "Team Member"}</p>
                          </div>
                       </div>
                       <div className="space-y-2 mt-4 pt-4 border-t border-slate-50">
                          <div className="flex justify-between items-center text-[10px] uppercase font-bold tracking-widest">
                            <span className="text-slate-400">Email:</span>
                            <span className="text-slate-600">{a.email}</span>
                          </div>
                          <div className="flex justify-between items-center text-[10px] uppercase font-bold tracking-widest">
                            <span className="text-slate-400">Status:</span>
                            <span className={a.is_active ? "text-green-500" : "text-slate-300"}>{a.is_active ? "Active" : "Inactive"}</span>
                          </div>
                       </div>
                    </div>
                  ))}
                </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
