import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Bell, BellRing, Check, Loader2, X } from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export default function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);

  // 1. Fetch notifications for current user
  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["in-app-notifications", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications" as any)
        .select("*")
        .eq("user_id", user?.id)
        .order("created_at", { ascending: false })
        .limit(30);

      if (error) throw error;
      return (data || []) as any[];
    },
  });

  // Calculate unread count
  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !n.is_read).length;
  }, [notifications]);

  // 2. Mutation: Mark single notification as read
  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications" as any)
        .update({ is_read: true } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["in-app-notifications", user?.id] });
    },
  });

  // 3. Mutation: Mark all as read
  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) return;
      const { error } = await supabase
        .from("notifications" as any)
        .update({ is_read: true } as any)
        .eq("user_id", user.id)
        .eq("is_read", false);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["in-app-notifications", user?.id] });
    },
  });

  // Handle click on notification item
  const handleNotifClick = async (notif: any) => {
    setIsOpen(false);
    if (!notif.is_read) {
      await markAsReadMutation.mutateAsync(notif.id);
    }
    if (notif.target_url) {
      navigate(notif.target_url);
    }
  };

  return (
    <div className="relative">
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "relative p-2 rounded-xl border bg-white/10 border-white/20 dark:bg-slate-900/60 dark:border-slate-800 cursor-pointer hover:bg-white/20 dark:hover:bg-slate-800 transition-all focus:outline-none flex items-center justify-center shadow-sm",
          isOpen && "bg-white/20 border-white/30 dark:bg-slate-800"
        )}
        title="Notifications"
      >
        {unreadCount > 0 ? (
          <BellRing className="h-4 w-4 text-amber-500 animate-pulse" />
        ) : (
          <Bell className="h-4 w-4 text-slate-600 dark:text-slate-300" />
        )}

        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-4.5 bg-rose-600 text-white rounded-full flex items-center justify-center px-1 text-[9px] font-black shadow-md border border-white dark:border-slate-900 animate-bounce">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel - Full Mobile & Desktop Fix */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs sm:bg-transparent sm:backdrop-blur-none"
              onClick={() => setIsOpen(false)}
            />

            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.95 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="fixed top-16 left-3 right-3 sm:absolute sm:top-full sm:right-0 sm:left-auto sm:mt-2.5 z-50 sm:w-96 max-w-md bg-slate-900 text-white border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-md"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/80">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-amber-400" />
                  <span className="text-xs font-bold text-white tracking-wide">Notifications</span>
                  {unreadCount > 0 && (
                    <span className="bg-rose-500/20 border border-rose-500/30 text-rose-300 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button
                      onClick={() => markAllAsReadMutation.mutate()}
                      disabled={markAllAsReadMutation.isPending}
                      className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-1 font-bold disabled:opacity-50 transition-colors"
                    >
                      {markAllAsReadMutation.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Check className="h-3 w-3" />
                      )}
                      Mark read
                    </button>
                  )}
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Items List */}
              <div className="max-h-[360px] overflow-y-auto divide-y divide-slate-800/60 scrollbar-thin">
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-400">
                    <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
                    <span className="text-xs font-medium">Loading alerts...</span>
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                    <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center mb-2.5">
                      <Bell className="h-5 w-5 text-slate-500" />
                    </div>
                    <p className="text-xs font-bold text-slate-200">No notifications yet!</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">All caught up with updates.</p>
                  </div>
                ) : (
                  notifications.map((notif) => {
                    const messageText = notif.message || notif.body || "";
                    const isUnread = !notif.is_read;

                    return (
                      <div
                        key={notif.id}
                        onClick={() => handleNotifClick(notif)}
                        className={cn(
                          "p-3.5 flex gap-3 items-start cursor-pointer hover:bg-slate-800/80 transition-all select-none relative group",
                          isUnread ? "bg-slate-800/40" : "bg-slate-900/60"
                        )}
                      >
                        {/* Unread indicator */}
                        {isUnread && (
                          <span className="absolute top-4 right-3.5 w-2 h-2 bg-amber-500 rounded-full shadow-[0_0_6px_#f59e0b]" />
                        )}

                        {/* Category Icon */}
                        <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 text-sm shadow-sm">
                          {notif.title?.includes("WON") ? "🎉" :
                           notif.title?.includes("LOST") ? "❌" :
                           notif.title?.includes("Urgent") || notif.title?.includes("Alert") ? "🚨" :
                           notif.title?.includes("Lead") ? "🆕" : "🔔"}
                        </div>

                        {/* Content */}
                        <div className="space-y-1 min-w-0 flex-1 pr-3">
                          <p className="font-bold text-xs text-slate-100 leading-snug">
                            {notif.title}
                          </p>
                          {messageText && (
                            <p className="text-[11px] text-slate-300 leading-normal break-words line-clamp-2">
                              {messageText}
                            </p>
                          )}
                          <p className="text-[9.5px] text-slate-400 font-semibold pt-0.5">
                            {formatDistanceToNow(parseISO(notif.created_at), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
