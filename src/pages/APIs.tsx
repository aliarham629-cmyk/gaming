import { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { APIKey } from '../types';
import { Key, Plus, Trash2, CheckCircle2, XCircle, Loader2, Info, ExternalLink, Activity } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { GoogleGenAI } from '@google/genai';

export const APIsPage = () => {
  const [keys, setKeys] = useState<APIKey[]>([]);
  const [newKey, setNewKey] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(collection(db, 'users', auth.currentUser.uid, 'apiKeys'));
    return onSnapshot(q, (snapshot) => {
      setKeys(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as APIKey)));
    });
  }, []);

  const testKey = async (key: string) => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const ai = new GoogleGenAI({ apiKey: key });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: "Hello",
      });
      if (response.text) {
        setTestResult({ success: true, message: "Connection successful!" });
        return true;
      }
      throw new Error("Empty response");
    } catch (error: any) {
      setTestResult({ success: false, message: error.message || "Failed to connect" });
      return false;
    } finally {
      setIsTesting(false);
    }
  };

  const addKey = async () => {
    if (!newKey || !auth.currentUser) return;
    const isValid = await testKey(newKey);
    if (isValid) {
      await addDoc(collection(db, 'users', auth.currentUser.uid, 'apiKeys'), {
        key: newKey,
        status: 'active',
        usageCount: 0,
        createdAt: serverTimestamp()
      });
      setNewKey('');
      setTestResult(null);
    }
  };

  const removeKey = async (id: string) => {
    if (!auth.currentUser) return;
    await deleteDoc(doc(db, 'users', auth.currentUser.uid, 'apiKeys', id));
  };

  return (
    <div className="p-10 max-w-5xl mx-auto space-y-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-black italic tracking-tighter uppercase">API Cores</h1>
        <p className="text-xs font-black uppercase tracking-[0.3em] text-white/40">Gemini LLM Authentication & Usage Tracking</p>
      </div>

      {/* AI LINK HELPER */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-primary/5 rounded-3xl p-8 border border-primary/20 flex flex-col md:flex-row items-center gap-8 relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-16 -mt-16"></div>
        <div className="bg-primary text-black p-5 rounded-2xl shadow-[0_0_30px_rgba(255,255,255,0.1)]">
          <Activity className="w-10 h-10" />
        </div>
        <div className="flex-1 text-center md:text-left">
          <div className="flex items-center justify-center md:justify-start gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
            <h3 className="text-sm font-black uppercase tracking-widest text-primary">System Expert Link Protocol</h3>
          </div>
          <p className="text-xs text-white/60 font-bold leading-relaxed mb-6 max-w-xl">
            Detected Session: <span className="text-white italic">{auth.currentUser?.email}</span>. 
            To bypass shared quotas and use your personal Gemini model limits, link your unique API core. 
            Once linked, this app will use your "Expert Session" automatically.
          </p>
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-4">
            <a 
              href="https://aistudio.google.com/app/apikey" 
              target="_blank" 
              rel="noreferrer"
              className="inline-flex items-center gap-3 px-6 py-3 bg-white text-black hover:bg-primary transition-all rounded font-black text-[11px] uppercase tracking-widest"
            >
              Copy From AI Studio <ExternalLink className="w-4 h-4" />
            </a>
            <div className="flex items-center gap-2 text-[10px] font-black text-white/30 uppercase tracking-tighter italic">
              <Info className="w-4 h-4" />
              Fetch protocol ready. Just paste & initialize.
            </div>
          </div>
        </div>
      </motion.div>

      <div className="bg-dark-card rounded-3xl border border-white/10 p-8 relative overflow-hidden">
        {/* Decor */}
        <div className="absolute -top-6 -right-6 text-6xl font-black text-white/[0.02] select-none uppercase italic">SECURE</div>

        <h2 className="text-xs font-black uppercase tracking-[0.2em] mb-6 text-white/40">Connect New Resource</h2>
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <input
              type="password"
              placeholder="PASTE_GEMINI_API_KEY_HERE"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              className="w-full bg-black/40 px-6 py-4 rounded border border-white/5 focus:outline-none focus:border-primary/40 text-white font-mono text-sm tracking-tight placeholder:text-white/10"
            />
          </div>
          <button
            onClick={addKey}
            disabled={!newKey || isTesting}
            className="px-8 py-4 bg-primary text-black rounded font-black text-xs uppercase tracking-widest hover:scale-105 transition-transform disabled:opacity-20 flex items-center justify-center gap-2"
          >
            {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Initialize Link
          </button>
        </div>
        
        {testResult && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className={cn(
              "mt-6 p-4 rounded border font-bold text-[10px] uppercase tracking-widest flex items-center gap-3",
              testResult.success ? "bg-primary/10 border-primary/20 text-primary" : "bg-red-500/10 border-red-500/20 text-red-500"
            )}
          >
            {testResult.success ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            SIGNAL: {testResult.message}
          </motion.div>
        )}
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between px-2">
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-white/40 italic">Active Node Cluster</h2>
          {keys.length === 0 && (
            <span className="text-[9px] font-black uppercase tracking-widest text-primary bg-primary/10 px-2 py-1 rounded border border-primary/20 animate-pulse">
              System Core Active (Fallback)
            </span>
          )}
        </div>
        {keys.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-white/10 rounded-3xl">
            <p className="text-sm font-black text-white/20 uppercase tracking-widest italic">No operational cores detected</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {keys.map((key) => (
              <motion.div
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                key={key.id}
                className="bg-white/5 p-6 rounded-2xl border border-white/5 flex items-center justify-between group hover:border-white/10 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-12 h-12 rounded flex items-center justify-center",
                    key.status === 'active' ? "bg-primary text-black" : "bg-red-500 text-white"
                  )}>
                    <Key className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-mono text-sm font-bold tracking-tighter">
                      GEN-KEY-••••{key.key.slice(-4)}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={cn(
                        "text-[9px] font-black uppercase tracking-widest",
                        key.status === 'active' ? "text-primary" : "text-red-500"
                      )}>
                        {key.status}
                      </span>
                      <span className="text-[9px] text-white/20 font-bold uppercase">
                         Usage: {key.usageCount || 0} cycles
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => removeKey(key.id)}
                  className="p-3 text-white/20 hover:text-red-500 hover:bg-black/20 rounded transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
