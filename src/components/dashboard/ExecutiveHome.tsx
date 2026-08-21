import { useState, useMemo, useEffect } from "react";
import { useBackgroundTracking } from "@/hooks/useBackgroundTracking";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
    CalendarCheck, CheckCircle2, Navigation,
    Plus, Bell, ChevronLeft, ChevronRight, AlertCircle,
    Activity, ChevronRight as ChevronRightIcon,
    Clock, History, Play, X, Target, Medal, Building2, Users,
    TrendingUp, Wallet, Zap, ArrowRight, Star, Loader2, Send,
    AlertTriangle, Handshake,
} from "lucide-react";
import { motion, AnimatePresence, useAnimation, PanInfo } from "framer-motion";
import { format, isToday, parseISO, addDays, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { useNavigate } from "react-router-dom";
import { Database } from "@/integrations/supabase/types";
import NotificationBell from "@/components/layout/NotificationBell";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RaceCountdown } from "@/components/dashboard/ChampionBanner";

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
    const [expandedTeamAlert, setExpandedTeamAlert] = useState<string | null>(null);
    const [showActionPopup, setShowActionPopup] = useState(false);

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
        rank: number;
        activeCategory: 'visits' | 'wosCount' | 'wosWon';
        isMe: boolean;
        leaderValue: number;
    } | null>(null);
    const [leaderboardTab, setLeaderboardTab] = useState<'visits' | 'wosCount' | 'wosWon'>('visits');

    const dateStr = format(selectedDate, "yyyy-MM-dd");
    
    const weekStart = format(startOfWeek(selectedDate, { weekStartsOn: 1 }), "yyyy-MM-dd");
    const weekEnd = format(endOfWeek(selectedDate, { weekStartsOn: 1 }), "yyyy-MM-dd");
    
    const monthStart = format(startOfMonth(selectedDate), "yyyy-MM-dd");
    const monthEnd = format(endOfMonth(selectedDate), "yyyy-MM-dd");

    const roleLabel = role === 'tl' ? 'Team Leader' : role === 'manager' ? 'Showroom Manager' : 'Executive';
    const fullName: string = user?.user_metadata?.full_name || roleLabel;
    const firstName = (fullName.split(" ")[0] || roleLabel).charAt(0).toUpperCase() + (fullName.split(" ")[0] || "").slice(1);

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

    // ── DONE VISIT PARTNER ACTION POPUP ──
    const [selectedDoneVisit, setSelectedDoneVisit] = useState<{
        visitId: string;
        partnerId: string;
        partnerName: string;
        partnerType: string;
        visitDate: string;
    } | null>(null);

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

    // ── PENDING PARTNERS THIS WEEK ─────────────────────────────────────
    const { data: execPartners = [] } = useQuery({
        queryKey: ["exec-my-partners", user?.id],
        enabled: !!user,
        queryFn: async () => {
            if (!user) return [];
            const { data } = await supabase
                .from("partners")
                .select("id, name, type, city")
                .eq("created_by", user.id)
                .neq("type", "self")   // exclude Direct / self type
                .order("name");
            return data || [];
        },
    });

    const pendingPartners = useMemo(() => {
        // Partners this exec has DONE a visit with THIS week
        const visitedThisWeekIds = new Set(
            ownVisits
                .filter(v =>
                    v.visit_with_type === "partner" &&
                    v.status === "done" &&
                    v.visit_date >= weekStart &&
                    v.visit_date <= weekEnd &&
                    v.partner_id
                )
                .map(v => v.partner_id)
        );

        // All done partner visits (for last-visit calculation)
        const allDonePartnerVisits = ownVisits.filter(
            v => v.visit_with_type === "partner" && v.status === "done" && v.partner_id
        );

        return execPartners
            .filter(p => p.type !== "self")  // exclude Direct partners
            .map(p => {
                const lastDone = allDonePartnerVisits
                    .filter(v => v.partner_id === p.id)
                    .sort((a, b) => b.visit_date.localeCompare(a.visit_date))[0];
                const daysSince = lastDone
                    ? Math.floor((Date.now() - new Date(lastDone.visit_date).getTime()) / 86_400_000)
                    : null;
                return { ...p, lastVisitDate: lastDone?.visit_date || null, daysSince };
            })
            .filter(p => !visitedThisWeekIds.has(p.id))
            .sort((a, b) => {
                if (a.daysSince === null) return -1;
                if (b.daysSince === null) return 1;
                return b.daysSince - a.daysSince;
            });
    }, [execPartners, ownVisits, weekStart, weekEnd]);

    // ── PARTNER VISITS DONE THIS WEEK ──────────────────────────────────────
    const weekPartnerVisitsDone = useMemo(() => {
        return ownVisits
            .filter(v =>
                v.visit_with_type === "partner" &&
                v.status === "done" &&
                v.visit_date >= weekStart &&
                v.visit_date <= weekEnd &&
                v.partner_id
            )
            .sort((a, b) => b.visit_date.localeCompare(a.visit_date));
    }, [ownVisits, weekStart, weekEnd]);

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

                // Office-to-home commute check: starts at showroom/office and ends at "End Day Location"
                const isCommute = 
                  (fromLocationName.toLowerCase().includes("office") || fromLocationName.toLowerCase().includes("showroom"));

                const finalDistance = isCommute ? 0 : distance;
                const finalAmount = isCommute ? 0 : amount;

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
                    distance_km: finalDistance,
                    vehicle_type: profile.conveyance_type,
                    rate_per_km: profile.conveyance_rate || 0,
                    amount: finalAmount
                });
                if (error) throw error;
                toast.success(isCommute ? "Day Ended! (Commute trip home - ₹0 conveyance)" : `Day Ended! Return trip: ${distance} km (₹${amount})`);
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

    // ── Live Location Tracking ──
    // On Android APK: runs in background even when app is minimized/screen off
    // On Web: runs only while tab is open (browser limitation)
    useBackgroundTracking({
        active: !!(todayAttendance && !endDayRecord && user),
        userId: user?.id,
    });

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

    // Fetch own clients (for smart alert calculations)
    const { data: ownClients = [] } = useQuery({
        queryKey: ["executive-own-clients", user?.id],
        enabled: !!user,
        queryFn: async () => {
            if (!user) return [];
            const { data } = await supabase
                .from("clients")
                .select("id, name, partner_id, created_at")
                .eq("created_by", user.id)
                .order("created_at", { ascending: false });
            return data || [];
        },
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

    // ── TEAM ACTION REQUIRED QUERIES (TL, MANAGER, ADMIN, MD) ──
    const { data: allUserRoles = [] } = useQuery({
        queryKey: ["exec-all-user-roles"],
        enabled: !!user && (role === "tl" || role === "manager" || role === "admin" || role === "md"),
        queryFn: async () => {
            const { data, error } = await (supabase.from("user_roles").select("*") as any).eq("is_active", true);
            if (error) throw error;
            return data || [];
        }
    });

    const { data: allProfiles = [] } = useQuery({
        queryKey: ["exec-all-profiles"],
        enabled: !!user && (role === "tl" || role === "manager" || role === "admin" || role === "md"),
        queryFn: async () => {
            const { data, error } = await supabase.from("profiles").select("user_id, full_name");
            if (error) throw error;
            return data || [];
        }
    });

    const teamUserIds = useMemo(() => {
        if (!user || (role !== "tl" && role !== "manager" && role !== "admin" && role !== "md")) return [];
        if (role === "tl") {
            return allUserRoles.filter(r => r.reports_to === user.id && r.role === "executive").map(r => r.user_id);
        } else if (role === "manager" && showroomId) {
            return allUserRoles.filter(r => r.showroom_id === showroomId && r.role === "executive").map(r => r.user_id);
        } else if (role === "admin" || role === "md") {
            return allUserRoles.filter(r => r.role === "executive").map(r => r.user_id);
        }
        return [];
    }, [allUserRoles, role, user, showroomId]);

    const { data: teamVisits = [] } = useQuery({
        queryKey: ["team-visits-alerts", teamUserIds],
        enabled: teamUserIds.length > 0,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("visits")
                .select("id, status, visit_date, created_at, created_by, client_id, partner_id, done_at")
                .in("created_by", teamUserIds);
            if (error) throw error;
            return data || [];
        }
    });

    const { data: teamClients = [] } = useQuery({
        queryKey: ["team-clients-alerts", teamUserIds],
        enabled: teamUserIds.length > 0,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("clients")
                .select("id, name, created_at, created_by, partner_id, project_status")
                .in("created_by", teamUserIds);
            if (error) throw error;
            return data || [];
        }
    });

    const { data: teamWos = [] } = useQuery({
        queryKey: ["team-wos-alerts", teamUserIds],
        enabled: teamUserIds.length > 0,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("work_scope_items")
                .select("id, work_status, created_at, created_by, client_id, amount_in_lac, is_verified")
                .in("created_by", teamUserIds);
            if (error) throw error;
            return data || [];
        }
    });

    const { data: teamPartners = [] } = useQuery({
        queryKey: ["team-partners-alerts", teamUserIds],
        enabled: teamUserIds.length > 0,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("partners")
                .select("id, name, type, created_by")
                .in("created_by", teamUserIds);
            if (error) throw error;
            return data || [];
        }
    });

    const teamAlerts = useMemo(() => {
        if (role !== "tl" && role !== "manager" && role !== "admin" && role !== "md") return [];
        
        const alertsList: {
            id: string;
            type: "inactive" | "partners" | "visits" | "deficit" | "closure";
            title: string;
            count: number;
            details: { name: string; info: string; actionText?: string; actionRoute?: string }[];
        }[] = [];

        const profileMap = Object.fromEntries(allProfiles.map(p => [p.user_id, p.full_name || "Unknown"]));

        // 1. Inactive Employees
        const inactiveDetails: typeof alertsList[number]["details"] = [];
        teamUserIds.forEach(uid => {
            const uVisits = teamVisits.filter(v => v.created_by === uid);
            const uWos = teamWos.filter(w => w.created_by === uid);
            const uClients = teamClients.filter(c => c.created_by === uid);

            const lastActiveDates = [
                ...uVisits.map(v => new Date(v.created_at)),
                ...uWos.map(w => new Date(w.created_at)),
                ...uClients.map(c => new Date(c.created_at))
            ].map(d => d.getTime());

            const lastActive = lastActiveDates.length > 0 ? Math.max(...lastActiveDates) : null;
            if (lastActive) {
                const daysInactive = (Date.now() - lastActive) / 86400000;
                if (daysInactive >= 2.0) {
                    inactiveDetails.push({
                        name: profileMap[uid] || "Unknown",
                        info: `${Math.floor(daysInactive)} days inactive`,
                        actionText: "View Team",
                        actionRoute: "/hierarchy"
                    });
                }
            } else {
                inactiveDetails.push({
                    name: profileMap[uid] || "Unknown",
                    info: "Never active in system",
                    actionText: "View Team",
                    actionRoute: "/hierarchy"
                });
            }
        });
        if (inactiveDetails.length > 0) {
            alertsList.push({
                id: "team-inactive",
                type: "inactive",
                title: `${inactiveDetails.length} Inactive Employee${inactiveDetails.length > 1 ? 's' : ''}`,
                count: inactiveDetails.length,
                details: inactiveDetails
            });
        }

        // 2. Partner Visit Pending (15-day limit)
        const partnerDetails: typeof alertsList[number]["details"] = [];
        const realPartners = teamPartners.filter(p => {
            const name = p.name.toLowerCase();
            return !(
                name.includes("zirakpur") || name.includes("kirti nagar") || name.includes("kirtinagar") ||
                name.includes("gurgaon") || name.includes("gurugram") || name.includes("art n glass") ||
                name.includes("art & glass") || name.includes("art and glass") || name.includes("showroom") ||
                name.includes("home") || name.includes("office") || name.includes("test") ||
                name.includes("testing") || name.includes("demo") || name.includes("dummy") ||
                name.includes("sample") || name.includes("internal") || name.includes("trial")
            );
        });

        realPartners.forEach(p => {
            const pVisits = teamVisits.filter(v => v.partner_id === p.id && v.status === "done");
            const lastVisitDate = pVisits.length > 0 
                ? Math.max(...pVisits.map(v => v.done_at ? new Date(v.done_at).getTime() : new Date(v.visit_date).getTime())) 
                : null;

            if (lastVisitDate) {
                const daysSince = (Date.now() - lastVisitDate) / 86400000;
                if (daysSince >= 12) {
                    partnerDetails.push({
                        name: p.name,
                        info: `${Math.floor(daysSince)} days since last visit (${profileMap[p.created_by] || 'Unassigned'})`,
                        actionText: "Plan Visit",
                        actionRoute: `/visits?partner_id=${p.id}&visit_with_type=partner`
                    });
                }
            } else {
                partnerDetails.push({
                    name: p.name,
                    info: `Never visited (${profileMap[p.created_by] || 'Unassigned'})`,
                    actionText: "Plan Visit",
                    actionRoute: `/visits?partner_id=${p.id}&visit_with_type=partner`
                });
            }
        });
        if (partnerDetails.length > 0) {
            alertsList.push({
                id: "team-partners-pending",
                type: "partners",
                title: `${partnerDetails.length} Partner Visit${partnerDetails.length > 1 ? 's' : ''} Overdue`,
                count: partnerDetails.length,
                details: partnerDetails
            });
        }

        // 3. Low Visit Average (< 2.0 visits/day completed in last 7 days)
        const lowAvgDetails: typeof alertsList[number]["details"] = [];
        const sevenDaysAgo = Date.now() - 7 * 86400000;
        teamUserIds.forEach(uid => {
            const recentVisits = teamVisits.filter(v => v.created_by === uid && v.status === "done" && new Date(v.visit_date).getTime() >= sevenDaysAgo);
            const completedCount = recentVisits.length;
            const avgPerDay = completedCount / 7.0;
            if (avgPerDay < 2.0) {
                lowAvgDetails.push({
                    name: profileMap[uid] || "Unknown",
                    info: `${avgPerDay.toFixed(1)} completed visits/day avg (last 7 days)`,
                    actionText: "Check Performance",
                    actionRoute: "/hierarchy"
                });
            }
        });
        if (lowAvgDetails.length > 0) {
            alertsList.push({
                id: "team-low-avg",
                type: "visits",
                title: `${lowAvgDetails.length} Executive${lowAvgDetails.length > 1 ? 's' : ''} with Low Visit Avg`,
                count: lowAvgDetails.length,
                details: lowAvgDetails
            });
        }

        // 4. Client / WOS Deficit (0 clients or WOS added this week)
        const deficitDetails: typeof alertsList[number]["details"] = [];
        const currentWeekStart = new Date(weekStart).getTime();
        teamUserIds.forEach(uid => {
            const weekClients = teamClients.filter(c => c.created_by === uid && new Date(c.created_at).getTime() >= currentWeekStart).length;
            const weekWos = teamWos.filter(w => w.created_by === uid && new Date(w.created_at).getTime() >= currentWeekStart).length;

            if (weekClients === 0 && weekWos === 0) {
                deficitDetails.push({
                    name: profileMap[uid] || "Unknown",
                    info: `0 clients & 0 WOS items added this week`,
                    actionText: "View Team",
                    actionRoute: "/hierarchy"
                });
            } else if (weekClients === 0) {
                deficitDetails.push({
                    name: profileMap[uid] || "Unknown",
                    info: `0 clients added this week`,
                    actionText: "View Team",
                    actionRoute: "/hierarchy"
                });
            } else if (weekWos === 0) {
                deficitDetails.push({
                    name: profileMap[uid] || "Unknown",
                    info: `0 WOS items added this week`,
                    actionText: "View Team",
                    actionRoute: "/hierarchy"
                });
            }
        });
        if (deficitDetails.length > 0) {
            alertsList.push({
                id: "team-deficit",
                type: "deficit",
                title: `${deficitDetails.length} Executive${deficitDetails.length > 1 ? 's' : ''} with Deficits`,
                count: deficitDetails.length,
                details: deficitDetails
            });
        }

        // 5. Pending Order Closure
        const closureDetails: typeof alertsList[number]["details"] = [];
        const activeClients = teamClients.filter(c => c.project_status === "active" || !c.project_status);
        activeClients.forEach(c => {
            const clientWos = teamWos.filter(w => w.client_id === c.id);
            const hasWonWos = clientWos.some(w => w.work_status === "won" || w.is_verified);
            if (hasWonWos) {
                closureDetails.push({
                    name: c.name,
                    info: `Won order pending final verification / project closure`,
                    actionText: "Close Project",
                    actionRoute: "/hierarchy"
                });
            }
        });
        if (closureDetails.length > 0) {
            alertsList.push({
                id: "team-order-closure",
                type: "closure",
                title: `${closureDetails.length} Won Order${closureDetails.length > 1 ? 's' : ''} Pending Closure`,
                count: closureDetails.length,
                details: closureDetails
            });
        }

        return alertsList;
    }, [teamUserIds, allProfiles, teamVisits, teamWos, teamClients, teamPartners, role, weekStart]);

    const displayDate = isToday(selectedDate) ? "TODAY" : format(selectedDate, "dd MMM yyyy");

    const handlePrevDay = () => setSelectedDate(subDays(selectedDate, 1));
    const handleNextDay = () => setSelectedDate(addDays(selectedDate, 1));

    const leaderboard = useMemo(() => {
        if (!showroomLeaderboard.length) return { visits: [], wosCount: [], wosWon: [] };
        const stats = showroomLeaderboard.map((exec: any) => ({
            user_id: exec.user_id,
            full_name: exec.full_name,
            role: exec.role || 'executive',
            visits: Number(exec.visits_count ?? 0),
            wosCount: Number(exec.wos_count ?? 0),
            wosWon: Number(exec.wos_won_total ?? 0)
        }));
        return {
            visits: [...stats].sort((a, b) => b.visits - a.visits),
            wosCount: [...stats].sort((a, b) => b.wosCount - a.wosCount),
            wosWon: [...stats].sort((a, b) => b.wosWon - a.wosWon),
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
            // Block if day is already ended
            const { data: dayEnded } = await supabase
                .from("conveyance_records")
                .select("id")
                .eq("user_id", user?.id)
                .eq("date", visit.visit_date)
                .is("visit_id", null)
                .maybeSingle();
            if (dayEnded) throw new Error("This day has already been marked ended. Visits cannot be modified.");

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
            const reason = window.prompt("Cancellation reason is mandatory:");
            if (reason === null) return;
            if (!reason.trim()) throw new Error("Cancellation reason is required");
            // Block if day is already ended
            const { data: dayEnded } = await supabase
                .from("conveyance_records")
                .select("id")
                .eq("user_id", user?.id)
                .eq("date", visit.visit_date)
                .is("visit_id", null)
                .maybeSingle();
            if (dayEnded) throw new Error("This day has already been marked ended. Visits cannot be modified.");

            const { error } = await supabase.from("visits").update({ status: "cancelled", remarks: `Cancellation reason: ${reason.trim()}` }).eq("id", visit.id);
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

    // ── SMART ALERT COMPUTATIONS ──────────────────────────────────────────
    const smartAlerts = useMemo(() => {
        const sevenDaysAgo = format(new Date(Date.now() - 7 * 86_400_000), "yyyy-MM-dd");
        const tenDaysAgo = format(new Date(Date.now() - 10 * 86_400_000), "yyyy-MM-dd");

        const alerts: {
            id: string;
            priority: 'critical' | 'warning' | 'info';
            emoji: string;
            title: string;
            desc: string;
            action: string;
            route: string;
            count?: number;
        }[] = [];

        // ① Start Day — must be first (critical)
        if (!todayAttendance && isToday(new Date())) {
            alerts.push({
                id: 'start-day',
                priority: 'critical',
                emoji: '🌅',
                title: 'Start Your Day',
                desc: 'Tap "Start Day" above to activate GPS tracking and begin recording your conveyance for today.',
                action: 'Start Day',
                route: '',
            });
        }

        // ② Partners not visited in > 7 days
        const partnersNeedingVisit = execPartners.filter(p => {
            const lastDone = ownVisits
                .filter(v => v.visit_with_type === 'partner' && v.status === 'done' && v.partner_id === p.id)
                .sort((a, b) => b.visit_date.localeCompare(a.visit_date))[0];
            if (!lastDone) return true;
            return lastDone.visit_date < sevenDaysAgo;
        });
        if (partnersNeedingVisit.length > 0) {
            alerts.push({
                id: 'partner-no-visit',
                priority: 'warning',
                emoji: '🤝',
                title: `${partnersNeedingVisit.length} Partner${partnersNeedingVisit.length > 1 ? 's' : ''} Not Visited in a Week`,
                desc: `${partnersNeedingVisit.slice(0, 3).map(p => p.name).join(', ')}${partnersNeedingVisit.length > 3 ? ` +${partnersNeedingVisit.length - 3} more` : ''} — not visited in over 7 days.`,
                action: 'Plan Visit',
                route: '/visits',
                count: partnersNeedingVisit.length,
            });
        }

        // ③ Partners under which no client was added in last 10 days
        const partnersWithNoRecentClient = execPartners.filter(p => {
            const clientsUnder = ownClients.filter(c => c.partner_id === p.id);
            if (clientsUnder.length === 0) return true;
            const latestClient = clientsUnder.sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
            return latestClient.created_at.split('T')[0] < tenDaysAgo;
        });
        if (partnersWithNoRecentClient.length > 0) {
            alerts.push({
                id: 'no-client-under-partner',
                priority: 'warning',
                emoji: '👤',
                title: `No New Client Added in 10 Days`,
                desc: `${partnersWithNoRecentClient.slice(0, 2).map(p => p.name).join(', ')}${partnersWithNoRecentClient.length > 2 ? ` +${partnersWithNoRecentClient.length - 2} more` : ''} — no client has been added under ${partnersWithNoRecentClient.length > 1 ? 'these partners' : 'this partner'} in the last 10 days.`,
                action: 'Add Client',
                route: '/clients',
                count: partnersWithNoRecentClient.length,
            });
        }

        // ④ Clients with no WOS (work scope) added yet
        const clientIdsWithWos = new Set(ownWorkScopes.map(w => w.client_id));
        const clientsWithoutWos = ownClients.filter(c => !clientIdsWithWos.has(c.id));
        if (clientsWithoutWos.length > 0) {
            alerts.push({
                id: 'clients-no-wos',
                priority: 'warning',
                emoji: '📋',
                title: `${clientsWithoutWos.length} Client${clientsWithoutWos.length > 1 ? 's' : ''} Without Work Scope`,
                desc: `${clientsWithoutWos.slice(0, 3).map(c => c.name).join(', ')}${clientsWithoutWos.length > 3 ? ` +${clientsWithoutWos.length - 3} more` : ''} — no work scope added yet. Add scope to track progress.`,
                action: 'Add Scope',
                route: '/clients',
                count: clientsWithoutWos.length,
            });
        }

        // ⑤ WOS items still pending status update
        const pendingWos = ownWorkScopes.filter(
            w => !['won', 'lost', 'hold'].includes(w.work_status || '')
        );
        if (pendingWos.length > 0) {
            alerts.push({
                id: 'wos-pending-status',
                priority: 'info',
                emoji: '⏳',
                title: `${pendingWos.length} Scope Item${pendingWos.length > 1 ? 's' : ''} Pending Status Update`,
                desc: `${pendingWos.length} work scope item${pendingWos.length > 1 ? 's are' : ' is'} still open — update the outcome to Won, Lost, or On Hold to keep records current.`,
                action: 'Update Now',
                route: '/clients',
                count: pendingWos.length,
            });
        }

        return alerts;
    }, [ownVisits, execPartners, ownClients, ownWorkScopes, todayAttendance]);

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
    }, [ownVisits, todayAttendance, endDayRecord, selectedDate, dismissedIds, smartAlerts]);

    return (
        <div className="w-full min-h-screen bg-background dark:bg-[#0A0B0F] text-foreground dark:text-white font-sans pb-28 overflow-x-hidden pt-16">

            {/* ── HEADER ── */}
            <div className="fixed top-0 left-0 right-0 z-50 bg-background/95 dark:bg-[#0A0B0F]/95 backdrop-blur-2xl border-b border-border dark:border-white/5 px-4 py-3 flex items-center justify-between w-full max-w-full overflow-hidden">
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
                        <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20">
                          {roleLabel}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* Date Navigator */}
                    <div className="flex items-center gap-1 bg-muted/60 rounded-full px-2 py-1.5 border border-border">
                        <button onClick={handlePrevDay} className="p-0.5 text-muted-foreground hover:text-foreground dark:hover:text-white transition-colors">
                            <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                        <span className="text-[10px] font-bold tracking-wide uppercase w-auto max-w-[80px] text-center text-foreground truncate">{displayDate}</span>
                        <button onClick={handleNextDay} className="p-0.5 text-muted-foreground hover:text-foreground dark:hover:text-white transition-colors">
                            <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                    </div>
                    {/* Bell */}
                    <NotificationBell />
                </div>
            </div>

            <div className="px-4 pt-5 pb-2 space-y-4 w-full max-w-full overflow-x-hidden">

                {/* ── LEADERBOARD ── */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.05 }}
                    className="bg-white dark:bg-white/[0.03] shadow-sm dark:shadow-none border border-border dark:border-white/5 rounded-2xl overflow-hidden"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 pt-4 pb-3">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-yellow-500/20 to-yellow-600/10 border border-yellow-500/20 flex items-center justify-center">
                                <Medal className="h-4 w-4 text-yellow-500" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-foreground leading-none">Showroom Leaderboard</h3>
                                <p className="text-[9px] text-muted-foreground dark:text-white/30 font-medium mt-0.5">This Month · {showroomLeaderboard.length} Members</p>
                            </div>
                        </div>
                        {/* My rank badge */}
                        {(() => {
                            const myRank = leaderboard[leaderboardTab].findIndex(e => e.user_id === user?.id);
                            return myRank >= 0 ? (
                                <div className="flex flex-col items-end">
                                    <span className="text-[9px] text-muted-foreground dark:text-white/30 font-semibold uppercase tracking-wider">Your Rank</span>
                                    <span className={`text-lg font-extrabold leading-none mt-0.5 ${
                                        myRank === 0 ? 'text-yellow-400' : myRank === 1 ? 'text-slate-400' : myRank === 2 ? 'text-amber-600' : 'text-foreground'
                                    }`}>#{myRank + 1}</span>
                                </div>
                            ) : null;
                        })()}
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-1 px-4 mb-3">
                        {([
                            { key: 'visits' as const, label: '🏃 Visits' },
                            { key: 'wosCount' as const, label: '📋 WOS' },
                            { key: 'wosWon' as const, label: '🏆 Won' },
                        ]).map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setLeaderboardTab(tab.key)}
                                className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                                    leaderboardTab === tab.key
                                        ? 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border border-yellow-500/25'
                                        : 'text-gray-500 dark:text-white/35 hover:bg-gray-100 dark:hover:bg-muted/60'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* List */}
                    <div className="px-3 pb-4 space-y-1.5">
                        {(() => {
                            const data = leaderboard[leaderboardTab];
                            const topVal = data[0]?.[leaderboardTab] || 1;
                            if (data.length === 0) return (
                                <p className="text-[11px] text-gray-400 dark:text-white/25 text-center py-4">No data yet for this month</p>
                            );

                            const top3 = data.slice(0, 3);
                            const myRankIdx = data.findIndex(e => e.user_id === user?.id);
                            const iAmInTop3 = myRankIdx >= 0 && myRankIdx < 3;
                            const myEntry = myRankIdx >= 0 ? data[myRankIdx] : null;

                            const renderRow = (exec: typeof data[0], idx: number) => {
                                const isMe = exec.user_id === user?.id;
                                const val = exec[leaderboardTab];
                                const barPct = topVal > 0 ? Math.max(4, Math.round((val / topVal) * 100)) : 4;
                                const medalEmoji = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : null;

                                // ── Row background + border (works on white card bg)
                                const rowBg = isMe
                                    ? 'bg-red-50 dark:bg-red-500/10 border-red-300 dark:border-red-500/25 hover:bg-red-100 dark:hover:bg-red-500/15'
                                    : idx === 0
                                        ? 'bg-yellow-50 dark:bg-yellow-500/10 border-yellow-300 dark:border-yellow-500/20 hover:bg-yellow-100 dark:hover:bg-yellow-500/15'
                                        : idx === 1
                                            ? 'bg-slate-100 dark:bg-slate-500/10 border-slate-300 dark:border-slate-400/15 hover:bg-slate-200 dark:hover:bg-slate-500/15'
                                            : idx === 2
                                                ? 'bg-orange-50 dark:bg-amber-600/10 border-orange-200 dark:border-amber-500/15 hover:bg-orange-100 dark:hover:bg-amber-600/15'
                                                : 'bg-gray-50 dark:bg-white/[0.025] border-gray-200 dark:border-white/[0.06] hover:bg-gray-100 dark:hover:bg-white/[0.04]';

                                // ── Name color: dark in light mode, light in dark mode
                                const nameColor = isMe
                                    ? 'text-red-700 dark:text-red-300'
                                    : idx === 0
                                        ? 'text-yellow-700 dark:text-yellow-300'
                                        : idx === 1
                                            ? 'text-slate-700 dark:text-slate-200'
                                            : idx === 2
                                                ? 'text-amber-700 dark:text-amber-300'
                                                : 'text-gray-700 dark:text-white/85';

                                // ── Value color
                                const valColor = isMe
                                    ? 'text-red-600 dark:text-red-400'
                                    : idx === 0
                                        ? 'text-yellow-600 dark:text-yellow-300'
                                        : idx === 1
                                            ? 'text-slate-600 dark:text-slate-300'
                                            : idx === 2
                                                ? 'text-amber-600 dark:text-amber-400'
                                                : 'text-gray-600 dark:text-white/80';

                                // ── Rank number color (non-medal ranks)
                                const rankNumColor = isMe
                                    ? 'text-red-500 dark:text-red-400'
                                    : 'text-gray-400 dark:text-white/50';

                                // ── Bar color
                                const barColor = idx === 0 ? 'bg-yellow-500' : idx === 1 ? 'bg-slate-400' : idx === 2 ? 'bg-amber-500' : isMe ? 'bg-red-500' : 'bg-gray-400 dark:bg-white/20';

                                return (
                                    <div
                                        key={exec.user_id}
                                        onClick={() => setLeadPopup({
                                            name: exec.full_name || 'Executive',
                                            visits: exec.visits,
                                            wosCount: exec.wosCount,
                                            wosWon: exec.wosWon,
                                            rankingLogic: leaderboardTab === 'visits' ? 'Ranked by Visits' : leaderboardTab === 'wosCount' ? 'Ranked by WOS' : 'Ranked by Won',
                                            rank: idx + 1,
                                            activeCategory: leaderboardTab,
                                            isMe,
                                            leaderValue: topVal,
                                        })}
                                        className={`rounded-xl px-3 py-2.5 cursor-pointer transition-all border ${rowBg}`}
                                    >
                                        <div className="flex items-center justify-between mb-1.5">
                                            <div className="flex items-center gap-2">
                                                {medalEmoji ? (
                                                    <span className="text-base leading-none w-5">{medalEmoji}</span>
                                                ) : (
                                                    <span className={`text-[11px] font-bold w-5 text-center ${rankNumColor}`}>#{idx + 1}</span>
                                                )}
                                                <span className={`text-[13px] font-bold truncate max-w-[110px] ${nameColor}`}>
                                                    {exec.full_name || 'Executive'}
                                                </span>
                                                {exec.role === 'tl' && (
                                                    <span className="text-[8px] font-bold bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-300 border border-blue-300 dark:border-blue-400/30 px-1.5 py-0.5 rounded-full shrink-0">TL</span>
                                                )}
                                                {exec.role === 'manager' && (
                                                    <span className="text-[8px] font-bold bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-300 border border-purple-300 dark:border-purple-400/30 px-1.5 py-0.5 rounded-full shrink-0">MGR</span>
                                                )}
                                                {isMe && (
                                                    <span className="text-[8px] font-bold bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-300 border border-red-300 dark:border-red-400/30 px-1.5 py-0.5 rounded-full shrink-0">YOU</span>
                                                )}
                                            </div>
                                            <span className={`text-sm font-extrabold font-mono tabular-nums ${valColor}`}>
                                                {val}
                                            </span>
                                        </div>
                                        <div className="h-1.5 rounded-full bg-gray-200 dark:bg-white/5 overflow-hidden">
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: `${barPct}%` }}
                                                transition={{ duration: 0.8, delay: idx * 0.05, ease: 'easeOut' }}
                                                className={`h-full rounded-full ${barColor}`}
                                            />
                                        </div>
                                    </div>
                                );
                            };


                            return (
                                <>
                                    {/* Top 3 */}
                                    {top3.map((exec, idx) => renderRow(exec, idx))}

                                    {/* Separator + My Rank (only if I'm NOT in top 3) */}
                                    {!iAmInTop3 && myEntry && (
                                        <>
                                            {/* Dotted separator with "your position" label */}
                                            <div className="flex items-center gap-2 py-1 px-1">
                                            <div className="flex-1 border-t border-dashed border-gray-300 dark:border-white/10" />
                                                <span className="text-[9px] font-bold text-gray-400 dark:text-white/25 uppercase tracking-widest whitespace-nowrap">Your Position</span>
                                            <div className="flex-1 border-t border-dashed border-gray-300 dark:border-white/10" />
                                            </div>
                                            {renderRow(myEntry, myRankIdx)}
                                        </>
                                    )}
                                </>
                            );
                        })()}
                    </div>
                </motion.div>

                {/* ── RACE COUNTDOWN ── */}
                {(() => {
                    const lbData = leaderboard[leaderboardTab];
                    const leader = lbData[0];
                    const myEntry = lbData.find(e => e.user_id === user?.id);
                    if (!leader || !myEntry || leader.user_id === user?.id) return null;
                    return (
                        <RaceCountdown
                            leaderName={leader.full_name.split(' ')[0]}
                            leaderScore={leader[leaderboardTab]}
                            myScore={myEntry[leaderboardTab]}
                            category={leaderboardTab}
                        />
                    );
                })()}

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

                {/* ── PENDING PARTNERS THIS WEEK ── */}
                {execPartners.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.18 }}
                        className="bg-white dark:bg-white/[0.03] shadow-sm dark:shadow-none border border-border dark:border-white/5 rounded-2xl p-4"
                    >
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <Handshake className="h-4 w-4 text-amber-500" />
                                <h3 className="text-sm font-bold text-foreground">Partners Not Visited This Week</h3>
                            </div>
                            {pendingPartners.length > 0 ? (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-500 border border-red-500/20">
                                    {pendingPartners.length} pending
                                </span>
                            ) : (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/20">
                                    All visited ✓
                                </span>
                            )}
                        </div>

                        {pendingPartners.length === 0 ? (
                            <div className="flex items-center gap-3 py-3 px-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                                <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                                <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                                    Great work! You've visited all your partners this week.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {pendingPartners.slice(0, 5).map(p => {
                                    const isNeverVisited = p.daysSince === null;
                                    const days = p.daysSince ?? 999;
                                    // Heat-map coloring: green(<7) → amber(7-10) → orange(10-14) → red(14+)
                                    const urgencyTier = isNeverVisited
                                        ? 4
                                        : days >= 14 ? 4 : days >= 10 ? 3 : days >= 7 ? 2 : 1;
                                    const dotColor = urgencyTier === 4 ? 'bg-red-500' : urgencyTier === 3 ? 'bg-orange-500' : urgencyTier === 2 ? 'bg-amber-500' : 'bg-emerald-500';
                                    const textColor = urgencyTier === 4 ? 'text-red-600 dark:text-red-400' : urgencyTier === 3 ? 'text-orange-600 dark:text-orange-400' : urgencyTier === 2 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400';
                                    const rowBg = urgencyTier === 4
                                        ? 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20 hover:bg-red-100 dark:hover:bg-red-500/15'
                                        : urgencyTier === 3
                                            ? 'bg-orange-50 dark:bg-orange-500/10 border-orange-200 dark:border-orange-500/20 hover:bg-orange-100 dark:hover:bg-orange-500/15'
                                            : urgencyTier === 2
                                                ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20 hover:bg-amber-100 dark:hover:bg-amber-500/15'
                                                : 'bg-muted/40 border-border hover:bg-muted/60';
                                    const urgencyLabel = isNeverVisited
                                        ? 'Never visited'
                                        : days >= 14
                                            ? `${days}d — CRITICAL`
                                            : days >= 10
                                                ? `${days}d — Overdue`
                                                : `${days}d ago`;
                                    return (
                                        <div
                                            key={p.id}
                                            className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border transition-colors cursor-pointer ${rowBg}`}
                                            onClick={() => navigate(`/visits?partner_id=${p.id}&visit_with_type=partner`)}
                                            title={`Plan visit with ${p.name}`}
                                        >
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotColor} ${urgencyTier >= 3 ? 'animate-pulse' : ''}`} />
                                                <div className="min-w-0">
                                                    <p className="text-sm font-semibold truncate leading-tight text-gray-800 dark:text-foreground">{p.name}</p>
                                                    <p className="text-[10px] text-muted-foreground capitalize">{p.type}{p.city ? ` · ${p.city}` : ''}</p>
                                                </div>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className={`text-[11px] font-bold ${textColor}`}>{urgencyLabel}</p>
                                                {urgencyTier >= 3 && (
                                                    <p className="text-[9px] text-gray-400 dark:text-white/30 mt-0.5">Tap to plan visit</p>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                                {pendingPartners.length > 5 && (
                                    <p className="text-[11px] text-muted-foreground text-center pt-1">
                                        +{pendingPartners.length - 5} more pending
                                    </p>
                                )}
                                <button
                                    onClick={() => navigate("/partners")}
                                    className="w-full mt-1 text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-4 py-2 rounded-xl hover:bg-amber-500/20 transition-colors flex items-center justify-center gap-1.5"
                                >
                                    <Handshake className="h-3.5 w-3.5" /> View All Partners
                                </button>
                            </div>
                        )}
                    </motion.div>
                )}

                {/* ── PARTNER VISITS DONE THIS WEEK ── */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.20 }}
                    className="bg-white dark:bg-white/[0.03] shadow-sm dark:shadow-none border border-border dark:border-white/5 rounded-2xl p-4"
                >
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            <h3 className="text-sm font-bold text-foreground">Partner Visits This Week</h3>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                weekPartnerVisitsDone.length > 0
                                    ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/20"
                                    : "bg-muted/60 text-muted-foreground border-border"
                            }`}>
                                {weekPartnerVisitsDone.length} done
                            </span>
                            <button
                                onClick={() => navigate("/partner-visits")}
                                className="text-[10px] text-primary font-semibold flex items-center gap-0.5 hover:text-primary/80 transition-colors"
                            >
                                View all <ChevronRightIcon className="h-3 w-3" />
                            </button>
                        </div>
                    </div>

                    {weekPartnerVisitsDone.length === 0 ? (
                        <div className="flex items-center gap-3 py-3 px-3 rounded-xl bg-muted/30 border border-border">
                            <Handshake className="h-5 w-5 text-muted-foreground shrink-0" />
                            <p className="text-sm text-muted-foreground font-medium">
                                No partner visits done yet this week.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {weekPartnerVisitsDone.slice(0, 5).map(v => {
                                const partner = v.partners as any;
                                const partnerName = partner?.name || "Unknown Partner";
                                const daysLabel = v.visit_date === format(new Date(), "yyyy-MM-dd")
                                    ? "Today"
                                    : format(new Date(v.visit_date), "EEE, dd MMM");
                                return (
                                    <div
                                        key={v.id}
                                        className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/15 hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-colors cursor-pointer"
                                        onClick={() => {
                                            const partner = v.partners as any;
                                            setSelectedDoneVisit({
                                                visitId: v.id,
                                                partnerId: v.partner_id || "",
                                                partnerName: partner?.name || "Unknown Partner",
                                                partnerType: partner?.type === "self" ? "Direct" : (partner?.type || ""),
                                                visitDate: v.visit_date,
                                            });
                                        }}
                                    >
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold truncate leading-tight">{partnerName}</p>
                                                <p className="text-[10px] text-muted-foreground capitalize">
                                                    {(partner?.type === "self" ? "Direct" : partner?.type) || ""}
                                                    {partner?.city ? ` · ${partner.city}` : ""}
                                                </p>
                                            </div>
                                        </div>
                                        <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 shrink-0 whitespace-nowrap">
                                            {daysLabel}
                                        </span>
                                    </div>
                                );
                            })}
                            {weekPartnerVisitsDone.length > 5 && (
                                <p className="text-[11px] text-muted-foreground text-center pt-1">
                                    +{weekPartnerVisitsDone.length - 5} more this week
                                </p>
                            )}
                        </div>
                    )}
                </motion.div>

                {/* ── TEAM ACTION REQUIRED (TL, MANAGER, ADMIN & MD) ── */}
                {(role === "tl" || role === "manager" || role === "admin" || role === "md") && teamAlerts.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.21 }}
                        className="bg-white dark:bg-white/[0.03] shadow-sm dark:shadow-none border border-border dark:border-white/5 rounded-2xl overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border dark:border-white/5">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-red-600/20 to-red-500/10 border border-red-500/30 flex items-center justify-center">
                                    <Users className="h-4 w-4 text-red-500" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-foreground leading-none">Team Action Required</h3>
                                    <p className="text-[9px] text-muted-foreground dark:text-white/30 font-medium mt-0.5">
                                        {teamAlerts.length} issue category{teamAlerts.length > 1 ? 's' : ''} require attention
                                    </p>
                                </div>
                            </div>
                            <span className="min-w-[22px] h-[22px] bg-red-600 rounded-full flex items-center justify-center px-1.5">
                                <span className="text-[10px] font-extrabold text-white">{teamAlerts.reduce((acc, alert) => acc + alert.count, 0)}</span>
                            </span>
                        </div>

                        {/* Accordion Categories */}
                        <div className="divide-y divide-border dark:divide-white/5">
                            {teamAlerts.map((alert, idx) => {
                                const isExpanded = expandedTeamAlert === alert.id;
                                const alertIcon = {
                                    inactive: <Clock className="h-4 w-4 text-red-500" />,
                                    partners: <Handshake className="h-4 w-4 text-red-500" />,
                                    visits: <AlertCircle className="h-4 w-4 text-red-500" />,
                                    deficit: <TrendingUp className="h-4 w-4 text-red-500" />,
                                    closure: <CheckCircle2 className="h-4 w-4 text-red-500" />,
                                }[alert.type] || <AlertCircle className="h-4 w-4 text-red-500" />;

                                return (
                                    <div key={alert.id} className="relative">
                                        {/* Row Header */}
                                        <button
                                            onClick={() => setExpandedTeamAlert(isExpanded ? null : alert.id)}
                                            className="w-full flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-black/5 dark:hover:bg-white/[0.02] transition-colors text-left"
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-7 h-7 rounded-lg bg-red-500/10 border border-red-500/15 flex items-center justify-center shrink-0">
                                                    {alertIcon}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-[12px] font-bold text-foreground leading-tight">
                                                        {alert.title}
                                                    </p>
                                                    <p className="text-[10px] text-muted-foreground mt-0.5">
                                                        {alert.count} case{alert.count > 1 ? 's' : ''} pending follow-up
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-red-500/15 text-red-500 border border-red-500/20">
                                                    {alert.count}
                                                </span>
                                                <ChevronRightIcon className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                                            </div>
                                        </button>

                                        {/* Accordion Expandable Details */}
                                        <AnimatePresence initial={false}>
                                            {isExpanded && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: "auto", opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    transition={{ duration: 0.25, ease: "easeInOut" }}
                                                    className="overflow-hidden bg-black/[0.02] dark:bg-white/[0.01] border-t border-border dark:border-white/5"
                                                >
                                                    <div className="px-4 py-2 divide-y divide-border/50 dark:divide-white/[0.03]">
                                                        {alert.details.map((detail, dIdx) => (
                                                            <div key={dIdx} className="flex items-center justify-between gap-3 py-2.5">
                                                                <div className="min-w-0">
                                                                    <p className="text-xs font-semibold text-gray-800 dark:text-foreground">
                                                                        {detail.name}
                                                                    </p>
                                                                    <p className="text-[10px] text-muted-foreground mt-0.5">
                                                                        {detail.info}
                                                                    </p>
                                                                </div>
                                                                {detail.actionRoute && (
                                                                    <button
                                                                        onClick={() => navigate(detail.actionRoute!)}
                                                                        className="shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-lg bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                                                                    >
                                                                        {detail.actionText || "View"}
                                                                    </button>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                );
                            })}
                        </div>
                    </motion.div>
                )}

                {/* ── SMART ACTION CENTER ── */}
                {smartAlerts.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.22 }}
                        className="bg-white dark:bg-white/[0.03] shadow-sm dark:shadow-none border border-border dark:border-white/5 rounded-2xl overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border dark:border-white/5">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-red-500/20 to-orange-500/10 border border-red-500/20 flex items-center justify-center">
                                    <AlertTriangle className="h-4 w-4 text-red-500" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-foreground leading-none">Action Required</h3>
                                    <p className="text-[9px] text-muted-foreground dark:text-white/30 font-medium mt-0.5">
                                        {smartAlerts.length} item{smartAlerts.length > 1 ? 's' : ''} need your attention
                                    </p>
                                </div>
                            </div>
                            <span className="min-w-[22px] h-[22px] bg-red-500 rounded-full flex items-center justify-center">
                                <span className="text-[10px] font-extrabold text-white">{smartAlerts.length}</span>
                            </span>
                        </div>

                        {/* Alert rows */}
                        <div className="divide-y divide-border dark:divide-white/5">
                            {smartAlerts.map((alert, idx) => {
                                const cfg = {
                                    critical: {
                                        leftBar: 'bg-red-500',
                                        rowBg: 'bg-red-500/[0.04]',
                                        badge: 'bg-red-500/15 text-red-500 border-red-500/25',
                                        badgeLabel: 'URGENT',
                                        btn: 'bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20',
                                    },
                                    warning: {
                                        leftBar: 'bg-amber-400',
                                        rowBg: 'bg-amber-500/[0.03]',
                                        badge: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25',
                                        badgeLabel: 'ACTION',
                                        btn: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 hover:bg-amber-500/20',
                                    },
                                    info: {
                                        leftBar: 'bg-blue-400',
                                        rowBg: 'bg-blue-500/[0.03]',
                                        badge: 'bg-blue-500/15 text-blue-500 border-blue-500/25',
                                        badgeLabel: 'INFO',
                                        btn: 'bg-blue-500/10 text-blue-500 border-blue-500/20 hover:bg-blue-500/20',
                                    },
                                }[alert.priority];

                                return (
                                    <motion.div
                                        key={alert.id}
                                        initial={{ opacity: 0, x: -6 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 0.24 + idx * 0.06 }}
                                        className={`relative flex items-start gap-3 px-4 py-3.5 ${cfg.rowBg}`}
                                    >
                                        {/* Left accent bar */}
                                        <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${cfg.leftBar} rounded-r-sm`} />

                                        {/* Emoji */}
                                        <span className="text-xl leading-none shrink-0 mt-0.5 ml-1">{alert.emoji}</span>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                                                <p className="text-[12px] font-bold text-foreground leading-tight">{alert.title}</p>
                                                <span className={`text-[8px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${cfg.badge} shrink-0`}>
                                                    {cfg.badgeLabel}
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-muted-foreground dark:text-white/40 leading-snug">{alert.desc}</p>
                                            {alert.route && (
                                                <button
                                                    onClick={() => navigate(alert.route)}
                                                    className={`mt-2 text-[10px] font-bold px-3 py-1 rounded-lg border transition-colors ${cfg.btn} inline-flex items-center gap-1`}
                                                >
                                                    {alert.action} <ChevronRightIcon className="h-2.5 w-2.5" />
                                                </button>
                                            )}
                                        </div>

                                        {/* Count */}
                                        {alert.count !== undefined && (
                                            <div className="shrink-0 self-center">
                                                <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-extrabold font-mono border ${cfg.badge}`}>
                                                    {alert.count}
                                                </span>
                                            </div>
                                        )}
                                    </motion.div>
                                );
                            })}
                        </div>
                    </motion.div>
                )}

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
                <DialogContent className="bg-[#131620] border border-white/10 text-white max-w-sm w-[95vw] rounded-2xl p-0 overflow-hidden outline-none">

                    {/* ── TOP BANNER ── */}
                    <div className={`relative px-5 pt-5 pb-5 ${
                        leadPopup?.rank === 1
                            ? 'bg-gradient-to-br from-yellow-800/50 via-yellow-900/30 to-transparent'
                            : leadPopup?.rank === 2
                                ? 'bg-gradient-to-br from-slate-600/40 via-slate-700/20 to-transparent'
                                : leadPopup?.rank === 3
                                    ? 'bg-gradient-to-br from-amber-800/40 via-amber-900/20 to-transparent'
                                    : leadPopup?.isMe
                                        ? 'bg-gradient-to-br from-red-800/35 via-red-900/15 to-transparent'
                                        : 'bg-white/[0.03]'
                    } border-b border-white/10`}>
                        <div className="flex items-center gap-4">
                            {/* Avatar */}
                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-black border-2 shrink-0 ${
                                leadPopup?.rank === 1 ? 'bg-yellow-500/25 border-yellow-400/50 text-yellow-300'
                                : leadPopup?.rank === 2 ? 'bg-slate-400/20 border-slate-300/40 text-slate-200'
                                : leadPopup?.rank === 3 ? 'bg-amber-600/25 border-amber-500/40 text-amber-300'
                                : leadPopup?.isMe ? 'bg-red-500/20 border-red-400/40 text-red-300'
                                : 'bg-white/10 border-white/15 text-white/80'
                            }`}>
                                {leadPopup?.name.charAt(0).toUpperCase()}
                            </div>

                            {/* Name & subtitle */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h2 className={`text-lg font-black leading-tight truncate ${
                                        leadPopup?.rank === 1 ? 'text-yellow-200'
                                        : leadPopup?.rank === 2 ? 'text-slate-100'
                                        : leadPopup?.rank === 3 ? 'text-amber-200'
                                        : leadPopup?.isMe ? 'text-red-200'
                                        : 'text-white'
                                    }`}>{leadPopup?.name}</h2>
                                    {leadPopup?.isMe && (
                                        <span className="shrink-0 text-[9px] font-black bg-red-500/30 text-red-200 border border-red-400/40 px-2 py-0.5 rounded-full">YOU</span>
                                    )}
                                </div>
                                <p className="text-[11px] text-white/60 font-semibold mt-1">{leadPopup?.rankingLogic}</p>
                            </div>

                            {/* Rank badge */}
                            <div className="text-center shrink-0">
                                <div className="text-3xl font-black leading-none">
                                    {leadPopup?.rank === 1 ? '🥇' : leadPopup?.rank === 2 ? '🥈' : leadPopup?.rank === 3 ? '🥉' : (
                                        <span className={`text-2xl font-black ${leadPopup?.isMe ? 'text-red-300' : 'text-white/80'}`}>
                                            #{leadPopup?.rank}
                                        </span>
                                    )}
                                </div>
                                <p className="text-[9px] text-white/50 font-bold uppercase tracking-widest mt-1">RANK</p>
                            </div>
                        </div>
                    </div>

                    {/* ── STATS ── */}
                    <div className="px-4 py-4 space-y-3">
                        {([
                            {
                                label: 'Visits Done',
                                icon: '🏃',
                                value: leadPopup?.visits ?? 0,
                                leaderVal: leadPopup?.activeCategory === 'visits' ? leadPopup.leaderValue : (leaderboard.visits[0]?.visits ?? 1),
                                highlight: leadPopup?.activeCategory === 'visits',
                                color: 'text-blue-300',
                                barColor: 'bg-blue-400',
                                trackColor: 'bg-blue-400/20',
                                cardBg: 'bg-blue-500/10 border-blue-400/20',
                                dimCardBg: 'bg-white/[0.03] border-white/10',
                            },
                            {
                                label: 'WOS Added',
                                icon: '📋',
                                value: leadPopup?.wosCount ?? 0,
                                leaderVal: leadPopup?.activeCategory === 'wosCount' ? leadPopup.leaderValue : (leaderboard.wosCount[0]?.wosCount ?? 1),
                                highlight: leadPopup?.activeCategory === 'wosCount',
                                color: 'text-orange-300',
                                barColor: 'bg-orange-400',
                                trackColor: 'bg-orange-400/20',
                                cardBg: 'bg-orange-500/10 border-orange-400/20',
                                dimCardBg: 'bg-white/[0.03] border-white/10',
                            },
                            {
                                label: 'WOS Won',
                                icon: '🏆',
                                value: leadPopup?.wosWon ?? 0,
                                leaderVal: leadPopup?.activeCategory === 'wosWon' ? leadPopup.leaderValue : (leaderboard.wosWon[0]?.wosWon ?? 1),
                                highlight: leadPopup?.activeCategory === 'wosWon',
                                color: 'text-emerald-300',
                                barColor: 'bg-emerald-400',
                                trackColor: 'bg-emerald-400/20',
                                cardBg: 'bg-emerald-500/10 border-emerald-400/20',
                                dimCardBg: 'bg-white/[0.03] border-white/10',
                            },
                        ]).map(({ label, icon, value, leaderVal, highlight, color, barColor, trackColor, cardBg, dimCardBg }) => {
                            const safeLeader = Math.max(leaderVal, 1);
                            const barPct = Math.max(4, Math.round((value / safeLeader) * 100));
                            const gap = safeLeader - value;
                            return (
                                <div key={label} className={`rounded-2xl p-4 border ${highlight ? cardBg : dimCardBg}`}>
                                    {/* Label row */}
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <span className="text-base leading-none">{icon}</span>
                                            <span className={`text-[12px] font-extrabold uppercase tracking-wider ${
                                                highlight ? color : 'text-white/75'
                                            }`}>{label}</span>
                                            {highlight && (
                                                <span className="text-[8px] font-black bg-yellow-400/20 text-yellow-300 border border-yellow-400/30 px-1.5 py-0.5 rounded-full">ACTIVE</span>
                                            )}
                                        </div>
                                        {/* Value — always bold & visible */}
                                        <span className={`text-2xl font-black font-mono tabular-nums ${
                                            highlight ? color : 'text-white/90'
                                        }`}>{value}</span>
                                    </div>

                                    {/* Progress bar */}
                                    <div className={`h-2 rounded-full overflow-hidden mb-2 ${highlight ? trackColor : 'bg-white/10'}`}>
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${barPct}%` }}
                                            transition={{ duration: 0.9, ease: 'easeOut' }}
                                            className={`h-full rounded-full ${highlight ? barColor : 'bg-white/30'}`}
                                        />
                                    </div>

                                    {/* Gap / leader text */}
                                    {gap > 0 ? (
                                        <p className="text-[10px] text-white/60 font-semibold">
                                            {gap} behind leader · {barPct}% of top
                                        </p>
                                    ) : (
                                        <p className="text-[10px] text-yellow-300 font-bold">🏅 Leading this category!</p>
                                    )}
                                </div>
                            );
                        })}
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

            {/* ── DONE VISIT PARTNER ACTION DIALOG ── */}
            <Dialog open={!!selectedDoneVisit} onOpenChange={(o) => !o && setSelectedDoneVisit(null)}>
                <DialogContent className="max-w-sm rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-base">
                            <Handshake className="h-5 w-5 text-emerald-500" />
                            {selectedDoneVisit?.partnerName}
                        </DialogTitle>
                    </DialogHeader>

                    {selectedDoneVisit && (
                        <div className="space-y-3 pt-1">
                            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/40 border border-border">
                                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                                <div>
                                    <p className="text-xs font-semibold text-foreground">
                                        Visited on {format(new Date(selectedDoneVisit.visitDate), "EEE, dd MMM yyyy")}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground capitalize">
                                        {selectedDoneVisit.partnerType}
                                    </p>
                                </div>
                            </div>

                            <p className="text-xs text-muted-foreground px-1">What would you like to do?</p>

                            <button
                                onClick={() => {
                                    setSelectedDoneVisit(null);
                                    navigate(`/visits?partner_id=${selectedDoneVisit.partnerId}&visit_with_type=partner`);
                                }}
                                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors"
                            >
                                <CalendarCheck className="h-4 w-4 shrink-0" />
                                <div className="text-left">
                                    <p className="font-bold text-sm">Reschedule Visit</p>
                                    <p className="text-[10px] opacity-80">Plan a new visit — form pre-filled</p>
                                </div>
                                <ChevronRightIcon className="h-4 w-4 ml-auto shrink-0" />
                            </button>

                            <button
                                onClick={() => setSelectedDoneVisit(null)}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border text-muted-foreground text-sm font-semibold hover:bg-muted/40 transition-colors"
                            >
                                <X className="h-4 w-4" /> Close
                            </button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* ── FAB ── */}
            <FAB navigate={navigate} />

            {/* Action Required Popup */}
            <Dialog open={showActionPopup} onOpenChange={setShowActionPopup}>
                <DialogContent className="max-w-[calc(100%-32px)] sm:max-w-md bg-white dark:bg-[#09090b] border-border dark:border-white/10 shadow-2xl p-0 overflow-hidden rounded-[24px]">
                    <div className="p-5 pb-4 bg-gradient-to-br from-red-500/10 to-orange-500/5 border-b border-border dark:border-white/5">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-red-500/20 to-orange-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                                <AlertTriangle className="h-5 w-5 text-red-500" />
                            </div>
                            <div>
                                <h2 className="text-lg font-black text-foreground tracking-tight leading-none">Action Required</h2>
                                <p className="text-xs text-muted-foreground dark:text-white/40 mt-1 font-medium">
                                    You have {smartAlerts.length} item{smartAlerts.length > 1 ? 's' : ''} that need your attention
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="p-4 max-h-[60vh] overflow-y-auto bg-slate-50/50 dark:bg-black/20">
                        <div className="space-y-3">
                            {smartAlerts.map((alert, idx) => {
                                const cfg = {
                                    critical: {
                                        rowBg: 'bg-white dark:bg-white/[0.02] border-red-500/20',
                                        badge: 'bg-red-500/15 text-red-500 border-red-500/25',
                                        badgeLabel: 'URGENT',
                                        btn: 'bg-red-500 text-white hover:bg-red-600 shadow-sm shadow-red-500/20',
                                    },
                                    warning: {
                                        rowBg: 'bg-white dark:bg-white/[0.02] border-amber-500/20',
                                        badge: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25',
                                        badgeLabel: 'ACTION',
                                        btn: 'bg-amber-500 text-white hover:bg-amber-600 shadow-sm shadow-amber-500/20',
                                    },
                                    info: {
                                        rowBg: 'bg-white dark:bg-white/[0.02] border-blue-500/20',
                                        badge: 'bg-blue-500/15 text-blue-500 border-blue-500/25',
                                        badgeLabel: 'INFO',
                                        btn: 'bg-blue-500 text-white hover:bg-blue-600 shadow-sm shadow-blue-500/20',
                                    },
                                }[alert.priority];

                                return (
                                    <div key={alert.id} className={`p-3.5 rounded-2xl border ${cfg?.rowBg || 'bg-white'} flex flex-col gap-2.5 shadow-sm`}>
                                        <div className="flex items-start gap-2.5">
                                            <span className="text-xl leading-none shrink-0 mt-0.5">{alert.emoji}</span>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between mb-1">
                                                    <p className="text-[13px] font-bold text-foreground leading-tight">{alert.title}</p>
                                                    {cfg && (
                                                        <span className={`text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${cfg.badge} shrink-0`}>
                                                            {cfg.badgeLabel}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-[12px] text-muted-foreground dark:text-white/50 leading-snug">{alert.desc}</p>
                                            </div>
                                        </div>
                                        {alert.route && cfg && (
                                            <button
                                                onClick={() => {
                                                    setShowActionPopup(false);
                                                    navigate(alert.route!);
                                                }}
                                                className={`w-full py-2 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 ${cfg.btn}`}
                                            >
                                                {alert.action} <ArrowRight className="h-3 w-3" />
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
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
                <span className={`text-white font-bold flex items-center gap-1.5 text-xs transition-opacity ${action === "done" ? "opacity-100" : "opacity-0"}`}><CheckCircle2 className="h-3.5 w-3.5" /> Done</span>
                <span className={`text-white font-bold flex items-center gap-1.5 text-xs transition-opacity ${action === "cancel" ? "opacity-100" : "opacity-0"}`}>Cancel <X className="h-3.5 w-3.5" /></span>
            </div>

            <motion.div
                drag={isDone || isCancelled ? false : "x"}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.15}
                onDrag={handleDrag}
                onDragEnd={handleDragEnd}
                animate={controls}
                className={`relative bg-muted/50 border rounded-2xl px-3 py-3 z-10 w-full min-w-0 ${isDone ? "border-emerald-500/15" : isCancelled ? "border-red-500/10" : "border-border"} transition-colors`}
            >
                {/* Single compact row: status dot + name + time + actions */}
                <div className="flex items-center gap-2.5 min-w-0">
                    {/* Status dot */}
                    <div className={`w-2 h-2 rounded-full shrink-0 ${sc.dot} shadow-sm`} />

                    {/* Name + purpose + address stacked */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                            <span className={`text-[9px] font-bold uppercase tracking-widest ${sc.text} shrink-0`}>{sc.label}</span>
                            <span className="text-[9px] text-muted-foreground dark:text-white/25">·</span>
                            <span className="text-[9px] text-muted-foreground dark:text-white/25 font-medium">
                                {format(parseISO(isDone && visit.done_at ? visit.done_at : visit.created_at), "hh:mm a")}
                            </span>
                        </div>
                        <h3 className="text-sm font-bold text-foreground leading-tight truncate">
                            {visit.clients?.name || visit.partners?.name || "Meeting"}
                        </h3>
                        <p className="text-[11px] text-muted-foreground dark:text-white/45 font-medium truncate">
                            {visit.purpose_masters?.purpose_name || visit.purpose || "Follow-up"}
                            {visit.address ? ` · ${visit.address}` : ""}
                        </p>
                    </div>

                    {/* Action buttons — icon only, compact */}
                    {!isDone && !isCancelled && (
                        <div className="flex items-center gap-1.5 shrink-0">
                            <button
                                onClick={() => {
                                    const addr = encodeURIComponent(visit.address || (visit.clients?.name ?? visit.partners?.name ?? 'destination'));
                                    window.open(`https://www.google.com/maps/search/?api=1&query=${addr}`, '_blank');
                                }}
                                className="h-8 w-8 rounded-xl bg-muted/60 hover:bg-muted border border-border text-muted-foreground dark:text-white/50 hover:text-white flex items-center justify-center transition-all"
                                title="Navigate"
                            >
                                <Navigation className="h-3.5 w-3.5" />
                            </button>
                            {visit.client_id && (
                                <button
                                    onClick={() => onAddWOS(visit)}
                                    className="h-8 w-8 rounded-xl bg-red-600/80 hover:bg-red-600 text-white flex items-center justify-center transition-all shadow shadow-red-900/30"
                                    title="Add WOS"
                                >
                                    <Plus className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>
                    )}

                    {/* Done / Cancelled icon */}
                    {isDone && <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />}
                    {isCancelled && <X className="h-4 w-4 text-red-400 shrink-0" />}
                </div>

                {/* Swipe hint — only for active visits, very subtle */}
                {!isDone && !isCancelled && (
                    <p className="text-[8px] text-muted-foreground/40 dark:text-white/15 font-medium text-center mt-2 tracking-widest uppercase">
                        ← swipe to act →
                    </p>
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
