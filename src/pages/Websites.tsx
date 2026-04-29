import { useState, useEffect, type FormEvent } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';
import { WPWebsite } from '../types';
import { Globe, Plus, Trash2, ShieldCheck, Loader2, Link2, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

export const WebsitesPage = () => {
  const [sites, setSites] = useState<WPWebsite[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({ name: '', url: '', user: '', pass: '' });
  const [isTesting, setIsTesting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(collection(db, 'users', auth.currentUser.uid, 'websites'));
    return onSnapshot(q, (snapshot) => {
      setSites(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as WPWebsite)));
    });
  }, []);

  const addWebsite = async (e: FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    setIsTesting(true);
    setError('');

    try {
      // Basic URL validation
      const url = formData.url.replace(/\/$/, "");
      
      // Test WP connectivity via backend (or simple fetch if allowed - but usually needs basic auth)
      // Since it's WordPress REST API, we can try to fetch the site info
      const authHeader = btoa(`${formData.user}:${formData.pass}`);
      const response = await window.fetch(`${url}/wp-json/wp/v2/users/me`, {
        headers: {
          'Authorization': `Basic ${authHeader}`
        }
      });

      if (!response.ok) {
        throw new Error("Invalid credentials or REST API disabled. Make sure to use an Application Password.");
      }

      await addDoc(collection(db, 'users', auth.currentUser.uid, 'websites'), {
        name: formData.name,
        siteUrl: url,
        username: formData.user,
        appPassword: formData.pass,
        createdAt: serverTimestamp()
      });

      setFormData({ name: '', url: '', user: '', pass: '' });
      setIsAdding(false);
    } catch (err: any) {
      setError(err.message || "Failed to connect to WordPress");
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="p-10 max-w-6xl mx-auto space-y-10">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-black italic tracking-tighter uppercase">Destination Nodes</h1>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-white/40">WordPress REST API Integrations</p>
        </div>
        <button
          onClick={() => setIsAdding(!isAdding)}
          className="flex items-center gap-2 px-6 py-3 bg-primary text-black rounded font-black text-xs uppercase tracking-widest hover:scale-105 transition-transform"
        >
          {isAdding ? <ShieldCheck className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {isAdding ? "CANCEL_LINK" : "CONNECT_WP_NODE"}
        </button>
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <form onSubmit={addWebsite} className="bg-dark-card rounded-3xl border border-white/10 p-8 space-y-6 relative overflow-hidden">
               {/* Decor */}
              <div className="absolute -top-6 -right-6 text-6xl font-black text-white/[0.02] select-none uppercase italic">LINK</div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Node Identifier</label>
                  <input
                    required
                    placeholder="E.G. MAIN_GAMING_BLOG"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-black/40 px-6 py-4 rounded border border-white/5 focus:outline-none focus:border-primary/40 text-white font-bold text-sm"
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Base URI</label>
                  <input
                    required
                    type="url"
                    placeholder="HTTPS://DOMAIN.COM"
                    value={formData.url}
                    onChange={e => setFormData({ ...formData, url: e.target.value })}
                    className="w-full bg-black/40 px-6 py-4 rounded border border-white/5 focus:outline-none focus:border-primary/40 text-white font-bold text-sm"
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Admin ID</label>
                  <input
                    required
                    placeholder="USERNAME"
                    value={formData.user}
                    onChange={e => setFormData({ ...formData, user: e.target.value })}
                    className="w-full bg-black/40 px-6 py-4 rounded border border-white/5 focus:outline-none focus:border-primary/40 text-white font-bold text-sm"
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40">App Access Token</label>
                  <input
                    required
                    type="password"
                    placeholder="XXXX XXXX XXXX XXXX"
                    value={formData.pass}
                    onChange={e => setFormData({ ...formData, pass: e.target.value })}
                    className="w-full bg-black/40 px-6 py-4 rounded border border-white/5 focus:outline-none focus:border-primary/40 text-white font-bold text-sm"
                  />
                </div>
              </div>
              
              <div className="flex items-center gap-4 text-[10px] bg-white/5 text-white/40 p-4 rounded uppercase font-black tracking-widest border-l-2 border-primary">
                <ShieldCheck className="w-4 h-4 text-primary" />
                <span>Protocol: WP-REST with Application Password authentication mandated.</span>
              </div>

              {error && <div className="text-xs text-red-500 font-black uppercase tracking-widest bg-red-500/10 p-3 rounded border border-red-500/20">FAIL: {error}</div>}

              <div className="flex justify-end pt-4">
                <button
                  type="submit"
                  disabled={isTesting}
                  className="px-10 py-5 bg-primary text-black rounded font-black text-xs uppercase tracking-widest hover:scale-[1.02] transition-transform active:scale-95 disabled:opacity-20 flex items-center gap-3 shadow-[0_0_20px_rgba(192,255,0,0.1)]"
                >
                  {isTesting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isTesting ? "VALIDATING..." : "AUTHORIZE LINK"}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sites.length === 0 ? (
          <div className="col-span-full py-24 border border-dashed border-white/10 rounded-3xl flex flex-col items-center justify-center gap-4">
            <Globe className="w-12 h-12 text-white/10" />
            <p className="text-sm font-black text-white/20 uppercase tracking-[0.3em] italic text-center">No destitation nodes connected</p>
          </div>
        ) : (
          sites.map((site) => (
            <motion.div
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              key={site.id}
              className="bg-dark-card p-8 rounded-3xl border border-white/10 group relative hover:border-primary/20 transition-all"
            >
              <div className="flex items-start justify-between mb-8">
                <div className="w-14 h-14 bg-white/5 border border-white/10 flex items-center justify-center rounded-2xl group-hover:bg-primary group-hover:text-black transition-colors">
                  <Globe className="w-7 h-7" />
                </div>
                <button
                  onClick={() => deleteDoc(doc(db, 'users', auth.currentUser!.uid, 'websites', site.id))}
                  className="p-3 text-white/20 hover:text-red-500 hover:bg-black/20 rounded opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
              
              <h3 className="font-black italic text-xl tracking-tighter mb-2">{site.name.toUpperCase()}</h3>
              <div className="flex items-center gap-2 text-[10px] font-bold text-white/40 mb-8 uppercase tracking-widest italic truncate">
                <Link2 className="w-3 h-3 text-primary" />
                {site.siteUrl}
              </div>

              <div className="flex items-center justify-between pt-6 border-t border-white/5">
                <span className="text-[10px] font-black text-primary uppercase">Active_Link</span>
                <a
                  href={site.siteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 text-[10px] font-black text-white py-1 px-3 bg-white/5 rounded border border-white/10 hover:bg-white/10 transition-colors uppercase"
                >
                   Open Node <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
};
