import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useBackgroundTracking } from "@/hooks/useBackgroundTracking";
import { supabase } from "@/integrations/supabase/client";

const todayKey = () => {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

export const GlobalLocationTracker = () => {
  const { user, role } = useAuth();
  const [dateStr, setDateStr] = useState(todayKey);
  useEffect(() => {
    const refreshDate = () => setDateStr(todayKey());
    const timer = setInterval(refreshDate, 60_000);
    window.addEventListener("focus", refreshDate);
    return () => { clearInterval(timer); window.removeEventListener("focus", refreshDate); };
  }, []);
  const canTrack =
    role === "executive" ||
    role === "backhand_executive" ||
    role === "tl" ||
    role === "manager";

  const { data: todayAttendance, isSuccess: attendanceReady } = useQuery({
    queryKey: ["daily-attendance", user?.id, dateStr],
    enabled: !!user?.id && canTrack,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_attendance")
        .select("*")
        .eq("user_id", user!.id)
        .eq("date", dateStr)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: "always",
  });

  const { data: endDayRecord, isSuccess: endDayReady } = useQuery({
    queryKey: ["end-day-record", user?.id, dateStr],
    enabled: !!user?.id && canTrack,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conveyance_records")
        .select("id")
        .eq("user_id", user!.id)
        .eq("date", dateStr)
        .is("visit_id", null)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: "always",
  });

  useBackgroundTracking({
    active: !!(user?.id && canTrack && attendanceReady && endDayReady && todayAttendance && !endDayRecord),
    userId: user?.id,
  });

  return null;
};
