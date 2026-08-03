import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Handshake, Download, Search, Building2, User, MapPin,
  CheckCircle2, Clock, XCircle, LayoutList, LayoutGrid,
  ChevronDown, ChevronRight, AlertTriangle, ArrowUpDown, ArrowUp, ArrowDown,
} from "lucide-react";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, subDays, parseISO, differenceInDays,
} from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

type DatePreset = "today" | "this_week" | "this_month" | "last_15" | "custom";
type ViewMode = "card" | "matrix";
type SortDir = "asc" | "desc" | null;

const statusConfig: Record<string, { label: string; icon: any; badge: string }> = {
  done: { label: "Done", icon: CheckCircle2, badge: "bg-green-500/10 text-green-600 border-green-500/30" },
  planned: { label: "Planned", icon: Clock, badge: "bg-blue-500/10 text-blue-600 border-blue-500/30" },
  cancelled: { label: "Cancelled", icon: XCircle, badge: "bg-red-500/10 text-red-600 border-red-500/30" },
};

const cellColor = (count: number) => {
  if (count === 0) return "bg-transparent";
  if (count === 1) return "bg-green-500/20 text-green-700 dark:text-green-400";
  if (count === 2) return "bg-green-500/45 text-green-700 dark:text-green-300";
  return "bg-green-500/75 text-white";
};

const PartnerVisits = () => {
  const { role, showroomId: myShowroomId, showroomIds } = useAuth();
  const canSeeAll = role === "md" || role === "admin";
  const isManager = role === "manager";

  // ── UI state ──────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>("matrix");
  const [preset, setPreset] = useState<DatePreset>("last_15");
  const [customFrom, setCustomFrom] = useState(format(subDays(new Date(), 14), "yyyy-MM-dd"));
  const [customTo, setCustomTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [selectedShowroom, setSelectedShowroom] = useState("all");
  const [selectedExec, setSelectedExec] = useState("all");
  const [selectedPartnerType, setSelectedPartnerType] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;
  const [collapsedExecs, setCollapsedExecs] = useState<Set<string>>(new Set());
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const todayStr = format(new Date(), "yyyy-MM-dd");

  // ── Date range ─────────────────────────────────────────────────────────────
  const { fromDate, toDate } = useMemo(() => {
    const today = new Date();
    if (preset === "today") return { fromDate: todayStr, toDate: todayStr };
    if (preset === "this_week") return {
      fromDate: format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"),
      toDate: format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"),
    };
    if (preset === "this_month") return {
      fromDate: format(startOfMonth(today), "yyyy-MM-dd"),
      toDate: format(endOfMonth(today), "yyyy-MM-dd"),
    };
    if (preset === "last_15") return {
      fromDate: format(subDays(today, 14), "yyyy-MM-dd"),
      toDate: todayStr,
    };
    return { fromDate: customFrom, toDate: customTo };
  }, [preset, customFrom, customTo, todayStr]);

  // ── Showrooms ──────────────────────────────────────────────────────────────
  const { data: showrooms = [] } = useQuery({
    queryKey: ["pv3-showrooms"],
    enabled: canSeeAll || isManager,
    queryFn: async () => {
      const { data } = await supabase.from("showrooms").select("*").order("name");
      return data || [];
    },
  });

  // ── User roles ─────────────────────────────────────────────────────────────
  const { data: userRoles = [] } = useQuery({
    queryKey: ["pv3-roles", myShowroomId, showroomIds, selectedShowroom, role],
    queryFn: async () => {
      let q = supabase.from("user_roles").select("user_id, role, showroom_id, reports_to").in("role", ["executive", "tl"]);
      if (isManager) {
        if (selectedShowroom && selectedShowroom !== "all") {
          q = q.eq("showroom_id", selectedShowroom);
        } else if (showroomIds && showroomIds.length > 0) {
          q = q.in("showroom_id", showroomIds);
        }
      } else if (canSeeAll && selectedShowroom !== "all") {
        q = q.eq("showroom_id", selectedShowroom);
      }
      const { data } = await q;
      return data || [];
    },
  });

  const execUserIds = useMemo(() => [...new Set(userRoles.map((r) => r.user_id))], [userRoles]);

  // ── TL (reports_to) map: exec user_id → TL user_id ───────────────────────
  const execTlMap = useMemo(() => {
    const map: Record<string, string | null> = {};
    userRoles.forEach((r) => {
      map[r.user_id] = (r as any).reports_to ?? null;
    });
    return map;
  }, [userRoles]);

  // Collect all unique TL user_ids to fetch their profiles
  const tlUserIds = useMemo(() => {
    const ids = Object.values(execTlMap).filter((id): id is string => !!id);
    return [...new Set(ids)];
  }, [execTlMap]);

  // ── Profiles ───────────────────────────────────────────────────────────────
  const { data: profiles = [] } = useQuery({
    queryKey: ["pv3-profiles", execUserIds],
    enabled: execUserIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name").in("user_id", execUserIds);
      return data || [];
    },
  });

  // ── TL Profiles ────────────────────────────────────────────────────────────
  const { data: tlProfiles = [] } = useQuery({
    queryKey: ["pv3-tl-profiles", tlUserIds],
    enabled: tlUserIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name").in("user_id", tlUserIds);
      return data || [];
    },
  });

  const profileMap = useMemo(() => Object.fromEntries(profiles.map((p) => [p.user_id, p.full_name])), [profiles]);
  const tlProfileMap = useMemo(() => Object.fromEntries(tlProfiles.map((p) => [p.user_id, p.full_name])), [tlProfiles]);
  const showroomMap = useMemo(() => Object.fromEntries(showrooms.map((s) => [s.id, s.name])), [showrooms]);
  const execShowroomMap = useMemo(() => Object.fromEntries(userRoles.map((r) => [r.user_id, r.showroom_id])), [userRoles]);

  // Helper: get TL name for an exec
  const getTlName = (execId: string) => {
    const tlId = execTlMap[execId];
    if (!tlId) return null;
    return tlProfileMap[tlId] || null;
  };

  const showTlColumn = canSeeAll || isManager;

  const targetUserIds = useMemo(() => {
    if (selectedExec !== "all") return [selectedExec];
    return execUserIds;
  }, [selectedExec, execUserIds]);

  // ── All partners for target executives ────────────────────────────────────
  const { data: execPartnersList = [] } = useQuery({
    queryKey: ["pv3-exec-partners", targetUserIds],
    enabled: targetUserIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("partners")
        .select("id, name, type, city, created_by")
        .in("created_by", targetUserIds)
        .order("name");
      return data || [];
    },
  });

  // ── Historical last done visit per exec+partner ───────────────────────────
  const { data: lastVisitData = [] } = useQuery({
    queryKey: ["pv3-last-visits", targetUserIds],
    enabled: targetUserIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("visits")
        .select("created_by, partner_id, visit_date")
        .eq("visit_with_type", "partner")
        .eq("status", "done")
        .in("created_by", targetUserIds)
        .order("visit_date", { ascending: false })
        .limit(10000);
      return data || [];
    },
  });

  const lastVisitMap = useMemo(() => {
    const map = new Map<string, string>();
    lastVisitData.forEach((v) => {
      if (!v.partner_id) return;
      const key = `${v.created_by}||${v.partner_id}`;
      if (!map.has(key)) map.set(key, v.visit_date); // already DESC order
    });
    return map;
  }, [lastVisitData]);

  // ── Partner visits in range ────────────────────────────────────────────────
  const { data: visits = [], isLoading } = useQuery({
    queryKey: ["pv3-visits", fromDate, toDate, targetUserIds],
    enabled: targetUserIds.length > 0 || canSeeAll,
    queryFn: async () => {
      let q = supabase
        .from("visits")
        .select("id, visit_date, status, created_by, partner_id, purpose, partners(name, type, city)")
        .eq("visit_with_type", "partner")
        .gte("visit_date", fromDate)
        .lte("visit_date", toDate)
        .order("visit_date", { ascending: false });
      if (targetUserIds.length > 0) q = q.in("created_by", targetUserIds);
      const { data } = await q;
      return data || [];
    },
  });

  // ── Client-side filter (card view) ────────────────────────────────────────
  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return visits.filter((v) => {
      const partner = v.partners as any;
      const matchSearch = !s ||
        (partner?.name || "").toLowerCase().includes(s) ||
        (profileMap[v.created_by] || "").toLowerCase().includes(s) ||
        (partner?.city || "").toLowerCase().includes(s);
      const matchType = selectedPartnerType === "all" || partner?.type === selectedPartnerType;
      return matchSearch && matchType;
    });
  }, [visits, search, selectedPartnerType, profileMap]);

  // ── Matrix: done visits only ──────────────────────────────────────────────
  const matrixFiltered = useMemo(() => filtered.filter((v) => v.status === "done"), [filtered]);

  // ── Date columns ──────────────────────────────────────────────────────────
  const dateColumns = useMemo(() => {
    const cols: string[] = [];
    let cur = new Date(fromDate);
    const end = new Date(toDate);
    while (cur <= end && cols.length < 31) {
      cols.push(format(cur, "yyyy-MM-dd"));
      cur = addDays(cur, 1);
    }
    return cols;
  }, [fromDate, toDate]);

  // ── Matrix rows: all (exec, partner) with visit counts ────────────────────
  const matrixRows = useMemo(() => {
    const visitMap = new Map<string, Record<string, number>>();
    matrixFiltered.forEach((v) => {
      const key = `${v.created_by}||${v.partner_id || "direct"}`;
      if (!visitMap.has(key)) visitMap.set(key, {});
      const row = visitMap.get(key)!;
      row[v.visit_date] = (row[v.visit_date] || 0) + 1;
    });

    return execPartnersList
      .filter((p) => {
        const matchType = selectedPartnerType === "all" || (p as any).type === selectedPartnerType;
        const matchSearch = !search ||
          ((p as any).name || "").toLowerCase().includes(search.toLowerCase()) ||
          (profileMap[p.created_by] || "").toLowerCase().includes(search.toLowerCase());
        return matchType && matchSearch;
      })
      .map((p) => {
        const key = `${p.created_by}||${p.id}`;
        const dates = visitMap.get(key) || {};
        const total = Object.values(dates).reduce((s, n) => s + n, 0);
        const lastVisit = lastVisitMap.get(key) || null;
        const daysSinceLastVisit = lastVisit
          ? differenceInDays(new Date(), parseISO(lastVisit))
          : null;
        return {
          execId: p.created_by,
          partnerId: p.id,
          partnerName: (p as any).name || "Unknown",
          partnerType: (p as any).type || "",
          dates,
          total,
          lastVisit,
          daysSinceLastVisit,
        };
      });
  }, [matrixFiltered, execPartnersList, profileMap, selectedPartnerType, search, lastVisitMap]);

  // ── Group by executive ─────────────────────────────────────────────────────
  const execGroups = useMemo(() => {
    const map = new Map<string, typeof matrixRows>();
    matrixRows.forEach((row) => {
      if (!map.has(row.execId)) map.set(row.execId, []);
      map.get(row.execId)!.push(row);
    });

    return [...map.entries()].map(([execId, rows]) => {
      const visitedCount = rows.filter((r) => r.total > 0).length;
      const coveragePct = rows.length > 0 ? Math.round((visitedCount / rows.length) * 100) : 0;
      const groupTotal = rows.reduce((s, r) => s + r.total, 0);
      return { execId, rows, visitedCount, coveragePct, groupTotal };
    }).sort((a, b) => (profileMap[a.execId] || "").localeCompare(profileMap[b.execId] || ""));
  }, [matrixRows, profileMap]);

  // ── Unvisited count ────────────────────────────────────────────────────────
  const unvisitedCount = useMemo(() => matrixRows.filter((r) => r.total === 0).length, [matrixRows]);

  // ── KPI summary ───────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    if (viewMode === "matrix") {
      const visitedPartners = new Set(matrixFiltered.map((v) => `${v.created_by}||${v.partner_id}`));
      return {
        doneVisits: matrixFiltered.length,
        assigned: execPartnersList.length,
        visited: matrixRows.filter((r) => r.total > 0).length,
        unvisited: unvisitedCount,
        executives: new Set(matrixRows.map((r) => r.execId)).size,
        coveragePct: execPartnersList.length > 0
          ? Math.round((matrixRows.filter((r) => r.total > 0).length / matrixRows.length) * 100) : 0,
      };
    }
    return {
      doneVisits: filtered.filter((v) => v.status === "done").length,
      assigned: new Set(filtered.map((v) => v.partner_id)).size,
      visited: 0,
      unvisited: 0,
      executives: new Set(filtered.map((v) => v.created_by)).size,
      coveragePct: 0,
    };
  }, [viewMode, matrixFiltered, matrixRows, execPartnersList, filtered, unvisitedCount]);

  // ── Toggle exec group collapse ─────────────────────────────────────────────
  const toggleExec = (execId: string) => {
    setCollapsedExecs((prev) => {
      const next = new Set(prev);
      if (next.has(execId)) next.delete(execId);
      else next.add(execId);
      return next;
    });
  };

  // ── Sort matrixRows within each group ─────────────────────────────────────
  const sortedGroups = useMemo(() => {
    if (!sortDir) return execGroups;
    return execGroups.map((g) => ({
      ...g,
      rows: [...g.rows].sort((a, b) => sortDir === "desc" ? b.total - a.total : a.total - b.total),
    }));
  }, [execGroups, sortDir]);

  // ── Pagination (card view) ─────────────────────────────────────────────────
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── CSV Export ────────────────────────────────────────────────────────────
  const exportCSV = () => {
    let rows: string[][];
    if (viewMode === "matrix") {
      const hdr = ["Executive", ...(showTlColumn ? ["TL"] : []), "Showroom", "Partner", "Type", "Last Visit", ...dateColumns.map((d) => format(new Date(d), "dd MMM")), "Total"];
      rows = [hdr];
      sortedGroups.forEach(({ execId, rows: gRows }) => {
        gRows.forEach((row) => {
          rows.push([
            profileMap[execId] || "Unknown",
            ...(showTlColumn ? [getTlName(execId) || "—"] : []),
            showroomMap[execShowroomMap[execId]] || "—",
            row.partnerName,
            row.partnerType,
            row.lastVisit ? format(parseISO(row.lastVisit), "dd MMM yyyy") : "Never",
            ...dateColumns.map((d) => String(row.dates[d] || 0)),
            String(row.total),
          ]);
        });
      });
    } else {
      rows = [["Date", "Executive", ...(showTlColumn ? ["TL"] : []), "Showroom", "Partner", "Type", "City", "Status"]];
      filtered.forEach((v) => {
        const partner = v.partners as any;
        rows.push([
          format(new Date(v.visit_date), "dd MMM yyyy"),
          profileMap[v.created_by] || "Unknown",
          ...(showTlColumn ? [getTlName(v.created_by) || "—"] : []),
          showroomMap[execShowroomMap[v.created_by]] || "—",
          partner?.name || "—",
          partner?.type || "—",
          partner?.city || "—",
          v.status,
        ]);
      });
    }
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url;
    a.download = `partner_visits_${viewMode}_${fromDate}_${toDate}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Handshake className="h-6 w-6 text-primary" /> Partner Visit Records
          </h1>
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground">Executive-wise partner visit history</p>
            {viewMode === "matrix" && unvisitedCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-600 border border-red-500/20">
                <AlertTriangle className="h-3 w-3" /> {unvisitedCount} unvisited this period
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center border border-border rounded-lg overflow-hidden">
            <button onClick={() => setViewMode("matrix")} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${viewMode === "matrix" ? "bg-primary text-primary-foreground" : "hover:bg-muted/60 text-muted-foreground"}`}>
              <LayoutGrid className="h-3.5 w-3.5" /> Matrix
            </button>
            <button onClick={() => setViewMode("card")} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${viewMode === "card" ? "bg-primary text-primary-foreground" : "hover:bg-muted/60 text-muted-foreground"}`}>
              <LayoutList className="h-3.5 w-3.5" /> Cards
            </button>
          </div>
          <Button onClick={exportCSV} size="sm" variant="outline" className="gap-1.5">
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      {/* ── Filter Bar (single row) ── */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input className="pl-8 h-8 text-sm bg-background" placeholder="Search partner, executive, city..."
                value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </div>

            {(canSeeAll || (isManager && showroomIds && showroomIds.length > 1)) && showrooms.length > 0 && (
              <Select value={selectedShowroom} onValueChange={(v) => { setSelectedShowroom(v); setPage(1); }}>
                <SelectTrigger className="h-8 text-xs w-[140px] bg-background"><SelectValue placeholder="All Showrooms" /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="all">All Showrooms</SelectItem>
                  {showrooms
                    .filter(s => canSeeAll || (showroomIds && showroomIds.includes(s.id)))
                    .map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}

            {profiles.length > 1 && (
              <Select value={selectedExec} onValueChange={(v) => { setSelectedExec(v); setPage(1); }}>
                <SelectTrigger className="h-8 text-xs w-[130px] bg-background"><SelectValue placeholder="All Executives" /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="all">All Executives</SelectItem>
                  {profiles.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}

            <Select value={selectedPartnerType} onValueChange={(v) => { setSelectedPartnerType(v); setPage(1); }}>
              <SelectTrigger className="h-8 text-xs w-[110px] bg-background"><SelectValue placeholder="All Types" /></SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="builder">Builder</SelectItem>
                <SelectItem value="architect">Architect</SelectItem>
                <SelectItem value="self">Direct</SelectItem>
              </SelectContent>
            </Select>

            <Select value={preset} onValueChange={(v) => { setPreset(v as DatePreset); setPage(1); }}>
              <SelectTrigger className="h-8 text-xs w-[115px] bg-background"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="last_15">Last 15 Days</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="this_week">This Week</SelectItem>
                <SelectItem value="this_month">This Month</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>

            {preset === "custom" && (
              <>
                <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-8 text-xs w-[130px] bg-background" />
                <span className="text-xs text-muted-foreground">to</span>
                <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-8 text-xs w-[130px] bg-background" />
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── KPI Cards ── */}
      {viewMode === "matrix" ? (
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {[
            { label: "Done Visits", value: summary.doneVisits, color: "text-green-500" },
            { label: "Assigned", value: summary.assigned, color: "text-foreground" },
            { label: "Visited", value: summary.visited, color: "text-blue-500" },
            { label: "Unvisited", value: summary.unvisited, color: summary.unvisited > 0 ? "text-red-500" : "text-muted-foreground" },
            { label: "Executives", value: summary.executives, color: "text-orange-500" },
            { label: "Coverage", value: `${summary.coveragePct}%`, color: summary.coveragePct >= 80 ? "text-green-500" : summary.coveragePct >= 50 ? "text-amber-500" : "text-red-500" },
          ].map(({ label, value, color }) => (
            <Card key={label}><CardContent className="p-3 text-center">
              <p className={`text-xl font-bold font-mono ${color}`}>{value}</p>
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mt-0.5">{label}</p>
            </CardContent></Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {[
            { label: "Total", value: filtered.length, color: "text-foreground" },
            { label: "Done", value: filtered.filter(v => v.status === "done").length, color: "text-green-500" },
            { label: "Planned", value: filtered.filter(v => v.status === "planned").length, color: "text-blue-500" },
            { label: "Cancelled", value: filtered.filter(v => v.status === "cancelled").length, color: "text-red-500" },
            { label: "Partners", value: new Set(filtered.map(v => v.partner_id)).size, color: "text-purple-500" },
            { label: "Executives", value: new Set(filtered.map(v => v.created_by)).size, color: "text-orange-500" },
          ].map(({ label, value, color }) => (
            <Card key={label}><CardContent className="p-3 text-center">
              <p className={`text-xl font-bold font-mono ${color}`}>{value}</p>
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mt-0.5">{label}</p>
            </CardContent></Card>
          ))}
        </div>
      )}

      {/* ════════════════════════════════ MATRIX VIEW ════════════════════════ */}
      {viewMode === "matrix" && (
        isLoading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-10 rounded animate-pulse bg-muted/40" />)}</div>
        ) : sortedGroups.length === 0 ? (
          <Card><CardContent className="py-14 text-center">
            <Handshake className="h-10 w-10 mx-auto text-muted-foreground mb-3 opacity-25" />
            <p className="text-muted-foreground font-semibold">No data for selected filters</p>
          </CardContent></Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="text-xs border-collapse" style={{ minWidth: "100%" }}>
                {/* ── Header ── */}
                <thead>
                  <tr className="bg-muted/60 border-b border-border">
                    {/* Executive */}
                    <th className="sticky left-0 z-20 bg-muted/80 text-left px-3 py-2.5 font-bold text-[11px] uppercase tracking-wider text-muted-foreground min-w-[130px] border-r border-border">
                      Executive
                    </th>
                    {/* Partner */}
                    <th className="sticky left-[130px] z-20 bg-muted/80 text-left px-3 py-2.5 font-bold text-[11px] uppercase tracking-wider text-muted-foreground min-w-[130px] border-r border-border">
                      Partner
                    </th>
                    {/* TL */}
                    {showTlColumn && (
                      <th className="bg-muted/80 text-left px-3 py-2.5 font-bold text-[11px] uppercase tracking-wider text-muted-foreground min-w-[100px] border-r border-border whitespace-nowrap">
                        TL
                      </th>
                    )}
                    {canSeeAll && (
                      <th className="bg-muted/80 text-left px-3 py-2.5 font-bold text-[11px] uppercase tracking-wider text-muted-foreground min-w-[85px] border-r border-border whitespace-nowrap">
                        Showroom
                      </th>
                    )}
                    {/* Last Visit */}
                    <th className="bg-muted/80 text-center px-2 py-2.5 font-bold text-[11px] uppercase tracking-wider text-muted-foreground min-w-[70px] border-r border-border whitespace-nowrap">
                      Last Visit
                    </th>
                    {/* Date columns */}
                    {dateColumns.map((d) => {
                      const isToday = d === todayStr;
                      const dow = new Date(d).getDay(); // 0=Sun,1=Mon..
                      const isWeekStart = dow === 1; // Monday
                      return (
                        <th
                          key={d}
                          className={`px-1.5 py-2 text-center min-w-[40px] border-r border-border/40 whitespace-nowrap text-[10px] font-semibold
                            ${isToday ? "bg-primary/10 text-primary border-primary/30" : "bg-muted/80 text-muted-foreground"}
                            ${isWeekStart ? "border-l-2 border-l-border" : ""}`}
                        >
                          <span className="block">{format(new Date(d), "EEE")}</span>
                          <span className={`block font-bold text-[11px] ${isToday ? "text-primary" : "text-foreground"}`}>{format(new Date(d), "dd")}</span>
                          <span className="block text-[9px] opacity-70">{format(new Date(d), "MMM")}</span>
                        </th>
                      );
                    })}
                    {/* Total (right sticky — sortable) */}
                    <th
                      className="sticky right-0 z-20 bg-primary/10 text-center px-3 py-2.5 font-bold text-[11px] uppercase tracking-wider text-primary min-w-[52px] border-l-2 border-primary/30 cursor-pointer select-none hover:bg-primary/20"
                      onClick={() => setSortDir(d => d === "desc" ? "asc" : d === "asc" ? null : "desc")}
                    >
                      <div className="flex items-center justify-center gap-1">
                        Total
                        {sortDir === "desc" ? <ArrowDown className="h-3 w-3" /> : sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                      </div>
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {sortedGroups.map(({ execId, rows, visitedCount, coveragePct, groupTotal }) => {
                    const isCollapsed = collapsedExecs.has(execId);
                    const execName = profileMap[execId] || "Unknown";
                    const srId = execShowroomMap[execId];
                    const coverageColor = coveragePct >= 80 ? "text-green-500" : coveragePct >= 50 ? "text-amber-500" : "text-red-500";

                    return (
                      <>
                        {/* ── Executive group header row ── */}
                        <tr
                          key={`group-${execId}`}
                          className="bg-muted/30 border-y border-border cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => toggleExec(execId)}
                        >
                          <td className="sticky left-0 z-10 bg-muted/50 border-r border-border px-3 py-2 min-w-[130px]" colSpan={2}>
                            <div className="flex items-center gap-2">
                              {isCollapsed
                                ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              }
                              <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-[9px] shrink-0">
                                {execName.charAt(0).toUpperCase()}
                              </div>
                              <span className="font-bold text-xs">{execName}</span>
                              <span className={`text-[10px] font-bold ml-1 ${coverageColor}`}>
                                {visitedCount}/{rows.length} ({coveragePct}%)
                              </span>
                            </div>
                          </td>
                          {/* TL in group header */}
                          {showTlColumn && (
                            <td className="bg-muted/50 border-r border-border px-3 py-2 min-w-[100px]">
                              {getTlName(execId)
                                ? <span className="text-[10px] font-semibold text-indigo-500">{getTlName(execId)}</span>
                                : <span className="text-[10px] text-muted-foreground">—</span>
                              }
                            </td>
                          )}
                          {canSeeAll && (
                            <td className="bg-muted/50 border-r border-border px-3 py-2 min-w-[85px]">
                              <span className="text-[10px] text-muted-foreground">{showroomMap[srId] || "—"}</span>
                            </td>
                          )}
                          {/* Last Visit blank */}
                          <td className="bg-muted/50 border-r border-border" />
                          {dateColumns.map((d) => {
                            const colCount = rows.reduce((s, r) => s + (r.dates[d] || 0), 0);
                            const isToday = d === todayStr;
                            return (
                              <td key={d} className={`border-r border-border/30 px-1 py-1.5 text-center ${isToday ? "bg-primary/5" : ""}`}>
                                {colCount > 0 && (
                                  <span className="text-[10px] font-bold font-mono text-muted-foreground">{colCount}</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="sticky right-0 z-10 bg-primary/10 border-l-2 border-primary/30 px-3 py-2 text-center">
                            <span className="text-xs font-bold font-mono text-primary">{groupTotal || "–"}</span>
                          </td>
                        </tr>

                        {/* ── Partner rows ── */}
                        {!isCollapsed && rows.map((row, idx) => {
                          const isZero = row.total === 0;
                          const isUrgent = isZero && row.daysSinceLastVisit !== null && row.daysSinceLastVisit > 14;
                          const rowBg = isZero ? "bg-red-500/[0.03] hover:bg-red-500/5" : "hover:bg-muted/10";
                          const leftBorder = isZero ? "border-l-2 border-l-red-400/40" : "border-l-2 border-l-transparent";

                          return (
                            <motion.tr
                              key={`${execId}||${row.partnerId}`}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: idx * 0.01 }}
                              className={`border-b border-border/30 transition-colors ${rowBg} ${leftBorder}`}
                            >
                              {/* Executive (blank — shown in group header) */}
                              <td className="sticky left-0 z-10 bg-background border-r border-border px-3 py-1.5 min-w-[130px]">
                                <span className="text-[10px] text-muted-foreground/50 pl-6">↳</span>
                              </td>

                              {/* Partner name */}
                              <td className="sticky left-[130px] z-10 bg-background border-r border-border px-3 py-1.5 min-w-[130px]">
                                <p className="text-xs font-semibold truncate max-w-[105px]">{row.partnerName}</p>
                                {row.partnerType && (
                                  <p className={`text-[9px] capitalize font-semibold mt-0.5 ${
                                    row.partnerType === "builder" ? "text-blue-500" :
                                    row.partnerType === "self" ? "text-amber-500" : "text-purple-500"
                                  }`}>{row.partnerType === "self" ? "Direct" : row.partnerType}</p>
                                )}
                              </td>

                              {/* TL cell in partner row */}
                              {showTlColumn && (
                                <td className="bg-background border-r border-border px-3 py-1.5 min-w-[100px]">
                                  {getTlName(execId)
                                    ? <span className="text-[10px] font-semibold text-indigo-500">{getTlName(execId)}</span>
                                    : <span className="text-[10px] text-muted-foreground/40">—</span>
                                  }
                                </td>
                              )}
                              {/* Showroom */}
                              {canSeeAll && (
                                <td className={`bg-background border-r border-border px-3 py-1.5 min-w-[85px]`}>
                                  <span className="text-[10px] text-muted-foreground">{showroomMap[execShowroomMap[execId]] || "—"}</span>
                                </td>
                              )}

                              {/* Last Visit */}
                              <td className="bg-background border-r border-border px-2 py-1.5 text-center">
                                {row.lastVisit ? (
                                  <span className={`text-[10px] font-semibold ${row.daysSinceLastVisit! > 14 ? "text-red-500" : row.daysSinceLastVisit! > 7 ? "text-amber-500" : "text-green-600"}`}>
                                    {row.daysSinceLastVisit === 0 ? "Today" : `${row.daysSinceLastVisit}d ago`}
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-bold text-red-400">Never</span>
                                )}
                              </td>



                              {/* Date cells */}
                              {dateColumns.map((d) => {
                                const cnt = row.dates[d] || 0;
                                const isToday = d === todayStr;
                                return (
                                  <td key={d} className={`border-r border-border/25 px-0.5 py-1 text-center ${isToday ? "bg-primary/5" : ""}`}>
                                    {cnt > 0 ? (
                                      <div className={`mx-auto w-7 h-7 rounded-md flex items-center justify-center text-[11px] font-bold font-mono ${cellColor(cnt)}`}>
                                        {cnt}
                                      </div>
                                    ) : (
                                      <div className="mx-auto w-7 h-7 rounded-md bg-transparent" />
                                    )}
                                  </td>
                                );
                              })}

                              {/* Total (right sticky) */}
                              <td className="sticky right-0 z-10 bg-primary/5 border-l-2 border-primary/20 px-3 py-1.5 text-center">
                                <span className={`text-xs font-bold font-mono ${row.total > 0 ? "text-primary" : "text-muted-foreground/25"}`}>
                                  {row.total > 0 ? row.total : "–"}
                                </span>
                              </td>
                            </motion.tr>
                          );
                        })}
                      </>
                    );
                  })}
                </tbody>

                {/* ── Footer ── */}
                <tfoot>
                  <tr className="bg-muted/50 border-t-2 border-border">
                    <td className="sticky left-0 z-20 bg-muted/70 border-r border-border px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground min-w-[130px]" colSpan={2}>
                      Grand Total
                    </td>
                    {showTlColumn && <td className="bg-muted/70 border-r border-border" />}
                    {canSeeAll && <td className="bg-muted/70 border-r border-border" />}
                    <td className="bg-muted/70 border-r border-border" />
                    {dateColumns.map((d) => {
                      const colTotal = matrixFiltered.filter((v) => v.visit_date === d).length;
                      const isToday = d === todayStr;
                      return (
                        <td key={d} className={`border-r border-border/30 px-1 py-2 text-center ${isToday ? "bg-primary/10" : "bg-muted/70"}`}>
                          <span className={`text-[11px] font-bold font-mono ${colTotal > 0 ? "text-primary" : "text-muted-foreground/25"}`}>
                            {colTotal || ""}
                          </span>
                        </td>
                      );
                    })}
                    <td className="sticky right-0 z-20 bg-primary/10 border-l-2 border-primary/30 px-3 py-2 text-center text-xs font-bold font-mono text-primary">
                      {matrixFiltered.length}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 px-4 py-2.5 border-t border-border bg-muted/10 flex-wrap">
              <span className="flex items-center gap-1.5 text-[10px] font-semibold text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-3 w-3" /> Done visits only
              </span>
              <span className="text-muted-foreground/30 text-[10px]">|</span>
              <span className="flex items-center gap-1 text-[10px] font-semibold text-red-500">
                <div className="w-3 h-3 rounded border-l-2 border-l-red-400 bg-red-500/5" /> 0 visits — needs attention
              </span>
              <span className="text-muted-foreground/30 text-[10px]">|</span>
              <span className="text-[10px] font-semibold text-muted-foreground">Click executive row to expand/collapse · Click Total header to sort</span>
            </div>
          </Card>
        )
      )}

      {/* ════════════════════════════════ CARD VIEW ══════════════════════════ */}
      {viewMode === "card" && (
        isLoading ? (
          <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-16 rounded-xl animate-pulse bg-muted/40" />)}</div>
        ) : paginated.length === 0 ? (
          <Card><CardContent className="py-14 text-center">
            <Handshake className="h-10 w-10 mx-auto text-muted-foreground mb-3 opacity-25" />
            <p className="text-muted-foreground font-semibold">No partner visits found</p>
          </CardContent></Card>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2">
              {paginated.map((v, idx) => {
                const partner = v.partners as any;
                const execName = profileMap[v.created_by] || "Unknown";
                const showroomName = showroomMap[execShowroomMap[v.created_by]] || "—";
                const sc = statusConfig[v.status] || statusConfig.planned;
                const StatusIcon = sc.icon;
                return (
                  <motion.div key={v.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.02 }}>
                    <Card className="hover:shadow-md transition-shadow">
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <div className="shrink-0 text-center bg-muted/60 rounded-xl px-2 py-1.5 min-w-[44px]">
                              <p className="text-[9px] font-bold text-muted-foreground uppercase">{format(new Date(v.visit_date), "MMM")}</p>
                              <p className="text-base font-bold font-mono leading-tight">{format(new Date(v.visit_date), "dd")}</p>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-semibold text-sm">{partner?.name || "Unknown Partner"}</p>
                                {partner?.type && (
                                  <Badge variant="outline" className={`text-[9px] capitalize shrink-0 ${partner.type === "builder" ? "border-blue-500/30 text-blue-600" : partner.type === "self" ? "border-amber-500/30 text-amber-600" : "border-purple-500/30 text-purple-600"}`}>
                                    {partner.type === "self" ? "Direct" : partner.type}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                                <span className="text-xs text-muted-foreground flex items-center gap-1"><User className="h-3 w-3" />{execName}</span>
                                {showTlColumn && getTlName(v.created_by) && (
                                  <span className="text-xs font-semibold text-indigo-500 flex items-center gap-1">
                                    <User className="h-3 w-3" />TL: {getTlName(v.created_by)}
                                  </span>
                                )}
                                {canSeeAll && <span className="text-xs text-muted-foreground flex items-center gap-1"><Building2 className="h-3 w-3" />{showroomName}</span>}
                                {partner?.city && <span className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{partner.city}</span>}
                              </div>
                            </div>
                          </div>
                          <Badge variant="outline" className={`text-[10px] font-semibold gap-1 shrink-0 ${sc.badge}`}>
                            <StatusIcon className="h-3 w-3" />{sc.label}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-1">
                <p className="text-xs text-muted-foreground">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                  <Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
};

export default PartnerVisits;
