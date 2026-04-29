import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, signInWithGoogle, db } from './lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { LayoutDashboard, Key, Globe, FileText, Settings, PlusCircle, LogOut, Gamepad2, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { DashboardPage } from './pages/Dashboard';
import { KeywordsPage } from './pages/Keywords';
import { APIsPage } from './pages/APIs';
import { WebsitesPage } from './pages/Websites';
import { HistoryPage } from './pages/History';

// Pages
const Dashboard = DashboardPage;
const Keywords = KeywordsPage;
const APIs = APIsPage;
const Websites = WebsitesPage;
const History = HistoryPage;

const Navbar = ({ user }: { user: User }) => {
  const location = useLocation();
  const navItems = [
    { name: 'DASHBOARD', path: '/', icon: LayoutDashboard },
    { name: 'KEYWORDS', path: '/keywords', icon: PlusCircle },
    { name: 'API MANAGEMENT', path: '/apis', icon: Key },
    { name: 'WP INTEGRATION', path: '/websites', icon: Globe },
    { name: 'HISTORY', path: '/history', icon: FileText },
  ];

  return (
    <aside className="w-64 border-r border-white/10 flex flex-col p-6 h-screen sticky top-0 bg-dark-bg">
      <div className="mb-12">
        <h1 className="text-2xl font-black italic tracking-tighter">
          GCAIP<span className="text-primary">.AI</span>
        </h1>
        <p className="text-[10px] text-white/40 uppercase tracking-[0.2em] font-bold">
          Publisher Command Center
        </p>
      </div>
      
      <nav className="flex-1 space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={cn(
              "flex items-center gap-3 py-3 px-4 font-bold text-sm transition-all",
              location.pathname === item.path 
                ? "bg-white/5 rounded-lg border-l-4 border-primary text-white" 
                : "text-white/40 hover:text-white"
            )}
          >
            {item.name}
          </Link>
        ))}
      </nav>

      <div className="mt-auto space-y-4">
        <div className="bg-gradient-to-br from-dark-card to-black p-4 rounded-xl border border-white/10">
          <p className="text-[10px] font-bold text-white/40 mb-2 uppercase tracking-widest">Active User</p>
          <p className="text-sm font-bold truncate">{user.email?.split('@')[0].toUpperCase()}</p>
          <p className="text-[10px] text-primary mt-1 font-bold">MASTER ACCOUNT</p>
        </div>

        <button 
          onClick={() => auth.signOut()}
          className="flex items-center gap-3 px-4 py-3 w-full text-left text-[10px] font-black uppercase tracking-widest text-red-500 hover:text-red-400 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Terminate Session
        </button>
      </div>
    </aside>
  );
};

const Login = () => {
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handleLogin = async () => {
    setIsAuthenticating(true);
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error(error);
      setIsAuthenticating(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark-bg flex items-center justify-center p-4 overflow-hidden relative">
      {/* Watermark Decoration */}
      <div className="absolute -bottom-20 -right-20 text-[200px] font-black text-white/[0.02] pointer-events-none select-none uppercase italic">
        GCAIP
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full bg-dark-card p-12 rounded-3xl border border-white/10 text-center relative z-10"
      >
        <div className="mb-12">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center border border-primary/20">
              <Zap className="w-8 h-8 text-primary" />
            </div>
          </div>
          <h1 className="text-4xl font-black italic tracking-tighter mb-2">
            GCAIP<span className="text-primary">.AI</span>
          </h1>
          <p className="text-[10px] text-white/40 uppercase tracking-[0.3em] font-bold">
            High Performance Publisher
          </p>
        </div>
        
        <button
          onClick={handleLogin}
          disabled={isAuthenticating}
          className="w-full flex items-center justify-center gap-4 px-8 py-5 bg-primary text-black rounded font-black text-xs uppercase tracking-widest hover:scale-[1.02] transition-all active:scale-95 shadow-[0_0_20px_rgba(192,255,0,0.2)] disabled:opacity-50 disabled:cursor-wait"
        >
          {isAuthenticating ? (
            <>
              <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
              Verifying Session...
            </>
          ) : (
            <>
              <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5 invert" />
              Initialize Authentication
            </>
          )}
        </button>

        <p className="mt-8 text-[9px] text-white/20 uppercase font-bold tracking-widest">
          Secured by Google Deepmind Antigravity System
        </p>
      </motion.div>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      if (u) {
        // Sync user document
        const userRef = doc(db, 'users', u.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          await setDoc(userRef, {
            email: u.email,
            createdAt: serverTimestamp(),
          });
        }
      }
      setUser(u);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(192,255,0,0.05)_0%,transparent_70%)]" />
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative z-10 text-center"
        >
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-8 h-8 text-primary animate-pulse" />
            <h1 className="text-4xl font-black italic tracking-tighter">
              GCAIP<span className="text-primary">.AI</span>
            </h1>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="h-[2px] w-48 bg-white/5 rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-primary"
                initial={{ x: '-100%' }}
                animate={{ x: '100%' }}
                transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
              />
            </div>
            <p className="text-[10px] font-black uppercase text-white/20 tracking-[0.4em]">Establishing Secure Uplink</p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      {!user ? (
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/login" />} />
        </Routes>
      ) : (
        <div className="flex min-h-screen bg-dark-bg">
          <Navbar user={user} />
          <main className="flex-1 overflow-auto bg-dark-bg">
            <AnimatePresence mode="wait">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/keywords" element={<Keywords />} />
                <Route path="/apis" element={<APIs />} />
                <Route path="/websites" element={<Websites />} />
                <Route path="/history" element={<History />} />
                <Route path="*" element={<Navigate to="/" />} />
              </Routes>
            </AnimatePresence>
          </main>
        </div>
      )}
    </BrowserRouter>
  );
}
