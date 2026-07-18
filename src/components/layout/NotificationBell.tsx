import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Bell, BellRing, Check, Loader2 } from "lucide-react";
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
          "relative p-2 rounded-full border bg-white/5 border-white/10 dark:bg-slate-900/60 dark:border-slate-800 cursor-pointer hover:bg-white/10 dark:hover:bg-slate-800 transition-all focus:outline-none flex items-center justify-center",
          isOpen && "bg-white/10 border-white/20 dark:bg-slate-800"
        )}
      >
        {unreadCount > 0 ? (
          <BellRing className="h-4 w-4 text-amber-500 animate-pulse" />
        ) : (
          <Bell className="h-4 w-4 text-slate-500 dark:text-slate-400" />
        )}

        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-rose-600 dark:bg-rose-500 text-white rounded-full flex items-center justify-center px-1 text-[8.5px] font-extrabold shadow-sm">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Overlay to close when clicking outside */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />

            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.96 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="absolute right-0 mt-2.5 z-50 w-[calc(100vw-32px)] sm:w-80 bg-white dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-850 dark:text-white">Notifications</span>
                  {unreadCount > 0 && (
                    <span className="bg-rose-500/10 text-rose-500 dark:text-rose-400 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={() => markAllAsReadMutation.mutate()}
                    disabled={markAllAsReadMutation.isPending}
                    className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-semibold disabled:opacity-50"
                  >
                    {markAllAsReadMutation.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Check className="h-3 w-3" />
                    )}
                    Mark all read
                  </button>
                )}
              </div>

              {/* Items List */}
              <div className="max-h-[320px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-900">
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-400">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-xs">Loading notifications...</span>
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 flex items-center justify-center mb-2.5">
                      <Bell className="h-4.5 w-4.5 text-slate-400 dark:text-slate-600" />
                    </div>
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300">All caught up!</p>
                    <p className="text-[10px] text-slate-450 dark:text-slate-500 mt-0.5">No notifications yet.</p>
                  </div>
                ) : (
                  notifications.map((notif) => (
                    <div
                      key={notif.id}
                      onClick={() => handleNotifClick(notif)}
                      className={cn(
                        "p-3.5 flex gap-3 items-start cursor-pointer hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-all select-none relative",
                        !notif.is_read && "bg-indigo-50/10 dark:bg-indigo-950/5"
                      )}
                    >
                      {/* Unread dot */}
                      {!notif.is_read && (
                        <span className="absolute top-4.5 right-3.5 w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                      )}

                      {/* Icon container */}
                      <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center shrink-0 border border-indigo-100/30 dark:border-indigo-900/20 text-xs">
                        🔔
                      </div>

                      {/* Content */}
                      <div className="space-y-1 min-w-0 pr-2">
                        <p className="font-bold text-[11px] text-slate-850 dark:text-slate-100 leading-none">
                          {notif.title}
                        </p>
                        <p className="text-[10.5px] text-slate-500 dark:text-slate-400 leading-snug break-words">
                          {notif.body}
                        </p>
                        <p className="text-[9px] text-slate-400 dark:text-slate-500 font-medium">
                          {formatDistanceToNow(parseISO(notif.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
