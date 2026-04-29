import { useState, useEffect, useMemo, FormEvent } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, onSnapshot, orderBy, limit, addDoc, serverTimestamp } from 'firebase/firestore';
import { Article, WPWebsite } from '../types';
import { 
  FileText, ExternalLink, AlertTriangle, CheckCircle2, Search, Clock, ArrowUpRight, X, 
  Trash2, Send, CheckSquare, Square, Loader2, Globe, FileJson, Zap, Copy, Check, Plus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatDate } from '../lib/utils';
import { deleteArticle, bulkDeleteArticles, publishToWordPress } from '../lib/generator';

export const HistoryPage = () => {
  const [articles, setArticles] = useState<Article[]>([]);
  const [websites, setWebsites] = useState<WPWebsite[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set<string>());
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAddingManual, setIsAddingManual] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'html' | 'text'>('idle');

  // Manual Form State
  const [manualForm, setManualForm] = useState({
    title: '',
    keyword: '',
    content: '',
    status: 'draft' as Article['status'],
    websiteId: ''
  });

  useEffect(() => {
    if (!auth.currentUser) return;
    
    const unsubArticles = onSnapshot(
      query(
        collection(db, 'users', auth.currentUser.uid, 'articles'),
        orderBy('createdAt', 'desc'),
        limit(100)
      ), 
      (snapshot) => {
        setArticles(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Article)));
      }
    );

    const unsubWebsites = onSnapshot(
      query(collection(db, 'users', auth.currentUser.uid, 'websites')), 
      (snapshot) => {
        setWebsites(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as WPWebsite)));
      }
    );

    return () => {
      unsubArticles();
      unsubWebsites();
    };
  }, []);

  const filteredArticles = useMemo(() => {
    return articles.filter(a => {
      const matchesSearch = a.keyword?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           a.title?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFilter = filter === 'all' || a.status === filter;
      return matchesSearch && matchesFilter;
    });
  }, [articles, searchTerm, filter]);

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredArticles.length) {
      setSelectedIds(new Set<string>());
    } else {
      setSelectedIds(new Set(filteredArticles.map(a => a.id)));
    }
  };

  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const handleDelete = async (ids: string[]) => {
    if (!auth.currentUser || ids.length === 0) return;
    
    // For bulk deletes or if confirmingId is already set for the single id
    const isSingle = ids.length === 1;
    const singleId = isSingle ? ids[0] : null;

    if (isSingle && confirmingId !== singleId) {
      setConfirmingId(singleId);
      // Auto-reset confirmation after 3 seconds
      setTimeout(() => setConfirmingId(prev => prev === singleId ? null : prev), 3000);
      return;
    }

    if (!isSingle && !window.confirm(`Are you sure you want to delete ${ids.length} articles?`)) {
      return;
    }

    const uid = auth.currentUser.uid;
    setIsProcessing(true);
    setDeletingIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.add(id));
      return next;
    });

    try {
      if (isSingle) {
        await deleteArticle(uid, ids[0]);
        setConfirmingId(null);
      } else {
        await bulkDeleteArticles(uid, ids);
      }
      
      const nextSelected = new Set((Array.from(selectedIds) as string[]).filter(id => !ids.includes(id)));
      setSelectedIds(nextSelected);
      
      if (selectedArticle && ids.includes(selectedArticle.id)) {
        setSelectedArticle(null);
      }
    } catch (err) {
      console.error("Delete operation failed:", err);
      // More descriptive error if it's a JSON string
      let errorMessage = "Operation failed. The database might be out of sync. Please refresh.";
      try {
        if (err instanceof Error && err.message.startsWith('{')) {
          const parsed = JSON.parse(err.message);
          errorMessage = `Delete Failed: ${parsed.error}`;
        }
      } catch (e) {}
      alert(errorMessage);
    } finally {
      setIsProcessing(false);
      setDeletingIds(prev => {
        const next = new Set(prev);
        ids.forEach(id => next.delete(id));
        return next;
      });
    }
  };

  const handleBulkPublish = async () => {
    if (!auth.currentUser || selectedIds.size === 0) return;
    const uid = auth.currentUser.uid;
    setIsProcessing(true);
    const ids = Array.from(selectedIds) as string[];
    
    try {
      for (const id of ids) {
        const article = articles.find(a => a.id === id);
        if (!article || article.status === 'published') continue;
        
        const site = websites.find(s => s.id === article.websiteId);
        if (!site) continue;

        await publishToWordPress(uid, id, {
          siteUrl: site.siteUrl,
          siteUser: site.username,
          sitePass: site.appPassword
        });
      }
    } catch (err) {
      console.error("Bulk publish error:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManualAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    setIsProcessing(true);
    try {
      await addDoc(collection(db, 'users', auth.currentUser.uid, 'articles'), {
        ...manualForm,
        createdAt: serverTimestamp(),
        slug: manualForm.title.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, ''),
        metaDescription: manualForm.content.substring(0, 160) + '...',
      });
      setIsAddingManual(false);
      setManualForm({ title: '', keyword: '', content: '', status: 'draft', websiteId: '' });
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const copyToClipboard = (text: string, type: 'html' | 'text') => {
    navigator.clipboard.writeText(text);
    setCopyStatus(type);
    setTimeout(() => setCopyStatus('idle'), 2000);
  };

  const websitesMap = useMemo(() => {
    return websites.reduce((acc, site) => {
      acc[site.id] = site;
      return acc;
    }, {} as Record<string, WPWebsite>);
  }, [websites]);

  return (
    <div className="p-10 max-w-6xl mx-auto space-y-10 pb-32">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-black italic tracking-tighter uppercase">Broadcast History</h1>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-white/40">Archive of Generated Content Assets</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <button 
            onClick={() => setIsAddingManual(true)}
            className="px-6 py-3 bg-white/5 border border-white/10 rounded font-bold text-[10px] uppercase tracking-widest text-white hover:bg-white/10 transition-all flex items-center gap-2"
          >
            <Plus className="w-4 h-4 text-primary" /> Manual_Entry
          </button>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-white/20" />
            <input
              placeholder="SEARCH_CLUSTERS..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-12 pr-6 py-3 bg-black/40 border border-white/5 rounded font-bold text-xs focus:outline-none focus:border-primary/40 text-white w-full sm:w-64 placeholder:text-white/10 uppercase tracking-widest"
            />
          </div>
          <select
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="px-6 py-3 bg-black/40 border border-white/5 rounded font-bold text-xs focus:outline-none focus:border-primary/40 text-white uppercase tracking-widest cursor-pointer appearance-none"
          >
            <option value="all" className="bg-dark-card uppercase">ALL_STATUS</option>
            <option value="published" className="bg-dark-card uppercase">PUBLISHED</option>
            <option value="draft" className="bg-dark-card uppercase">DEFERRED</option>
            <option value="error" className="bg-dark-card uppercase">FAILURE</option>
          </select>
        </div>
      </div>

      <div className="space-y-4">
        {filteredArticles.length > 0 && (
           <div className="flex items-center justify-between px-6 py-2">
             <button 
                onClick={toggleSelectAll}
                className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors"
             >
                {selectedIds.size === filteredArticles.length ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4 text-white/20" />}
                {selectedIds.size === filteredArticles.length ? 'Deselect All' : 'Select All Filtered'}
             </button>
             <span className="text-[10px] font-black text-white/20 tracking-widest">{selectedIds.size} SELECTED</span>
           </div>
        )}

        {filteredArticles.length === 0 ? (
          <div className="py-32 text-center border border-dashed border-white/10 rounded-3xl">
              <p className="text-sm font-black text-white/20 uppercase tracking-[0.4em] italic">No archived records detected in current filter</p>
          </div>
        ) : (
          filteredArticles.map((article, i) => (
            <motion.div
              layout
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              key={article.id}
              className={cn(
                "bg-dark-card p-6 rounded-2xl border transition-all flex flex-col md:flex-row md:items-center gap-6 relative overflow-hidden",
                selectedIds.has(article.id) ? "border-primary/40 bg-primary/5" : "border-white/10 group hover:border-primary/20"
              )}
            >
              <button 
                onClick={() => toggleSelect(article.id)}
                className="flex-shrink-0 z-10"
              >
                {selectedIds.has(article.id) ? (
                  <CheckSquare className="w-5 h-5 text-primary" />
                ) : (
                  <Square className="w-5 h-5 text-white/10 group-hover:text-white/20 transition-colors" />
                )}
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                   <StatusBadge status={article.status} />
                   <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">
                     {article.createdAt ? formatDate((article.createdAt as any).toDate()) : 'INITIATED'}
                   </span>
                   {article.websiteId && websitesMap[article.websiteId] && (
                     <span className="text-[10px] font-bold text-primary/40 uppercase tracking-widest flex items-center gap-1">
                       <Globe className="w-3 h-3" /> {websitesMap[article.websiteId].name}
                     </span>
                   )}
                </div>
                <h3 className="font-black italic text-lg tracking-tight truncate group-hover:text-primary transition-colors">
                  {(article.title || article.keyword || 'UNTITLED').toUpperCase()}
                </h3>
                <div className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-1 opacity-60">
                   Extraction Seed: {article.keyword || 'MANUAL_ENTRY'}
                </div>
              </div>

              <div className="flex items-center gap-3">
                {article.status === 'published' && article.wpUrl && (
                  <a 
                    href={article.wpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-3 bg-white/5 border border-white/10 text-white rounded hover:bg-primary hover:text-black transition-all"
                    title="Open Destination Node"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
                {article.status !== 'published' && article.websiteId && (
                  <button 
                    onClick={() => {
                      const site = websitesMap[article.websiteId];
                      if (site && auth.currentUser) {
                        const uid = auth.currentUser.uid;
                        publishToWordPress(uid, article.id, {
                          siteUrl: site.siteUrl,
                          siteUser: site.username,
                          sitePass: site.appPassword
                        });
                      }
                    }}
                    className="p-3 bg-primary/10 border border-primary/20 text-primary rounded hover:bg-primary hover:text-black transition-all"
                    title="Attempt Re-Publish"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                )}
                <button 
                  onClick={() => setSelectedArticle(article)}
                  className="p-3 bg-white/5 border border-white/10 text-white/40 rounded hover:bg-white/10 hover:text-white transition-all flex items-center gap-2 font-black text-[10px] uppercase tracking-widest"
                >
                   Preview <ArrowUpRight className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => handleDelete([article.id])}
                  disabled={isProcessing || deletingIds.has(article.id)}
                  className={cn(
                    "p-3 rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed group/del flex items-center gap-2",
                    confirmingId === article.id 
                      ? "bg-red-500 text-white" 
                      : "bg-red-500/5 border border-red-500/10 text-red-500/40 hover:bg-red-500/20 hover:text-red-500"
                  )}
                >
                  {deletingIds.has(article.id) ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : confirmingId === article.id ? (
                    <span className="text-[9px] font-black uppercase whitespace-nowrap">CONFIRM?</span>
                  ) : (
                    <Trash2 className="w-4 h-4 group-hover/del:scale-110 transition-transform" />
                  )}
                </button>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Manual Entry Modal */}
      <AnimatePresence>
        {isAddingManual && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddingManual(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.form
              onSubmit={handleManualAdd}
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-dark-card border border-white/10 rounded-[40px] p-10 flex flex-col gap-6 shadow-2xl"
            >
              <h2 className="text-3xl font-black italic tracking-tighter text-primary">MANUAL_ASSET_ENTRY</h2>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-white/40 tracking-widest">Article Title</label>
                    <input 
                      required
                      value={manualForm.title}
                      onChange={e => setManualForm({...manualForm, title: e.target.value})}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-primary/40 outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-white/40 tracking-widest">Seed Keyword</label>
                    <input 
                      value={manualForm.keyword}
                      onChange={e => setManualForm({...manualForm, keyword: e.target.value})}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-primary/40 outline-none"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-white/40 tracking-widest">Target Node</label>
                  <select 
                    required
                    value={manualForm.websiteId}
                    onChange={e => setManualForm({...manualForm, websiteId: e.target.value})}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-primary/40 outline-none appearance-none"
                  >
                    <option value="">-- No Destination Node --</option>
                    {websites.map(s => <option key={s.id} value={s.id}>{s.name.toUpperCase()}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-white/40 tracking-widest">Content (HTML Supported)</label>
                  <textarea 
                    required
                    rows={8}
                    value={manualForm.content}
                    onChange={e => setManualForm({...manualForm, content: e.target.value})}
                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm font-mono focus:border-primary/40 outline-none resize-none"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-4 mt-4">
                <button 
                  type="button" 
                  onClick={() => setIsAddingManual(false)}
                  className="px-6 py-3 text-[10px] font-black uppercase text-white/20 hover:text-white"
                >
                  CANCEL_INIT
                </button>
                <button 
                  type="submit"
                  disabled={isProcessing}
                  className="px-8 py-3 bg-primary text-black rounded-xl font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-transform flex items-center gap-2"
                >
                  {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckSquare className="w-4 h-4" />}
                  COMMIT_TO_HISTORY
                </button>
              </div>
            </motion.form>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Bulk Actions */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 z-40 bg-dark-card border border-primary/20 shadow-[0_0_50px_rgba(192,255,0,0.1)] p-4 rounded-3xl flex items-center gap-6 min-w-[400px] backdrop-blur-xl"
          >
            <div className="pl-4 border-r border-white/10 pr-6">
              <span className="text-[10px] font-black uppercase tracking-tighter text-primary">{selectedIds.size} ITEMS_STAGED</span>
            </div>
            
            <div className="flex-1 flex gap-3">
              <button 
                onClick={handleBulkPublish}
                disabled={isProcessing}
                className="flex-1 px-6 py-3 bg-primary text-black rounded-xl font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-transform flex items-center justify-center gap-2"
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                BROADCAST_ALL
              </button>
              <button 
                onClick={() => handleDelete(Array.from(selectedIds))}
                disabled={isProcessing}
                className="px-6 py-3 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                ERASE
              </button>
            </div>
            
            <button 
              onClick={() => setSelectedIds(new Set<string>())}
              className="p-3 text-white/20 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Asset Preview Modal */}
      <AnimatePresence>
        {selectedArticle && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedArticle(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-5xl max-h-[90vh] bg-dark-bg border border-white/10 rounded-3xl overflow-hidden flex flex-col shadow-2xl"
            >
              <div className="p-8 border-b border-white/10 flex items-center justify-between bg-dark-card relative">
                <div className="absolute top-0 left-0 w-1 bg-primary h-full" />
                <div className="flex-1 pr-10">
                  <div className="flex items-center gap-3 mb-2">
                    <StatusBadge status={selectedArticle.status} />
                    <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">Asset Preview Instance</span>
                  </div>
                  <h2 className="text-2xl font-black italic tracking-tighter uppercase text-primary leading-tight">
                    {selectedArticle.title}
                  </h2>
                  <div className="flex flex-wrap gap-4 mt-3">
                    <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest flex items-center gap-1.5 px-3 py-1 bg-white/5 rounded-full border border-white/5">
                      <FileText className="w-3 h-3" /> {selectedArticle.content?.split(' ').length || 0} WORDS
                    </div>
                    <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest flex items-center gap-1.5 px-3 py-1 bg-white/5 rounded-full border border-white/5">
                      <Zap className="w-3 h-3" /> SEED: {selectedArticle.keyword || 'MANUAL'}
                    </div>
                    {selectedArticle.wpPostId && (
                      <div className="text-[10px] font-bold text-primary/40 uppercase tracking-widest flex items-center gap-1.5 px-3 py-1 bg-primary/5 rounded-full border border-primary/10">
                        <Globe className="w-3 h-3" /> WP_ID: {selectedArticle.wpPostId}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                   <button 
                    onClick={() => copyToClipboard(selectedArticle.content, 'html')}
                    className="p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all text-white/40 hover:text-primary flex items-center gap-2 font-black text-[9px] uppercase tracking-widest border border-white/5"
                   >
                     {copyStatus === 'html' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                     {copyStatus === 'html' ? 'COPIED' : 'COPY_HTML'}
                   </button>
                   <button 
                    onClick={() => setSelectedArticle(null)}
                    className="p-4 hover:bg-white/5 rounded-full transition-colors text-white/40 hover:text-white flex-shrink-0"
                   >
                     <X className="w-8 h-8" />
                   </button>
                </div>
              </div>

              <div className="flex-1 flex overflow-hidden">
                <div className="w-64 border-r border-white/5 bg-black/20 p-8 hidden lg:block space-y-8 overflow-auto">
                   <div>
                     <h4 className="text-[9px] font-black text-white/20 uppercase tracking-[0.3em] mb-4">Meta Data</h4>
                     <div className="space-y-4">
                        <div>
                          <p className="text-[8px] text-white/40 uppercase mb-1">Slug Instance</p>
                          <p className="text-[10px] font-mono text-primary/60 break-all">{selectedArticle.slug || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-[8px] text-white/40 uppercase mb-1">Description Buffer</p>
                          <p className="text-[10px] text-white/60 leading-relaxed font-medium italic">{selectedArticle.metaDescription || 'No meta generated'}</p>
                        </div>
                     </div>
                   </div>

                   {selectedArticle.schemaMarkup && (
                     <div>
                       <h4 className="text-[9px] font-black text-white/20 uppercase tracking-[0.3em] mb-4 flex items-center gap-2">
                         <FileJson className="w-3 h-3" /> Schema_Sync
                       </h4>
                       <div className="p-3 bg-black/40 border border-white/5 rounded-xl font-mono text-[9px] text-white/30 max-h-48 overflow-auto">
                          {selectedArticle.schemaMarkup}
                       </div>
                     </div>
                   )}
                </div>

                <div className="flex-1 overflow-auto p-12 bg-dark-bg/50">
                  <div className="max-w-3xl mx-auto">
                    <div className="prose prose-invert prose-primary max-w-none 
                      prose-headings:italic prose-headings:font-black prose-headings:tracking-tighter prose-headings:uppercase
                      prose-p:text-white/70 prose-p:leading-relaxed prose-p:text-lg
                      prose-strong:text-primary prose-strong:font-black
                      prose-li:text-white/60
                      prose-h2:text-3xl prose-h2:border-b prose-h2:border-white/10 prose-h2:pb-4 prose-h2:mt-16
                      prose-h3:text-xl prose-h3:mt-10
                    ">
                      <div dangerouslySetInnerHTML={{ __html: selectedArticle.content }} />
                    </div>

                    {selectedArticle.status === 'error' && selectedArticle.error && (
                      <div className="mt-16 p-8 bg-red-500/5 border border-red-500/20 rounded-3xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                          <AlertTriangle className="w-16 h-16 text-red-500" />
                        </div>
                        <p className="text-xs font-black text-red-500 uppercase tracking-[0.3em] mb-4 flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4" /> FAILURE_DIAGNOSTICS:
                        </p>
                        <p className="text-sm font-mono text-red-400 leading-relaxed break-words relative z-10">{selectedArticle.error}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-white/10 bg-dark-card flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => handleDelete([selectedArticle.id])}
                    disabled={isProcessing || deletingIds.has(selectedArticle.id)}
                    className={cn(
                      "p-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2",
                      confirmingId === selectedArticle.id
                        ? "bg-red-500 text-white"
                        : "text-red-500/40 hover:text-red-500 hover:bg-red-500/10"
                    )}
                  >
                    {deletingIds.has(selectedArticle.id) ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : confirmingId === selectedArticle.id ? (
                      <span className="text-[10px] font-black uppercase">CONFIRM_DELETE?</span>
                    ) : (
                      <Trash2 className="w-5 h-5" />
                    )}
                  </button>
                </div>
                <div className="flex gap-4">
                  <button 
                    onClick={() => setSelectedArticle(null)}
                    className="px-8 py-3 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white"
                  >
                    CLOSE_NODE
                  </button>
                  {selectedArticle.status === 'published' && selectedArticle.wpUrl ? (
                    <a 
                      href={selectedArticle.wpUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-8 py-3 bg-primary text-black rounded-xl font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-transform flex items-center gap-2"
                    >
                      <Globe className="w-4 h-4" /> VIEW_ON_SITE
                    </a>
                  ) : selectedArticle.websiteId && websitesMap[selectedArticle.websiteId] && (
                    <button 
                      onClick={() => {
                        const site = websitesMap[selectedArticle.websiteId!];
                        if (site && auth.currentUser) {
                          const uid = auth.currentUser.uid;
                          publishToWordPress(uid, selectedArticle.id, {
                            siteUrl: site.siteUrl,
                            siteUser: site.username,
                            sitePass: site.appPassword
                          });
                        }
                      }}
                      className="px-8 py-3 bg-primary text-black rounded-xl font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-transform flex items-center gap-2"
                    >
                      <Send className="w-4 h-4" /> BROADCAST_NOW
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="pt-10 border-t border-white/10 flex flex-col md:flex-row justify-between text-[9px] font-bold text-white/20 uppercase tracking-widest gap-4">
        <div className="flex gap-6">
           <span>Total Record Count: {articles.length}</span>
           <span>Filter Success Rate: {Math.round((articles.filter(a => a.status === 'published').length / (articles.length || 1)) * 100)}%</span>
           <span>Filtered View: {filteredArticles.length} Nodes</span>
        </div>
        <div className="italic">Auth Instance: {auth.currentUser?.email} [READ_WRITE_ACTIVE]</div>
      </div>
    </div>
  );
};

const StatusBadge = ({ status }: { status: Article['status'] }) => {
  const configs = {
    published: { color: 'bg-primary/20 text-primary border-primary/20', text: 'Live_Node' },
    draft: { color: 'bg-blue-500/20 text-blue-400 border-blue-500/20', text: 'Staged' },
    scheduled: { color: 'bg-purple-500/20 text-purple-400 border-purple-500/20', text: 'Queued' },
    error: { color: 'bg-red-500/20 text-red-500 border-red-500/20', text: 'Fail' },
  };

  const config = configs[status] || configs.draft;

  return (
    <span className={cn(
      "px-2 py-0.5 rounded border text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5",
      config.color
    )}>
      <div className={cn("w-1 h-1 rounded-full animate-pulse", status === 'published' ? 'bg-primary' : status === 'error' ? 'bg-red-500' : 'bg-blue-400')} />
      {config.text}
    </span>
  );
};
