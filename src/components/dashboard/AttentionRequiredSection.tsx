import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { ShieldAlert, ArrowRight, AlertCircle, AlertTriangle, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CATEGORY_META } from "@/lib/notifications";
import { parseNotificationDeepLink } from "@/lib/notificationDeepLinks";

export function AttentionRequiredSection() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: criticalItems = [] } = useQuery({
    queryKey: ["attention-required-items", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications" as any)
        .select("*")
        .eq("user_id", user?.id)
        .in("category", ["critical", "important"])
        .eq("is_read", false)
        .order("created_at", { ascending: false })
        .limit(5);

      if (error && error.code !== "42P01") throw error;
      return (data || []) as any[];
    },
  });

  if (criticalItems.length === 0) return null;

  return (
    <div className="bg-rose-500/10 border border-rose-500/30 dark:bg-rose-950/20 dark:border-rose-900/40 rounded-2xl p-4 sm:p-5 space-y-3 shadow-xs">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-rose-600 text-white animate-pulse">
            <ShieldAlert className="h-4 w-4" />
          </div>
          <h2 className="text-sm font-black tracking-wide text-rose-700 dark:text-rose-400 uppercase">
            Attention Required ({criticalItems.length})
          </h2>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate("/notifications")}
          className="h-7 text-[11px] font-bold border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-300 hover:bg-rose-500/10 gap-1 rounded-xl"
        >
          <span>View All Notifications</span>
          <ArrowRight className="h-3 w-3" />
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {criticalItems.map((item) => {
          const category = item.category || "critical";
          const meta = CATEGORY_META[category as keyof typeof CATEGORY_META] || CATEGORY_META.critical;
          const target = parseNotificationDeepLink(item.target_url || item.deep_link);

          return (
            <div
              key={item.id}
              onClick={() => navigate(target.fullUrl)}
              className="p-3 rounded-xl bg-card border border-rose-500/20 hover:border-rose-500/40 cursor-pointer transition-all shadow-xs flex items-start gap-2.5 group"
            >
              <span className="text-base shrink-0 pt-0.5">{meta.icon}</span>
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-xs font-bold text-foreground truncate group-hover:text-primary transition-colors">
                  {item.title}
                </p>
                <p className="text-[11px] text-muted-foreground line-clamp-1">
                  {item.message || item.body || ""}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
