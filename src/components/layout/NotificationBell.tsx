import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Bell, BellRing, Check, Loader2, X, Trash2 } from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import { ReportDetailModal, NotificationRecord } from "./ReportDetailModal";
import { recordNotificationOpened } from "@/lib/notificationDelivery";

export default function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedNotif, setSelectedNotif] = useState<NotificationRecord | null>(null);

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
    refetchInterval: 5000,
    staleTime: 0,
  });

  // Defensive UI dedupe for legacy rows created before backend idempotency was
  // introduced. Keep the newest copy when identical content was generated
  // within five minutes (the common app-open/server double-trigger window).
  const displayNotifications = useMemo(() => {
    const seen = new Map<string, number>();
    return notifications.filter((notif: any) => {
      const message = notif.message || notif.body || "";
      const target = notif.target_url || notif.deep_link || notif.data?.targetUrl || "";
      const key = `${notif.title || ""}|${message}|${target}`;
      const timestamp = new Date(notif.created_at || 0).getTime();
      const previous = seen.get(key);
      if (previous !== undefined && Math.abs(previous - timestamp) <= 5 * 60 * 1000) return false;
      seen.set(key, timestamp);
      return true;
    });
  }, [notifications]);

  // Calculate unread count
  const unreadCount = useMemo(() => {
    return displayNotifications.filter((n) => !n.is_read).length;
  }, [displayNotifications]);

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
      toast.success("All marked as read");
    },
  });

  // 4. Mutation: Clear All Notifications
  const clearAllNotificationsMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) return;
      const { error } = await supabase
        .from("notifications" as any)
        .delete()
        .eq("user_id", user.id);

      if (error) {
        // Fallback if RLS restricts delete: mark all as read
        await supabase
          .from("notifications" as any)
          .update({ is_read: true } as any)
          .eq("user_id", user.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["in-app-notifications", user?.id] });
      toast.success("Notifications cleared!");
    },
  });

  // Handle click on notification item
  const handleNotifClick = async (notif: any) => {
    setIsOpen(false);
    if (!notif.is_read) {
      await markAsReadMutation.mutateAsync(notif.id);
    }
    await recordNotificationOpened(notif, user?.id);
    // Normalize legacy rows: older database records used `body` while the
    // report dialog expected `message`, which produced an empty dark box.
    setSelectedNotif({
      ...notif,
      message: notif.message || notif.body || notif.data?.body || "Notification details are unavailable.",
      target_url: notif.target_url || notif.deep_link || notif.data?.targetUrl || "/notifications",
      data: notif.data || notif.metadata || {},
    });
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
              className="fixed inset-0 z-[999998] bg-black/40 backdrop-blur-xs sm:bg-black/20"
              onClick={() => setIsOpen(false)}
            />

            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.95 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="fixed top-14 left-2 right-2 sm:top-16 sm:right-6 sm:left-auto sm:w-96 max-w-md z-[999999] bg-slate-900 text-white border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-md"
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
                      title="Mark all as read"
                    >
                      {markAllAsReadMutation.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Check className="h-3 w-3" />
                      )}
                      Mark read
                    </button>
                  )}
                  {displayNotifications.length > 0 && (
                    <button
                      onClick={() => clearAllNotificationsMutation.mutate()}
                      disabled={clearAllNotificationsMutation.isPending}
                      className="text-[10px] text-rose-400 hover:text-rose-300 flex items-center gap-1 font-bold disabled:opacity-50 transition-colors ml-1"
                      title="Clear all notifications"
                    >
                      {clearAllNotificationsMutation.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                      Clear
                    </button>
                  )}
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors ml-1"
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
                ) : displayNotifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                    <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center mb-2.5">
                      <Bell className="h-5 w-5 text-slate-500" />
                    </div>
                    <p className="text-xs font-bold text-slate-200">No notifications yet!</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">All caught up with updates.</p>
                  </div>
                ) : (
                  displayNotifications.map((notif) => {
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

              {/* Footer View All Link */}
              <div className="p-2 border-t border-slate-800 bg-slate-950/90 text-center">
                <button
                  onClick={() => { setIsOpen(false); navigate("/notifications"); }}
                  className="text-xs font-bold text-amber-400 hover:text-amber-300 w-full py-1 rounded-lg transition-colors cursor-pointer"
                >
                  View All Notifications →
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Interactive Full Report & Decision Modal */}
      <ReportDetailModal
        notification={selectedNotif}
        isOpen={!!selectedNotif}
        onClose={() => setSelectedNotif(null)}
      />
    </div>
  );
}
