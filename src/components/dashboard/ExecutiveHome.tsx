import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
    CalendarCheck, MapPin, CheckCircle2, Navigation,
    Plus, Bell, ChevronLeft, ChevronRight, AlertCircle,
    Activity, ChevronRight as ChevronRightIcon,
    Clock, History, Play, X, Target, Medal, Building2, Users
} from "lucide-react";
import { motion, AnimatePresence, useAnimation, PanInfo } from "framer-motion";
import { format, isToday, parseISO, addDays, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { useNavigate } from "react-router-dom";
import { Database } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { mockOwnVisits, mockOwnWorkScopes, mockShowroomExecs, mockShowroomVisits, mockShowroomWOS } from "./mockData";

type Visit = Database["public"]["Tables"]["visits"]["Row"] & {
    clients?: { name: string } | null;
    partners?: { name: string } | null;
    purpose_masters?: { purpose_name: string } | null;
};

export const ExecutiveHome = () => {
    const { user, role, showroomId } = useAuth();
    const navigate = useNavigate();
    const [selectedDate, setSelectedDate] = useState(new Date());

    const [kpiPopup, setKpiPopup] = useState<{
        title: string;
        metrics: { label: string; value: string | number }[];
        list: any[];
        type: 'visits' | 'wos_count' | 'wos_won';
    } | null>(null);

    const [leadPopup, setLeadPopup] = useState<{
        name: string;
        visits: number;
        wosCount: number;
        wosWon: number;
        rankingLogic: string;
    } | null>(null);

    const dateStr = format(selectedDate, "yyyy-MM-dd");
    
    const weekStart = format(startOfWeek(selectedDate, { weekStartsOn: 1 }), "yyyy-MM-dd");
    const weekEnd = format(endOfWeek(selectedDate, { weekStartsOn: 1 }), "yyyy-MM-dd");
    
    const monthStart = format(startOfMonth(selectedDate), "yyyy-MM-dd");
    const monthEnd = format(endOfMonth(selectedDate), "yyyy-MM-dd");

    const fullName: string = user?.user_metadata?.full_name || "Executive";

    // === MOCK DATA TOGGLE ===
    const USE_MOCK_DATA = false;

    // 1. Fetch own visits (all time)
    const { data: ownVisits = USE_MOCK_DATA ? mockOwnVisits : [], refetch: refetchVisits } = useQuery({
        queryKey: ["executive-visits-whoop-all", user?.id],
        queryFn: async () => {
            if (USE_MOCK_DATA) return mockOwnVisits;
            if (!user) return [];
            const { data, error } = await supabase
                .from("visits")
                .select(`
          *,
          clients(name),
          partners(name),
          purpose_masters(purpose_name)
        `)
                .eq("created_by", user.id)
                .order("visit_date", { ascending: true });
            if (error) throw error;
            return data as Visit[];
        },
        enabled: !!user || USE_MOCK_DATA,
    });

    // Fetch today's attendance
    const { data: todayAttendance, refetch: refetchAttendance } = useQuery({
        queryKey: ["daily-attendance", user?.id, dateStr],
        queryFn: async () => {
            if (!user) return null;
            const { data, error } = await supabase
                .from("daily_attendance")
                .select("*")
                .eq("user_id", user.id)
                .eq("date", dateStr)
                .maybeSingle();
            if (error) throw error;
            return data;
        },
        enabled: !!user,
    });

    const { data: endDayRecord, refetch: refetchEndDay } = useQuery({
        queryKey: ["end-day-record", user?.id, dateStr],
        queryFn: async () => {
            if (!user) return null;
            const { data, error } = await supabase
                .from("conveyance_records")
                .select("id")
                .eq("user_id", user.id)
                .eq("date", dateStr)
                .is("visit_id", null)
                .maybeSingle();
            if (error) throw error;
            return data;
        },
        enabled: !!user,
    });

    const [isCheckingIn, setIsCheckingIn] = useState(false);
    const [isEndingDay, setIsEndingDay] = useState(false);

    // Fetch today's conveyance records for executive display
    const { data: todayConveyance = [], refetch: refetchConveyance } = useQuery({
        queryKey: ["my-conveyance-today", user?.id, dateStr],
        queryFn: async () => {
            if (!user) return [];
            const { data, error } = await supabase
                .from("conveyance_records")
                .select("*")
                .eq("user_id", user.id)
                .eq("date", dateStr)
                .order("created_at", { ascending: true });
            if (error) throw error;
            return data;
        },
        enabled: !!user,
    });

    const todayTotalKm = todayConveyance.reduce((s, r) => s + (r.distance_km || 0), 0);
    const todayTotalAmount = todayConveyance.reduce((s, r) => s + (r.amount || 0), 0);

    const handleCheckIn = async () => {
        if (!user) return;
        setIsCheckingIn(true);
        try {
            const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 15000, enableHighAccuracy: true });
            });
            const { error } = await supabase.from("daily_attendance").insert({
                user_id: user.id,
                date: dateStr,
                check_in_lat: pos.coords.latitude,
                check_in_lng: pos.coords.longitude,
            });
            if (error) throw error;
            toast.success("Checked in successfully! Have a great day.");
            refetchAttendance();
        } catch (e: any) {
            toast.error(e.message || "Failed to get location");
        } finally {
            setIsCheckingIn(false);
        }
    };

    const handleEndDay = async () => {
        if (!user) return;
        setIsEndingDay(true);
        try {
            const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 15000, enableHighAccuracy: true });
            });
            const gpsLat = pos.coords.latitude;
            const gpsLng = pos.coords.longitude;

            const { data: profile } = await supabase.from("profiles").select("conveyance_type, conveyance_rate").eq("user_id", user.id).single();

            const { data: lastVisit } = await supabase.from("visits")
                .select("*")
                .eq("created_by", user.id)
                .eq("visit_date", dateStr)
                .eq("status", "done")
                .order("done_at", { ascending: false })
                .limit(1)
                .maybeSingle();

            let fromLat: number | null = null;
            let fromLng: number | null = null;
            let fromLocationName = "Unknown Location";

            if (lastVisit && lastVisit.gps_latitude && lastVisit.gps_longitude) {
                fromLat = lastVisit.gps_latitude;
                fromLng = lastVisit.gps_longitude;
                fromLocationName = lastVisit.address || "Last Visit";
            } else if (todayAttendance) {
                fromLat = todayAttendance.check_in_lat;
                fromLng = todayAttendance.check_in_lng;
                fromLocationName = "Start Day Location";
            }

            if (fromLat && fromLng && profile?.conveyance_type) {
                // Dynamically evaluating calculation logic
                const R = 6371;
                const dLat = (gpsLat - fromLat) * (Math.PI / 180);
                const dLon = (gpsLng - fromLng) * (Math.PI / 180);
                const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(fromLat * (Math.PI/180)) * Math.cos(gpsLat * (Math.PI/180)) * Math.sin(dLon/2) * Math.sin(dLon/2);
                const distance = Number((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1));
                
                const amount = Number((distance * (profile.conveyance_rate || 0)).toFixed(2));

                const { error } = await supabase.from("conveyance_records").insert({
                    user_id: user.id,
                    visit_id: null,
                    date: dateStr,
                    from_location_name: fromLocationName,
                    from_lat: fromLat,
                    from_lng: fromLng,
                    to_location_name: "End Day Location",
                    to_lat: gpsLat,
                    to_lng: gpsLng,
                    distance_km: distance,
                    vehicle_type: profile.conveyance_type,
                    rate_per_km: profile.conveyance_rate || 0,
                    amount: amount
                });
                if (error) throw error;
                toast.success(`Day Ended! Return trip: ${distance} km (₹${amount})`);
                refetchEndDay();
            } else {
                toast.success("Day Marked Ended. No conveyance required.");
                refetchEndDay();
            }

        } catch (e: any) {
            toast.error(e.message || "Failed to end day");
        } finally {
            setIsEndingDay(false);
        }
    };

    // 2. Fetch own WOS (all time)
    const { data: ownWorkScopes = USE_MOCK_DATA ? mockOwnWorkScopes : [] } = useQuery({
        queryKey: ["executive-wos-whoop-all", user?.id],
        queryFn: async () => {
             if (USE_MOCK_DATA) return mockOwnWorkScopes;
            if (!user) return [];
            const { data, error } = await supabase
                .from("work_scope_items")
                .select("*")
                .eq("created_by", user.id);
            if (error) throw error;
            return data;
        },
        enabled: !!user || USE_MOCK_DATA,
    });

    // 3. Fetch Showroom Colleagues for Leaderboard
    const { data: showroomExecs = USE_MOCK_DATA ? mockShowroomExecs : [] } = useQuery({
        queryKey: ["executive-showroom-colleagues", showroomId],
        queryFn: async () => {
            if (USE_MOCK_DATA) return mockShowroomExecs;
            if (!showroomId) return [];
            
            const { data: roles, error: rolesError } = await supabase
                .from("user_roles")
                .select("user_id, role")
                .eq("showroom_id", showroomId)
                .eq("role", "executive");
                
            if (rolesError) throw rolesError;
            if (!roles || roles.length === 0) return [];
            
            const userIds = roles.map(r => r.user_id);
            
            const { data: profiles, error: profError } = await supabase
                .from("profiles")
                .select("user_id, full_name")
                .in("user_id", userIds);
                
            if (profError) throw profError;
            
            return profiles || [];
        },
        enabled: !!showroomId || USE_MOCK_DATA,
    });

    // 4. Fetch Showroom Visits for Leaderboard
    const { data: showroomVisits = USE_MOCK_DATA ? mockShowroomVisits : [] } = useQuery({
        queryKey: ["executive-showroom-visits", showroomId],
        queryFn: async () => {
            if (USE_MOCK_DATA) return mockShowroomVisits;
            if (!showroomId || showroomExecs.length === 0) return [];
            const userIds = showroomExecs.map(e => e.user_id);
            const { data, error } = await supabase
                .from("visits")
                .select("id, created_by, status")
                .in("created_by", userIds)
                .eq("status", "done");
            if (error) throw error;
            return data || [];
        },
        enabled: showroomExecs.length > 0 || USE_MOCK_DATA,
    });

    // 5. Fetch Showroom WOS for Leaderboard
    const { data: showroomWOS = USE_MOCK_DATA ? mockShowroomWOS : [] } = useQuery({
        queryKey: ["executive-showroom-wos", showroomId],
        queryFn: async () => {
            if (USE_MOCK_DATA) return mockShowroomWOS;
            if (!showroomId || showroomExecs.length === 0) return [];
            const userIds = showroomExecs.map(e => e.user_id);
            const { data, error } = await supabase
                .from("work_scope_items")
                .select("id, created_by, work_status, amount_in_lac, verified_amount")
                .in("created_by", userIds);
            if (error) throw error;
            return data || [];
        },
        enabled: showroomExecs.length > 0 || USE_MOCK_DATA,
    });

    const displayDate = isToday(selectedDate) ? "TODAY" : format(selectedDate, "dd MMM yyyy");

    const handlePrevDay = () => setSelectedDate(subDays(selectedDate, 1));
    const handleNextDay = () => setSelectedDate(addDays(selectedDate, 1));

    // Calculate Leaderboard
    const leaderboard = useMemo(() => {
        if (!showroomExecs.length) return { visits: [], wosCount: [], wosWon: [] };

        const stats = showroomExecs.map(exec => {
            const execVisits = showroomVisits.filter(v => v.created_by === exec.user_id).length;
            const execWos = showroomWOS.filter(w => w.created_by === exec.user_id);
            const execWosCount = execWos.length;
            
            let execWosWonTotal = 0;
            execWos.forEach(w => {
                 if(w.work_status === 'won' || w.verified_amount) {
                      execWosWonTotal += Number(w.amount_in_lac || 0);
                 }
            });

            return {
                ...exec,
                visits: execVisits,
                wosCount: execWosCount,
                wosWon: execWosWonTotal
            };
        });

        return {
            visits: [...stats].sort((a, b) => b.visits - a.visits).slice(0, 3),
            wosCount: [...stats].sort((a, b) => b.wosCount - a.wosCount).slice(0, 3),
            wosWon: [...stats].sort((a, b) => b.wosWon - a.wosWon).slice(0, 3),
        };
    }, [showroomExecs, showroomVisits, showroomWOS]);


    // Daily KPIs (for My Day section)
    const dailyKpis = useMemo(() => {
        const todayVisits = ownVisits.filter(v => v.visit_date === dateStr);
        const todayPlanned = todayVisits.filter(v => v.status === "planned" || v.status === "in_progress" || v.status === "done").length;
        const todayDone = todayVisits.filter(v => v.status === "done").length;
        
        const pendingFollowups = todayVisits.filter(v => v.purpose_masters?.purpose_name?.toLowerCase().includes("follow")).length;
        const overdueCount = ownVisits.filter(v => v.status === "planned" && v.visit_date < format(new Date(), "yyyy-MM-dd")).length;

        return { todayPlanned, todayDone, pendingFollowups, overdueCount, todayVisits };
    }, [ownVisits, dateStr]);

    // KPI Rings Calculation Helper
    const calculateRingKpis = (startDate?: string, endDate?: string) => {
        let filteredVisits = ownVisits;
        let filteredWos = ownWorkScopes;

        if (startDate && endDate) {
            filteredVisits = ownVisits.filter(v => v.visit_date >= startDate && v.visit_date <= endDate);
            // Need to handle WOS creation date format (ISO)
            filteredWos = ownWorkScopes.filter(w => {
                 const createdDate = w.created_at.split('T')[0];
                 return createdDate >= startDate && createdDate <= endDate;
            });
        }

        const plannedVisits = filteredVisits.filter(v => v.status === "planned" || v.status === "in_progress" || v.status === "done").length;
        const doneVisits = filteredVisits.filter(v => v.status === "done").length;
        
        const wosCount = filteredWos.length;
        
        let estValue = 0;
        let wonValue = 0;
        
        filteredWos.forEach((ws) => {
            estValue += Number(ws.amount_in_lac || 0);
            if (ws.work_status === 'won' || ws.verified_amount) {
                wonValue += Number(ws.amount_in_lac || 0);
            }
        });

        const wonPercent = estValue > 0 ? Math.round((wonValue / estValue) * 100) : 0;

        const wonItems: any[] = [];
        filteredWos.forEach(w => {
            if (w.work_status === 'won' || w.verified_amount) wonItems.push(w);
        });

        return { 
            plannedVisits, 
            doneVisits, 
            wosCount, 
            estValue, 
            wonValue, 
            wonPercent,
            rawVisits: filteredVisits,
            rawWos: filteredWos,
            rawWosWon: wonItems
        };
    };

    const weekKpis = useMemo(() => calculateRingKpis(weekStart, weekEnd), [ownVisits, ownWorkScopes, weekStart, weekEnd]);
    const monthKpis = useMemo(() => calculateRingKpis(monthStart, monthEnd), [ownVisits, ownWorkScopes, monthStart, monthEnd]);
    const totalKpis = useMemo(() => calculateRingKpis(), [ownVisits, ownWorkScopes]);

    // Trend Card calculation — use done_at date when available, fallback to visit_date
    const trendData = useMemo(() => {
        const last7Days = Array.from({length: 7}, (_, i) => {
             const d = subDays(selectedDate, 6 - i);
             const dStr = format(d, "yyyy-MM-dd");
             const done = ownVisits.filter(v => {
                 if (v.status !== 'done') return false;
                 const effectiveDate = v.done_at ? v.done_at.split('T')[0] : v.visit_date;
                 return effectiveDate === dStr;
             }).length;
             return {
                 day: format(d, "EEEE").charAt(0),
                 val: done
             }
        });
        return last7Days;
    }, [ownVisits, selectedDate]);


    const markDone = async (visit: Visit) => {
        try {
            let gpsLat: number | null = null;
            let gpsLng: number | null = null;
            try {
                const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
                    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000, enableHighAccuracy: true })
                );
                gpsLat = pos.coords.latitude;
                gpsLng = pos.coords.longitude;
            } catch { /* GPS optional for mark done */ }

            const { error } = await supabase.from("visits").update({
                status: "done",
                done_at: new Date().toISOString(),
                gps_latitude: gpsLat,
                gps_longitude: gpsLng,
            }).eq("id", visit.id);
            if (error) throw error;
            toast.success("Visit marked as done!");
            refetchVisits();
        } catch (e: unknown) {
            if (e instanceof Error) {
                toast.error(e.message);
            } else {
                toast.error("An unknown error occurred");
            }
        }
    };

    const cancelVisit = async (visit: Visit) => {
        try {
            const { error } = await supabase.from("visits").update({ status: "cancelled" }).eq("id", visit.id);
            if (error) throw error;
            toast.success("Visit cancelled.");
            refetchVisits();
        } catch (e: unknown) {
            if (e instanceof Error) {
                toast.error(e.message);
            } else {
                toast.error("An unknown error occurred");
            }
        }
    };

    const getMedalColor = (index: number) => {
         if (index === 0) return "text-yellow-400";
         if (index === 1) return "text-exec-text-sec";
         if (index === 2) return "text-[#9A5B0B]";
         return "text-[#6B7280]";
    }

    return (
        <div className="-m-4 md:-m-6 lg:-m-8 -mb-20 md:-mb-8 min-h-[calc(100vh-3.5rem)] bg-exec-bg text-exec-text font-sans pb-24 selection:bg-exec-primary/30 overflow-x-hidden">

            {/* A. Sticky Header */}
            <div className="sticky top-0 z-50 bg-exec-bg/80 backdrop-blur-xl border-b border-exec-border px-3 sm:px-5 py-3 sm:py-4 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 shadow-sm">
                <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-[140px]">
                    <div className="relative shrink-0">
                        <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-exec-surface border border-exec-primary/30 flex items-center justify-center text-exec-text font-semibold shadow-inner">
                            {fullName.charAt(0)}
                        </div>
                        <div className="absolute bottom-0 right-0 w-2.5 h-2.5 sm:w-3 sm:h-3 bg-[#2E7D32] border-2 border-[#0E0F12] rounded-full" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 className="text-sm font-semibold text-exec-text tracking-wide leading-tight truncate">{fullName}</h2>
                        <p className="text-[10px] text-exec-text-sec font-medium uppercase tracking-[0.15em] mt-0.5 truncate">{role}</p>
                    </div>
                </div>

                <div className="flex items-center justify-end gap-2 sm:gap-4 flex-shrink-0">
                    <div className="flex items-center gap-1 sm:gap-2 bg-exec-surface/60 rounded-full px-1.5 sm:px-2 py-1 border border-exec-border">
                        <button onClick={handlePrevDay} className="p-1 sm:p-1.5 text-exec-text-sec hover:text-exec-text transition-colors">
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <span className="text-[10px] sm:text-xs font-semibold tracking-widest uppercase w-16 sm:w-20 text-center text-gray-200">{displayDate}</span>
                        <button onClick={handleNextDay} className="p-1 sm:p-1.5 text-exec-text-sec hover:text-exec-text transition-colors">
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="relative p-1.5 sm:p-2 rounded-full hover:bg-exec-text/5 transition-colors cursor-pointer shrink-0">
                        <Bell className="h-4 w-4 sm:h-5 sm:w-5 text-[#D1D5DB]" />
                        {dailyKpis.overdueCount > 0 && (
                            <div className="absolute top-1 sm:top-1.5 right-1 sm:right-1.5 w-2 h-2 bg-exec-hover rounded-full ring-2 ring-[#0E0F12]" />
                        )}
                    </div>
                </div>
            </div>

            <div className="p-3 sm:p-5 space-y-6 sm:space-y-8 w-full max-w-[100vw] overflow-x-hidden">

                {/* NEW LEADERBOARD SECTION */}
                <div className="bg-exec-card rounded-2xl p-4 sm:p-5 border border-exec-border shadow-sm">
                     <h3 className="text-exec-text text-sm font-semibold mb-5 flex items-center gap-2">
                         <Medal className="h-4 w-4 text-exec-primary" /> Showroom Leaderboard
                     </h3>
                     
                     <div className="flex overflow-x-auto snap-x snap-mandatory gap-3 pb-4 -mx-4 sm:-mx-5 px-4 sm:px-5 sm:grid sm:grid-cols-3 sm:mx-0 sm:px-0 sm:pb-0 sm:overflow-visible no-scrollbar">
                         {/* Visited Leaderboard */}
                         <div className="w-[85%] max-w-[280px] sm:w-auto shrink-0 snap-center bg-exec-surface rounded-xl p-3 border border-exec-border flex flex-col justify-between">
                              <p className="text-[9px] text-exec-text-sec font-semibold uppercase tracking-wider mb-3 text-center">Top Visits</p>
                              <div className="space-y-2.5">
                                   {leaderboard.visits.map((exec, idx) => (
                                        <div key={exec.user_id} className="flex items-center justify-between cursor-pointer hover:bg-exec-text/10 p-1 -mx-1 rounded transition-colors" onClick={() => setLeadPopup({ name: exec.full_name || 'Executive', visits: exec.visits, wosCount: exec.wosCount, wosWon: exec.wosWon, rankingLogic: 'Ranked by Total Visits Completed' })}>
                                             <span className={`text-xs truncate max-w-[60px] ${exec.user_id === user?.id ? 'text-exec-text font-semibold' : 'text-exec-text-sec'}`}>
                                                  {exec.full_name?.split(' ')[0]}
                                             </span>
                                             <div className="flex items-center gap-1.5">
                                                <span className="text-xs font-mono text-[#D1D5DB]">{exec.visits}</span>
                                                <div className={`w-1.5 h-1.5 rounded-full ${idx === 0 ? 'bg-[#D4AF37]' : idx === 1 ? 'bg-[#C0C0C0]' : idx === 2 ? 'bg-[#CD7F32]' : 'bg-gray-600'}`} />
                                             </div>
                                        </div>
                                   ))}
                                   {leaderboard.visits.length === 0 && <p className="text-xs text-center text-exec-text-mut">No data</p>}
                              </div>
                         </div>

                         {/* WOS Count Leaderboard */}
                         <div className="w-[85%] max-w-[280px] sm:w-auto shrink-0 snap-center bg-exec-surface rounded-xl p-3 border border-exec-border flex flex-col justify-between">
                              <p className="text-[9px] text-exec-text-sec font-semibold uppercase tracking-wider mb-3 text-center">Top WOS</p>
                              <div className="space-y-2.5">
                                   {leaderboard.wosCount.map((exec, idx) => (
                                        <div key={exec.user_id} className="flex items-center justify-between cursor-pointer hover:bg-exec-text/10 p-1 -mx-1 rounded transition-colors" onClick={() => setLeadPopup({ name: exec.full_name || 'Executive', visits: exec.visits, wosCount: exec.wosCount, wosWon: exec.wosWon, rankingLogic: 'Ranked by Total WOS Added' })}>
                                             <span className={`text-xs truncate max-w-[60px] ${exec.user_id === user?.id ? 'text-exec-text font-semibold' : 'text-exec-text-sec'}`}>
                                                  {exec.full_name?.split(' ')[0]}
                                             </span>
                                             <div className="flex items-center gap-1.5">
                                                <span className="text-xs font-mono text-[#D1D5DB]">{exec.wosCount}</span>
                                                <div className={`w-1.5 h-1.5 rounded-full ${idx === 0 ? 'bg-[#D4AF37]' : idx === 1 ? 'bg-[#C0C0C0]' : idx === 2 ? 'bg-[#CD7F32]' : 'bg-gray-600'}`} />
                                             </div>
                                        </div>
                                   ))}
                                   {leaderboard.wosCount.length === 0 && <p className="text-xs text-center text-exec-text-mut">No data</p>}
                              </div>
                         </div>
                         
                         {/* WOS Won Leaderboard */}
                         <div className="w-[85%] max-w-[280px] sm:w-auto shrink-0 snap-center bg-exec-surface rounded-xl p-3 border border-exec-border flex flex-col justify-between">
                              <p className="text-[9px] text-exec-text-sec font-semibold uppercase tracking-wider mb-3 text-center">Top WOS Won</p>
                              <div className="space-y-2.5">
                                   {leaderboard.wosWon.map((exec, idx) => (
                                        <div key={exec.user_id} className="flex items-center justify-between cursor-pointer hover:bg-exec-text/10 p-1 -mx-1 rounded transition-colors" onClick={() => setLeadPopup({ name: exec.full_name || 'Executive', visits: exec.visits, wosCount: exec.wosCount, wosWon: exec.wosWon, rankingLogic: 'Ranked by Verified WOS Value' })}>
                                             <span className={`text-xs truncate max-w-[55px] ${exec.user_id === user?.id ? 'text-exec-text font-semibold' : 'text-exec-text-sec'}`}>
                                                  {exec.full_name?.split(' ')[0]}
                                             </span>
                                             <div className="flex items-center gap-1.5">
                                                <span className="text-[11px] font-mono text-[#D1D5DB]">{exec.wosWon.toFixed(1)}L</span>
                                                <div className={`w-1.5 h-1.5 rounded-full ${idx === 0 ? 'bg-[#D4AF37]' : idx === 1 ? 'bg-[#C0C0C0]' : idx === 2 ? 'bg-[#CD7F32]' : 'bg-gray-600'}`} />
                                             </div>
                                        </div>
                                   ))}
                                   {leaderboard.wosWon.length === 0 && <p className="text-xs text-center text-exec-text-mut">No data</p>}
                              </div>
                         </div>
                     </div>
                </div>

                {/* KPI RINGS - THIS WEEK */}
                <div className="bg-exec-card rounded-2xl p-4 sm:p-5 border border-exec-border shadow-sm">
                    <h3 className="text-[10px] text-exec-text-sec font-semibold uppercase tracking-[0.15em] mb-4 flex items-center gap-2">
                        <div className="w-1 h-3 bg-exec-primary rounded-full" />
                        This Week
                    </h3>
                    <div className="flex justify-between items-center px-1">
                        <ProgressRing
                            value={weekKpis.doneVisits}
                            max={weekKpis.plannedVisits || 1}
                            label="Visits"
                            sublabel="Done"
                            color="#b91c1c"
                            displayValue={`${weekKpis.doneVisits}/${weekKpis.plannedVisits}`}
                            delay={0.1}
                        onClick={() => setKpiPopup({
                                title: "This Week - Visits",
                                metrics: [{ label: "Planned", value: weekKpis.plannedVisits }, { label: "Done", value: weekKpis.doneVisits }],
                                list: weekKpis.rawVisits,
                                type: 'visits'
                            })}
                        />
                        <ProgressRing
                            value={weekKpis.estValue}
                            max={Math.max(weekKpis.estValue, 10)}
                            label="WOS Count"
                            sublabel={`${weekKpis.wosCount} Added`}
                            color="#b91c1c"
                            displayValue={weekKpis.estValue.toFixed(1)}
                            delay={0.2}
                        onClick={() => setKpiPopup({
                                title: "This Week - WOS Count",
                                metrics: [{ label: "WOS Added", value: weekKpis.wosCount }, { label: "Estimated Total (L)", value: weekKpis.estValue.toFixed(1) }],
                                list: weekKpis.rawWos,
                                type: 'wos_count'
                            })}
                        />
                        <ProgressRing
                            value={weekKpis.wonPercent}
                            max={100}
                            label="WOS Won"
                            sublabel={`${weekKpis.wonValue.toFixed(1)}L Won`}
                            color="#b91c1c"
                            displayValue={`${weekKpis.wonPercent}%`}
                            delay={0.3}
                        onClick={() => setKpiPopup({
                                title: "This Week - WOS Won",
                                metrics: [{ label: "Won Deals", value: weekKpis.rawWosWon.length }, { label: "Secured Value (L)", value: weekKpis.wonValue.toFixed(1) }],
                                list: weekKpis.rawWosWon,
                                type: 'wos_won'
                            })}
                        />
                    </div>
                </div>

               {/* KPI RINGS - THIS MONTH */}
                <div className="bg-exec-card rounded-2xl p-4 sm:p-5 border border-exec-border shadow-sm">
                    <h3 className="text-[10px] text-exec-text-sec font-semibold uppercase tracking-[0.15em] mb-4 flex items-center gap-2">
                        <div className="w-1 h-3 bg-exec-primary rounded-full" />
                        This Month
                    </h3>
                    <div className="flex justify-between items-center px-1">
                        <ProgressRing
                            value={monthKpis.doneVisits}
                            max={monthKpis.plannedVisits || 1}
                            label="Visits"
                            sublabel="Done"
                            color="#b91c1c"
                            displayValue={`${monthKpis.doneVisits}/${monthKpis.plannedVisits}`}
                            delay={0.4}
                        onClick={() => setKpiPopup({
                                title: "This Month - Visits",
                                metrics: [{ label: "Planned", value: monthKpis.plannedVisits }, { label: "Done", value: monthKpis.doneVisits }],
                                list: monthKpis.rawVisits,
                                type: 'visits'
                            })}
                        />
                        <ProgressRing
                            value={monthKpis.estValue}
                            max={Math.max(monthKpis.estValue, 10)}
                            label="WOS Count"
                            sublabel={`${monthKpis.wosCount} Added`}
                            color="#b91c1c"
                            displayValue={monthKpis.estValue.toFixed(1)}
                            delay={0.5}
                        onClick={() => setKpiPopup({
                                title: "This Month - WOS Count",
                                metrics: [{ label: "WOS Added", value: monthKpis.wosCount }, { label: "Estimated Total (L)", value: monthKpis.estValue.toFixed(1) }],
                                list: monthKpis.rawWos,
                                type: 'wos_count'
                            })}
                        />
                        <ProgressRing
                            value={monthKpis.wonPercent}
                            max={100}
                            label="WOS Won"
                            sublabel={`${monthKpis.wonValue.toFixed(1)}L Won`}
                            color="#b91c1c"
                            displayValue={`${monthKpis.wonPercent}%`}
                            delay={0.6}
                        onClick={() => setKpiPopup({
                                title: "This Month - WOS Won",
                                metrics: [{ label: "Won Deals", value: monthKpis.rawWosWon.length }, { label: "Secured Value (L)", value: monthKpis.wonValue.toFixed(1) }],
                                list: monthKpis.rawWosWon,
                                type: 'wos_won'
                            })}
                        />
                    </div>
                </div>

               {/* KPI RINGS - TOTAL */}
                <div className="bg-exec-card rounded-2xl p-4 sm:p-5 border border-exec-border shadow-sm">
                    <h3 className="text-[10px] text-exec-text-sec font-semibold uppercase tracking-[0.15em] mb-4 flex items-center gap-2">
                        <div className="w-1 h-3 bg-exec-primary rounded-full" />
                        Total Overview
                    </h3>
                    <div className="flex justify-between items-center px-1">
                        <ProgressRing
                            value={totalKpis.doneVisits}
                            max={totalKpis.plannedVisits || 1}
                            label="Visits"
                            sublabel="Done"
                            color="#b91c1c"
                            displayValue={`${totalKpis.doneVisits}/${totalKpis.plannedVisits}`}
                            delay={0.7}
                        onClick={() => setKpiPopup({
                                title: "Overview - Visits",
                                metrics: [{ label: "Planned", value: totalKpis.plannedVisits }, { label: "Done", value: totalKpis.doneVisits }],
                                list: totalKpis.rawVisits,
                                type: 'visits'
                            })}
                        />
                        <ProgressRing
                            value={totalKpis.estValue}
                            max={Math.max(totalKpis.estValue, 10)}
                            label="WOS Count"
                            sublabel={`${totalKpis.wosCount} Added`}
                            color="#b91c1c"
                            displayValue={totalKpis.estValue.toFixed(1)}
                            delay={0.8}
                        onClick={() => setKpiPopup({
                                title: "Overview - WOS Count",
                                metrics: [{ label: "WOS Added", value: totalKpis.wosCount }, { label: "Estimated Total (L)", value: totalKpis.estValue.toFixed(1) }],
                                list: totalKpis.rawWos,
                                type: 'wos_count'
                            })}
                        />
                        <ProgressRing
                            value={totalKpis.wonPercent}
                            max={100}
                            label="WOS Won"
                            sublabel={`${totalKpis.wonValue.toFixed(1)}L Won`}
                            color="#b91c1c"
                            displayValue={`${totalKpis.wonPercent}%`}
                            delay={0.9}
                        onClick={() => setKpiPopup({
                                title: "Overview - WOS Won",
                                metrics: [{ label: "Won Deals", value: totalKpis.rawWosWon.length }, { label: "Secured Value (L)", value: totalKpis.wonValue.toFixed(1) }],
                                list: totalKpis.rawWosWon,
                                type: 'wos_won'
                            })}
                        />
                    </div>
                </div>

                {/* C. Trend Card */}
                <div className="bg-exec-card rounded-2xl p-4 sm:p-5 border border-exec-border shadow-sm mt-6 sm:mt-8">
                    <h3 className="text-exec-text text-sm font-semibold mb-5 flex items-center gap-2">
                        <Activity className="h-4 w-4 text-exec-primary" /> Performance Trend
                    </h3>
                    <div className="h-28 flex items-end justify-between gap-2.5 border-b border-exec-border pb-2 relative">
                        <div className="absolute top-1/2 left-0 right-0 border-t border-dashed border-exec-border" />
                        {trendData.map((data, i) => (
                            <div key={i} className="w-full bg-exec-primary/5 rounded-t-sm relative group overflow-hidden">
                                <motion.div
                                    initial={{ height: 0 }}
                                    animate={{ height: `${(data.val / Math.max(10, ...trendData.map(d=>d.val))) * 100}%` }}
                                    transition={{ duration: 1, delay: i * 0.1 }}
                                    className={`absolute bottom-0 w-full rounded-t-sm ${i === 6 ? 'bg-exec-hover' : 'bg-exec-primary/40'}`}
                                />
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-between mt-3 text-[10px] text-exec-text-mut font-semibold uppercase tracking-widest">
                        {trendData.map((d, i) => <span key={i} className={i === 6 ? "text-exec-text" : ""}>{d.day}</span>)}
                    </div>
                </div>


                {/* D. Action Cards */}
                <div className="flex flex-col gap-3 mt-8">
                    <StackedCard icon={<CalendarCheck className="h-4 w-4 text-[#D1D5DB]" />} title="Today's Plan" subtitle={`${dailyKpis.todayPlanned} stops scheduled`} onClick={() => navigate("/visits")} />
                    <StackedCard icon={<Clock className="h-4 w-4 text-[#D1D5DB]" />} title="Pending Follow-ups" subtitle={`${dailyKpis.pendingFollowups} due today`} badge={dailyKpis.pendingFollowups} badgeColor="bg-exec-hover" />
                    <StackedCard icon={<AlertCircle className="h-4 w-4 text-[#D1D5DB]" />} title="Overdue TAT Alerts" subtitle="Requires immediate action" badge={dailyKpis.overdueCount} badgeColor="bg-exec-hover" />
                    <StackedCard icon={<History className="h-4 w-4 text-[#D1D5DB]" />} title="Recent Activity" subtitle="Last synced 2m ago" />
                </div>

                {/* E. My Day Action Area */}
                <div className="mt-6 sm:mt-8">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-4">
                        <h3 className="text-lg font-bold text-exec-text tracking-tight m-0">My Day</h3>
                        {isToday(selectedDate) && !todayAttendance && (
                             <button 
                                onClick={handleCheckIn}
                                disabled={isCheckingIn}
                                className="bg-exec-surface text-exec-text px-4 py-1.5 rounded-full text-xs font-semibold border border-[#2E7D32]/50 hover:bg-[#2E7D32]/20 transition-all flex items-center gap-2 disabled:opacity-50 w-fit shadow-md"
                             >
                                <Navigation className="h-3.5 w-3.5 text-[#2E7D32]" />
                                {isCheckingIn ? 'Locating...' : 'Start Day / Check In'}
                             </button>
                        )}
                        {isToday(selectedDate) && todayAttendance && (
                             <div className="flex items-center gap-3">
                                 <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#2E7D32]/10 border border-[#2E7D32]/30 w-fit shadow-sm">
                                     <div className="w-1.5 h-1.5 rounded-full bg-[#2E7D32] animate-pulse" />
                                     <span className="text-xs font-semibold text-[#2E7D32]">Checked In</span>
                                 </div>
                                 {!endDayRecord ? (
                                     <button 
                                        onClick={handleEndDay}
                                        disabled={isEndingDay}
                                        className="bg-exec-surface text-exec-text-sec hover:text-exec-text px-4 py-1.5 rounded-full text-xs font-semibold border border-[rgba(255,255,255,0.1)] hover:border-[rgba(255,255,255,0.3)] transition-all flex items-center gap-2 disabled:opacity-50"
                                     >
                                        <History className="h-3.5 w-3.5" />
                                        {isEndingDay ? 'Ending...' : 'End Day'}
                                     </button>
                                 ) : (
                                     <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-exec-surface border border-[rgba(255,255,255,0.1)] w-fit shadow-sm">
                                         <CheckCircle2 className="w-3.5 h-3.5 text-exec-text-sec" />
                                         <span className="text-xs font-semibold text-exec-text-sec">Day Ended</span>
                                     </div>
                                 )}
                             </div>
                        )}
                    </div>

                    <div className="bg-gradient-to-br from-[#7A121F]/40 to-[#0E0F12] border border-[#7A121F]/30 rounded-2xl p-5 sm:p-6 mb-5 relative overflow-hidden shadow-lg w-full">
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white/5 via-transparent to-transparent pointer-events-none" />
                        <div className="relative z-10">
                            <p className="text-[10px] sm:text-xs text-[#D1D5DB] font-semibold uppercase tracking-widest mb-2">Daily Outlook</p>
                            <h4 className="text-xl sm:text-2xl font-bold text-exec-text leading-tight mb-4 sm:mb-5">
                                You have <span className="text-exec-text bg-exec-hover px-2 py-0.5 rounded-md inline-block mx-1 shadow-sm">{dailyKpis.todayPlanned - dailyKpis.todayDone}</span> pending visits today.
                            </h4>
                            <button onClick={() => navigate("/visits")} className="w-full bg-white text-exec-primary hover:bg-gray-100 font-bold py-3 sm:py-3.5 rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all active:scale-[0.98] text-sm sm:text-base">
                                <Play className="h-4 w-4 fill-exec-primary" /> Start Next Visit
                            </button>
                        </div>
                        <div className="absolute -bottom-8 -right-8 opacity-[0.03] pointer-events-none">
                            <Target className="h-40 w-40 sm:h-48 sm:w-48 text-exec-text" />
                        </div>
                    </div>

                    <div className="space-y-3">
                        {dailyKpis.todayVisits.length === 0 ? (
                            <div className="text-center py-12 px-4 bg-exec-card rounded-2xl border border-exec-border shadow-sm">
                                <div className="w-16 h-16 bg-exec-surface rounded-full flex items-center justify-center mx-auto mb-4 border border-exec-border shadow-inner">
                                    <CalendarCheck className="h-6 w-6 text-exec-text-mut" />
                                </div>
                                <p className="text-exec-text font-semibold text-lg mb-1">Your day is clear</p>
                                <p className="text-sm text-exec-text-sec mb-5">Take a moment to plan ahead or scout new leads.</p>
                                <button onClick={() => navigate("/visits")} className="text-exec-text font-semibold text-sm bg-exec-surface hover:bg-exec-text/10 px-5 py-2.5 rounded-xl border border-exec-border transition-colors">Plan a Visit</button>
                            </div>
                        ) : (
                            dailyKpis.todayVisits.map((visit, i) => (
                                <VisitCard key={visit.id} visit={visit} onMarkDone={markDone} onCancel={cancelVisit} index={i} navigate={navigate} />
                            ))
                        )}
                    </div>
                </div>

                {/* F. My Conveyance Summary */}
                <div className="mt-8">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-exec-text tracking-tight">My Conveyance</h3>
                        <span className="text-[10px] text-exec-text-mut uppercase tracking-widest font-semibold">
                            {isToday(selectedDate) ? "Today" : format(selectedDate, "dd MMM")}
                        </span>
                    </div>

                    {todayConveyance.length === 0 ? (
                        <div className="bg-exec-card rounded-2xl border border-exec-border p-5 flex flex-col items-center justify-center text-center gap-2">
                            <Navigation className="h-8 w-8 text-[#3A3F4B] mb-1" />
                            <p className="text-exec-text font-semibold text-sm">No trips recorded yet</p>
                            <p className="text-xs text-exec-text-mut">Start Day and mark visits done to track conveyance.</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {/* Summary Bar */}
                            <div className="bg-exec-surface rounded-2xl p-3 sm:p-4 border border-exec-border flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 mb-3 shadow-sm">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-full bg-[#2E7D32]/15 flex items-center justify-center">
                                        <Navigation className="h-4 w-4 text-[#2E7D32]" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-exec-text-mut font-semibold uppercase tracking-widest">Total Distance</p>
                                        <p className="text-lg font-bold text-exec-text font-mono">{todayTotalKm.toFixed(1)} <span className="text-sm text-exec-text-mut font-sans">km</span></p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-exec-text-mut font-semibold uppercase tracking-widest">Total Earned</p>
                                    <p className="text-2xl font-bold text-[#2E7D32] font-mono">₹{todayTotalAmount.toFixed(2)}</p>
                                </div>
                            </div>

                            {/* Trip List */}
                            {todayConveyance.map((trip, i) => (
                                <div key={trip.id} className="bg-exec-card rounded-xl border border-exec-border px-4 py-3 flex items-center gap-3">
                                    <div className="flex flex-col items-center gap-0.5 shrink-0">
                                        <div className="w-2 h-2 rounded-full bg-exec-text-mut" />
                                        <div className="w-px h-4 bg-exec-text/10" />
                                        <div className="w-2 h-2 rounded-full bg-[#2E7D32]" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs text-exec-text-sec truncate"><span className="text-exec-text-mut">{i === 0 ? 'Start' : 'From'}:</span> {trip.from_location_name}</p>
                                        <p className="text-xs text-exec-text truncate font-medium"><span className="text-exec-text-mut">To:</span> {trip.to_location_name}</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-xs font-bold text-exec-text font-mono">{trip.distance_km} km</p>
                                        <p className="text-xs text-[#2E7D32] font-semibold">₹{trip.amount}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

            </div>

            
            {/* KPI Dialog Popup */}
            <Dialog open={!!kpiPopup} onOpenChange={(open) => !open && setKpiPopup(null)}>
                <DialogContent className="bg-exec-card border border-[rgba(255,255,255,0.1)] text-exec-text max-w-sm w-[95vw] rounded-2xl p-0 overflow-hidden outline-none">
                    <div className="flex flex-col h-full max-h-[80vh]">
                        <div className="p-5 border-b border-exec-border bg-exec-surface shrink-0">
                            <DialogHeader className="text-left mb-1">
                                <DialogTitle className="text-xl font-bold tracking-tight text-exec-text flex items-center justify-between">
                                    {kpiPopup?.title}
                                </DialogTitle>
                            </DialogHeader>
                            <div className="flex gap-3 mt-5">
                                {kpiPopup?.metrics.map((m, i) => (
                                    <div key={i} className="flex-1 bg-exec-card rounded-xl p-3 border border-exec-border shadow-inner">
                                        <p className="text-[9px] text-exec-text-sec font-semibold uppercase tracking-wider mb-1 line-clamp-1">{m.label}</p>
                                        <p className="text-lg font-bold text-exec-text tracking-tight truncate">{m.value}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                        
                        <div className="p-4 overflow-y-auto w-full bg-exec-bg space-y-2">
                            {(!kpiPopup?.list || kpiPopup.list.length === 0) ? (
                                <div className="text-center py-8">
                                    <p className="text-sm text-exec-text-mut font-medium">No records found for this metric.</p>
                                </div>
                            ) : (
                                kpiPopup.list.map((item, idx) => (
                                    <div key={idx} className="bg-exec-surface rounded-xl p-3 border border-exec-border flex flex-col gap-1.5 shadow-sm">
                                        {kpiPopup.type === 'visits' && (
                                            <>
                                                <div className="flex justify-between items-start">
                                                    <p className="font-semibold text-[13px] tracking-tight">{item.clients?.name || item.partners?.name || "Meeting"}</p>
                                                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider whitespace-nowrap ${item.status === 'done' ? 'bg-[#2E7D32]/20 text-[#2E7D32]' : item.status === 'planned' ? 'bg-[#2B6CB0]/20 text-[#3182CE]' : 'bg-[#B4690E]/20 text-[#B4690E]'}`}>
                                                        {item.status.replace("_", " ")}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center text-[11px] text-exec-text-sec font-medium">
                                                    <span className="truncate pr-2">{item.purpose_masters?.purpose_name || "Follow up"}</span>
                                                    <span className="shrink-0">{format(parseISO(item.visit_date), "dd MMM")}</span>
                                                </div>
                                            </>
                                        )}
                                        {kpiPopup.type !== 'visits' && (
                                            <>
                                                <div className="flex justify-between items-start">
                                                    <p className="font-semibold text-[13px] tracking-tight">{item.clients?.name || "Client Work Scope"}</p>
                                                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider whitespace-nowrap ${item.work_status === 'won' ? 'bg-[#2E7D32]/20 text-[#2E7D32]' : 'bg-[#B4690E]/20 text-[#B4690E]'}`}>
                                                        {item.work_status}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center text-[11px] text-exec-text-sec font-medium">
                                                    <span>Creation Date: {format(parseISO(item.created_at.split('T')[0]), "dd MMM")}</span>
                                                    <span className="font-bold text-[#D1D5DB]">₹ {item.amount_in_lac}L</span>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Leaderboard Dialog Popup */}
            <Dialog open={!!leadPopup} onOpenChange={(open) => !open && setLeadPopup(null)}>
                <DialogContent className="bg-exec-surface border border-[rgba(255,255,255,0.1)] text-exec-text max-w-sm w-[95vw] rounded-2xl p-6 outline-none shadow-2xl">
                    <DialogHeader className="text-left mb-6">
                        <DialogTitle className="text-2xl font-bold tracking-tight text-exec-text flex items-center gap-3">
                            <span className="bg-exec-card w-10 h-10 rounded-full border border-[rgba(255,255,255,0.1)] flex items-center justify-center text-sm shadow-inner uppercase">
                                {leadPopup?.name.charAt(0)}
                            </span>
                            {leadPopup?.name}
                        </DialogTitle>
                        <p className="text-[10px] text-exec-text-sec font-semibold uppercase tracking-widest mt-2 bg-exec-card inline-block px-2 py-1 rounded-md border border-exec-border self-start">
                            {leadPopup?.rankingLogic}
                        </p>
                    </DialogHeader>
                    <div className="flex flex-col gap-3">
                        <div className="bg-exec-card rounded-xl p-4 border border-exec-border flex justify-between items-center shadow-inner group transition-colors hover:border-exec-text/20">
                            <span className="text-exec-text-mut text-xs font-semibold uppercase tracking-wider group-hover:text-exec-text-sec transition-colors">Total Visits Done</span>
                            <span className="text-exec-text text-xl font-bold font-mono tracking-tight">{leadPopup?.visits}</span>
                        </div>
                        <div className="bg-exec-card rounded-xl p-4 border border-exec-border flex justify-between items-center shadow-inner group transition-colors hover:border-exec-text/20">
                            <span className="text-exec-text-mut text-xs font-semibold uppercase tracking-wider group-hover:text-exec-text-sec transition-colors">WOS Items Added</span>
                            <span className="text-exec-text text-xl font-bold font-mono tracking-tight">{leadPopup?.wosCount}</span>
                        </div>
                        <div className="bg-gradient-to-r from-exec-card to-exec-card rounded-xl p-4 border border-exec-primary/30 flex justify-between items-center shadow-inner group relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-r from-exec-primary/5 to-transparent pointer-events-none" />
                            <span className="text-exec-text-sec text-xs font-semibold uppercase tracking-wider relative z-10">WOS Value Won</span>
                            <span className="text-exec-text text-xl font-bold font-mono tracking-tight text-exec-primary relative z-10">₹ {leadPopup?.wosWon.toFixed(1)}L</span>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>


            {/* F. Floating Action Button */}
            <FAB navigate={navigate} />

        </div>
    );
};

// --- Subcomponents ---

interface ProgressRingProps {
    onClick?: () => void;
    value: number;
    max: number;
    label: string;
    sublabel: string;
    color: string;
    displayValue: string;
    delay: number;
}

const ProgressRing = ({ value, max, label, sublabel, color, displayValue, delay, onClick }: ProgressRingProps) => {
    const radius = 38;
    const stroke = 6;
    const normalizedRadius = radius - stroke * 2;
    const circumference = normalizedRadius * 2 * Math.PI;
    const safeMax = max > 0 ? max : 1;
    const safeValue = Math.min(value, safeMax);
    const strokeDashoffset = circumference - (safeValue / safeMax) * circumference;

    return (
        <div className="flex flex-col items-center justify-center cursor-pointer group hover:scale-105 transition-transform" onClick={onClick}>
            <div className="relative flex items-center justify-center mb-3">
                <svg height={radius * 2} width={radius * 2} className="transform -rotate-90">
                    <circle
                        stroke="#1E2025"
                        fill="transparent"
                        strokeWidth={stroke}
                        r={normalizedRadius}
                        cx={radius}
                        cy={radius}
                    />
                    <motion.circle
                        stroke={color}
                        fill="transparent"
                        strokeWidth={stroke}
                        strokeDasharray={circumference + ' ' + circumference}
                        style={{ strokeDashoffset }}
                        strokeLinecap="round"
                        r={normalizedRadius}
                        cx={radius}
                        cy={radius}
                        initial={{ strokeDashoffset: circumference }}
                        animate={{ strokeDashoffset }}
                        transition={{ duration: 1.5, delay, ease: "easeOut" }}
                    />
                </svg>
                <div className="absolute flex flex-col items-center justify-center text-center w-full">
                    <span className="text-lg font-bold text-exec-text tracking-tighter leading-none">{displayValue}</span>
                </div>
            </div>
            <div className="text-center">
                <p className="text-[11px] font-semibold text-[#D1D5DB] leading-tight mb-0.5">{label}</p>
                <p className="text-[9px] font-medium text-exec-text-mut uppercase tracking-wider leading-none max-w-[80px] text-center truncate">{sublabel}</p>
            </div>
        </div>
    );
};

interface StackedCardProps {
    icon: React.ReactNode;
    title: string;
    subtitle: string;
    badge?: number;
    badgeColor?: string;
    onClick?: () => void;
}

const StackedCard = ({ icon, title, subtitle, badge, badgeColor = "bg-exec-hover", onClick }: StackedCardProps) => (
    <div onClick={onClick} className={`bg-exec-card rounded-2xl p-4 flex items-center justify-between border border-exec-border shadow-sm group ${onClick ? 'cursor-pointer hover:bg-exec-surface transition-colors' : ''}`}>
        <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-exec-surface border border-exec-border shadow-inner flex items-center justify-center">
                {icon}
            </div>
            <div>
                <p className="text-sm font-semibold text-exec-text mb-0.5">{title}</p>
                <p className="text-[11px] text-exec-text-sec font-medium">{subtitle}</p>
            </div>
        </div>
        <div className="flex items-center gap-3">
            {badge && badge > 0 ? (
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold text-exec-text ${badgeColor} shadow-sm`}>
                    {badge}
                </span>
            ) : null}
            <ChevronRightIcon className="h-4 w-4 text-exec-text-mut group-hover:text-exec-text transition-colors" />
        </div>
    </div>
);

interface VisitCardProps {
    visit: Visit;
    onMarkDone: (visit: Visit) => void;
    onCancel: (visit: Visit) => void;
    index: number;
    navigate: (path: string) => void;
}

const VisitCard = ({ visit, onMarkDone, onCancel, index, navigate }: VisitCardProps) => {
    const controls = useAnimation();
    const [action, setAction] = useState<"done" | "cancel" | null>(null);

    const handleDragEnd = async (_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
        const threshold = 120;
        if (info.offset.x > threshold) {
            await controls.start({ x: 500, opacity: 0, transition: { duration: 0.2 } });
            onMarkDone(visit);
        } else if (info.offset.x < -threshold) {
            await controls.start({ x: -500, opacity: 0, transition: { duration: 0.2 } });
            onCancel(visit);
        } else {
            controls.start({ x: 0, transition: { type: "spring", stiffness: 300, damping: 20 } });
        }
    };

    const handleDrag = (_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
        if (info.offset.x > 50) setAction("done");
        else if (info.offset.x < -50) setAction("cancel");
        else setAction(null);
    };

    const isDone = visit.status === "done";
    const statusColor = isDone ? "bg-[#2E7D32]" : visit.status === "planned" ? "bg-[#2B6CB0]" : "bg-[#B4690E]";

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="relative rounded-2xl overflow-hidden bg-exec-card touch-pan-y shadow-sm"
        >
            {/* Background Actions */}
            <div className={`absolute inset-0 flex items-center justify-between px-6 transition-colors duration-200 ${action === "done" ? "bg-[#276749]" : action === "cancel" ? "bg-exec-hover" : "bg-exec-surface"}`}>
                <span className={`text-exec-text font-bold flex items-center gap-2 transition-opacity ${action === "done" ? 'opacity-100' : 'opacity-0'}`}><CheckCircle2 className="h-5 w-5" /> DONE</span>
                <span className={`text-exec-text font-bold flex items-center gap-2 transition-opacity ${action === "cancel" ? 'opacity-100' : 'opacity-0'}`}>CANCEL <X className="h-5 w-5" /></span>
            </div>

            {/* Draggable Card */}
            <motion.div
                drag={isDone ? false : "x"}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.2}
                onDrag={handleDrag}
                onDragEnd={handleDragEnd}
                animate={controls}
                className="relative bg-exec-card p-5 rounded-2xl border border-exec-border z-10 w-full"
            >
                <div className="flex justify-between items-start mb-2.5">
                    <p className="text-exec-text-sec text-[10px] font-semibold tracking-widest uppercase">{format(parseISO(visit.visit_date), "hh:mm a")} <span className="mx-1 text-[#6B7280]">•</span> <span className={`text-${isDone ? 'emerald' : 'blue'}-400`}>{visit.status.replace("_", " ")}</span></p>
                    <div className={`w-2 h-2 rounded-full ${statusColor} shadow-sm`} />
                </div>
                <h3 className="text-exec-text font-semibold text-lg leading-tight mb-1 truncate">{visit.clients?.name || visit.partners?.name || "Meeting"}</h3>
                <p className="text-exec-text-sec text-xs font-medium mb-4">{visit.purpose_masters?.purpose_name || visit.purpose || "Follow-up"}</p>

                <div className="flex items-center gap-2 text-xs text-[#D1D5DB] mb-5 bg-exec-surface p-2.5 rounded-xl border border-exec-border shadow-inner">
                    <MapPin className="h-3.5 w-3.5 text-exec-primary shrink-0" />
                    <span className="truncate leading-none pt-0.5">{visit.address || "Location pending"}</span>
                </div>

                <div className="flex gap-2.5">
                    <button
                        onClick={() => {
                            const addr = encodeURIComponent(visit.address || (visit.clients?.name ?? visit.partners?.name ?? 'destination'));
                            window.open(`https://www.google.com/maps/search/?api=1&query=${addr}`, '_blank');
                        }}
                        className="flex-1 bg-exec-surface hover:bg-exec-text/10 text-exec-text rounded-xl py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border border-exec-border"
                    >
                        <Navigation className="h-3.5 w-3.5 text-exec-text-sec" /> Navigate
                    </button>
                    {!isDone && (
                        <button onClick={() => navigate("/verification")} className="flex-1 bg-exec-hover hover:bg-exec-primary text-exec-text rounded-xl py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-sm">
                            <Plus className="h-3.5 w-3.5" /> WOS
                        </button>
                    )}
                </div>

                {!isDone && (
                    <div className="mt-4 flex items-center justify-center gap-2">
                        <ChevronRightIcon className="h-3 w-3 text-[#6B7280] animate-pulse" />
                        <span className="text-[9px] font-semibold text-exec-text-mut uppercase tracking-widest">Swipe to mark done</span>
                        <ChevronRightIcon className="h-3 w-3 text-[#6B7280] animate-pulse" />
                    </div>
                )}
            </motion.div>
        </motion.div>
    );
};

const FAB = ({ navigate }: { navigate: (path: string) => void }) => {
    const [open, setOpen] = useState(false);
    const toggle = () => setOpen(!open);

    return (
        <>
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-exec-bg/80 z-40 backdrop-blur-sm"
                        onClick={() => setOpen(false)}
                    />
                )}
            </AnimatePresence>
            <div className="fixed bottom-24 right-5 z-50 flex flex-col items-end gap-3">
                <AnimatePresence>
                    {open && (
                        <motion.div
                            initial={{ opacity: 0, y: 20, scale: 0.8 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 20, scale: 0.8 }}
                            className="flex flex-col items-end gap-3 mb-2"
                        >
                            <ActionButton label="Mark Done" icon={<CheckCircle2 className="h-4 w-4" />} color="bg-[#276749]" onClick={() => { setOpen(false); navigate("/visits"); }} />
                            <ActionButton label="Add WOS" icon={<Activity className="h-4 w-4" />} color="bg-[#9A5B0B]" onClick={() => { setOpen(false); navigate("/verification"); }} />
                            <ActionButton label="Add Partner" icon={<Building2 className="h-4 w-4" />} color="bg-exec-surface border border-[rgba(255,255,255,0.1)]" onClick={() => { setOpen(false); navigate("/partners"); }} />
                            <ActionButton label="Add Client" icon={<Users className="h-4 w-4" />} color="bg-exec-surface border border-[rgba(255,255,255,0.1)]" onClick={() => { setOpen(false); navigate("/clients"); }} />
                            <ActionButton label="Plan Visit" icon={<CalendarCheck className="h-4 w-4" />} color="bg-exec-hover" onClick={() => { setOpen(false); navigate("/visits"); }} />
                        </motion.div>
                    )}
                </AnimatePresence>
                <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={toggle}
                    className="h-14 w-14 rounded-full bg-exec-hover text-exec-text shadow-lg shadow-black/40 flex items-center justify-center transition-all hover:bg-exec-primary active:scale-95"
                >
                    <motion.div animate={{ rotate: open ? 45 : 0 }}>
                        <Plus className="h-6 w-6" />
                    </motion.div>
                </motion.button>
            </div>
        </>
    );
};

interface ActionButtonProps {
    label: string;
    icon: React.ReactNode;
    color: string;
    onClick: () => void;
}

const ActionButton = ({ label, icon, color, onClick }: ActionButtonProps) => (
    <div className="flex items-center gap-3">
        <span className="text-exec-text text-[11px] font-semibold tracking-wider uppercase bg-exec-surface px-3.5 py-2 rounded-xl shadow-md border border-exec-border">{label}</span>
        <button onClick={onClick} className={`h-10 w-10 rounded-full ${color} text-exec-text shadow-lg flex items-center justify-center`}>
            {icon}
        </button>
    </div>
);
