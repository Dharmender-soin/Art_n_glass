import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import {
  Bell, Check, CheckCheck, Trash2, Search, Filter, Calendar as CalendarIcon,
  ChevronLeft, ChevronRight, ArrowUpRight, ShieldAlert, Sparkles, RefreshCw, MessageSquareShare
} from "lucide-react";
import { formatDistanceToNow, parseISO, isToday, isYesterday, isThisWeek, isThisMonth } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CATEGORY_META, NotificationCategory } from "@/lib/notifications";
import { parseNotificationDeepLink } from "@/lib/notificationDeepLinks";

const PAGE_SIZE = 20;

export default function NotificationsCenter() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Fetch notifications
  const { data: notifications = [], isLoading, refetch } = useQuery({
    queryKey: ["notifications-center", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications" as any)
        .select("*")
        .eq("user_id", user?.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as any[];
    },
  });

  // Mark single as read
  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications" as any)
        .update({ is_read: true } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications-center"] });
      queryClient.invalidateQueries({ queryKey: ["in-app-notifications"] });
    },
  });

  // Mark all as read
  const markAllReadMutation = useMutation({
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
      queryClient.invalidateQueries({ queryKey: ["notifications-center"] });
      queryClient.invalidateQueries({ queryKey: ["in-app-notifications"] });
      toast.success("All notifications marked as read!");
    },
  });

  // Delete notification
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications-center"] });
      queryClient.invalidateQueries({ queryKey: ["in-app-notifications"] });
      toast.success("Notification removed");
    },
  });

  // Filtered Notifications Logic
  const filteredNotifications = useMemo(() => {
    return notifications.filter((item) => {
      // Category filter
      if (activeCategory === "unread" && item.is_read) return false;
      if (activeCategory !== "all" && activeCategory !== "unread" && item.category !== activeCategory) {
        return false;
      }

      // Date filter
      if (item.created_at) {
        const itemDate = parseISO(item.created_at);
        if (dateFilter === "today" && !isToday(itemDate)) return false;
        if (dateFilter === "yesterday" && !isYesterday(itemDate)) return false;
        if (dateFilter === "this_week" && !isThisWeek(itemDate)) return false;
        if (dateFilter === "this_month" && !isThisMonth(itemDate)) return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const titleMatch = item.title?.toLowerCase().includes(q);
        const msgMatch = (item.message || item.body || "").toLowerCase().includes(q);
        if (!titleMatch && !msgMatch) return false;
      }

      return true;
    });
  }, [notifications, activeCategory, dateFilter, searchQuery]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredNotifications.length / PAGE_SIZE) || 1;
  const paginatedList = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredNotifications.slice(start, start + PAGE_SIZE);
  }, [filteredNotifications, currentPage]);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.is_read).length, [notifications]);

  const handleCardClick = async (notif: any) => {
    if (!notif.is_read) {
      await markReadMutation.mutateAsync(notif.id);
    }
    const target = parseNotificationDeepLink(notif.target_url || notif.deep_link);
    navigate(target.fullUrl);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      
      {/* ── Header Bar ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-card p-5 rounded-2xl border border-border shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Bell className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Notification Center</h1>
              <p className="text-xs text-muted-foreground">
                Manage business alerts, reports, reminders, and executive performance updates.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="gap-1.5 text-xs font-semibold"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          {unreadCount > 0 && (
            <Button
              variant="default"
              size="sm"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
              className="gap-1.5 text-xs font-bold"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Mark All Read ({unreadCount})
            </Button>
          )}
        </div>
      </div>

      {/* ── Filter Bar ── */}
      <div className="space-y-4">
        {/* Category Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          {[
            { id: "all", label: "All Alerts", icon: "🔔" },
            { id: "unread", label: `Unread (${unreadCount})`, icon: "🔴" },
            { id: "critical", label: "Critical", icon: "🔴" },
            { id: "important", label: "Important", icon: "🟠" },
            { id: "report", label: "Reports", icon: "🔵" },
            { id: "reminder", label: "Reminders", icon: "🟡" },
            { id: "informational", label: "Informational", icon: "⚪" },
          ].map((tab) => {
            const isActive = activeCategory === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => { setActiveCategory(tab.id); setCurrentPage(1); }}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer border ${
                  isActive
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-card hover:bg-muted text-muted-foreground border-border"
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Search & Date Filter Controls */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search notifications by title, executive, or client..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="pl-9 bg-card rounded-xl text-xs"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
            <Select value={dateFilter} onValueChange={(val) => { setDateFilter(val); setCurrentPage(1); }}>
              <SelectTrigger className="w-full sm:w-[180px] bg-card rounded-xl text-xs font-medium">
                <CalendarIcon className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Date Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="this_week">This Week</SelectItem>
                <SelectItem value="this_month">This Month</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* ── Notification Feed ── */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground bg-card rounded-2xl border border-border">
            <RefreshCw className="h-6 w-6 animate-spin text-primary" />
            <span className="text-xs font-semibold">Loading notifications...</span>
          </div>
        ) : paginatedList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-card rounded-2xl border border-border space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center">
              <Bell className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-base font-bold">No notifications found</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              No matching alerts or reports for the selected filters.
            </p>
          </div>
        ) : (
          paginatedList.map((item) => {
            const category = (item.category as NotificationCategory) || "informational";
            const meta = CATEGORY_META[category] || CATEGORY_META.informational;
            const messageText = item.message || item.body || "";
            const isUnread = !item.is_read;

            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
              >
                <Card
                  className={`relative overflow-hidden transition-all duration-200 hover:shadow-md cursor-pointer border ${
                    isUnread
                      ? `${meta.border} bg-card ring-1 ring-primary/20 shadow-xs`
                      : "bg-card/70 hover:bg-card border-border/60"
                  }`}
                  onClick={() => handleCardClick(item)}
                >
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex items-start gap-3.5">
                      
                      {/* Priority Dot & Category Icon */}
                      <div className="relative shrink-0 pt-0.5">
                        <div className={`w-10 h-10 rounded-xl ${meta.badgeBg} border ${meta.border} flex items-center justify-center text-base shadow-xs`}>
                          {meta.icon}
                        </div>
                        {isUnread && (
                          <span className={`absolute -top-1 -right-1 w-3 h-3 rounded-full ${meta.priorityDot} border-2 border-background`} />
                        )}
                      </div>

                      {/* Main Details */}
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${meta.badgeBg} ${meta.badgeText}`}>
                              {meta.label}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-semibold">
                              {formatDistanceToNow(parseISO(item.created_at), { addSuffix: true })}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            {!item.is_read && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-[10px] font-bold text-primary hover:bg-primary/10"
                                onClick={() => markReadMutation.mutate(item.id)}
                              >
                                <Check className="h-3 w-3 mr-1" /> Mark Read
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => deleteMutation.mutate(item.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>

                        {/* Title & Body */}
                        <h3 className={`text-sm ${isUnread ? "font-bold text-foreground" : "font-semibold text-foreground/80"}`}>
                          {item.title}
                        </h3>
                        {messageText && (
                          <p className="text-xs text-muted-foreground leading-relaxed break-words">
                            {messageText}
                          </p>
                        )}

                        {/* CTA Deep-Link & WhatsApp Share Buttons */}
                        <div className="pt-2 flex items-center justify-between gap-2 flex-wrap">
                          <Button
                            variant="secondary"
                            size="sm"
                            className="h-7 px-2.5 text-[11px] font-bold gap-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20"
                          >
                            <span>Open Details</span>
                            <ArrowUpRight className="h-3 w-3" />
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              const text = `📊 *ART N GLASS MANAGEMENT ALERT*\n\n📌 *${item.title}*\n\n📝 ${messageText || ""}\n\n🕒 ${formatDistanceToNow(parseISO(item.created_at), { addSuffix: true })}\n\n_Generated via VisitWiz Enterprise_`;
                              window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
                            }}
                            className="h-7 px-2.5 text-[11px] font-bold gap-1 rounded-lg border-emerald-500/40 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                          >
                            <MessageSquareShare className="h-3 w-3 text-emerald-600" />
                            <span>Share on WhatsApp</span>
                          </Button>
                        </div>
                      </div>

                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })
        )}
      </div>

      {/* ── Pagination Footer ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground">
            Page {currentPage} of {totalPages} ({filteredNotifications.length} items)
          </p>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="gap-1 text-xs"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="gap-1 text-xs"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

    </div>
  );
}
