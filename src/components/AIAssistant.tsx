import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, X, Send, Sparkles, RefreshCw, ChevronDown } from "lucide-react";
import { toast } from "sonner";

interface Message {
  role: "user" | "model";
  text: string;
  timestamp: Date;
}

const QUICK_QUESTIONS: Record<string, string[]> = {
  executive: [
    "How many site visits for measurements did I do this week?",
    "Which clients are waiting for a glass quotation?",
    "Show my glass installation pipeline summary",
    "Which architect should I follow up with today?",
  ],
  manager: [
    "Which executive closed the most glass interiors this month?",
    "Show pending installations & WOS in my showroom",
    "What is our conversion rate with architects?",
    "Which high-value leads have been inactive?",
  ],
  md: [
    "Overall glass & art pipeline across all showrooms",
    "Which showroom is performing the best?",
    "Total revenue from glass installations this month",
    "How many active WOS items are there across the company?",
  ],
  admin: [
    "Overall glass & art pipeline across all showrooms",
    "Which showroom needs immediate attention?",
    "Total won vs lost projects this month",
    "Show executive performance comparison",
  ],
};

const TypingIndicator = () => (
  <div className="flex items-center gap-1 px-4 py-3">
    {[0, 1, 2].map((i) => (
      <motion.div
        key={i}
        className="h-2 w-2 rounded-full bg-primary/60"
        animate={{ scale: [1, 1.4, 1], opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.2 }}
      />
    ))}
  </div>
);

export const AIAssistant = () => {
  const { user, role } = useAuth();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const effectiveRole = role === "md" ? "md" : role === "admin" ? "admin" : role === "manager" ? "manager" : "executive";
  const suggestions = QUICK_QUESTIONS[effectiveRole] || QUICK_QUESTIONS.executive;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 300);
  }, [open]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading || !user) return;

    const userMsg: Message = { role: "user", text: text.trim(), timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setShowSuggestions(false);

    try {
      const history = messages.slice(-6).map((m) => ({ role: m.role, text: m.text }));

      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: { question: text.trim(), history },
      });

      if (error) throw new Error(error.message || "Failed to get response");
      if (data?.error) throw new Error(data.error);

      setMessages((prev) => [
        ...prev,
        { role: "model", text: data.answer || "I couldn't process your request.", timestamp: new Date() },
      ]);
    } catch (e: any) {
      toast.error("AI Assistant: " + (e.message || "Something went wrong"));
      setMessages((prev) => [
        ...prev,
        { role: "model", text: "Sorry, I couldn't process your request. Please try again.", timestamp: new Date() },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setShowSuggestions(true);
    setInput("");
  };

  const roleLabel = effectiveRole === "md" ? "MD" : effectiveRole.charAt(0).toUpperCase() + effectiveRole.slice(1);

  return (
    <>
      {/* Floating Button - Art & Glass Animated Logo */}
      <motion.button
        onClick={() => setOpen(true)}
        className={`fixed bottom-[164px] right-4 z-50 h-14 w-14 rounded-2xl shadow-2xl flex items-center justify-center transition-all overflow-hidden ${open ? "opacity-0 pointer-events-none scale-75" : "opacity-100 scale-100"}`}
        style={{
          background: "linear-gradient(135deg, rgba(160, 20, 30, 0.9) 0%, rgba(30, 10, 15, 0.9) 100%)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(255, 70, 70, 0.3)"
        }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        title="Art & Glass AI"
      >
        {/* Animated Glass Shards/Layers */}
        <motion.div className="absolute inset-0 flex items-center justify-center mix-blend-screen opacity-70">
          <motion.div
            animate={{ rotate: 360, scale: [1, 1.1, 1] }}
            transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
            className="absolute w-8 h-8 border border-red-400/40 rounded-lg bg-gradient-to-tr from-red-500/20 to-transparent"
            style={{ transform: "rotate(15deg)" }}
          />
          <motion.div
            animate={{ rotate: -360, scale: [1.1, 1, 1.1] }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
            className="absolute w-8 h-8 border border-orange-400/30 rounded-lg bg-gradient-to-bl from-orange-500/20 to-transparent"
            style={{ transform: "rotate(45deg)" }}
          />
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
            className="absolute w-6 h-6 border-4 border-t-red-400/50 border-r-transparent border-b-rose-400/50 border-l-transparent rounded-full"
          />
        </motion.div>

        {/* Shine Sweep Effect */}
        <motion.div
           className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/30 to-transparent"
           animate={{ x: ['-200%', '200%'] }}
           transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", repeatDelay: 2 }}
        />

        <Sparkles className="h-5 w-5 text-red-100 z-10 drop-shadow-[0_0_8px_rgba(255,200,200,0.8)]" />
      </motion.button>

      {/* Chat Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 32, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 32, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="fixed bottom-[90px] right-4 z-50 w-[360px] max-w-[calc(100vw-32px)] h-[560px] max-h-[calc(100vh-120px)] flex flex-col rounded-3xl overflow-hidden shadow-2xl border border-white/10"
            style={{
              background: "linear-gradient(145deg, rgba(15,15,30,0.97) 0%, rgba(20,16,40,0.97) 100%)",
              backdropFilter: "blur(20px)",
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/10"
              style={{ background: "linear-gradient(90deg, #a0141e 0%, #7d0a14 100%)" }}>
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-xl bg-white/20 flex items-center justify-center">
                  <Bot className="h-4.5 w-4.5 text-white" />
                </div>
                <div>
                  <p className="text-white font-bold text-sm leading-tight">Art & Glass AI</p>
                  <p className="text-white/70 text-[10px]">{roleLabel} • Assistant</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <button onClick={clearChat} title="Clear chat"
                    className="h-8 w-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                    <RefreshCw className="h-3.5 w-3.5 text-white/80" />
                  </button>
                )}
                <button onClick={() => setOpen(false)}
                  className="h-8 w-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                  <X className="h-4 w-4 text-white" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3 scrollbar-thin">
              {/* Welcome message */}
              {messages.length === 0 && (
                <div className="text-center px-4 py-6">
                  <div className="h-14 w-14 rounded-2xl mx-auto mb-3 flex items-center justify-center relative overflow-hidden"
                    style={{ background: "linear-gradient(135deg, rgba(160, 20, 30, 0.9) 0%, rgba(30, 10, 15, 0.9) 100%)" }}>
                    <div className="absolute inset-0 bg-gradient-to-tr from-red-500/20 to-transparent transform rotate-12" />
                    <Sparkles className="h-7 w-7 text-red-100 z-10" />
                  </div>
                  <p className="text-white/90 font-semibold text-sm">Hello! I'm Art & Glass AI.</p>
                  <p className="text-white/50 text-xs mt-1">Ask me anything about your sales data, pipeline, or performance.</p>
                </div>
              )}

              {/* Message bubbles */}
              {messages.map((msg, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} gap-2`}
                >
                  {msg.role === "model" && (
                    <div className="h-7 w-7 rounded-xl shrink-0 flex items-center justify-center mt-0.5"
                      style={{ background: "linear-gradient(135deg, #a0141e 0%, #7d0a14 100%)" }}>
                      <Bot className="h-3.5 w-3.5 text-white" />
                    </div>
                  )}
                  <div className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${msg.role === "user"
                      ? "bg-red-700 text-white rounded-tr-sm"
                      : "bg-white/10 text-white/90 rounded-tl-sm border border-white/10"
                    }`}>
                    {msg.text}
                  </div>
                </motion.div>
              ))}

              {/* Typing indicator */}
              {loading && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-2">
                  <div className="h-7 w-7 rounded-xl shrink-0 flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg, #a0141e 0%, #7d0a14 100%)" }}>
                    <Bot className="h-3.5 w-3.5 text-white" />
                  </div>
                  <div className="bg-white/10 rounded-2xl rounded-tl-sm border border-white/10">
                    <TypingIndicator />
                  </div>
                </motion.div>
              )}

              <div ref={bottomRef} />
            </div>

            {/* Quick Suggestions */}
            <AnimatePresence>
              {showSuggestions && !loading && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="px-3 pb-2 border-t border-white/10 pt-2"
                >
                  <div className="flex items-center gap-1 mb-2">
                    <p className="text-white/40 text-[10px] uppercase tracking-wider font-semibold">Quick Questions</p>
                    <button onClick={() => setShowSuggestions(false)} className="ml-auto text-white/30 hover:text-white/60">
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {suggestions.slice(0, 3).map((q) => (
                      <button
                        key={q}
                        onClick={() => sendMessage(q)}
                        className="text-[10px] px-2.5 py-1.5 rounded-full border border-red-500/40 text-red-300 hover:bg-red-500/20 transition-colors leading-tight text-left"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input */}
            <div className="px-3 pb-4 pt-2 border-t border-white/10">
              <form
                onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
                className="flex items-center gap-2 bg-white/10 rounded-2xl px-3 py-2 border border-white/10 focus-within:border-red-500/50 transition-colors"
              >
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask anything about your data..."
                  disabled={loading}
                  className="flex-1 bg-transparent text-white/90 text-sm placeholder:text-white/30 outline-none disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || loading}
                  className="h-8 w-8 rounded-xl flex items-center justify-center transition-all disabled:opacity-30"
                  style={{ background: "linear-gradient(135deg, #a0141e 0%, #7d0a14 100%)" }}
                >
                  <Send className="h-3.5 w-3.5 text-white" />
                </button>
              </form>
              <p className="text-white/20 text-[9px] text-center mt-2">Powered by Gemini AI • Your data stays private</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default AIAssistant;
