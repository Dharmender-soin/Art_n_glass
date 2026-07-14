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
  Receipt, Download, User, Calendar, MapPin, IndianRupee,
  Navigation2, ChevronDown, ChevronRight, Search,
  LayoutList, LayoutGrid, ArrowUpDown, ArrowUp, ArrowDown,
  Car, Bike, Bus,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, subDays, parseISO } from "date-fns";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

type DatePreset = "today" | "this_week" | "last_15" | "this_month" | "last_30" | "custom";
type ViewMode = "summary" | "table";
type SortField = "amount" | "km" | "trips";
type TableSort = { field: string; dir: "asc" | "desc" };

const vehicleIcon = (v: string) => {
  const t = (v || "").toLowerCase();
  if (t.includes("car")) return <Car className="h-3.5 w-3.5" />;
  if (t.includes("bike") || t.includes("motor")) return <Bike className="h-3.5 w-3.5" />;
  return <Bus className="h-3.5 w-3.5" />;
};

const vehicleEmoji = (v: string) => {
  const t = (v || "").toLowerCase();
  if (t.includes("car")) return "🚗";
  if (t.includes("bike") || t.includes("motor")) return "🏍️";
  return "🚌";
};

const Conveyance = () => {
  const { role, showroomId: myShowroomId, showroomIds, user } = useAuth();
  const canSeeAll = role === "md" || role === "admin";
  // Accountant: read-only view scoped to their own showroom (same as manager)
  const isManager = role === "manager" || role === "accountant";

  // ── UI State ─────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>("summary");
  const [preset, setPreset] = useState<DatePreset>("this_month");
  const [customFrom, setCustomFrom] = useState(format(new Date(), "yyyy-MM-dd"));
  const [customTo, setCustomTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [selectedShowroom, setSelectedShowroom] = useState("all");
  const [selectedExec, setSelectedExec] = useState("all");
  const [selectedVehicle, setSelectedVehicle] = useState("all");
  const [search, setSearch] = useState("");
  const [expandedExecs, setExpandedExecs] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<SortField>("amount");
  const [tableSort, setTableSort] = useState<TableSort>({ field: "date", dir: "desc" });

  // ── Date range ────────────────────────────────────────────────────────────
  const { fromDate, toDate } = useMemo(() => {
    const today = new Date();
    if (preset === "today") return { fromDate: format(today, "yyyy-MM-dd"), toDate: format(today, "yyyy-MM-dd") };
    if (preset === "this_week") return {
      fromDate: format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"),
      toDate: format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"),
    };
    if (preset === "last_15") return {
      fromDate: format(subDays(today, 14), "yyyy-MM-dd"),
      toDate: format(today, "yyyy-MM-dd"),
    };
    if (preset === "this_month") return {
      fromDate: format(startOfMonth(today), "yyyy-MM-dd"),
      toDate: format(endOfMonth(today), "yyyy-MM-dd"),
    };
    if (preset === "last_30") return {
      fromDate: format(subDays(today, 29), "yyyy-MM-dd"),
      toDate: format(today, "yyyy-MM-dd"),
    };
    return { fromDate: customFrom, toDate: customTo };
  }, [preset, customFrom, customTo]);

  // ── Queries ─────────────────────────
  const { data: showrooms = [] } = useQuery({
    queryKey: ["conv2-showrooms"],
    enabled: canSeeAll || isManager,
    queryFn: async () => {
      const { data } = await supabase.from("showrooms").select("*").order("name");
      return data || [];
    },
  });

  const { data: userRoles = [] } = useQuery({
    queryKey: ["conv2-roles", myShowroomId, showroomIds, selectedShowroom, role],
    queryFn: async () => {
      if (isManager && showroomIds && showroomIds.length > 0) {
        const targetShowrooms = (selectedShowroom && selectedShowroom !== "all")
          ? [selectedShowroom]
          : showroomIds;

        const results = await Promise.all(
          targetShowrooms.map(async (sid) => {
            const { data, error } = await supabase.rpc("get_showroom_leaderboard", { p_showroom_id: sid });
            if (error) return [];
            return ((data || []) as { user_id: string; role: string }[]).map((item) => ({
              user_id: item.user_id,
              role: item.role,
              showroom_id: sid
            }));
          })
        );
        return results.flat();
      }

      // Fallback for Admin/MD
      let q = supabase.from("user_roles").select("user_id, role, showroom_id").in("role", ["executive", "backhand_executive", "tl"]);
      if (canSeeAll && selectedShowroom !== "all") {
        q = q.eq("showroom_id", selectedShowroom);
      }
      const { data } = await q;
      return data || [];
    },
  });

  const execUserIds = useMemo(() => [...new Set(userRoles.map((r) => r.user_id))], [userRoles]);

  const { data: profiles = [] } = useQuery({
    queryKey: ["conv2-profiles", execUserIds],
    enabled: execUserIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name").in("user_id", execUserIds);
      return data || [];
    },
  });

  const profileMap = useMemo(() => Object.fromEntries(profiles.map((p) => [p.user_id, p.full_name])), [profiles]);
  const showroomMap = useMemo(() => Object.fromEntries(showrooms.map((s) => [s.id, s.name])), [showrooms]);
  const execShowroomIdMap = useMemo(() => Object.fromEntries(userRoles.map((r) => [r.user_id, r.showroom_id])), [userRoles]);

  const targetUserIds = useMemo(() => {
    if (role === "executive" && user) return [user.id];
    if (selectedExec !== "all") return [selectedExec];
    return execUserIds;
  }, [role, user, selectedExec, execUserIds]);

  // ── Conveyance records ────────────────────────────────────────────────────
  const { data: rawRecords = [], isLoading } = useQuery({
    queryKey: ["conv2-records", fromDate, toDate, targetUserIds, isManager],
    enabled: targetUserIds.length > 0 || canSeeAll || isManager,
    queryFn: async () => {
      if (isManager && targetUserIds.length === 0) return [];
      let q = supabase
        .from("conveyance_records")
        .select(`
          *,
          visits (
            purpose,
            clients (name),
            partners (name)
          )
        `)
        .gte("date", fromDate)
        .lte("date", toDate)
        .order("date", { ascending: false })
        .order("created_at", { ascending: true });
      if (targetUserIds.length > 0) q = q.in("user_id", targetUserIds);
      const { data } = await q;
      return (data || []) as any[];
    },
  });

  // Fetch profiles for all user IDs in rawRecords that are not yet in execUserIds
  const recordUserIds = useMemo(() => [...new Set(rawRecords.map((r) => r.user_id))], [rawRecords]);
  const fallbackProfileIds = useMemo(
    () => recordUserIds.filter(id => !execUserIds.includes(id)),
    [execUserIds, recordUserIds]
  );
  const { data: fallbackProfiles = [] } = useQuery({
    queryKey: ["conv2-profiles-fallback", fallbackProfileIds],
    enabled: fallbackProfileIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name").in("user_id", fallbackProfileIds);
      return data || [];
    },
  });

  // Merge both profile sources into one map
  const mergedProfileMap = useMemo(() => ({
    ...Object.fromEntries(profiles.map((p) => [p.user_id, p.full_name])),
    ...Object.fromEntries(fallbackProfiles.map((p) => [p.user_id, p.full_name])),
  }), [profiles, fallbackProfiles]);

  // ── Client-side filter ────────────────────────────────────────────────────
  const records = useMemo(() => {
    let r = rawRecords;
    if (selectedVehicle !== "all") {
      r = r.filter((rec) => (rec.vehicle_type || "").toLowerCase().includes(selectedVehicle));
    }
    if (search) {
      const s = search.toLowerCase();
      r = r.filter((rec) =>
        (mergedProfileMap[rec.user_id] || "").toLowerCase().includes(s) ||
        (rec.from_location_name || "").toLowerCase().includes(s) ||
        (rec.to_location_name || "").toLowerCase().includes(s)
      );
    }
    return r;
  }, [rawRecords, selectedVehicle, search, mergedProfileMap]);

  // ── Summary KPIs ──────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const totalKm = records.reduce((s, r) => s + r.distance_km, 0);
    const totalAmount = records.reduce((s, r) => s + r.amount, 0);
    const execSet = new Set(records.map((r) => r.user_id));
    const tripCount = records.length;
    const avgRatePerKm = totalKm > 0 ? totalAmount / totalKm : 0;
    const avgPerExec = execSet.size > 0 ? totalAmount / execSet.size : 0;
    const carTrips = records.filter((r) => (r.vehicle_type || "").toLowerCase().includes("car")).length;
    const bikeTrips = records.filter((r) => (r.vehicle_type || "").toLowerCase().includes("bike") || (r.vehicle_type || "").toLowerCase().includes("motor")).length;
    return { totalKm, totalAmount, tripCount, execCount: execSet.size, avgRatePerKm, avgPerExec, carTrips, bikeTrips };
  }, [records]);

  // ── Grouped (summary view) ────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const map = new Map<string, {
      name: string; showroomName: string;
      byDate: Map<string, typeof records>;
      totalKm: number; totalAmt: number; tripCount: number;
      carTrips: number; bikeTrips: number; otherTrips: number;
    }>();

    records.forEach((r) => {
      if (!map.has(r.user_id)) {
        const sid = execShowroomIdMap[r.user_id];
        map.set(r.user_id, {
          name: mergedProfileMap[r.user_id] || "Unknown",
          showroomName: sid ? (showroomMap[sid] || "—") : "—",
          byDate: new Map(),
          totalKm: 0, totalAmt: 0, tripCount: 0,
          carTrips: 0, bikeTrips: 0, otherTrips: 0,
        });
      }
      const exec = map.get(r.user_id)!;
      if (!exec.byDate.has(r.date)) exec.byDate.set(r.date, []);
      exec.byDate.get(r.date)!.push(r);
      exec.totalKm += r.distance_km;
      exec.totalAmt += r.amount;
      exec.tripCount += 1;
      const vt = (r.vehicle_type || "").toLowerCase();
      if (vt.includes("car")) exec.carTrips++;
      else if (vt.includes("bike") || vt.includes("motor")) exec.bikeTrips++;
      else exec.otherTrips++;
    });

    // Sort by selected field
    return [...map.entries()].sort(([, a], [, b]) => {
      if (sortField === "km") return b.totalKm - a.totalKm;
      if (sortField === "trips") return b.tripCount - a.tripCount;
      return b.totalAmt - a.totalAmt;
    });
  }, [records, mergedProfileMap, execShowroomIdMap, showroomMap, sortField]);

  // ── Flat table rows ───────────────────────────────────────────────────────
  const tableRows = useMemo(() => {
    const rows = records.map((r) => {
      const sid = execShowroomIdMap[r.user_id];
      return {
        id: r.id,
        date: r.date,
        execName: mergedProfileMap[r.user_id] || "Unknown",
        showroomName: sid ? (showroomMap[sid] || "—") : "—",
        from: r.from_location_name || "—",
        to: r.to_location_name || (r.visit_id ? "Visit Location" : "End Day"),
        vehicle: r.vehicle_type || "—",
        km: r.distance_km,
        rate: r.rate_per_km,
        amount: r.amount,
        type: r.visit_id ? "Visit" : "Return",
      };
    });

    return [...rows].sort((a, b) => {
      const mul = tableSort.dir === "asc" ? 1 : -1;
      const f = tableSort.field;
      if (f === "date") return mul * a.date.localeCompare(b.date);
      if (f === "executive") return mul * a.execName.localeCompare(b.execName);
      if (f === "km") return mul * (a.km - b.km);
      if (f === "amount") return mul * (a.amount - b.amount);
      return 0;
    });
  }, [records, mergedProfileMap, execShowroomIdMap, showroomMap, tableSort]);

  // ── Excel Export ───────────────────────────────────────────────────────────
  const exportToExcel = () => {
    let html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8" />
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>Conveyance Report</x:Name>
                <x:WorksheetOptions>
                  <x:DisplayGridlines/>
                </x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
        <style>
          table { border-collapse: collapse; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
          td { border: 1px solid #D1D5DB; padding: 8px 12px; font-size: 11px; color: #374151; }
          th { border: 1px solid #D1D5DB; padding: 10px 12px; font-size: 11px; text-align: left; background-color: #1E293B; color: #FFFFFF; font-weight: bold; }
          .title-row { font-size: 16px; font-weight: bold; color: #1E3A8A; height: 40px; }
          .amount-cell { color: #059669; font-weight: bold; }
          .empty-row { height: 18px; }
          .empty-cell { border: none; background: transparent; }
        </style>
      </head>
      <body>
        <table>
          <tr>
            <td colspan="12" class="title-row" style="vertical-align: middle;">CONVEYANCE EXPENSES REPORT (FROM ${format(parseISO(fromDate), "dd MMM yyyy")} TO ${format(parseISO(toDate), "dd MMM yyyy")})</td>
          </tr>
          <tr class="empty-row"><td colspan="12" class="empty-cell"></td></tr>
          <tr>
            <th style="width: 90px;">Date</th>
            <th style="width: 150px;">Executive</th>
            <th style="width: 110px;">Showroom</th>
            <th style="width: 200px;">From</th>
            <th style="width: 200px;">To</th>
            <th style="width: 80px;">Vehicle</th>
            <th style="width: 95px; text-align: right;">Distance (KM)</th>
            <th style="width: 95px; text-align: right;">Rate (INR/km)</th>
            <th style="width: 95px; text-align: right;">Amount (INR)</th>
            <th style="width: 100px;">Trip Category</th>
            <th style="width: 180px;">Visited Client/Partner</th>
            <th style="width: 150px;">Visit Purpose</th>
          </tr>
    `;

    tableRows.forEach((r) => {
      const rawRec = rawRecords.find(x => x.id === r.id);
      const visitInfo = rawRec?.visits;
      const visitedName = visitInfo?.clients?.name || visitInfo?.partners?.name || "-";
      const purpose = visitInfo?.purpose || "-";

      html += `
        <tr>
          <td>${format(new Date(r.date), "dd MMM yyyy")}</td>
          <td>${r.execName}</td>
          <td>${r.showroomName}</td>
          <td>${r.from}</td>
          <td>${r.to}</td>
          <td style="text-transform: capitalize;">${r.vehicle}</td>
          <td style="text-align: right;">${r.km.toFixed(2)}</td>
          <td style="text-align: right;">${r.rate.toFixed(2)}</td>
          <td style="text-align: right;" class="amount-cell">${r.amount.toFixed(2)}</td>
          <td>${r.type}</td>
          <td>${visitedName}</td>
          <td>${purpose}</td>
        </tr>
      `;
    });

    html += `
        </table>
      </body>
      </html>
    `;

    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `conveyance_${fromDate}_to_${toDate}.xls`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Conveyance report exported successfully ✓");
  };

  const toggleExec = (uid: string) => setExpandedExecs((prev) => {
    const next = new Set(prev);
    if (next.has(uid)) next.delete(uid); else next.add(uid);
    return next;
  });

  const toggleTableSort = (field: string) => {
    setTableSort((prev) =>
      prev.field === field
        ? { field, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { field, dir: "desc" }
    );
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (tableSort.field !== field) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return tableSort.dir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Receipt className="h-6 w-6 text-primary" /> Conveyance Panel
          </h1>
          <p className="text-xs text-muted-foreground">
            Executive travel &amp; conveyance records — formatted for accounts
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode("summary")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${viewMode === "summary" ? "bg-primary text-primary-foreground" : "hover:bg-muted/60 text-muted-foreground"}`}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Summary
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${viewMode === "table" ? "bg-primary text-primary-foreground" : "hover:bg-muted/60 text-muted-foreground"}`}
            >
              <LayoutList className="h-3.5 w-3.5" /> Table
            </button>
          </div>
          <Button onClick={exportToExcel} size="sm" variant="outline" className="gap-2">
            <Download className="h-4 w-4" /> Export Excel
          </Button>
        </div>
      </div>

      {/* ── Filter Bar (single row) ── */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap gap-2 items-center">

            {/* Search */}
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="pl-8 h-8 text-sm bg-background"
                placeholder="Search executive or location..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Period */}
            <Select value={preset} onValueChange={(v) => setPreset(v as DatePreset)}>
              <SelectTrigger className="h-8 text-xs w-[120px] bg-background"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="this_week">This Week</SelectItem>
                <SelectItem value="last_15">Last 15 Days</SelectItem>
                <SelectItem value="this_month">This Month</SelectItem>
                <SelectItem value="last_30">Last 30 Days</SelectItem>
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

            {/* Showroom */}
            {(canSeeAll || (isManager && showroomIds && showroomIds.length > 1)) && showrooms.length > 0 && (
              <Select value={selectedShowroom} onValueChange={setSelectedShowroom}>
                <SelectTrigger className="h-8 text-xs w-[140px] bg-background"><SelectValue placeholder="All Showrooms" /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="all">All Showrooms</SelectItem>
                  {showrooms
                    .filter(s => canSeeAll || (showroomIds && showroomIds.includes(s.id)))
                    .map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}

            {/* Executive */}
            {profiles.length > 1 && (
              <Select value={selectedExec} onValueChange={setSelectedExec}>
                <SelectTrigger className="h-8 text-xs w-[130px] bg-background"><SelectValue placeholder="All Executives" /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="all">All Executives</SelectItem>
                  {profiles.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}

            {/* Vehicle type */}
            <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
              <SelectTrigger className="h-8 text-xs w-[110px] bg-background"><SelectValue placeholder="All Vehicles" /></SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="all">All Vehicles</SelectItem>
                <SelectItem value="car">🚗 Car</SelectItem>
                <SelectItem value="bike">🏍️ Bike</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {[
          {
            label: "Total Distance", value: `${summary.totalKm.toFixed(1)} km`,
            sub: `${summary.tripCount} trips`,
            icon: Navigation2, color: "text-blue-500", bg: "bg-blue-500/10",
          },
          {
            label: "Total Conveyance", value: `₹${summary.totalAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`,
            sub: `₹${summary.avgRatePerKm.toFixed(2)}/km avg`,
            icon: IndianRupee, color: "text-green-500", bg: "bg-green-500/10",
          },
          {
            label: "Total Trips", value: summary.tripCount,
            sub: `${summary.carTrips} car · ${summary.bikeTrips} bike`,
            icon: MapPin, color: "text-purple-500", bg: "bg-purple-500/10",
          },
          {
            label: "Executives", value: summary.execCount,
            sub: summary.execCount > 0 ? `filed expense` : "—",
            icon: User, color: "text-orange-500", bg: "bg-orange-500/10",
          },
          {
            label: "Avg ₹/km", value: `₹${summary.avgRatePerKm.toFixed(1)}`,
            sub: "overall rate",
            icon: Receipt, color: "text-teal-500", bg: "bg-teal-500/10",
          },
          {
            label: "Avg / Executive", value: `₹${summary.avgPerExec.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`,
            sub: "this period",
            icon: IndianRupee, color: "text-pink-500", bg: "bg-pink-500/10",
          },
        ].map(({ label, value, sub, icon: Icon, color, bg }) => (
          <Card key={label}><CardContent className="p-3">
            <div className={`w-7 h-7 rounded-lg ${bg} ${color} flex items-center justify-center mb-2`}>
              <Icon className="h-3.5 w-3.5" />
            </div>
            <p className="text-lg font-bold font-mono">{value}</p>
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mt-0.5">{label}</p>
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">{sub}</p>
          </CardContent></Card>
        ))}
      </div>

      {/* ════════════════════════════ SUMMARY VIEW ════════════════════════════ */}
      {viewMode === "summary" && (
        isLoading ? (
          <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl animate-pulse bg-muted/40" />)}</div>
        ) : grouped.length === 0 ? (
          <Card><CardContent className="py-16 text-center">
            <Receipt className="h-10 w-10 mx-auto text-muted-foreground mb-3 opacity-25" />
            <p className="text-muted-foreground font-semibold">No conveyance records found</p>
            <p className="text-xs text-muted-foreground mt-1">Try adjusting the date range or filters</p>
          </CardContent></Card>
        ) : (
          <div className="space-y-3">
            {/* Sort strip */}
            <div className="flex items-center gap-2 px-1">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase">Sort by:</span>
              {(["amount", "km", "trips"] as SortField[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setSortField(f)}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors ${sortField === f ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground hover:bg-muted"}`}
                >
                  {f === "amount" ? "₹ Amount" : f === "km" ? "KM" : "Trips"}
                </button>
              ))}
            </div>

            {grouped.map(([userId, exec], idx) => {
              const isExpanded = expandedExecs.has(userId);
              const avgRateExec = exec.totalKm > 0 ? exec.totalAmt / exec.totalKm : 0;

              return (
                <motion.div key={userId} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04 }}>
                  <Card className="overflow-hidden">
                    {/* ── Executive header ── */}
                    <div
                      className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors select-none"
                      onClick={() => toggleExec(userId)}
                    >
                      {/* Left: avatar + name + showroom */}
                      <div className="flex items-center gap-3 min-w-0">
                        {isExpanded
                          ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                          : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                        <div className="h-9 w-9 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                          {exec.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-sm leading-tight">{exec.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {canSeeAll && <p className="text-[10px] text-muted-foreground">{exec.showroomName}</p>}
                            {/* Vehicle breakdown */}
                            {exec.carTrips > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-muted-foreground">
                                🚗 {exec.carTrips}
                              </span>
                            )}
                            {exec.bikeTrips > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-muted-foreground">
                                🏍️ {exec.bikeTrips}
                              </span>
                            )}
                            {exec.otherTrips > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-muted-foreground">
                                🚌 {exec.otherTrips}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: stats */}
                      <div className="flex items-center gap-3 sm:gap-5 shrink-0">
                        <div className="text-right hidden sm:block">
                          <p className="text-sm font-bold font-mono">{exec.totalKm.toFixed(1)} km</p>
                          <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Distance</p>
                        </div>
                        <div className="text-right hidden sm:block">
                          <p className="text-[10px] font-semibold font-mono text-muted-foreground">₹{avgRateExec.toFixed(1)}/km</p>
                          <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Avg rate</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold font-mono text-green-500">₹{exec.totalAmt.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p>
                          <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Amount</p>
                        </div>
                        <Badge variant="outline" className="text-[10px] font-mono shrink-0">
                          {exec.tripCount} trips
                        </Badge>
                      </div>
                    </div>

                    {/* ── Expanded: date-wise breakdown ── */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden border-t border-border"
                        >
                          {Array.from(exec.byDate.entries())
                            .sort(([a], [b]) => b.localeCompare(a))
                            .map(([date, trips]) => {
                              const dayKm = trips.reduce((s, r) => s + r.distance_km, 0);
                              const dayAmt = trips.reduce((s, r) => s + r.amount, 0);

                              return (
                                <div key={date} className="border-b border-border last:border-0">
                                  {/* Date header */}
                                  <div className="flex items-center justify-between px-5 py-2 bg-muted/20">
                                    <div className="flex items-center gap-2">
                                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                                      <span className="text-xs font-bold">{format(new Date(date), "dd MMM yyyy")}</span>
                                      <span className="text-[10px] text-muted-foreground font-semibold">{format(new Date(date), "EEEE")}</span>
                                    </div>
                                    <div className="flex items-center gap-4 text-xs">
                                      <span className="font-mono font-semibold text-muted-foreground">{dayKm.toFixed(1)} km</span>
                                      <span className="font-mono font-bold text-green-500">₹{dayAmt.toFixed(0)}</span>
                                      <span className="text-muted-foreground/50">{trips.length} trip{trips.length !== 1 ? "s" : ""}</span>
                                    </div>
                                  </div>

                                  {/* Trip rows */}
                                  {trips.map((trip, ti) => (
                                    <div
                                      key={trip.id}
                                      className="flex items-center gap-3 px-6 py-2.5 hover:bg-muted/10 transition-colors border-b border-border/30 last:border-0"
                                    >
                                      {/* Order number */}
                                      <span className="text-[10px] font-bold text-muted-foreground/50 w-4 shrink-0">{ti + 1}</span>

                                      {/* Vehicle icon */}
                                      <span className="text-xl shrink-0">{vehicleEmoji(trip.vehicle_type)}</span>

                                      {/* Route */}
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 text-xs font-semibold">
                                          <span className="truncate max-w-[120px] text-foreground">{trip.from_location_name || "Start"}</span>
                                          <span className="text-muted-foreground shrink-0 text-lg leading-none">→</span>
                                          <span className="truncate max-w-[120px] text-foreground">
                                            {trip.to_location_name || (trip.visit_id ? "Visit Location" : "End Day")}
                                          </span>
                                        </div>
                                        <p className="text-[10px] text-muted-foreground capitalize mt-0.5">
                                          {trip.vehicle_type} · ₹{trip.rate_per_km}/km
                                        </p>
                                      </div>

                                      {/* KM + Amount */}
                                      <div className="text-right shrink-0">
                                        <p className="text-xs font-mono font-semibold">{trip.distance_km.toFixed(2)} km</p>
                                        <p className="text-sm font-mono font-bold text-green-500">₹{trip.amount.toFixed(0)}</p>
                                      </div>

                                      {/* Type badge */}
                                      <Badge
                                        variant="outline"
                                        className={`text-[9px] shrink-0 ${trip.visit_id ? "border-blue-500/40 text-blue-500 bg-blue-500/5" : "border-orange-500/40 text-orange-500 bg-orange-500/5"}`}
                                      >
                                        {trip.visit_id ? "Visit" : "Return"}
                                      </Badge>
                                    </div>
                                  ))}

                                  {/* Day total */}
                                  <div className="flex items-center justify-between px-6 py-2 bg-muted/10 border-t border-border/40">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Day Total</span>
                                    <div className="flex items-center gap-6">
                                      <span className="text-xs font-mono font-bold">{dayKm.toFixed(1)} km</span>
                                      <span className="text-xs font-mono font-bold text-green-500 min-w-[56px] text-right">₹{dayAmt.toFixed(0)}</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}

                          {/* Executive total */}
                          <div className="flex items-center justify-between px-5 py-3 bg-primary/5 border-t-2 border-primary/20">
                            <div>
                              <span className="text-[11px] font-bold uppercase tracking-wider text-primary">{exec.name} — Monthly Total</span>
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {exec.tripCount} trips · ₹{avgRateExec.toFixed(2)}/km avg
                              </p>
                            </div>
                            <div className="flex items-center gap-6">
                              <div className="text-right">
                                <p className="text-sm font-mono font-bold">{exec.totalKm.toFixed(1)} km</p>
                                <p className="text-[9px] text-muted-foreground uppercase">Distance</p>
                              </div>
                              <div className="text-right min-w-[70px]">
                                <p className="text-sm font-mono font-bold text-green-500">₹{exec.totalAmt.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p>
                                <p className="text-[9px] text-muted-foreground uppercase">Amount</p>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </Card>
                </motion.div>
              );
            })}

            {/* Grand Total */}
            {grouped.length > 1 && (
              <Card className="border-2 border-primary/25 bg-primary/5">
                <CardContent className="p-4 flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <span className="font-bold text-sm text-primary uppercase tracking-wider">Grand Total</span>
                    <p className="text-xs text-muted-foreground mt-0.5">{summary.execCount} executives · {summary.tripCount} trips</p>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-xl font-bold font-mono">{summary.totalKm.toFixed(1)} km</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Distance</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold font-mono text-green-500">
                        ₹{summary.totalAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                      </p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Amount</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )
      )}

      {/* ════════════════════════════ TABLE VIEW ══════════════════════════════ */}
      {viewMode === "table" && (
        isLoading ? (
          <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-10 rounded animate-pulse bg-muted/40" />)}</div>
        ) : tableRows.length === 0 ? (
          <Card><CardContent className="py-16 text-center">
            <Receipt className="h-10 w-10 mx-auto text-muted-foreground mb-3 opacity-25" />
            <p className="text-muted-foreground font-semibold">No conveyance records found</p>
          </CardContent></Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-muted/60 border-b border-border">
                    {[
                      { label: "Date", field: "date" },
                      { label: "Executive", field: "executive" },
                      ...(canSeeAll ? [{ label: "Showroom", field: "showroom" }] : []),
                      { label: "From → To", field: "route" },
                      { label: "Vehicle", field: "vehicle" },
                      { label: "Type", field: "type" },
                      { label: "KM", field: "km" },
                      { label: "₹/km", field: "rate" },
                      { label: "Amount", field: "amount" },
                    ].map(({ label, field }) => (
                      <th
                        key={field}
                        className="px-3 py-2.5 text-left font-bold text-[11px] uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground select-none whitespace-nowrap border-r border-border last:border-0"
                        onClick={() => ["date","executive","km","amount"].includes(field) && toggleTableSort(field)}
                      >
                        <div className="flex items-center gap-1">
                          {label}
                          {["date","executive","km","amount"].includes(field) && <SortIcon field={field} />}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row, idx) => (
                    <motion.tr
                      key={row.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: idx * 0.01 }}
                      className="border-b border-border/40 hover:bg-muted/20 transition-colors"
                    >
                      <td className="px-3 py-2.5 font-semibold whitespace-nowrap border-r border-border/30">
                        {format(new Date(row.date), "dd MMM")}
                        <span className="block text-[9px] text-muted-foreground">{format(new Date(row.date), "EEE")}</span>
                      </td>
                      <td className="px-3 py-2.5 border-r border-border/30">
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center text-primary font-bold text-[9px] shrink-0">
                            {row.execName.charAt(0)}
                          </div>
                          <span className="font-semibold">{row.execName}</span>
                        </div>
                      </td>
                      {canSeeAll && (
                        <td className="px-3 py-2.5 text-muted-foreground border-r border-border/30 whitespace-nowrap">{row.showroomName}</td>
                      )}
                      <td className="px-3 py-2.5 border-r border-border/30 max-w-[200px]">
                        <div className="flex items-center gap-1 text-xs">
                          <span className="truncate max-w-[80px] font-medium">{row.from}</span>
                          <span className="text-muted-foreground shrink-0">→</span>
                          <span className="truncate max-w-[80px] font-medium">{row.to}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 border-r border-border/30 whitespace-nowrap">
                        <span className="flex items-center gap-1">
                          {vehicleIcon(row.vehicle)}
                          <span className="capitalize text-[11px]">{row.vehicle}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5 border-r border-border/30">
                        <Badge variant="outline" className={`text-[9px] ${row.type === "Visit" ? "border-blue-500/40 text-blue-500" : "border-orange-500/40 text-orange-500"}`}>
                          {row.type}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 font-mono font-semibold text-right border-r border-border/30 whitespace-nowrap">
                        {row.km.toFixed(2)}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-muted-foreground text-right border-r border-border/30 whitespace-nowrap">
                        ₹{row.rate.toFixed(0)}
                      </td>
                      <td className="px-3 py-2.5 font-mono font-bold text-green-500 text-right whitespace-nowrap">
                        ₹{row.amount.toFixed(0)}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
                {/* Table footer totals */}
                <tfoot>
                  <tr className="bg-muted/50 border-t-2 border-border font-bold">
                    <td className="px-3 py-2.5 text-[11px] font-bold uppercase text-muted-foreground" colSpan={canSeeAll ? 6 : 5}>
                      Total ({tableRows.length} trips)
                    </td>
                    <td className="px-3 py-2.5 font-mono font-bold text-right border-r border-border/30 whitespace-nowrap">
                      {summary.totalKm.toFixed(1)}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-muted-foreground text-right border-r border-border/30">
                      ₹{summary.avgRatePerKm.toFixed(0)}
                    </td>
                    <td className="px-3 py-2.5 font-mono font-bold text-green-500 text-right whitespace-nowrap">
                      ₹{summary.totalAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        )
      )}
    </div>
  );
};

export default Conveyance;
