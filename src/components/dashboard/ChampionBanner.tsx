import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Crown, Trophy, Star, Flame, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subMonths, getDaysInMonth, getDate } from "date-fns";

// ─── Types ────────────────────────────────────────────
interface Champion {
  id: string;
  month: string;
  category: string;
  full_name: string;
  role: string | null;
  showroom_name: string | null;
  score: number;
  avatar_url: string | null;
}

// ─── Confetti Particle ────────────────────────────────
const COLORS = ["#A6192E", "#D4AF37", "#22c55e", "#3b82f6", "#a855f7", "#f97316", "#ec4899"];

const ConfettiParticle = ({ delay, color, x }: { delay: number; color: string; x: number }) => (
  <motion.div
    className="absolute top-0 w-2 h-2 rounded-sm pointer-events-none"
    style={{ left: `${x}%`, backgroundColor: color }}
    initial={{ y: -20, opacity: 1, rotate: 0, scale: 1 }}
    animate={{
      y: ["0%", "110vh"],
      opacity: [1, 1, 0],
      rotate: [0, 360 * 3],
      scale: [1, 0.8, 0.4],
      x: [0, Math.random() * 100 - 50],
    }}
    transition={{ duration: 3.5 + Math.random() * 2, delay, ease: "easeIn" }}
  />
);

const Confetti = () => {
  const particles = Array.from({ length: 60 }, (_, i) => ({
    id: i,
    delay: i * 0.04,
    color: COLORS[i % COLORS.length],
    x: Math.random() * 100,
  }));
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-50">
      {particles.map(p => <ConfettiParticle key={p.id} {...p} />)}
    </div>
  );
};

// ─── Role Label ───────────────────────────────────────
const roleLabel = (role: string | null) => {
  if (role === "manager") return "Showroom Manager";
  if (role === "tl") return "Team Leader";
  if (role === "executive") return "Executive";
  return role || "Champion";
};

const categoryLabel = (cat: string) => {
  if (cat === "visits") return { label: "Most Visits", icon: "🗺️" };
  if (cat === "clients") return { label: "Most Clients", icon: "👥" };
  if (cat === "orders_won") return { label: "Most Orders Won", icon: "🏅" };
  return { label: cat, icon: "⭐" };
};

// ─── Race Countdown (for current month) ──────────────
export const RaceCountdown = ({ leaderName, leaderScore, myScore, category }: {
  leaderName: string; leaderScore: number; myScore: number; category: string;
}) => {
  const today = new Date();
  const totalDays = getDaysInMonth(today);
  const daysPassed = getDate(today);
  const daysLeft = totalDays - daysPassed;
  const gap = leaderScore - myScore;

  if (gap <= 0) return null; // You ARE the leader

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-orange-500/5 p-4 mt-3"
    >
      <div className="flex items-center gap-2 mb-2">
        <Flame className="h-4 w-4 text-amber-400" />
        <span className="text-xs font-bold text-amber-400 uppercase tracking-wide">Month-End Race</span>
        <span className="ml-auto text-xs font-bold text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded-full">
          {daysLeft} day{daysLeft !== 1 ? "s" : ""} left
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-2">
        <motion.div
          className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${(daysPassed / totalDays) * 100}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </div>

      <p className="text-[11px] text-[#A1A5AE]">
        <span className="text-white font-bold">{leaderName}</span> is leading with{" "}
        <span className="text-amber-400 font-bold">{leaderScore}</span> {categoryLabel(category).label.toLowerCase()}.
        You need <span className="text-white font-bold">{gap} more</span> to reach #1!
      </p>
    </motion.div>
  );
};

// ─── Hall of Fame Card ────────────────────────────────
const HofCard = ({ champion, rank }: { champion: Champion; rank: number }) => {
  const medals = ["🥇", "🥈", "🥉"];
  const cat = categoryLabel(champion.category);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: rank * 0.1 }}
      className={`relative rounded-2xl border p-4 overflow-hidden ${
        rank === 0
          ? "border-[#D4AF37]/40 bg-gradient-to-br from-[#D4AF37]/10 to-amber-900/5"
          : rank === 1
          ? "border-slate-400/30 bg-gradient-to-br from-slate-400/8 to-slate-900/5"
          : "border-orange-700/30 bg-gradient-to-br from-orange-900/10 to-orange-950/5"
      }`}
    >
      {rank === 0 && (
        <div className="absolute top-2 right-2 opacity-20">
          <Crown className="h-12 w-12 text-[#D4AF37]" />
        </div>
      )}
      <div className="flex items-center gap-3 relative z-10">
        {/* Avatar */}
        <div className={`h-10 w-10 rounded-full flex items-center justify-center text-lg font-bold shrink-0 ${
          rank === 0 ? "bg-[#D4AF37]/20 text-[#D4AF37]" :
          rank === 1 ? "bg-slate-400/20 text-slate-300" :
          "bg-orange-800/20 text-orange-400"
        }`}>
          {champion.avatar_url
            ? <img src={champion.avatar_url} className="w-full h-full rounded-full object-cover" alt="" />
            : champion.full_name.charAt(0).toUpperCase()
          }
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-base">{medals[rank] || `#${rank + 1}`}</span>
            <p className="text-sm font-bold text-[#F5F5F7] truncate">{champion.full_name}</p>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-[#A6192E]/20 text-[#A6192E]">
              {roleLabel(champion.role)}
            </span>
            {champion.showroom_name && (
              <span className="text-[9px] text-[#8E939D] truncate">{champion.showroom_name}</span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xl font-extrabold font-mono text-[#F5F5F7]">{champion.score}</p>
          <p className="text-[9px] text-[#8E939D]">{cat.icon} {cat.label}</p>
        </div>
      </div>
    </motion.div>
  );
};

// ─── Hall of Fame Section ─────────────────────────────
export const HallOfFame = () => {
  const [tab, setTab] = useState<"visits" | "clients" | "orders_won">("visits");

  const { data: champions = [] } = useQuery({
    queryKey: ["monthly-champions"],
    queryFn: async () => {
      const threeMonthsAgo = format(subMonths(new Date(), 3), "yyyy-MM");
      const { data } = await supabase
        .from("monthly_champions")
        .select("*")
        .gte("month", threeMonthsAgo)
        .order("month", { ascending: false })
        .order("score", { ascending: false });
      return (data || []) as Champion[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const tabs = [
    { key: "visits" as const, label: "Visits", icon: "🗺️" },
    { key: "clients" as const, label: "Clients", icon: "👥" },
    { key: "orders_won" as const, label: "Won", icon: "🏅" },
  ];

  const filtered = champions.filter(c => c.category === tab);
  const months = [...new Set(filtered.map(c => c.month))].slice(0, 3);

  if (champions.length === 0) return (
    <div className="rounded-2xl border border-white/5 bg-[#12141A] p-6 text-center">
      <Trophy className="h-8 w-8 text-[#D4AF37] mx-auto mb-2 opacity-50" />
      <p className="text-sm text-[#8E939D]">Hall of Fame is empty — first month-end champions will appear here!</p>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-1.5">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl text-[11px] font-bold transition-all border ${
              tab === t.key
                ? "bg-[#A6192E] text-white border-[#A6192E]"
                : "bg-white/5 text-[#A1A5AE] border-white/10 hover:bg-white/10"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Month sections */}
      {months.map(month => {
        const monthChamps = filtered.filter(c => c.month === month)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3);
        return (
          <div key={month}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#8E939D] mb-2 flex items-center gap-1.5">
              <Star className="h-3 w-3 text-[#D4AF37]" />
              {format(new Date(month + "-01"), "MMMM yyyy")}
            </p>
            <div className="space-y-2">
              {monthChamps.map((c, i) => <HofCard key={c.id} champion={c} rank={i} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── Champion Banner (main export) ───────────────────
export const ChampionBanner = () => {
  const [dismissed, setDismissed] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const hasTriggered = useRef(false);

  // Check if today is within first 3 days of a new month
  const today = new Date();
  const dayOfMonth = getDate(today);
  const isFirstDays = dayOfMonth <= 3;

  const lastMonth = format(subMonths(today, 1), "yyyy-MM");
  const dismissKey = `champion_dismissed_${lastMonth}`;

  // Check localStorage on mount
  useEffect(() => {
    if (localStorage.getItem(dismissKey) === "true") {
      setDismissed(true);
    }
  }, [dismissKey]);

  // Fetch last month's champions
  const { data: lastMonthChampions = [] } = useQuery({
    queryKey: ["last-month-champions", lastMonth],
    queryFn: async () => {
      const { data } = await supabase
        .from("monthly_champions")
        .select("*")
        .eq("month", lastMonth)
        .order("score", { ascending: false });
      return (data || []) as Champion[];
    },
    enabled: isFirstDays && !dismissed,
    staleTime: 10 * 60 * 1000,
  });

  // Trigger confetti once when champions load
  useEffect(() => {
    if (lastMonthChampions.length > 0 && !hasTriggered.current && isFirstDays && !dismissed) {
      hasTriggered.current = true;
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 5000);
    }
  }, [lastMonthChampions, isFirstDays, dismissed]);

  const handleDismiss = () => {
    localStorage.setItem(dismissKey, "true");
    setDismissed(true);
    setShowConfetti(false);
  };

  // Top champion (by visits)
  const topChampion = lastMonthChampions.find(c => c.category === "visits") ||
                      lastMonthChampions[0];

  if (!isFirstDays || dismissed || !topChampion) return null;

  return (
    <>
      {showConfetti && <Confetti />}
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ type: "spring", damping: 20, stiffness: 200 }}
          className="relative overflow-hidden rounded-2xl border border-[#D4AF37]/30 bg-gradient-to-br from-[#1A1500] via-[#1A1200] to-[#0A0B0E] p-5 shadow-2xl"
          style={{ boxShadow: "0 0 40px rgba(212,175,55,0.15)" }}
        >
          {/* Animated gold shimmer background */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
            <div className="absolute -inset-2 bg-gradient-to-r from-transparent via-[#D4AF37]/5 to-transparent animate-[shimmer_3s_linear_infinite]" />
          </div>

          {/* Dismiss */}
          <button
            onClick={handleDismiss}
            className="absolute top-3 right-3 h-6 w-6 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center z-10 transition-colors"
          >
            <X className="h-3.5 w-3.5 text-[#8E939D]" />
          </button>

          {/* Content */}
          <div className="relative z-10">
            {/* Header */}
            <div className="flex items-center gap-2 mb-4">
              <div className="h-8 w-8 rounded-full bg-[#D4AF37]/20 flex items-center justify-center">
                <Crown className="h-4 w-4 text-[#D4AF37]" />
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#D4AF37]">
                  🏆 {format(new Date(lastMonth + "-01"), "MMMM yyyy")} Champion
                </p>
                <p className="text-[10px] text-[#8E939D]">Congratulations to this month's top performer!</p>
              </div>
            </div>

            {/* Main champion */}
            <div className="flex items-center gap-4 mb-4">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-[#D4AF37]/30 to-amber-900/20 flex items-center justify-center text-2xl font-bold text-[#D4AF37] border border-[#D4AF37]/20 shrink-0 overflow-hidden">
                {topChampion.avatar_url
                  ? <img src={topChampion.avatar_url} className="w-full h-full object-cover" alt="" />
                  : topChampion.full_name.charAt(0).toUpperCase()
                }
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-lg">👑</span>
                  <h3 className="text-lg font-extrabold text-[#F5F5F7] truncate">{topChampion.full_name}</h3>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-[#A6192E]/30 text-[#A6192E] border border-[#A6192E]/30">
                    {roleLabel(topChampion.role)}
                  </span>
                  {topChampion.showroom_name && (
                    <span className="text-[10px] text-[#8E939D]">📍 {topChampion.showroom_name}</span>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-3xl font-extrabold font-mono text-[#D4AF37]">{topChampion.score}</p>
                <p className="text-[9px] text-[#8E939D]">🗺️ Visits</p>
              </div>
            </div>

            {/* Other category winners (compact) */}
            {lastMonthChampions.filter(c => c.category !== "visits").length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {lastMonthChampions.filter(c => c.category !== "visits").map(c => {
                  const cat = categoryLabel(c.category);
                  return (
                    <div key={c.id} className="flex items-center gap-1.5 bg-white/5 rounded-xl px-3 py-1.5 border border-white/5">
                      <span className="text-sm">{cat.icon}</span>
                      <div>
                        <p className="text-[10px] font-bold text-[#F5F5F7]">{c.full_name}</p>
                        <p className="text-[9px] text-[#8E939D]">{cat.label} · {c.score}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Motivation line */}
            <div className="mt-4 flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2 border border-white/5">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <p className="text-[10px] text-[#A1A5AE]">
                Will <span className="text-white font-bold">YOU</span> be next month's champion? The race has already begun! 🔥
              </p>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </>
  );
};

export default ChampionBanner;
