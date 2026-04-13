import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
    CalendarCheck, MapPin, CheckCircle2, Navigation,
    Plus, Bell, ChevronLeft, ChevronRight, AlertCircle,
    Activity, ChevronRight as ChevronRightIcon,
    Clock, History, Play, X, Target, Medal, Building2, Users,
    TrendingUp, Wallet, Zap, ArrowRight, Star, Loader2, Send
} from "lucide-react";
import { motion, AnimatePresence, useAnimation, PanInfo } from "framer-motion";
import { format, isToday, parseISO, addDays, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { useNavigate } from "react-router-dom";
import { Database } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { calculateRouteDistance } from "@/lib/utils";

type Visit = Omit<Database["public"]["Tables"]["visits"]["Row"], "status"> & {
    status: "planned" | "in_progress" | "done" | "cancelled";
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
    const firstName = (fullName.split(" ")[0] || "Executive").charAt(0).toUpperCase() + (fullName.split(" ")[0] || "").slice(1);

    // ── Fetch profile avatar ──
    const queryClient = useQueryClient();
    const { data: userProfile } = useQuery({
        queryKey: ["userProfile", user?.id],
        queryFn: async () => {
            if (!user?.id) return null;
            const { data } = await supabase.from("profiles").select("avatar_url, full_name").eq("user_id", user.id).maybeSingle();
            return data;
        },
        enabled: !!user?.id,
    });
    const avatarUrl: string | null = (userProfile as any)?.avatar_url || null;

    // ── ADD WOS DIALOG ──
    const [wosDialogVisit, setWosDialogVisit] = useState<Visit | null>(null);
    const [wosForm, setWosForm] = useState({ work_type_id: "", qty: "", description: "" });

    const { data: workTypes = [] } = useQuery({
        queryKey: ["master-work-types-exec"],
        queryFn: async () => {
            const { data } = await supabase.from("master_work_types").select("id, type_of_work, sub_work").order("type_of_work");
            return data || [];
        },
    });

    const addWosMutation = useMutation({
        mutationFn: async () => {
            if (!user || !wosDialogVisit?.client_id) throw new Error("No client");

            const { error } = await supabase.from("work_scope_items").insert({
                client_id: wosDialogVisit.client_id,
                work_type_id: wosForm.work_type_id,
                quantity: wosForm.qty ? parseInt(wosForm.qty) : null,
                description: wosForm.description || null,
                created_by: user.id,
                work_status: "pending",
                is_verified: false,
            });
            if (error) {
                // Unique constraint violation — duplicate WOS
                if (error.code === "23505") throw new Error("This work type has already been added for this client. Duplicates are not allowed.");
                throw error;
            }
        },
        onSuccess: () => {
            toast.success("WOS item added!");
            setWosDialogVisit(null);
            setWosForm({ work_type_id: "", qty: "", description: "" });
            queryClient.invalidateQueries({ queryKey: ["executive-visits-whoop-all"] });
            queryClient.invalidateQueries({ queryKey: ["client-wos-exec", wosDialogVisit?.client_id] });
        },
        onError: (e: any) => toast.error(e.message || "Failed to add WOS"),
    });

    // ── FETCH EXISTING WOS FOR CLIENT (shown in dialog) ──
    const { data: clientWosItems = [] } = useQuery({
        queryKey: ["client-wos-exec", wosDialogVisit?.client_id],
        enabled: !!wosDialogVisit?.client_id && !!user,
        queryFn: async () => {
            const { data } = await supabase
                .from("work_scope_items")
                .select("id, work_status, submitted_at, created_at, master_work_types(type_of_work, sub_work)")
                .eq("client_id", wosDialogVisit!.client_id)
                .eq("created_by", user!.id)
                .order("created_at", { ascending: false });
            return data || [];
        },
    });

    // ── MARK QUOTATION SENT ──
    const markQuotationMutation = useMutation({
        mutationFn: async (wosId: string) => {
            const { error } = await supabase
                .from("work_scope_items")
                .update({ work_status: "submitted", submitted_at: new Date().toISOString() })
                .eq("id", wosId);
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success("Quotation marked as sent!");
            queryClient.invalidateQueries({ queryKey: ["client-wos-exec", wosDialogVisit?.client_id] });
            queryClient.invalidateQueries({ queryKey: ["wos-h3"] });
        },
        onError: () => toast.error("Failed to update"),
    });

    // 1. Fetch own visits (all time)
    const { data: ownVisits = [], refetch: refetchVisits } = useQuery({
        queryKey: ["executive-visits-whoop-all", user?.id],
        queryFn: async () => {
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
        enabled: !!user,
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

    // Fetch today's conveyance records
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
                const distance = await calculateRouteDistance(fromLat, fromLng, gpsLat, gpsLng);
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
                refetchConveyance();
            } else {
                if (!profile?.conveyance_type) {
                    toast.warning("Day Ended. No conveyance recorded — conveyance type not set in profile.");
                } else {
                    toast.success("Day Marked Ended. No return trip calculated.");
                }
                refetchEndDay();
            }
        } catch (e: any) {
            toast.error(e.message || "Failed to end day");
        } finally {
            setIsEndingDay(false);
        }
    };

    // Live Location Tracking
    useEffect(() => {
        let interval: NodeJS.Timeout;
        let trackingPaused = false;

        const sendLocation = async () => {
            if (trackingPaused) return;
            try {
                const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 15000, enableHighAccuracy: true });
                });
                if (user?.id) {
                    await supabase.from("live_locations").upsert({
                        user_id: user.id,
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude,
                        updated_at: new Date().toISOString()
                    });
                    await supabase.from("location_history").insert({
                        user_id: user.id,
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude,
                        timestamp: new Date().toISOString()
                    });
                }
            } catch (err: any) {
                console.error("Failed to broadcast live location", err);
                if (err.code === 1) {
                    trackingPaused = true;
                    if (interval) clearInterval(interval);
                    toast.error("GPS Permission Denied! Live tracking paused.");
                }
            }
        };

        if (todayAttendance && !endDayRecord && user) {
            sendLocation();
            interval = setInterval(sendLocation, 60000);
        }

        return () => { if (interval) clearInterval(interval); };
    }, [todayAttendance, endDayRecord, user]);

    // Fetch own WOS
    const { data: ownWorkScopes = [] } = useQuery({
        queryKey: ["executive-wos-whoop-all", user?.id],
        queryFn: async () => {
            if (!user) return [];
            const { data, error } = await supabase
                .from("work_scope_items")
                .select("*")
                .eq("created_by", user.id);
            if (error) throw error;
            return data;
        },
        enabled: !!user,
    });

    // Fetch Showroom Leaderboard
    const { data: showroomLeaderboard = [] } = useQuery({
        queryKey: ["executive-showroom-leaderboard-rpc", showroomId],
        queryFn: async () => {
            if (!showroomId) return [];
            const { data, error } = await supabase.rpc('get_showroom_leaderboard', { p_showroom_id: showroomId });
            if (error) { console.error("Error fetching leaderboard:", error); return []; }
            return data || [];
        },
        enabled: !!showroomId,
    });

    const displayDate = isToday(selectedDate) ? "TODAY" : format(selectedDate, "dd MMM yyyy");

    const handlePrevDay = () => setSelectedDate(subDays(selectedDate, 1));
    const handleNextDay = () => setSelectedDate(addDays(selectedDate, 1));

    const leaderboard = useMemo(() => {
        if (!showroomLeaderboard.length) return { visits: [], wosCount: [], wosWon: [] };
        const stats = showroomLeaderboard.map(exec => ({
            user_id: exec.user_id,
            full_name: exec.full_name,
            visits: Number(exec.visits_count),
            wosCount: Number(exec.wos_count),
            wosWon: Number(exec.wos_won_total)
        }));
        return {
            visits: [...stats].sort((a, b) => b.visits - a.visits).slice(0, 3),
            wosCount: [...stats].sort((a, b) => b.wosCount - a.wosCount).slice(0, 3),
            wosWon: [...stats].sort((a, b) => b.wosWon - a.wosWon).slice(0, 3),
        };
    }, [showroomLeaderboard]);

    const dailyKpis = useMemo(() => {
        const todayVisits = ownVisits.filter(v => v.visit_date === dateStr);
        const todayPlanned = todayVisits.filter(v => v.status === "planned" || v.status === "in_progress" || v.status === "done").length;
        const todayDone = todayVisits.filter(v => v.status === "done").length;
        const pendingFollowups = todayVisits.filter(v => (v.purpose_masters?.purpose_name || v.purpose || "").toLowerCase().includes("follow")).length;
        const overdueCount = ownVisits.filter(v => v.status === "planned" && v.visit_date < format(new Date(), "yyyy-MM-dd")).length;
        const lastActivity = [...ownVisits].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
        const recentActivityLabel = lastActivity
            ? `Last: ${lastActivity.clients?.name || lastActivity.partners?.name || "Visit"} · ${format(new Date(lastActivity.created_at), "dd MMM, hh:mm a")}`
            : "No recent activity";
        return { todayPlanned, todayDone, pendingFollowups, overdueCount, todayVisits, recentActivityLabel };
    }, [ownVisits, dateStr]);

    const calculateRingKpis = (startDate?: string, endDate?: string) => {
        let filteredVisits = ownVisits;
        let filteredWos = ownWorkScopes;
        if (startDate && endDate) {
            filteredVisits = ownVisits.filter(v => v.visit_date >= startDate && v.visit_date <= endDate);
            filteredWos = ownWorkScopes.filter(w => {
                const createdDate = w.created_at.split('T')[0];
                return createdDate >= startDate && createdDate <= endDate;
            });
        }
        const plannedVisits = filteredVisits.filter(v => v.status === "planned" || v.status === "in_progress" || v.status === "done").length;
        const doneVisits = filteredVisits.filter(v => v.status === "done").length;
        const wosCount = filteredWos.length;
        const wonItems: any[] = [];
        filteredWos.forEach(w => { if (w.work_status === 'won' || w.verified_amount) wonItems.push(w); });
        const estValueCount = filteredWos.length;
        const wonValueCount = wonItems.length;
        const wonPercent = estValueCount > 0 ? Math.round((wonValueCount / estValueCount) * 100) : 0;
        return { plannedVisits, doneVisits, wosCount, estValue: estValueCount, wonValue: wonValueCount, wonPercent, rawVisits: filteredVisits, rawWos: filteredWos, rawWosWon: wonItems };
    };

    const weekKpis = useMemo(() => calculateRingKpis(weekStart, weekEnd), [ownVisits, ownWorkScopes, weekStart, weekEnd]);
    const monthKpis = useMemo(() => calculateRingKpis(monthStart, monthEnd), [ownVisits, ownWorkScopes, monthStart, monthEnd]);
    const totalKpis = useMemo(() => calculateRingKpis(), [ownVisits, ownWorkScopes]);

    const trendData = useMemo(() => {
        const today = new Date();
        return Array.from({ length: 7 }, (_, i) => {
            const d = subDays(today, 6 - i);
            const dStr = format(d, "yyyy-MM-dd");
            const done = ownVisits.filter(v => {
                if (v.status !== 'done') return false;
                const effectiveDate = v.done_at ? v.done_at.split('T')[0] : v.visit_date;
                return effectiveDate === dStr;
            }).length;
            return { day: format(d, "EEE"), date: format(d, "d"), val: done, isToday: i === 6 };
        });
    }, [ownVisits]);

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
            } catch { /* GPS optional */ }
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
            if (e instanceof Error) toast.error(e.message);
            else toast.error("An unknown error occurred");
        }
    };

    const cancelVisit = async (visit: Visit) => {
        try {
            const { error } = await supabase.from("visits").update({ status: "cancelled" }).eq("id", visit.id);
            if (error) throw error;
            toast.success("Visit cancelled.");
            refetchVisits();
        } catch (e: unknown) {
            if (e instanceof Error) toast.error(e.message);
            else toast.error("An unknown error occurred");
        }
    };

    const pendingToday = dailyKpis.todayPlanned - dailyKpis.todayDone;
    const completionPct = dailyKpis.todayPlanned > 0 ? Math.round((dailyKpis.todayDone / dailyKpis.todayPlanned) * 100) : 0;

    // ── NOTIFICATIONS ──
    const [notifOpen, setNotifOpen] = useState(false);
    const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

    const dismissNotif = (id: string) => setDismissedIds(prev => new Set([...prev, id]));
    const dismissAll = () => { setDismissedIds(new Set(notifications.map(n => n.id))); setNotifOpen(false); };

    const notifications = useMemo(() => {
        const items: { id: string; type: 'danger' | 'warning' | 'info'; title: string; desc: string }[] = [];
        const todayStr = format(new Date(), "yyyy-MM-dd");

        // 1. Overdue planned visits
        const overdueVisits = ownVisits.filter(v => v.status === "planned" && v.visit_date < todayStr);
        overdueVisits.slice(0, 5).forEach(v => {
            items.push({
                id: `overdue-${v.id}`,
                type: 'danger',
                title: `Overdue Visit`,
                desc: `${v.clients?.name || v.partners?.name || 'Visit'} — was planned on ${format(parseISO(v.visit_date), "dd MMM")}`,
            });
        });

        // 2. Today's pending visits
        const todayPending = ownVisits.filter(v =>
            v.visit_date === todayStr &&
            (v.status === 'planned' || v.status === 'in_progress')
        );
        if (todayPending.length > 0) {
            items.push({
                id: 'today-pending',
                type: 'warning',
                title: `${todayPending.length} Visit${todayPending.length > 1 ? 's' : ''} Pending Today`,
                desc: todayPending.map(v => v.clients?.name || v.partners?.name || 'Visit').join(', '),
            });
        }

        // 3. Check-in reminder (no attendance today)
        if (!todayAttendance && isToday(selectedDate)) {
            items.push({
                id: 'checkin-reminder',
                type: 'warning',
                title: 'Start Day Pending',
                desc: 'You haven\'t checked in today. GPS tracking is not active.',
            });
        }

        // 4. Forgot to end day
        if (todayAttendance && !endDayRecord && isToday(selectedDate)) {
            const checkInTime = format(parseISO(todayAttendance.created_at), "hh:mm a");
            items.push({
                id: 'endday-reminder',
                type: 'info',
                title: 'Remember to End Day',
                desc: `You checked in at ${checkInTime}. Don't forget to tap End Day when you return.`,
            });
        }

        // 5. Follow-up visits today
        const followups = ownVisits.filter(v =>
            v.visit_date === todayStr &&
            (v.purpose_masters?.purpose_name || v.purpose || '').toLowerCase().includes('follow') &&
            v.status !== 'done'
        );
        if (followups.length > 0) {
            items.push({
                id: 'followup',
                type: 'info',
                title: `${followups.length} Follow-up${followups.length > 1 ? 's' : ''} Today`,
                desc: followups.map(v => v.clients?.name || v.partners?.name || 'Client').join(', '),
            });
        }

        return items.filter(i => !dismissedIds.has(i.id));
    }, [ownVisits, todayAttendance, endDayRecord, selectedDate, dismissedIds]);

    return (
        <div className="w-full min-h-screen bg-background dark:bg-[#0A0B0F] text-foreground dark:text-white font-sans pb-28 overflow-x-hidden">

            {/* ── HEADER ── */}
            <div className="sticky top-0 z-50 bg-background/90 dark:bg-[#0A0B0F]/90 backdrop-blur-2xl border-b border-border dark:border-white/5 px-4 py-3 flex items-center justify-between w-full max-w-full overflow-hidden">
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <div className="h-9 w-9 rounded-full bg-gradient-to-br from-red-700 to-red-900 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-red-900/40 overflow-hidden border-2 border-red-800/50">
                            {avatarUrl ? (
                                <img src={avatarUrl} alt={firstName} className="w-full h-full object-cover" />
                            ) : (
                                <span>{firstName.charAt(0).toUpperCase()}</span>
                            )}
                        </div>
                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-[#0A0B0F] rounded-full" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-[10px] text-muted-foreground dark:text-white/50 font-medium uppercase tracking-[0.15em] truncate">Welcome back</p>
                        <h2 className="text-sm font-bold text-foreground leading-tight truncate">{firstName}</h2>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* Date Navigator */}
                    <div className="flex items-center gap-1 bg-muted/60 rounded-full px-2 py-1.5 border border-border">
                        <button onClick={handlePrevDay} className="p-0.5 text-muted-foreground dark:text-white/50 hover:text-white transition-colors">
                            <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                        <span className="text-[10px] font-bold tracking-wide uppercase w-auto max-w-[80px] text-center text-foreground truncate">{displayDate}</span>
                        <button onClick={handleNextDay} className="p-0.5 text-muted-foreground dark:text-white/50 hover:text-white transition-colors">
                            <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                    </div>
                    {/* Bell */}
                    <div className="relative">
                        <button
                            onClick={() => setNotifOpen(!notifOpen)}
                            className="relative p-2 rounded-full bg-muted/60 border border-border cursor-pointer hover:bg-muted transition-colors"
                        >
                            <Bell className="h-4 w-4 text-muted-foreground dark:text-white/50" />
                            {notifications.length > 0 && (
                                <div className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 rounded-full flex items-center justify-center px-1">
                                    <span className="text-[9px] font-extrabold text-foreground">{notifications.length}</span>
                                </div>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* ── NOTIFICATION DRAWER ── */}
            <AnimatePresence>
                {notifOpen && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
                            onClick={() => setNotifOpen(false)}
                        />
                        {/* Panel */}
                        <motion.div
                            initial={{ opacity: 0, y: -20, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -20, scale: 0.97 }}
                            transition={{ type: "spring", stiffness: 400, damping: 30 }}
                            className="fixed top-16 right-4 z-50 w-[calc(100vw-32px)] max-w-sm bg-[#12141A] border border-border rounded-2xl shadow-2xl shadow-black/60 overflow-hidden"
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                                <div className="flex items-center gap-2">
                                    <Bell className="h-4 w-4 text-muted-foreground dark:text-white/50" />
                                    <h3 className="text-sm font-bold text-foreground">Notifications</h3>
                                    {notifications.length > 0 && (
                                        <span className="bg-red-500 text-foreground text-[9px] font-bold px-1.5 py-0.5 rounded-full">{notifications.length}</span>
                                    )}
                                </div>
                                <button onClick={() => setNotifOpen(false)} className="p-1 rounded-lg hover:bg-muted transition-colors">
                                    <X className="h-4 w-4 text-muted-foreground dark:text-white/50" />
                                </button>
                            </div>

                            {/* Items */}
                            <div className="max-h-[70vh] overflow-y-auto">
                                {notifications.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                                        <div className="w-12 h-12 rounded-2xl bg-muted/60 border border-border flex items-center justify-center mb-3">
                                            <Bell className="h-5 w-5 text-muted-foreground dark:text-white/20" />
                                        </div>
                                        <p className="text-sm font-semibold text-muted-foreground dark:text-white/50">All caught up!</p>
                                        <p className="text-xs text-muted-foreground dark:text-white/25 mt-1">No pending alerts right now</p>
                                    </div>
                                ) : (
                                    <div className="p-3 space-y-2">
                                        {notifications.map((notif) => {
                                            const cfg = {
                                                danger: { bg: "bg-red-500/10", border: "border-red-500/25", dot: "bg-red-500", text: "text-red-400", icon: "🚨" },
                                                warning: { bg: "bg-amber-500/10", border: "border-amber-500/25", dot: "bg-amber-500", text: "text-amber-400", icon: "⚠️" },
                                                info: { bg: "bg-blue-500/10", border: "border-blue-500/25", dot: "bg-blue-500", text: "text-blue-400", icon: "ℹ️" },
                                            }[notif.type];
                                            const getAction = () => {
                                                setNotifOpen(false);
                                                if (notif.id.startsWith('overdue') || notif.id === 'today-pending' || notif.id === 'followup') {
                                                    navigate('/visits');
                                                }
                                            };
                                            return (
                                                <div
                                                    key={notif.id}
                                                    className={`${cfg.bg} border ${cfg.border} rounded-xl p-3 flex gap-3 items-start cursor-pointer hover:opacity-80 active:scale-[0.98] transition-all`}
                                                    onClick={getAction}
                                                >
                                                    <span className="text-base leading-none mt-0.5">{cfg.icon}</span>
                                                    <div className="flex-1 min-w-0">
                                                        <p className={`text-xs font-bold ${cfg.text} mb-0.5`}>{notif.title}</p>
                                                        <p className="text-[11px] text-muted-foreground dark:text-white/50 leading-snug">{notif.desc}</p>
                                                    </div>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); dismissNotif(notif.id); }}
                                                        className="p-1 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 shrink-0 transition-colors"
                                                    >
                                                        <X className="h-3.5 w-3.5 text-muted-foreground dark:text-white/30" />
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Footer */}
                            <div className="px-4 py-3 border-t border-border">
                                <button
                                    onClick={dismissAll}
                                    className="w-full text-xs font-semibold text-muted-foreground dark:text-white/30 hover:text-foreground dark:hover:text-white/50 transition-colors text-center"
                                >
                                    Dismiss All
                                </button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            <div className="px-4 pt-5 pb-2 space-y-4 w-full max-w-full overflow-x-hidden">

                {/* ── LEADERBOARD ── */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.05 }}
                    className="bg-white dark:bg-white/[0.03] shadow-sm dark:shadow-none border border-border dark:border-white/5 rounded-2xl p-4 overflow-hidden"
                >
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-yellow-500/15 flex items-center justify-center">
                                <Medal className="h-4 w-4 text-yellow-500" />
                            </div>
                            <h3 className="text-sm font-bold text-foreground">Showroom Leaderboard</h3>
                        </div>
                        <span className="text-[10px] font-semibold text-muted-foreground dark:text-white/35 bg-muted/60 dark:bg-white/5 px-2 py-0.5 rounded-full">This Month</span>
                    </div>

                    <div className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory grid grid-cols-3 overflow-visible no-scrollbar">
                        {[
                            { title: "Top Visits", data: leaderboard.visits, key: "visits" as const },
                            { title: "Top WOS", data: leaderboard.wosCount, key: "wosCount" as const },
                            { title: "Most Won", data: leaderboard.wosWon, key: "wosWon" as const },
                        ].map(({ title, data, key }) => (
                            <div key={title} className="flex-1 min-w-0 snap-center bg-muted/30 dark:bg-white/[0.04] shadow-sm dark:shadow-none rounded-xl border border-border dark:border-white/5 overflow-hidden">
                                <div className="px-2.5 pt-2.5 pb-1">
                                    <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground dark:text-white/35 mb-2 text-center">{title}</p>
                                </div>
                                <div className="px-2 pb-2 space-y-1">
                                    {data.map((exec, idx) => (
                                        <div
                                            key={exec.user_id}
                                            className={`flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
                                                idx === 0
                                                    ? "bg-yellow-500/10 dark:bg-yellow-500/10"
                                                    : exec.user_id === user?.id
                                                        ? "bg-red-500/10 border border-red-500/20"
                                                        : "hover:bg-muted/60"
                                            }`}
                                            onClick={() => setLeadPopup({ name: exec.full_name || 'Executive', visits: exec.visits, wosCount: exec.wosCount, wosWon: exec.wosWon, rankingLogic: `Ranked by ${title}` })}
                                        >
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-sm w-5 leading-none">{idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉"}</span>
                                                <span className={`text-[11px] truncate max-w-[58px] font-semibold ${idx === 0 ? "text-foreground dark:text-white" : "text-muted-foreground dark:text-white/50"}`}>
                                                    {exec.full_name?.split(' ')[0]}
                                                </span>
                                            </div>
                                            <span className={`text-[11px] font-mono font-bold tabular-nums ${idx === 0 ? "text-yellow-500 dark:text-yellow-400" : "text-muted-foreground dark:text-white/35"}`}>
                                                {exec[key]}
                                            </span>
                                        </div>
                                    ))}
                                    {data.length === 0 && <p className="text-[10px] text-muted-foreground dark:text-white/25 text-center py-2">No data yet</p>}
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>

                {/* ── HERO SECTION: Today's Summary ── */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    className="relative rounded-3xl overflow-hidden p-5"
                    style={{ background: "linear-gradient(135deg, #7f1d1d 0%, #1c0a0a 60%, #0A0B0F 100%)" }}
                >
                    {/* Decorative circles */}
                    <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-red-600/10 blur-2xl pointer-events-none" />
                    <div className="absolute bottom-0 left-0 w-24 h-24 rounded-full bg-red-900/15 blur-xl pointer-events-none" />

                    <div className="relative z-10">
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                <p className="text-[10px] text-red-300/70 font-semibold uppercase tracking-[0.2em] mb-1">Daily Outlook</p>
                                <h3 className="text-2xl font-extrabold text-foreground leading-none">
                                    {pendingToday > 0 ? (
                                        <><span className="text-red-400">{pendingToday}</span> visits left</>
                                    ) : (
                                        <span className="text-emerald-400">All done! 🎉</span>
                                    )}
                                </h3>
                                <p className="text-xs text-muted-foreground dark:text-white/50 mt-1 font-medium">{dailyKpis.todayDone} of {dailyKpis.todayPlanned} completed today</p>
                            </div>
                            {/* Circular progress */}
                            <div className="relative w-16 h-16 flex-shrink-0">
                                <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                                    <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
                                    <motion.circle
                                        cx="32" cy="32" r="26" fill="none"
                                        stroke={completionPct === 100 ? "#34d399" : "#ef4444"}
                                        strokeWidth="5" strokeLinecap="round"
                                        strokeDasharray={`${2 * Math.PI * 26}`}
                                        initial={{ strokeDashoffset: 2 * Math.PI * 26 }}
                                        animate={{ strokeDashoffset: (1 - completionPct / 100) * 2 * Math.PI * 26 }}
                                        transition={{ duration: 1.2, ease: "easeOut" }}
                                    />
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <span className="text-sm font-extrabold text-foreground">{completionPct}%</span>
                                </div>
                            </div>
                        </div>

                        {/* Check-in / End Day Row */}
                        <div className="flex items-center gap-2 flex-wrap">
                            {isToday(selectedDate) && !todayAttendance && (
                                <button
                                    onClick={handleCheckIn}
                                    disabled={isCheckingIn}
                                    className="flex-1 bg-white text-red-700 font-bold rounded-2xl py-3 text-sm flex items-center justify-center gap-2 hover:bg-red-50 transition-all active:scale-95 shadow-lg shadow-red-900/30 disabled:opacity-60"
                                >
                                    <Navigation className="h-4 w-4" />
                                    {isCheckingIn ? "Locating..." : "Start Day & Check In"}
                                </button>
                            )}
                            {isToday(selectedDate) && todayAttendance && (
                                <>
                                    <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                        <span className="text-xs font-bold text-emerald-400">Active</span>
                                    </div>
                                    {!endDayRecord ? (
                                        <button
                                            onClick={handleEndDay}
                                            disabled={isEndingDay}
                                            className="flex-1 bg-muted/80 hover:bg-white/12 text-foreground/70 hover:text-white border border-border font-semibold rounded-2xl py-3 text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60"
                                        >
                                            <History className="h-4 w-4" />
                                            {isEndingDay ? "Ending..." : "End Day"}
                                        </button>
                                    ) : (
                                        <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-muted/60 border border-border">
                                            <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground dark:text-white/50" />
                                            <span className="text-xs font-semibold text-muted-foreground dark:text-white/50">Day Ended</span>
                                        </div>
                                    )}
                                    <button
                                        onClick={() => navigate("/visits")}
                                        className="flex-1 bg-red-600 hover:bg-red-500 text-foreground font-bold rounded-2xl py-3 text-sm flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-red-900/40"
                                    >
                                        <Play className="h-4 w-4 fill-white" /> Next Visit
                                    </button>
                                </>
                            )}
                            {!todayAttendance && !isToday(selectedDate) && (
                                <button
                                    onClick={() => navigate("/visits")}
                                    className="flex-1 bg-red-600 hover:bg-red-500 text-foreground font-bold rounded-2xl py-3 text-sm flex items-center justify-center gap-2 transition-all active:scale-95"
                                >
                                    <ArrowRight className="h-4 w-4" /> View Visits
                                </button>
                            )}
                        </div>
                    </div>
                </motion.div>

                {/* ── QUICK STATS ROW ── */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                    className="grid grid-cols-3 gap-2.5"
                >
                    <QuickStat
                        label="Planned"
                        value={dailyKpis.todayPlanned}
                        icon={<CalendarCheck className="h-4 w-4" />}
                        color="text-blue-500"
                        bg="bg-blue-50 dark:bg-blue-500/10"
                        border="border-blue-200 dark:border-blue-500/20"
                    />
                    <QuickStat
                        label="Done"
                        value={dailyKpis.todayDone}
                        icon={<CheckCircle2 className="h-4 w-4" />}
                        color="text-emerald-500"
                        bg="bg-emerald-50 dark:bg-emerald-500/10"
                        border="border-emerald-200 dark:border-emerald-500/20"
                    />
                    <QuickStat
                        label="Overdue"
                        value={dailyKpis.overdueCount}
                        icon={<AlertCircle className="h-4 w-4" />}
                        color="text-red-500"
                        bg="bg-red-50 dark:bg-red-500/10"
                        border="border-red-200 dark:border-red-500/20"
                    />
                </motion.div>

                {/* ── TODAY'S VISITS ── */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.15 }}
                >
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-bold text-foreground">My Day</h3>
                        <button onClick={() => navigate("/visits")} className="text-[10px] text-red-400 font-semibold flex items-center gap-0.5 hover:text-red-300 transition-colors">
                            View all <ChevronRightIcon className="h-3 w-3" />
                        </button>
                    </div>

                    {dailyKpis.todayVisits.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 bg-card rounded-2xl border border-border text-center px-4">
                            <div className="w-14 h-14 rounded-2xl bg-muted/60 border border-border flex items-center justify-center mb-3">
                                <CalendarCheck className="h-6 w-6 text-muted-foreground dark:text-white/25" />
                            </div>
                            <p className="text-sm font-semibold text-muted-foreground dark:text-white/50 mb-0.5">Your day is clear</p>
                            <p className="text-xs text-muted-foreground dark:text-white/30 mb-4">Plan visits or scout new leads</p>
                            <button onClick={() => navigate("/visits")} className="text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-4 py-2 rounded-xl hover:bg-red-500/20 transition-colors">
                                Plan a Visit
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-2.5 w-full">
                            {dailyKpis.todayVisits.map((visit, i) => (
                                <VisitCard key={visit.id} visit={visit} onMarkDone={markDone} onCancel={cancelVisit} onAddWOS={setWosDialogVisit} index={i} navigate={navigate} />
                            ))}
                        </div>
                    )}
                </motion.div>

                {/* ── PERFORMANCE TREND ── */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.2 }}
                    className="bg-white dark:bg-white/[0.03] shadow-sm dark:shadow-none border border-border dark:border-white/5 rounded-2xl p-4"
                >
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-red-400" />
                            <h3 className="text-sm font-bold text-foreground">Performance Trend</h3>
                        </div>
                        <span className="text-[10px] text-muted-foreground dark:text-white/30 font-medium">Last 7 days</span>
                    </div>
                    <div className="flex items-end justify-between gap-1.5 h-20">
                        {trendData.map((d, i) => {
                            const maxVal = Math.max(1, ...trendData.map(x => x.val));
                            const heightPct = d.val > 0 ? Math.max(8, (d.val / maxVal) * 100) : 6;
                            return (
                                <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                                    <div className="w-full relative flex items-end" style={{ height: "56px" }}>
                                        <motion.div
                                            initial={{ height: 0 }}
                                            animate={{ height: `${heightPct}%` }}
                                            transition={{ duration: 0.8, delay: i * 0.07 }}
                                            className={`w-full rounded-t-md ${d.isToday
                                                ? "bg-red-500 shadow-sm shadow-red-500/40"
                                                : d.val > 0 ? "bg-white/15" : "bg-muted/60"}`}
                                            style={{ position: "absolute", bottom: 0 }}
                                        />
                                    </div>
                                    <p className={`text-[9px] font-bold uppercase ${d.isToday ? "text-red-400" : "text-muted-foreground dark:text-white/30"}`}>{d.day}</p>
                                </div>
                            );
                        })}
                    </div>
                </motion.div>

                {/* ── KPI RINGS — WEEK / MONTH / TOTAL ── */}
                {[
                    { label: "This Week", kpis: weekKpis, delays: [0.25, 0.3, 0.35] },
                    { label: "This Month", kpis: monthKpis, delays: [0.3, 0.35, 0.4] },
                    { label: "Total Overview", kpis: totalKpis, delays: [0.35, 0.4, 0.45] },
                ].map(({ label, kpis, delays }, gi) => (
                    <motion.div
                        key={label}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.2 + gi * 0.05 }}
                        className="bg-white dark:bg-white/[0.03] shadow-sm dark:shadow-none border border-border dark:border-white/5 rounded-2xl p-4"
                    >
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-1 h-4 bg-gradient-to-b from-red-500 to-red-800 rounded-full" />
                            <h3 className="text-[11px] text-muted-foreground dark:text-white/50 font-bold uppercase tracking-[0.15em]">{label}</h3>
                        </div>
                        <div className="flex justify-around items-center">
                            <ProgressRing
                                value={kpis.doneVisits} max={kpis.plannedVisits || 1}
                                label="Visits" sublabel="Done" color="#ef4444"
                                displayValue={`${kpis.doneVisits}/${kpis.plannedVisits}`} delay={delays[0]}
                                onClick={() => setKpiPopup({ title: `${label} - Visits`, metrics: [{ label: "Planned", value: kpis.plannedVisits }, { label: "Done", value: kpis.doneVisits }], list: kpis.rawVisits, type: 'visits' })}
                            />
                            <ProgressRing
                                value={kpis.estValue} max={Math.max(kpis.estValue, 10)}
                                label="WOS Items" sublabel={`${kpis.wosCount} Added`} color="#f97316"
                                displayValue={String(kpis.estValue)} delay={delays[1]}
                                onClick={() => setKpiPopup({ title: `${label} - WOS Count`, metrics: [{ label: "WOS Added", value: kpis.wosCount }, { label: "Total", value: kpis.estValue }], list: kpis.rawWos, type: 'wos_count' })}
                            />
                            <ProgressRing
                                value={kpis.wonPercent} max={100}
                                label="WOS Won" sublabel={`${kpis.wonValue} Won`} color="#22c55e"
                                displayValue={`${kpis.wonPercent}%`} delay={delays[2]}
                                onClick={() => setKpiPopup({ title: `${label} - WOS Won`, metrics: [{ label: "Won", value: kpis.rawWosWon.length }, { label: "Secured", value: kpis.wonValue }], list: kpis.rawWosWon, type: 'wos_won' })}
                            />
                        </div>
                    </motion.div>
                ))}

                {/* ── ACTION QUICK LINKS ── */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.4 }}
                >
                    <h3 className="text-sm font-bold text-foreground mb-3">Quick Actions</h3>
                    <div className="grid grid-cols-2 gap-2.5">
                        <ActionQuickLink icon={<CalendarCheck className="h-5 w-5" />} label="Today's Plan" sub={`${dailyKpis.todayPlanned} stops`} badge={dailyKpis.overdueCount > 0 ? dailyKpis.overdueCount : undefined} badgeColor="bg-red-500" onClick={() => navigate("/visits")} />
                        <ActionQuickLink icon={<Clock className="h-5 w-5" />} label="Follow-ups" sub={`${dailyKpis.pendingFollowups} pending`} badge={dailyKpis.pendingFollowups > 0 ? dailyKpis.pendingFollowups : undefined} onClick={() => navigate("/visits")} />
                        <ActionQuickLink icon={<Activity className="h-5 w-5" />} label="Add WOS" sub="Work scope" onClick={() => navigate("/verification")} />
                        <ActionQuickLink icon={<History className="h-5 w-5" />} label="Recent Activity" sub={dailyKpis.recentActivityLabel.slice(0, 24) + "..."} onClick={() => navigate("/visits")} />
                    </div>
                </motion.div>

                {/* ── CONVEYANCE SUMMARY ── */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.45 }}
                >
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <Wallet className="h-4 w-4 text-emerald-400" />
                            <h3 className="text-sm font-bold text-foreground">My Conveyance</h3>
                        </div>
                        <span className="text-[10px] text-muted-foreground dark:text-white/30 uppercase tracking-widest font-semibold">
                            {isToday(selectedDate) ? "Today" : format(selectedDate, "dd MMM")}
                        </span>
                    </div>

                    {todayConveyance.length === 0 ? (
                        <div className="bg-white dark:bg-white/[0.03] shadow-sm dark:shadow-none border border-border dark:border-white/5 rounded-2xl p-5 flex flex-col items-center text-center gap-2">
                            <div className="w-12 h-12 rounded-2xl bg-muted/60 border border-border flex items-center justify-center mb-1">
                                <Navigation className="h-5 w-5 text-muted-foreground dark:text-white/20" />
                            </div>
                            <p className="text-sm font-semibold text-muted-foreground dark:text-white/50">No trips recorded</p>
                            <p className="text-xs text-muted-foreground dark:text-white/25">Start Day and complete visits to track conveyance</p>
                        </div>
                    ) : (
                        <div className="space-y-2.5">
                            {/* Summary */}
                            <div className="bg-gradient-to-r from-emerald-900/30 to-emerald-900/10 border border-emerald-500/20 rounded-2xl p-4 flex items-center justify-between">
                                <div>
                                    <p className="text-[10px] text-emerald-400/60 font-semibold uppercase tracking-widest mb-1">Total Distance</p>
                                    <p className="text-xl font-extrabold text-foreground font-mono">{todayTotalKm.toFixed(1)} <span className="text-sm text-muted-foreground dark:text-white/50 font-sans">km</span></p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] text-emerald-400/60 font-semibold uppercase tracking-widest mb-1">Total Earned</p>
                                    <p className="text-2xl font-extrabold text-emerald-400 font-mono">₹{todayTotalAmount.toFixed(0)}</p>
                                </div>
                            </div>
                            {/* Trips */}
                            <div className="space-y-2">
                                {todayConveyance.map((trip, i) => (
                                    <div key={trip.id} className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3">
                                        <div className="flex flex-col items-center gap-0.5 shrink-0">
                                            <div className="w-2 h-2 rounded-full bg-white/20" />
                                            <div className="w-px h-3 bg-muted/80" />
                                            <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[11px] text-muted-foreground dark:text-white/50 truncate"><span className="text-muted-foreground dark:text-white/25">{i === 0 ? 'From:' : 'Via:'}</span> {trip.from_location_name}</p>
                                            <p className="text-xs text-foreground/70 font-medium truncate"><span className="text-muted-foreground dark:text-white/25">To:</span> {trip.to_location_name}</p>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="text-xs font-bold text-foreground font-mono">{trip.distance_km} km</p>
                                            <p className="text-xs text-emerald-400 font-semibold">₹{trip.amount}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </motion.div>

                {/* Leaderboard moved to top — duplicate removed */}

            </div>

            {/* ── KPI POPUP ── */}
            <Dialog open={!!kpiPopup} onOpenChange={(open) => !open && setKpiPopup(null)}>
                <DialogContent className="bg-[#111318] border border-border text-foreground max-w-sm w-[95vw] rounded-2xl p-0 overflow-hidden outline-none">
                    <div className="flex flex-col max-h-[80vh]">
                        <div className="p-5 border-b border-border bg-white/[0.02] shrink-0">
                            <DialogHeader>
                                <DialogTitle className="text-lg font-bold text-foreground">{kpiPopup?.title}</DialogTitle>
                            </DialogHeader>
                            <div className="flex gap-3 mt-4">
                                {kpiPopup?.metrics.map((m, i) => (
                                    <div key={i} className="flex-1 bg-muted/60 rounded-xl p-3 border border-border">
                                        <p className="text-[9px] text-muted-foreground dark:text-white/50 font-bold uppercase tracking-wider mb-1">{m.label}</p>
                                        <p className="text-xl font-extrabold text-foreground">{m.value}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="p-4 overflow-y-auto space-y-2 bg-[#0D0E13]">
                            {(!kpiPopup?.list || kpiPopup.list.length === 0) ? (
                                <div className="text-center py-8">
                                    <p className="text-sm text-muted-foreground dark:text-white/30">No records for this metric</p>
                                </div>
                            ) : (
                                kpiPopup.list.map((item, idx) => (
                                    <div key={idx} className="bg-muted/50 border border-border rounded-xl p-3 flex flex-col gap-1.5">
                                        {kpiPopup.type === 'visits' && (
                                            <>
                                                <div className="flex justify-between items-start">
                                                    <p className="font-semibold text-sm text-foreground">{item.clients?.name || item.partners?.name || "Meeting"}</p>
                                                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${item.status === 'done' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-blue-500/15 text-blue-400'}`}>{item.status.replace("_", " ")}</span>
                                                </div>
                                                <p className="text-[11px] text-muted-foreground dark:text-white/35">{item.purpose_masters?.purpose_name || "Follow up"} · {format(parseISO(item.visit_date), "dd MMM")}</p>
                                            </>
                                        )}
                                        {kpiPopup.type !== 'visits' && (
                                            <>
                                                <div className="flex justify-between items-start">
                                                    <p className="font-semibold text-sm text-foreground">Work Scope Item</p>
                                                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${item.work_status === 'won' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-orange-500/15 text-orange-400'}`}>{item.work_status}</span>
                                                </div>
                                                <p className="text-[11px] text-muted-foreground dark:text-white/35">Added: {format(parseISO(item.created_at.split('T')[0]), "dd MMM")}</p>
                                            </>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* ── LEADERBOARD POPUP ── */}
            <Dialog open={!!leadPopup} onOpenChange={(open) => !open && setLeadPopup(null)}>
                <DialogContent className="bg-[#111318] border border-border text-foreground max-w-sm w-[95vw] rounded-2xl p-6 outline-none">
                    <DialogHeader className="mb-5">
                        <DialogTitle className="text-xl font-extrabold text-foreground flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-red-500/15 border border-red-500/25 flex items-center justify-center text-sm font-bold text-red-400">
                                {leadPopup?.name.charAt(0)}
                            </div>
                            {leadPopup?.name}
                        </DialogTitle>
                        <p className="text-[10px] text-muted-foreground dark:text-white/30 font-semibold uppercase tracking-widest mt-1">{leadPopup?.rankingLogic}</p>
                    </DialogHeader>
                    <div className="space-y-2.5">
                        {[
                            { label: "Total Visits Done", value: leadPopup?.visits },
                            { label: "WOS Items Added", value: leadPopup?.wosCount },
                            { label: "WOS Value Won", value: leadPopup?.wosWon, highlight: true },
                        ].map(({ label, value, highlight }) => (
                            <div key={label} className={`rounded-xl p-4 flex justify-between items-center border ${highlight ? "bg-red-500/8 border-red-500/20" : "bg-muted/50 border-border"}`}>
                                <span className={`text-xs font-semibold uppercase tracking-wider ${highlight ? "text-red-400/80" : "text-muted-foreground dark:text-white/50"}`}>{label}</span>
                                <span className={`text-xl font-extrabold font-mono ${highlight ? "text-red-400" : "text-foreground"}`}>{value}</span>
                            </div>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>

            {/* ── ADD WOS DIALOG ── */}
            <Dialog open={!!wosDialogVisit} onOpenChange={(o) => { if (!o) setWosDialogVisit(null); }}>
                <DialogContent className="max-w-sm mx-4">
                    <DialogHeader>
                        <DialogTitle className="text-base font-bold text-foreground">
                            WOS — {wosDialogVisit?.clients?.name}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-1">

                        {/* Existing WOS items for this client */}
                        {clientWosItems.length > 0 && (
                            <div>
                                <p className="text-[11px] font-bold text-foreground/50 uppercase tracking-wider mb-2">Existing WOS Items</p>
                                <div className="space-y-2">
                                    {(clientWosItems as any[]).map((item: any) => {
                                        const isPending = item.work_status === "pending" || item.work_status === "draft";
                                        const isSubmitted = item.work_status === "submitted";
                                        const wt = item.master_work_types;
                                        const statusLabel = isPending ? "WOS" : isSubmitted ? "Quotation" : item.work_status;
                                        const statusCls = isPending
                                            ? "text-sky-600 bg-sky-50 border-sky-200"
                                            : isSubmitted
                                                ? "text-amber-600 bg-amber-50 border-amber-200"
                                                : "text-emerald-600 bg-emerald-50 border-emerald-200";
                                        return (
                                            <div key={item.id} className="flex items-center justify-between bg-muted/50 border border-border rounded-xl px-3 py-2.5 gap-2">
                                                <div className="min-w-0">
                                                    <p className="text-xs font-semibold text-foreground truncate">
                                                        {wt ? `${wt.type_of_work} — ${wt.sub_work}` : "Unknown"}
                                                    </p>
                                                    <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded border mt-1 ${statusCls}`}>
                                                        {statusLabel}
                                                    </span>
                                                </div>
                                                {isPending && (
                                                    <button
                                                        onClick={() => markQuotationMutation.mutate(item.id)}
                                                        disabled={markQuotationMutation.isPending}
                                                        className="shrink-0 flex items-center gap-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition-all"
                                                    >
                                                        <Send className="h-3 w-3" />
                                                        Quotation Sent
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="border-t border-border mt-3 pt-3">
                                    <p className="text-[11px] font-bold text-foreground/50 uppercase tracking-wider mb-2">Add New WOS</p>
                                </div>
                            </div>
                        )}

                        <div>
                            <label className="text-xs font-semibold text-foreground/70 mb-1 block">Work Type *</label>
                            <select
                                value={wosForm.work_type_id}
                                onChange={(e) => setWosForm(f => ({ ...f, work_type_id: e.target.value }))}
                                className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                            >
                                <option value="">Select work type...</option>
                                {workTypes.map(wt => (
                                    <option key={wt.id} value={wt.id}>{wt.type_of_work} — {wt.sub_work}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-foreground/70 mb-1 block">Qty *</label>
                            <input
                                type="number" step="1" min="1" placeholder="e.g. 3"
                                value={wosForm.qty}
                                onChange={(e) => setWosForm(f => ({ ...f, qty: e.target.value }))}
                                className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-foreground/70 mb-1 block">Note (optional)</label>
                            <textarea
                                rows={2} placeholder="Brief description..."
                                value={wosForm.description}
                                onChange={(e) => setWosForm(f => ({ ...f, description: e.target.value }))}
                                className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary resize-none"
                            />
                        </div>
                        <button
                            disabled={!wosForm.work_type_id || !wosForm.qty || addWosMutation.isPending}
                            onClick={() => addWosMutation.mutate()}
                            className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-sm transition-all flex items-center justify-center gap-2"
                        >
                            {addWosMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                            {addWosMutation.isPending ? "Saving..." : "Save WOS"}
                        </button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* ── FAB ── */}
            <FAB navigate={navigate} />
        </div>
    );
};

// ── SUBCOMPONENTS ──

const QuickStat = ({ label, value, icon, color, bg, border }: { label: string; value: number; icon: React.ReactNode; color: string; bg: string; border: string }) => (
    <div className={`${bg} border ${border} rounded-2xl p-3 flex flex-col gap-2`}>
        <div className={`${color}`}>{icon}</div>
        <p className="text-xl font-extrabold text-foreground leading-none">{value}</p>
        <p className="text-[10px] text-foreground/60 font-semibold uppercase tracking-wider">{label}</p>
    </div>
);

const ActionQuickLink = ({ icon, label, sub, badge, badgeColor = "bg-red-500", onClick }: { icon: React.ReactNode; label: string; sub: string; badge?: number; badgeColor?: string; onClick: () => void }) => (
    <button onClick={onClick} className="bg-card border border-border rounded-2xl p-3.5 flex flex-col gap-2 text-left hover:bg-muted/60 hover:border-primary/30 transition-all active:scale-[0.97] relative shadow-sm">
        {badge && badge > 0 && (
            <span className={`absolute top-2.5 right-2.5 ${badgeColor} text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow`}>{badge}</span>
        )}
        <div className="text-foreground/60">{icon}</div>
        <div>
            <p className="text-xs font-bold text-foreground mb-0.5">{label}</p>
            <p className="text-[10px] text-foreground/55 font-medium leading-tight line-clamp-1">{sub}</p>
        </div>
    </button>
);

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
    const radius = 34;
    const stroke = 5;
    const normalizedRadius = radius - stroke * 2;
    const circumference = normalizedRadius * 2 * Math.PI;
    const safeMax = max > 0 ? max : 1;
    const safeValue = Math.min(value, safeMax);
    const strokeDashoffset = circumference - (safeValue / safeMax) * circumference;

    return (
        <div className="flex flex-col items-center cursor-pointer group hover:scale-105 transition-transform" onClick={onClick}>
            <div className="relative flex items-center justify-center mb-2.5">
                <svg height={radius * 2} width={radius * 2} className="transform -rotate-90">
                    <circle stroke="rgba(255,255,255,0.05)" fill="transparent" strokeWidth={stroke} r={normalizedRadius} cx={radius} cy={radius} />
                    <motion.circle
                        stroke={color} fill="transparent" strokeWidth={stroke}
                        strokeDasharray={`${circumference} ${circumference}`} strokeLinecap="round"
                        r={normalizedRadius} cx={radius} cy={radius}
                        initial={{ strokeDashoffset: circumference }}
                        animate={{ strokeDashoffset }}
                        transition={{ duration: 1.5, delay, ease: "easeOut" }}
                    />
                </svg>
                <div className="absolute flex flex-col items-center justify-center text-center">
                    <span className="text-sm font-extrabold text-foreground leading-none">{displayValue}</span>
                </div>
            </div>
            <p className="text-[11px] font-bold text-foreground/70 text-center leading-tight">{label}</p>
            <p className="text-[9px] text-muted-foreground dark:text-white/30 font-medium text-center uppercase tracking-wider">{sublabel}</p>
        </div>
    );
};

interface VisitCardProps {
    visit: Visit;
    onMarkDone: (visit: Visit) => void;
    onCancel: (visit: Visit) => void;
    onAddWOS: (visit: Visit) => void;
    index: number;
    navigate: (path: string) => void;
}

const VisitCard = ({ visit, onMarkDone, onCancel, onAddWOS, index, navigate }: VisitCardProps) => {
    const controls = useAnimation();
    const [action, setAction] = useState<"done" | "cancel" | null>(null);
    const isDone = visit.status === "done";
    const isCancelled = visit.status === "cancelled";

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

    const statusConfig = {
        done: { dot: "bg-emerald-500", text: "text-emerald-400", label: "Done", badge: "bg-emerald-500/12 text-emerald-400 border-emerald-500/20" },
        planned: { dot: "bg-blue-500", text: "text-blue-400", label: "Planned", badge: "bg-blue-500/12 text-blue-400 border-blue-500/20" },
        in_progress: { dot: "bg-amber-500", text: "text-amber-400", label: "In Progress", badge: "bg-amber-500/12 text-amber-400 border-amber-500/20" },
        cancelled: { dot: "bg-red-500", text: "text-red-400", label: "Cancelled", badge: "bg-red-500/12 text-red-400 border-red-500/20" },
        missed: { dot: "bg-red-700", text: "text-red-500", label: "Missed", badge: "bg-red-700/12 text-red-500 border-red-700/20" },
        rescheduled: { dot: "bg-orange-500", text: "text-orange-400", label: "Rescheduled", badge: "bg-orange-500/12 text-orange-400 border-orange-500/20" },
    } as const;
    const sc = statusConfig[(visit.status as keyof typeof statusConfig)] || statusConfig.planned;

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="relative rounded-2xl overflow-hidden touch-pan-y w-full max-w-full"
        >
            {/* Swipe indicator bg */}
            <div className={`absolute inset-0 flex items-center justify-between px-5 rounded-2xl transition-colors duration-150 ${action === "done" ? "bg-emerald-700/60" : action === "cancel" ? "bg-red-700/60" : "bg-transparent"}`}>
                <span className={`text-white font-bold flex items-center gap-1.5 text-sm transition-opacity ${action === "done" ? "opacity-100" : "opacity-0"}`}><CheckCircle2 className="h-4 w-4" /> Done</span>
                <span className={`text-white font-bold flex items-center gap-1.5 text-sm transition-opacity ${action === "cancel" ? "opacity-100" : "opacity-0"}`}>Cancel <X className="h-4 w-4" /></span>
            </div>

            <motion.div
                drag={isDone || isCancelled ? false : "x"}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.15}
                onDrag={handleDrag}
                onDragEnd={handleDragEnd}
                animate={controls}
                className={`relative bg-muted/50 border rounded-2xl p-4 z-10 w-full min-w-0 ${isDone ? "border-emerald-500/15" : isCancelled ? "border-red-500/10" : "border-border"} transition-colors`}
            >
                {/* Top row */}
                <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${sc.dot} shadow-sm`} />
                        <span className={`text-[10px] font-bold uppercase tracking-widest ${sc.text}`}>{sc.label}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground dark:text-white/25 font-medium">
                        {format(parseISO(isDone && visit.done_at ? visit.done_at : visit.created_at), "hh:mm a")}
                    </span>
                </div>

                {/* Client name */}
                <h3 className="text-base font-bold text-foreground leading-tight mb-0.5 truncate">
                    {visit.clients?.name || visit.partners?.name || "Meeting"}
                </h3>
                <p className="text-xs text-muted-foreground dark:text-white/50 font-medium mb-3 truncate">
                    {visit.purpose_masters?.purpose_name || visit.purpose || "Follow-up"}
                </p>

                {/* Address */}
                {visit.address && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground dark:text-white/35 bg-card border border-border rounded-xl px-3 py-2 mb-3 min-w-0 overflow-hidden">
                        <MapPin className="h-3 w-3 text-red-500/60 shrink-0" />
                        <span className="truncate min-w-0 flex-1">{visit.address}</span>
                    </div>
                )}

                {/* Action buttons - Navigate always shows; Add WOS only for client visits */}
                {!isDone && !isCancelled && (
                    <div className="flex gap-2">
                        <button
                            onClick={() => {
                                const addr = encodeURIComponent(visit.address || (visit.clients?.name ?? visit.partners?.name ?? 'destination'));
                                window.open(`https://www.google.com/maps/search/?api=1&query=${addr}`, '_blank');
                            }}
                            className="flex-1 bg-muted/60 hover:bg-muted border border-border text-muted-foreground dark:text-white/50 hover:text-white rounded-xl py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
                        >
                            <Navigation className="h-3.5 w-3.5" /> Navigate
                        </button>
                        {visit.client_id && (
                            <button
                                onClick={() => onAddWOS(visit)}
                                className="flex-1 bg-red-600/80 hover:bg-red-600 text-white rounded-xl py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow shadow-red-900/30"
                            >
                                <Plus className="h-3.5 w-3.5" /> Add WOS
                            </button>
                        )}
                    </div>
                )}

                {!isDone && !isCancelled && (
                    <div className="flex items-center justify-center gap-1.5 mt-3">
                        <ChevronRightIcon className="h-2.5 w-2.5 text-foreground/15 animate-pulse" />
                        <span className="text-[9px] text-muted-foreground dark:text-white/20 font-semibold uppercase tracking-widest">Swipe to mark done</span>
                        <ChevronRightIcon className="h-2.5 w-2.5 text-foreground/15 animate-pulse" />
                    </div>
                )}
            </motion.div>
        </motion.div>
    );
};

const FAB = ({ navigate }: { navigate: (path: string) => void }) => {
    const [open, setOpen] = useState(false);

    const items = [
        { label: "Mark Done", icon: <CheckCircle2 className="h-4 w-4" />, color: "bg-emerald-600", action: () => { setOpen(false); navigate("/visits"); } },
        { label: "Add WOS", icon: <Activity className="h-4 w-4" />, color: "bg-orange-600", action: () => { setOpen(false); navigate("/visits"); } },
        { label: "Add Partner", icon: <Building2 className="h-4 w-4" />, color: "bg-slate-700", action: () => { setOpen(false); navigate("/partners"); } },
        { label: "Add Client", icon: <Users className="h-4 w-4" />, color: "bg-slate-700", action: () => { setOpen(false); navigate("/clients"); } },
        { label: "Plan Visit", icon: <CalendarCheck className="h-4 w-4" />, color: "bg-red-700", action: () => { setOpen(false); navigate("/visits"); } },
    ];

    return (
        <>
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
                        onClick={() => setOpen(false)}
                    />
                )}
            </AnimatePresence>

            <div className="fixed bottom-24 right-4 z-50 flex flex-col items-end gap-3">
                <AnimatePresence>
                    {open && (
                        <motion.div
                            initial={{ opacity: 0, y: 20, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 20, scale: 0.9 }}
                            className="flex flex-col items-end gap-2.5 mb-1"
                        >
                            {items.map((item, i) => (
                                <motion.div
                                    key={item.label}
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 20 }}
                                    transition={{ delay: i * 0.04 }}
                                    className="flex items-center gap-2.5"
                                >
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-white bg-gray-900 border border-white/10 px-3 py-1.5 rounded-xl shadow-lg">{item.label}</span>
                                    <button onClick={item.action} className={`h-10 w-10 rounded-full ${item.color} text-white shadow-lg flex items-center justify-center transition-all hover:scale-110 active:scale-95`}>
                                        {item.icon}
                                    </button>
                                </motion.div>
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>

                <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setOpen(!open)}
                    className="h-14 w-14 rounded-full bg-red-600 text-white shadow-xl shadow-red-900/50 flex items-center justify-center hover:bg-red-500 transition-all"
                >
                    <motion.div animate={{ rotate: open ? 45 : 0 }} transition={{ type: "spring", stiffness: 300 }}>
                        <Plus className="h-6 w-6" />
                    </motion.div>
                </motion.button>
            </div>
        </>
    );
};
