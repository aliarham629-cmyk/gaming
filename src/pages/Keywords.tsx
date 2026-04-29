import { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, onSnapshot, getDocs, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { WPWebsite, APIKey } from '../types';
import { Zap, Play, Loader2, AlertCircle, CheckCircle2, History } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { generateAndPublish } from '../lib/generator';

export const KeywordsPage = () => {
  const [keywords, setKeywords] = useState('');
  const [sites, setSites] = useState<WPWebsite[]>([]);
  const [apiKeys, setApiKeys] = useState<APIKey[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    const savedSiteId = localStorage.getItem('last_site_id');
    if (savedSiteId) setSelectedSiteId(savedSiteId);

    if (!auth.currentUser) return;
    
    const sitesQuery = query(collection(db, 'users', auth.currentUser.uid, 'websites'));
    onSnapshot(sitesQuery, (snap) => setSites(snap.docs.map(d => ({ id: d.id, ...d.data() } as WPWebsite))));

    const apiQuery = query(collection(db, 'users', auth.currentUser.uid, 'apiKeys'));
    onSnapshot(apiQuery, (snap) => setApiKeys(snap.docs.map(d => ({ id: d.id, ...d.data() } as APIKey))));
  }, []);

  const onSiteChange = (id: string) => {
    setSelectedSiteId(id);
    localStorage.setItem('last_site_id', id);
  };

  const addLog = (msg: string) => setLogs(prev => [msg, ...prev].slice(0, 5));

  const startGeneration = async () => {
    const kwList = keywords.split('\n').map(k => k.trim()).filter(k => k !== '');
    if (kwList.length === 0 || !selectedSiteId || !auth.currentUser) return;
    
    const dbKeys = apiKeys.filter(k => k.status === 'active');
    
    // Check if system key is available on server
    const configRes = await window.fetch('/api/config');
    const { hasSystemKey } = await configRes.json();
    
    if (dbKeys.length === 0 && !hasSystemKey) {
      alert("No AI Core detected. Please add an API key in API Management.");
      return;
    }

    // Combine database keys with system key as fallback
    const activeKeys: Partial<APIKey>[] = dbKeys.length > 0 
      ? dbKeys 
      : [{ id: 'system-default', key: 'system-default', status: 'active', usageCount: 0 }];

    const selectedSite = sites.find(s => s.id === selectedSiteId);
    if (!selectedSite) return;

    setIsProcessing(true);
    setProgress({ current: 0, total: kwList.length });
    setLogs([]);

    try {
      const batchRef = await addDoc(collection(db, 'users', auth.currentUser.uid, 'batches'), {
        keywords: kwList,
        status: 'processing',
        createdAt: serverTimestamp()
      });

      let currentKeyIndex = 0;

      for (let i = 0; i < kwList.length; i++) {
        const keyword = kwList[i];
        setProgress(p => ({ ...p, current: i + 1 }));
        addLog(`ENGINE: Processing "${keyword}"`);

        try {
          const apiKey = activeKeys[currentKeyIndex];
          if (apiKey.id === 'system-default') {
            addLog(`CORE_SIGNAL: Using System Default Key`);
          }
          
          await generateAndPublish({
            userId: auth.currentUser.uid,
            websiteId: selectedSiteId,
            batchId: batchRef.id,
            apiKey: apiKey.key!,
            keyword,
            siteUrl: selectedSite.siteUrl,
            siteUser: selectedSite.username,
            sitePass: selectedSite.appPassword
          });
          addLog(`SUCCESS: Published "${keyword}"`);

          if (apiKey.id !== 'system-default') {
            await updateDoc(doc(db, 'users', auth.currentUser.uid, 'apiKeys', apiKey.id!), {
              usageCount: (apiKey.usageCount || 0) + 1
            });
          }

        } catch (err: any) {
          addLog(`FAIL: "${keyword}"`);
          console.error(`Article error [${keyword}]:`, err);
          
          if (err.message.includes('429') || err.message.toLowerCase().includes('quota')) {
            addLog(`EVENT: Quota exceeded. Rotating core...`);
            currentKeyIndex++;
            if (currentKeyIndex >= activeKeys.length) {
              addLog(`CRITICAL: All cores exhausted.`);
              break;
            }
            i--; 
          }
        }
      }

      await updateDoc(batchRef, { status: 'completed' });
      addLog(`SIGNAL: Batch sequence completed.`);
    } catch (err: any) {
      console.error("Batch creation failed:", err);
      alert("Failed to start batch. Check permissions.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="p-10 max-w-6xl mx-auto space-y-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-black italic tracking-tighter uppercase">Publisher Core</h1>
        <p className="text-xs font-black uppercase tracking-[0.3em] text-white/40">Keyword Extraction & Content Generation Engine</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-dark-card rounded-3xl border border-white/10 p-8 relative overflow-hidden">
             {/* Decor */}
            <div className="absolute -top-6 -right-6 text-6xl font-black text-white/[0.02] select-none uppercase italic">INPUT</div>
            
            <label className="block text-[11px] font-black text-white/40 uppercase tracking-widest mb-4">Initial Scraped Keywords</label>
            <textarea
              rows={12}
              value={keywords}
              onChange={e => setKeywords(e.target.value)}
              placeholder="best gaming laptops 2026&#10;gta 6 release date leaks&#10;pubg mobile tips"
              disabled={isProcessing}
              className="w-full bg-black/40 px-6 py-5 rounded-2xl border border-white/5 focus:outline-none focus:border-primary/40 text-white font-mono text-sm leading-relaxed transition-all placeholder:text-white/10"
            />
            <div className="mt-4 flex justify-between items-center text-[10px] uppercase font-black tracking-widest text-white/30">
              <span>Sequence Count: {keywords.split('\n').filter(k => k.trim() !== '').length}</span>
              <span>Buffer: UTF-8 / Standard</span>
            </div>
          </div>

          <AnimatePresence>
            {isProcessing && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="bg-dark-card rounded-3xl border border-white/10 p-8 relative overflow-hidden"
              >
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-black italic">PROCESSING BATCH</h3>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black text-primary">CORE_ACTIVE</span>
                    <span className="px-3 py-1 bg-primary text-black text-[10px] font-black rounded">
                      {progress.current} / {progress.total}
                    </span>
                  </div>
                </div>

                <div className="w-full bg-white/5 h-1.5 rounded-full mb-8 overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${(progress.current / progress.total) * 100}%` }}
                    className="bg-primary h-full rounded-full shadow-[0_0_10px_#C0FF00]"
                  />
                </div>

                <div className="space-y-3 font-mono text-[10px] uppercase font-black">
                  {logs.map((log, i) => (
                    <div key={i} className={cn(
                      "flex items-start gap-4 p-3 rounded bg-black/40 border-l-2",
                      log.startsWith('FAIL') ? "border-red-500 text-red-400" : 
                      log.startsWith('SUCCESS') ? "border-primary text-primary" : "border-white/10 text-white/40"
                    )}>
                      <span className="opacity-40">[{new Date().toLocaleTimeString()}]</span>
                      {log}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="space-y-8">
          <div className="bg-dark-card rounded-3xl border border-white/10 p-8">
            <h2 className="text-xs font-black uppercase tracking-[0.2em] mb-8 text-white/40">Configuration</h2>
            
            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-primary mb-3">Target Node (WP)</label>
                <select
                  value={selectedSiteId}
                  onChange={e => onSiteChange(e.target.value)}
                  disabled={isProcessing}
                  className="w-full bg-black/40 px-4 py-3 rounded border border-white/10 text-xs font-bold focus:outline-none focus:border-primary transition-all appearance-none text-white tracking-tight"
                >
                  <option value="" className="bg-dark-card">-- Select Destination --</option>
                  {sites.map(s => (
                    <option key={s.id} value={s.id} className="bg-dark-card">{s.name.toUpperCase()}</option>
                  ))}
                </select>
              </div>

              <div className="bg-white/5 p-5 rounded-2xl border border-white/5">
                <div className="flex items-center gap-2 text-primary font-black text-[10px] uppercase tracking-widest mb-3">
                  <AlertCircle className="w-4 h-4" />
                  Key Rotation System
                </div>
                <p className="text-[10px] text-white/40 leading-relaxed font-bold">
                  {apiKeys.filter(k => k.status === 'active').length > 0 
                    ? `${apiKeys.filter(k => k.status === 'active').length} Active Cores available.` 
                    : "Using System Default Core for testing."}
                </p>
              </div>

              <button
                onClick={startGeneration}
                disabled={isProcessing || !selectedSiteId || keywords.trim() === ''}
                className="w-full h-16 bg-primary text-black rounded font-black text-sm uppercase tracking-widest hover:scale-[1.02] transition-all active:scale-95 disabled:opacity-20 flex items-center justify-center gap-3 shadow-[0_0_30px_rgba(192,255,0,0.1)]"
              >
                {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 fill-current" />}
                {isProcessing ? "INITIATING..." : "START BROADCAST"}
              </button>
            </div>
          </div>

          <div className="bg-gradient-to-br from-dark-card to-black p-8 rounded-3xl border border-white/10">
            <h3 className="font-black italic text-lg mb-4 flex items-center gap-3">
              <History className="w-5 h-5 text-primary" />
              GUIDELINES
            </h3>
            <ul className="text-[10px] text-white/40 space-y-4 font-bold uppercase tracking-widest">
              <li className="flex gap-2">
                <span className="text-primary">01:</span>
                Input keywords should be specific for higher CTR.
              </li>
              <li className="flex gap-2">
                <span className="text-primary">02:</span>
                Wait for green signal before browser closing.
              </li>
              <li className="flex gap-2">
                <span className="text-primary">03:</span>
                API fail triggers automatic fallback.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
