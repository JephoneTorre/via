"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/supabase/client";
import { updateSOP, deleteSOP, updateAssistant, deleteAssistant, createAssistant } from "@/lib/ingest";

type SOPDoc = {
  id: number;
  content: string;
  metadata: {
    type?: string;
    source?: string;
    is_edited?: boolean;
    date?: string;
    [key: string]: string | number | boolean | null | undefined | object;
  };
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
  
  // Editing state
  const [editingId, setEditingId] = useState<number | string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editAssistant, setEditAssistant] = useState<Partial<Assistant>>({});
  const [isSaving, setIsSaving] = useState(false);

  const supabase = createClient();

  const fetchData = useCallback(async () => {
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
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleEditSop = (doc: SOPDoc) => {
    setEditingId(doc.id);
    setEditContent(doc.content);
  };

  const handleSaveSop = useCallback(async (id: number) => {
    setIsSaving(true);
    const res = await updateSOP(id, editContent);
    if (res.success) {
      setEditingId(null);
      await fetchData();
    } else {
      alert("Error updating SOP: " + res.error);
    }
    setIsSaving(false);
  }, [editContent, fetchData]);

  const handleDeleteSop = useCallback(async (id: number) => {
    if (!confirm("Are you sure you want to delete this document? This cannot be undone.")) return;
    const res = await deleteSOP(id);
    if (res.success) {
      await fetchData();
    } else {
      alert("Error deleting SOP: " + res.error);
    }
  }, [fetchData]);

  const handleEditAssistant = useCallback((a: Assistant) => {
    setEditingId(a.id);
    setEditAssistant(a);
  }, []);

  const handleSaveAssistant = useCallback(async (id: string) => {
    setIsSaving(true);
    const res = await updateAssistant(id, editAssistant);
    if (res.success) {
      setEditingId(null);
      await fetchData();
    } else {
      alert("Error updating team member: " + res.error);
    }
    setIsSaving(false);
  }, [editAssistant, fetchData]);

  const handleDeleteAssistant = useCallback(async (id: string) => {
    if (!confirm("Are you sure you want to delete this team member?")) return;
    const res = await deleteAssistant(id);
    if (res.success) {
      await fetchData();
    } else {
      alert("Error deleting team member: " + res.error);
    }
  }, [fetchData]);

  const handleCreateAssistant = useCallback(async () => {
    const name = prompt("Enter assistant name:");
    if (!name) return;
    const email = prompt("Enter assistant email:");
    if (!email) return;

    const res = await createAssistant({
      name,
      email,
      is_active: true,
      employment_type: "Full-Time"
    });
    
    if (res.success) {
      await fetchData();
    } else {
      alert("Error creating assistant: " + res.error);
    }
  }, [fetchData]);

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
              <>
                {sops.length > 0 ? (
                  sops.map((doc) => (
                    <div key={doc.id} className="glass-card bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-md transition-all group relative">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-black uppercase tracking-widest text-primary/60 bg-primary/5 px-3 py-1 rounded-full border border-primary/10">
                            {String(doc.metadata?.type || "Document").replace("_", " ")}
                          </span>
                          {doc.metadata?.is_edited && (
                            <span className="text-[8px] font-bold text-slate-400 uppercase bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100">
                              Edited
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-[10px] text-slate-300 font-bold uppercase tracking-tighter">
                            {new Date(doc.created_at).toLocaleDateString()} • ID: {doc.id}
                          </span>
                          
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                               onClick={() => handleEditSop(doc)}
                               className="p-1.5 rounded-lg hover:bg-slate-50 text-slate-400 hover:text-primary transition-colors"
                               title="Edit Document"
                            >
                               <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                               </svg>
                            </button>
                            <button 
                               onClick={() => handleDeleteSop(doc.id)}
                               className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                               title="Delete Document"
                            >
                               <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                               </svg>
                            </button>
                          </div>
                        </div>
                      </div>

                      {editingId === doc.id ? (
                        <div className="space-y-4">
                          <textarea 
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className="w-full min-h-[150px] p-4 rounded-2xl border border-primary/20 bg-slate-50 text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-primary/10 font-medium"
                            placeholder="Update SOP content..."
                          />
                          <div className="flex justify-end gap-3">
                            <button 
                              onClick={() => setEditingId(null)}
                              className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100 transition-all"
                            >
                              Cancel
                            </button>
                            <button 
                              onClick={() => handleSaveSop(doc.id)}
                              disabled={isSaving}
                              className="px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-primary text-white shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                            >
                              {isSaving ? "Saving..." : "Save Changes"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-slate-700 text-[14px] leading-relaxed line-clamp-3 group-hover:line-clamp-none transition-all">
                          {doc.content}
                        </p>
                      )}

                      <div className="mt-4 pt-4 border-t border-slate-50 flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                         <span>Source: {doc.metadata?.source || "Unknown"}</span>
                         <span className={doc.metadata?.is_edited ? "text-primary" : "text-green-500"}>
                           {doc.metadata?.is_edited ? "Re-Vectorized" : "Vectorized"}
                         </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-20 bg-white/40 rounded-[3rem] border-2 border-dashed border-slate-200">
                    <p className="text-slate-400 font-bold uppercase tracking-widest">No documentation found in secure storage.</p>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex justify-end mb-2">
                   <button 
                     onClick={handleCreateAssistant}
                     className="px-6 py-2 bg-primary/10 text-primary border border-primary/20 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-primary hover:text-white transition-all shadow-sm"
                   >
                     + Add Team Member
                   </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {assistants.map((a) => (
                    <div key={a.id} className="glass-card bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-md transition-all group relative">
                       {editingId === a.id ? (
                         <div className="space-y-3">
                            <input 
                              value={editAssistant.name || ""}
                              onChange={e => setEditAssistant({...editAssistant, name: e.target.value})}
                              placeholder="Name"
                              className="w-full px-4 py-2 rounded-xl border border-primary/20 bg-slate-50 text-sm font-bold"
                            />
                            <input 
                              value={editAssistant.email || ""}
                              onChange={e => setEditAssistant({...editAssistant, email: e.target.value})}
                              placeholder="Email"
                              className="w-full px-4 py-2 rounded-xl border border-primary/20 bg-slate-50 text-xs"
                            />
                            <select 
                              value={editAssistant.employment_type || ""}
                              onChange={e => setEditAssistant({...editAssistant, employment_type: e.target.value})}
                              className="w-full px-4 py-2 rounded-xl border border-primary/20 bg-slate-50 text-[10px] font-bold uppercase tracking-wider"
                            >
                               <option value="Full-Time">Full-Time</option>
                               <option value="Part-Time">Part-Time</option>
                               <option value="Contractor">Contractor</option>
                            </select>
                            <label className="flex items-center gap-2 px-2">
                               <input 
                                 type="checkbox"
                                 checked={editAssistant.is_active}
                                 onChange={e => setEditAssistant({...editAssistant, is_active: e.target.checked})}
                               />
                               <span className="text-[10px] font-bold uppercase text-slate-500">Active</span>
                            </label>
                            <div className="flex justify-end gap-2 pt-2">
                               <button onClick={() => setEditingId(null)} className="text-[10px] font-black px-3 py-1 text-slate-400">Cancel</button>
                               <button onClick={() => handleSaveAssistant(a.id)} className="text-[10px] font-black px-4 py-2 bg-primary text-white rounded-xl shadow-lg shadow-primary/20">Save</button>
                            </div>
                         </div>
                       ) : (
                         <>
                           <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => handleEditAssistant(a)} className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-300 hover:text-primary transition-colors">
                                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                 </svg>
                              </button>
                              <button onClick={() => handleDeleteAssistant(a.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-300 hover:text-red-500 transition-colors">
                                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                 </svg>
                              </button>
                           </div>
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
                                <span className="text-slate-600 truncate max-w-[150px]">{a.email}</span>
                              </div>
                              <div className="flex justify-between items-center text-[10px] uppercase font-bold tracking-widest">
                                <span className="text-slate-400">Status:</span>
                                <span className={a.is_active ? "text-green-500" : "text-slate-300"}>{a.is_active ? "Active" : "Inactive"}</span>
                              </div>
                           </div>
                         </>
                       )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
