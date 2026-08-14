import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, parseISO, startOfMonth, getDaysInMonth, eachDayOfInterval, startOfMonth as som, endOfMonth, subDays } from "date-fns";
import { CalendarCheck, Users, Building2, CheckCircle, Clock, Package, Filter, ArrowUpRight, Download, Navigation, FileText, Printer, ChevronDown } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { Database } from "@/integrations/supabase/types";

type VisitWithRelations = Database["public"]["Tables"]["visits"]["Row"] & {
  clients: { name: string; address?: string | null } | null;
  partners: { name: string; address?: string | null } | null;
};

type WorkScopeItemWithJoins = Database["public"]["Tables"]["work_scope_items"]["Row"] & {
  master_work_types: { type_of_work: string; sub_work: string | null } | null;
  clients: { name: string } | null;
};

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];
const safeFormatTime = (str: string | null | undefined, fmtStr: string = "hh:mm a"): string => {
  if (!str) return "—";
  try {
    const d = parseISO(str);
    return isNaN(d.getTime()) ? "—" : format(d, fmtStr);
  } catch {
    return "—";
  }
};

const safeFormatDate = (str: string | null | undefined, fmtStr: string = "dd MMM yyyy"): string => {
  if (!str) return "—";
  try {
    const d = parseISO(str);
    return isNaN(d.getTime()) ? "—" : format(d, fmtStr);
  } catch {
    return "—";
  }
};

class ReportsErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: string }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: "" };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error?.message || "Render Error" };
  }
  componentDidCatch(error: Error, errorInfo: any) {
    console.error("Reports Error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 text-center bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl my-4">
          <p className="text-sm font-bold text-rose-600 dark:text-rose-400">Something went wrong loading DSR Reports.</p>
          <p className="text-xs text-rose-500 mt-1">{this.state.error}</p>
          <button onClick={() => this.setState({ hasError: false })} className="mt-3 px-3 py-1 bg-rose-600 text-white rounded text-xs font-bold">
            Retry Loading
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const Reports = () => {
  const { role } = useAuth();
  const [activeTab, setActiveTab] = useState<"overview" | "dsr">("overview");
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [filterExecutive, setFilterExecutive] = useState<string>("all");

  // DSR Tab state
  const [dsrEmployee, setDsrEmployee] = useState<string>("");
  const [dsrMonth, setDsrMonth] = useState<number>(new Date().getMonth());
  const [dsrYear, setDsrYear] = useState<number>(new Date().getFullYear());
  type DsrFilterMode = "weekly" | "15_days" | "this_month" | "custom";
  const [dsrFilterMode, setDsrFilterMode] = useState<DsrFilterMode>("this_month");
  const [dsrCustomFrom, setDsrCustomFrom] = useState<string>(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dsrCustomTo, setDsrCustomTo] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);

  // Fetch WON & LOST clients for Report Dialog
  const { data: reportClients = [] } = useQuery({
    queryKey: ["report-clients-won-lost"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, status, created_at, phone")
        .in("status", ["converted", "lost"])
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: visits = [], isLoading: isLoadingVisits } = useQuery({
    queryKey: ["report-visits", dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visits")
        .select("*, clients(name), partners(name)")
        .gte("visit_date", dateFrom)
        .lte("visit_date", dateTo)
        .order("visit_date", { ascending: false })
        .limit(10000);
      if (error) throw error;
      return (data || []) as VisitWithRelations[];
    },
  });

  // Work scope report for managers/admins
  const isManager = role === "admin" || role === "manager" || role === "md" || role === "accountant";

  const { data: workScopeItems = [], isLoading: isLoadingWork } = useQuery({
    queryKey: ["report-work-scope", dateFrom, dateTo],
    enabled: isManager,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_scope_items")
        .select("*, master_work_types(type_of_work, sub_work), clients(name)")
        .gte("created_at", dateFrom)
        .lte("created_at", dateTo + "T23:59:59")
        .order("created_at", { ascending: false })
        .limit(10000);
      if (error) throw error;
      return (data || []) as WorkScopeItemWithJoins[];
    },
  });

  const planned = visits.filter((v) => v.status === "planned").length;
  const done = visits.filter((v) => v.status === "done").length;
  const uniqueClients = new Set(visits.filter((v) => v.client_id).map((v) => v.client_id)).size;
  const uniquePartners = new Set(visits.filter((v) => v.partner_id).map((v) => v.partner_id)).size;

  const totalWorkAmount = workScopeItems.reduce((sum, i) => sum + (i.amount_in_lac || 0), 0);
  const verifiedWorkAmount = workScopeItems.filter((i) => i.is_verified).reduce((sum, i) => sum + (i.amount_in_lac || 0), 0);
  const verifiedCount = workScopeItems.filter((i) => i.is_verified).length;

  const { data: conveyanceRecords = [] } = useQuery({
    queryKey: ["report-conveyance", dateFrom, dateTo],
    enabled: isManager,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conveyance_records")
        .select("*")
        .gte("date", dateFrom)
        .lte("date", dateTo)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(10000);
      if (error) throw error;
      return data;
    },
  });

  const totalConveyanceAmount = conveyanceRecords.reduce((sum, r) => sum + (r.amount || 0), 0);

  // Fetch all executives for the filter dropdown
  const { data: executivesList = [] } = useQuery({
    queryKey: ["executives-list-reports"],
    enabled: isManager,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .order("full_name");
      if (error) throw error;
      return (data || []) as { user_id: string; full_name: string }[];
    },
  });

  // DSR — fetch visits for selected employee + month/range
  const { dsrFrom, dsrTo } = useMemo(() => {
    const today = new Date();
    if (dsrFilterMode === "weekly") {
      const from = format(subDays(today, 6), "yyyy-MM-dd");
      const to = format(today, "yyyy-MM-dd");
      return { dsrFrom: from, dsrTo: to };
    }
    if (dsrFilterMode === "15_days") {
      const from = format(subDays(today, 14), "yyyy-MM-dd");
      const to = format(today, "yyyy-MM-dd");
      return { dsrFrom: from, dsrTo: to };
    }
    if (dsrFilterMode === "custom") {
      return { dsrFrom: dsrCustomFrom, dsrTo: dsrCustomTo };
    }
    // Default: 'this_month'
    const from = `${dsrYear}-${String(dsrMonth + 1).padStart(2, "0")}-01`;
    const to = `${dsrYear}-${String(dsrMonth + 1).padStart(2, "0")}-${String(getDaysInMonth(new Date(dsrYear, dsrMonth))).padStart(2, "0")}`;
    return { dsrFrom: from, dsrTo: to };
  }, [dsrFilterMode, dsrMonth, dsrYear, dsrCustomFrom, dsrCustomTo]);

  const { data: dsrVisits = [], isLoading: dsrLoading } = useQuery({
    queryKey: ["dsr-visits", dsrEmployee, dsrFrom, dsrTo],
    enabled: isManager && !!dsrEmployee,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visits")
        .select("*, clients(name, address), partners(name, address)")
        .eq("created_by", dsrEmployee)
        .gte("visit_date", dsrFrom)
        .lte("visit_date", dsrTo)
        .order("visit_date", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(10000);
      if (error) throw error;
      return (data || []) as VisitWithRelations[];
    },
  });

  const dsrEmployeeName = executivesList.find(e => e.user_id === dsrEmployee)?.full_name || "";

  // Group DSR visits by date
  const dsrByDate = useMemo(() => {
    const map = new Map<string, typeof dsrVisits>();
    dsrVisits.forEach(v => {
      const d = v.visit_date;
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(v);
    });
    return map;
  }, [dsrVisits]);

  const dsrTotalPlanned = dsrVisits.filter(v => v.status === "planned" || v.status === "done").length;
  const dsrTotalDone = dsrVisits.filter(v => v.status === "done").length;
  const dsrSuccessRate = dsrTotalPlanned > 0 ? Math.round((dsrTotalDone / dsrTotalPlanned) * 100) : 0;

  const printDSR = () => {
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;

    const monthLabel = dsrFilterMode === "weekly" ? "LAST 7 DAYS"
                     : dsrFilterMode === "15_days" ? "LAST 15 DAYS"
                     : dsrFilterMode === "custom" ? `${format(parseISO(dsrFrom), "dd-MMM-yyyy")} TO ${format(parseISO(dsrTo), "dd-MMM-yyyy")}`
                     : `${MONTHS[dsrMonth].toUpperCase()} ${dsrYear}`;
    const generatedAt = format(new Date(), "dd-MMM-yyyy, hh:mm a");

    const daysHtml = Array.from(dsrByDate.entries()).map(([date, dayVisits]) => {
      const plannedCount = dayVisits.filter((v: VisitWithRelations) => v.status === "planned" || v.status === "done").length;
      const doneCount = dayVisits.filter((v: VisitWithRelations) => v.status === "done").length;
      const dateLabel = format(parseISO(date), "EEEE, dd MMM yyyy");

      const dayKm = conveyanceRecords
        .filter((r) => r.user_id === dsrEmployee && r.date === date)
        .reduce((sum, r) => sum + (r.distance_km || 0), 0);

      const rowsHtml = dayVisits.map((v: VisitWithRelations, idx: number) => {
        const name = v.clients?.name || v.partners?.name || "\u2014";
        const addr = v.address || v.clients?.address || v.partners?.address || "\u2014";
        const purpose = v.purpose || "\u2014";
        const remarks = v.remarks || "\u2014";
        const type = v.visit_with_type || "solo";
        const planningDate = v.created_at ? format(parseISO(v.created_at), "dd-MMM-yyyy") : format(parseISO(v.visit_date), "dd-MMM-yyyy");
        const statusColor = v.status === "done" ? "#16a34a" : v.status === "cancelled" ? "#dc2626" : "#d97706";
        const statusLabel = v.status === "done" ? "\u2713 Done" : v.status === "cancelled" ? "\u2717 Cancelled" : "\u23f3 Planned";
        const startTime = v.created_at ? format(parseISO(v.created_at), "hh:mm a") : "\u2014";
        const endTime = (v.done_at && v.status === "done") ? format(parseISO(v.done_at), "hh:mm a") : null;
        return `<tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:5px 7px;border:1px solid #e5e7eb;color:#888;font-size:10px;">${idx + 1}</td>
          <td style="padding:5px 7px;border:1px solid #e5e7eb;font-size:10px;color:#374151;white-space:nowrap;">${planningDate}</td>
          <td style="padding:5px 7px;border:1px solid #e5e7eb;"><strong style="font-size:11px;">${name}</strong><br/><span style="font-size:9px;color:#888;text-transform:capitalize;">${type}</span></td>
          <td style="padding:5px 7px;border:1px solid #e5e7eb;font-size:10px;color:#555;">${addr}</td>
          <td style="padding:5px 7px;border:1px solid #e5e7eb;font-size:10px;">${purpose}</td>
          <td style="padding:5px 7px;border:1px solid #e5e7eb;"><span style="font-size:10px;font-weight:bold;color:${statusColor};">${statusLabel}</span></td>
          <td style="padding:5px 7px;border:1px solid #e5e7eb;font-size:10px;white-space:nowrap;">
            <span style="font-weight:600;color:#111;">${startTime}</span>
            ${endTime ? `<br/><span style="color:#d97706;font-size:9px;font-weight:500;">Done: ${endTime}</span>` : ""}
          </td>
          <td style="padding:5px 7px;border:1px solid #e5e7eb;font-size:10px;color:#555;">${remarks}</td>
        </tr>`;
      }).join("");

      // Day-level start/end time
      const validCreatedAts = dayVisits.filter((v: VisitWithRelations) => v.created_at).map((v: VisitWithRelations) => v.created_at as string);
      const validDoneAts = dayVisits.filter((v: VisitWithRelations) => v.done_at && v.status === "done").map((v: VisitWithRelations) => v.done_at as string);
      const dayStartTime = validCreatedAts.length > 0 ? format(parseISO(validCreatedAts.sort()[0]), "hh:mm a") : "\u2014";
      const dayEndTime = validDoneAts.length > 0 ? format(parseISO(validDoneAts.sort().reverse()[0]), "hh:mm a") : "\u2014";

      return `<div style="border:1px solid #d1d5db;margin-bottom:12px;page-break-inside:avoid;">
        <div style="background:#f3f4f6;padding:7px 12px;border-bottom:1px solid #d1d5db;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div><strong style="font-size:12px;">${dateLabel}</strong><span style="font-size:10px;color:#6b7280;margin-left:8px;">${plannedCount} planned \u2022 ${doneCount} done</span></div>
            <div style="text-align:right;">
              <span style="font-size:10px;font-weight:bold;color:#16a34a;margin-right:10px;">${doneCount}/${plannedCount} Done</span>
              <span style="font-size:10px;font-weight:bold;color:#2563eb;background:#dbeafe;padding:2px 6px;border-radius:4px;">🚗 ${dayKm.toFixed(1)} KM</span>
            </div>
          </div>
          <div style="margin-top:4px;font-size:10px;color:#374151;">
            <span style="margin-right:14px;">\uD83D\uDD35 <strong>Day Start:</strong> <span style="color:#166534;font-weight:600;">${dayStartTime}</span></span>
            <span>\uD83D\uDD34 <strong>Day End:</strong> <span style="color:#b45309;font-weight:600;">${dayEndTime}</span></span>
          </div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:11px;">
          <thead><tr style="background:#f9fafb;">
            <th style="padding:5px 7px;border:1px solid #e5e7eb;text-align:left;font-size:10px;width:28px;">#</th>
            <th style="padding:5px 7px;border:1px solid #e5e7eb;text-align:left;font-size:10px;">Planning Date</th>
            <th style="padding:5px 7px;border:1px solid #e5e7eb;text-align:left;font-size:10px;">Customer / Partner</th>
            <th style="padding:5px 7px;border:1px solid #e5e7eb;text-align:left;font-size:10px;">Address</th>
            <th style="padding:5px 7px;border:1px solid #e5e7eb;text-align:left;font-size:10px;">Purpose</th>
            <th style="padding:5px 7px;border:1px solid #e5e7eb;text-align:left;font-size:10px;">Status</th>
            <th style="padding:5px 7px;border:1px solid #e5e7eb;text-align:left;font-size:10px;white-space:nowrap;">Time</th>
            <th style="padding:5px 7px;border:1px solid #e5e7eb;text-align:left;font-size:10px;">Remarks</th>
          </tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>`;
    }).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
    <title>DSR \u2014 ${dsrEmployeeName} \u2014 ${monthLabel}</title>
    <style>*{box-sizing:border-box;}body{font-family:Arial,sans-serif;margin:0;padding:18px 20px;color:#111;background:#fff;}@media print{body{padding:10px 14px;}@page{margin:10mm;}}</style>
    </head><body>
    <div style="text-align:center;border-bottom:2px solid #222;padding-bottom:10px;margin-bottom:18px;">
      <h1 style="margin:0;font-size:18px;font-weight:bold;">DAILY VISIT REPORT \u2014 ${monthLabel}</h1>
      <p style="margin:4px 0 0;font-size:11px;"><strong>Employee:</strong> ${dsrEmployeeName} &nbsp;|&nbsp; <strong>Generated:</strong> ${generatedAt}</p>
      <p style="margin:3px 0 0;font-size:11px;">Total Visits: <strong>${dsrTotalPlanned}</strong> &nbsp;|&nbsp; Done: <strong>${dsrTotalDone}</strong> &nbsp;|&nbsp; Success Rate: <strong>${dsrSuccessRate}%</strong></p>
    </div>
    ${daysHtml}
    </body></html>`;

    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
  };


  // Filtered conveyance records
  const filteredConveyance = filterExecutive === "all"
    ? conveyanceRecords
    : conveyanceRecords.filter((r) => r.user_id === filterExecutive);

  const filteredTotalKm = filteredConveyance.reduce((s, r) => s + (r.distance_km || 0), 0);
  const filteredTotalAmount = filteredConveyance.reduce((s, r) => s + (r.amount || 0), 0);

  // Executive summary map (for the per-person breakdown)
  const execSummaryMap = new Map<string, { name: string; km: number; amount: number; trips: number }>();
  conveyanceRecords.forEach((r) => {
    const matchedExec = executivesList.find(e => e.user_id === r.user_id);
    const name = matchedExec ? matchedExec.full_name : "Unknown";
    const existing = execSummaryMap.get(r.user_id);
    if (existing) {
      existing.km += (r.distance_km || 0);
      existing.amount += (r.amount || 0);
      existing.trips += 1;
    } else {
      execSummaryMap.set(r.user_id, { name, km: r.distance_km || 0, amount: r.amount || 0, trips: 1 });
    }
  });
  const execSummaryList = Array.from(execSummaryMap.values()).sort((a, b) => b.amount - a.amount);

  // EVR Reports Processing
  const processVisits = (type: 'partner' | 'client') => {
    const map = new Map<string, { name: string; address: string; count: number }>();
    visits.filter((v) => type === 'partner' ? v.partner_id : v.client_id).forEach((v) => {
      const id = type === 'partner' ? v.partner_id : v.client_id;
      const split = type === 'partner' ? v.partners : v.clients;
      if (!id || !split) return;

      const existing = map.get(id);
      if (existing) {
        existing.count++;
      } else {
        map.set(id, {
          name: split.name,
          address: v.address || "—",
          count: 1,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  };

  const partnerVisitList = processVisits('partner');
  const clientVisitList = processVisits('client');

  const exportToCSV = (data: { name: string; address: string; count: number }[], filename: string, isPartner: boolean) => {
    const headers = [isPartner ? "Partner Name" : "Client Name", "Address", "Visit Count"];
    const csvContent = [
      headers.join(","),
      ...data.map(row => `"${(row.name || '').replace(/"/g, '""')}","${(row.address || '').replace(/"/g, '""')}",${row.count}`)
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `${filename}_${format(new Date(), "yyyy-MM-dd")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-8 pb-20"
    >
      {/* Page Header - hidden on print */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 print:hidden">
        <div className="space-y-1 hidden md:block">
          <motion.h1
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-2xl md:text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent"
          >
            Reports & Analytics
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-sm text-muted-foreground"
          >
            Comprehensive overview of performance and activities
          </motion.p>
        </div>
        <Button
          onClick={() => setIsReportDialogOpen(true)}
          className="w-full md:w-auto gap-2 bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 text-white font-bold shadow-lg hover:brightness-110"
        >
          <FileText className="h-4 w-4" /> Open Report Summary Dialog 📊
        </Button>
      </div>

      {/* Tabs - hidden on print */}
      {isManager && (
        <div className="flex gap-1 bg-muted/40 p-1 rounded-xl border border-border/50 w-fit print:hidden">
          <button
            onClick={() => setActiveTab("overview")}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center gap-2 ${
              activeTab === "overview"
                ? "bg-background shadow-sm text-foreground border border-border/60"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <BarChart3Icon className="h-4 w-4" />
            Overview
          </button>
          <button
            onClick={() => setActiveTab("dsr")}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center gap-2 ${
              activeTab === "dsr"
                ? "bg-background shadow-sm text-foreground border border-border/60"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileText className="h-4 w-4" />
            Employee DSR
          </button>
        </div>
      )}

      {/* ───────── DSR TAB ───────── */}
      {activeTab === "dsr" && isManager && (
        <AnimatePresence mode="wait">
          <motion.div
            key="dsr-tab"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-6"
          >
            {/* DSR Filters - hidden on print */}
            <Card className="border-none shadow-sm print:hidden">
              <CardContent className="p-4">
                <div className="flex flex-wrap gap-4 items-end">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Employee</Label>
                    <Select value={dsrEmployee} onValueChange={setDsrEmployee}>
                      <SelectTrigger className="w-[200px] h-9">
                        <SelectValue placeholder="Select Employee" />
                      </SelectTrigger>
                      <SelectContent>
                        {executivesList.map(e => (
                          <SelectItem key={e.user_id} value={e.user_id}>{e.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Range Mode</Label>
                    <Select value={dsrFilterMode} onValueChange={(v) => setDsrFilterMode(v as DsrFilterMode)}>
                      <SelectTrigger className="w-[180px] h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="this_month">This Month</SelectItem>
                        <SelectItem value="weekly">Weekly (Last 7 Days)</SelectItem>
                        <SelectItem value="15_days">Last 15 Days</SelectItem>
                        <SelectItem value="custom">Custom Range</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {dsrFilterMode === "this_month" && (
                    <>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Month</Label>
                        <Select value={String(dsrMonth)} onValueChange={v => setDsrMonth(Number(v))}>
                          <SelectTrigger className="w-[140px] h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {MONTHS.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Year</Label>
                        <Select value={String(dsrYear)} onValueChange={v => setDsrYear(Number(v))}>
                          <SelectTrigger className="w-[100px] h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[2024,2025,2026,2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}
                  {dsrFilterMode === "custom" && (
                    <>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">From Date</Label>
                        <Input type="date" value={dsrCustomFrom} onChange={(e) => setDsrCustomFrom(e.target.value)} className="w-[150px] h-9 bg-background" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">To Date</Label>
                        <Input type="date" value={dsrCustomTo} onChange={(e) => setDsrCustomTo(e.target.value)} className="w-[150px] h-9 bg-background" />
                      </div>
                    </>
                  )}
                  {dsrEmployee && (
                    <Button onClick={printDSR} variant="outline" size="sm" className="h-9 gap-2 ml-auto print:hidden">
                      <Printer className="h-4 w-4" />
                      Print / Save PDF
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* DSR Summary - hidden on print */}
            {dsrEmployee && !dsrLoading && (
              <div className="grid grid-cols-3 gap-4 print:hidden">
                {[
                  { label: "Total Planned", value: dsrTotalPlanned, color: "text-blue-500", bg: "bg-blue-500/10" },
                  { label: "Total Done", value: dsrTotalDone, color: "text-emerald-500", bg: "bg-emerald-500/10" },
                  { label: "Success Rate", value: `${dsrSuccessRate}%`, color: "text-amber-500", bg: "bg-amber-500/10" },
                ].map(s => (
                  <Card key={s.label} className="border-none shadow-sm">
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full ${s.bg} flex items-center justify-center`}>
                        <span className={`text-sm font-bold ${s.color}`}>{s.value}</span>
                      </div>
                      <p className="text-sm text-muted-foreground font-medium">{s.label}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* DSR Report Table */}
            {!dsrEmployee ? (
              <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                  <FileText className="h-7 w-7 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground font-medium">Select an employee to generate their DSR</p>
              </div>
            ) : dsrLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : dsrVisits.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                  <CalendarCheck className="h-7 w-7 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground font-medium">
                  No visits found for {dsrEmployeeName} in {
                    dsrFilterMode === "weekly" ? "Last 7 Days"
                    : dsrFilterMode === "15_days" ? "Last 15 Days"
                    : dsrFilterMode === "custom" ? `${format(parseISO(dsrFrom), "dd MMM yyyy")} - ${format(parseISO(dsrTo), "dd MMM yyyy")}`
                    : `${MONTHS[dsrMonth]} ${dsrYear}`
                  }
                </p>
              </div>
            ) : (
              <div id="dsr-printable">
                {/* Print Header - visible ONLY when printing */}
                <div className="dsr-print-header hidden print:block text-center mb-4 pb-3" style={{borderBottom: "2px solid #222"}}>
                  <h1 style={{fontSize: "16px", fontWeight: "bold", margin: 0}}>
                    DAILY VISIT REPORT — {
                      dsrFilterMode === "weekly" ? "LAST 7 DAYS"
                      : dsrFilterMode === "15_days" ? "LAST 15 DAYS"
                      : dsrFilterMode === "custom" ? `${format(parseISO(dsrFrom), "dd-MMM-yyyy")} TO ${format(parseISO(dsrTo), "dd-MMM-yyyy")}`
                      : `${MONTHS[dsrMonth].toUpperCase()} ${dsrYear}`
                    }
                  </h1>
                  <p style={{fontSize: "11px", marginTop: "4px"}}>Employee: <strong>{dsrEmployeeName}</strong> &nbsp;|&nbsp; Generated: {format(new Date(), "dd-MMM-yyyy, hh:mm a")}</p>
                  <p style={{fontSize: "11px"}}>Total Visits: <strong>{dsrTotalPlanned}</strong> &nbsp;|&nbsp; Done: <strong>{dsrTotalDone}</strong> &nbsp;|&nbsp; Success Rate: <strong>{dsrSuccessRate}%</strong></p>
                </div>

                <div className="space-y-4">
                  {Array.from(dsrByDate.entries()).map(([date, dayVisits]) => {
                    const planned = dayVisits.filter(v => v.status === "planned" || v.status === "done");
                    const done = dayVisits.filter(v => v.status === "done");
                    return (
                      <div key={date} className="dsr-day-card overflow-hidden rounded-xl border border-border shadow-md">
                        <div className="dsr-day-header flex flex-col gap-1 bg-muted/40 border-b py-2.5 px-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center print:hidden">
                                <span className="text-xs font-bold text-primary">{format(parseISO(date), "dd")}</span>
                              </div>
                              <div>
                                <p className="font-bold text-sm">{safeFormatDate(date, "EEEE, dd MMM yyyy")}</p>
                                <p className="text-[11px] text-muted-foreground">{planned.length} planned &bull; {done.length} done</p>
                              </div>
                            </div>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 print:hidden">
                              {done.length}/{planned.length} Done
                            </span>
                            <span className="hidden print:inline text-[11px] font-bold text-green-700">
                              {done.length}/{planned.length} Done
                            </span>
                          </div>
                          {/* Day-level start/end time */}
                          {(() => {
                            const validCreated = dayVisits.filter(v => v.created_at).map(v => v.created_at as string);
                            const validDone = dayVisits.filter(v => v.done_at && v.status === "done").map(v => v.done_at as string);
                            const dayStart = validCreated.length > 0 ? safeFormatTime([...validCreated].sort()[0], "hh:mm a") : "—";
                            const dayEnd = validDone.length > 0 ? safeFormatTime([...validDone].sort().reverse()[0], "hh:mm a") : "—";
                            return (
                              <div className="flex items-center gap-4 text-[11px] pl-10 print:pl-0">
                                <span className="flex items-center gap-1">
                                  <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                                  <span className="text-muted-foreground">Day Start:</span>
                                  <span className="font-semibold text-green-600">{dayStart}</span>
                                </span>
                                <span className="flex items-center gap-1">
                                  <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                                  <span className="text-muted-foreground">Day End:</span>
                                  <span className="font-semibold text-amber-600">{dayEnd}</span>
                                </span>
                              </div>
                            );
                          })()}
                        </div>
                        <div className="p-0">
                          <table className="w-full border-collapse text-xs">
                            <thead>
                              <tr className="bg-muted/20">
                                <th className="text-[11px] py-2 px-3 text-left font-semibold border-b w-[28px]">#</th>
                                <th className="text-[11px] py-2 px-3 text-left font-semibold border-b">Customer / Partner</th>
                                <th className="text-[11px] py-2 px-3 text-left font-semibold border-b">Address</th>
                                <th className="text-[11px] py-2 px-3 text-left font-semibold border-b">Purpose</th>
                                <th className="text-[11px] py-2 px-3 text-left font-semibold border-b">Status</th>
                                <th className="text-[11px] py-2 px-3 text-left font-semibold border-b">Time</th>
                                <th className="text-[11px] py-2 px-3 text-left font-semibold border-b">Remarks</th>
                              </tr>
                            </thead>
                            <tbody>
                              {dayVisits.map((v, idx) => {
                                const name = v.clients?.name || v.partners?.name || "—";
                                const addr = v.address || v.clients?.address || v.partners?.address || "—";
                                const statusClass = v.status === "done" ? "dsr-status-done" : v.status === "cancelled" ? "dsr-status-cancelled" : "dsr-status-planned";
                                const statusLabel = v.status === "done" ? "✓ Done" : v.status === "cancelled" ? "✗ Cancelled" : "⏳ Planned";
                                const startTime = safeFormatTime(v.created_at, "hh:mm a");
                                const endTime = (v.done_at && v.status === "done") ? safeFormatTime(v.done_at, "hh:mm a") : null;
                                return (
                                  <tr key={v.id} className="border-b hover:bg-muted/10">
                                    <td className="text-[11px] py-2 px-3 text-muted-foreground font-mono">{idx + 1}</td>
                                    <td className="py-2 px-3">
                                      <p className="font-semibold text-sm">{name}</p>
                                      <span className="text-[9px] text-muted-foreground capitalize">{v.visit_with_type || "solo"}</span>
                                    </td>
                                    <td className="text-xs text-muted-foreground py-2 px-3 max-w-[120px]">{addr}</td>
                                    <td className="text-xs py-2 px-3 max-w-[160px]">{v.purpose}</td>
                                    <td className="py-2 px-3">
                                      <span className={`text-[10px] font-bold ${statusClass}`}>{statusLabel}</span>
                                    </td>
                                    <td className="py-2 px-3 whitespace-nowrap text-xs text-muted-foreground">
                                      <span className="font-semibold text-foreground">{startTime}</span>
                                      {endTime && <span className="block text-[10px] text-amber-500 font-medium">Done: {endTime}</span>}
                                    </td>
                                    <td className="text-xs text-muted-foreground py-2 px-3 max-w-[160px]">{v.remarks || "—"}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      )}

      {/* ───────── OVERVIEW TAB ───────── */}
      {(activeTab === "overview" || !isManager) && (
      <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        className="flex items-center gap-3 bg-card p-2 rounded-xl border shadow-sm"
      >
        <div className="flex items-center gap-2 px-2 border-r pr-4">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Filter Range</span>
        </div>
        <div className="flex gap-2">
          <div className="space-y-0.5">
            <Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">From</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 w-36 bg-background border-none shadow-none text-xs focus-visible:ring-0 px-0" />
          </div>
          <div className="h-8 w-px bg-border mx-1 self-end mb-1" />
          <div className="space-y-0.5">
            <Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">To</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 w-36 bg-background border-none shadow-none text-xs focus-visible:ring-0 px-0" />
          </div>
        </div>
      </motion.div>

      {/* Visit Stats */}
      <motion.div variants={containerVariants} className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: "Planned Visits", value: planned, icon: Clock, color: "text-[hsl(var(--status-new))]", bg: "bg-[hsl(var(--status-new))]/10" },
          { label: "Completed Visits", value: done, icon: CheckCircle, color: "text-[hsl(var(--status-converted))]", bg: "bg-[hsl(var(--status-converted))]/10" },
          { label: "Active Clients", value: uniqueClients, icon: Users, color: "text-blue-500", bg: "bg-blue-500/10" },
          { label: "Active Partners", value: uniquePartners, icon: Building2, color: "text-purple-500", bg: "bg-purple-500/10" },
        ].map((stat, i) => (
          <motion.div key={stat.label} variants={itemVariants} whileHover={{ y: -5 }} transition={{ type: "spring", stiffness: 300 }}>
            <Card className="border-none shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden relative">
              <div className={`absolute top-0 right-0 p-3 opacity-20 ${stat.color}`}>
                <stat.icon className="h-16 w-16 -mr-4 -mt-4 transform rotate-12" />
              </div>
              <CardContent className="p-6 relative z-10">
                <div className={`w-10 h-10 rounded-full ${stat.bg} ${stat.color} flex items-center justify-center mb-4`}>
                  <stat.icon className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <p className="text-3xl font-bold tracking-tighter">{stat.value}</p>
                  <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Work Scope Summary */}
      {isManager && (
        <motion.div variants={containerVariants} className="space-y-6">

          <motion.div variants={itemVariants} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-1 bg-primary rounded-full" />
              <h2 className="text-xl font-bold">Work Scope Performance</h2>
            </div>
            <Badge variant="outline" className="px-3 py-1">Manager View</Badge>
          </motion.div>

          <motion.div variants={containerVariants} className="grid grid-cols-2 gap-4 md:grid-cols-2">
            <motion.div variants={itemVariants}>
              <Card className="bg-gradient-to-br from-card to-muted border-none shadow-sm">
                <CardContent className="p-4 flex flex-col items-center justify-center text-center space-y-2">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Total Items</span>
                  <span className="text-3xl font-bold">{workScopeItems.length}</span>
                </CardContent>
              </Card>
            </motion.div>
            <motion.div variants={itemVariants}>
              <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-none shadow-sm">
                <CardContent className="p-4 flex flex-col items-center justify-center text-center space-y-2">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-primary/80">Verified Count</span>
                  <span className="text-3xl font-bold text-primary">{verifiedCount}</span>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>

          {/* Work scope detail list */}
          <motion.div variants={itemVariants}>
            <Card className="overflow-hidden border-none shadow-md">
              <CardHeader className="bg-muted/30 border-b pb-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Package className="h-5 w-5 text-primary" />
                      Work Scope Details
                    </CardTitle>
                    <CardDescription>Detailed breakdown of logged work items</CardDescription>
                  </div>
                  <Badge variant="secondary" className="font-mono text-xs">{workScopeItems.length} Records</Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0 bg-card/50">
                <ScrollArea className="h-[500px]">
                  <div className="p-4 space-y-3">
                    <AnimatePresence>
                      {workScopeItems.length === 0 ? (
                        <p className="text-center text-muted-foreground py-10">No items found.</p>
                      ) : (
                        workScopeItems.map((item, index) => {
                          const wt = item.master_work_types;
                          const client = item.clients;
                          const verified = item.is_verified;
                          const amt = item.amount_in_lac;
                          return (
                            <motion.div
                              key={item.id}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: index * 0.05 }}
                              whileHover={{ scale: 1.01, backgroundColor: "hsl(var(--muted)/0.6)" }}
                              className="group flex flex-col sm:flex-row sm:items-center justify-between rounded-xl border p-4 bg-background shadow-sm hover:shadow-md transition-all cursor-default"
                            >
                              <div className="space-y-1.5 flex-1">
                                <div className="flex items-center gap-2">
                                  <div className={`w-2 h-2 rounded-full ${verified ? 'bg-[hsl(var(--status-converted))]' : 'bg-orange-400'}`} />
                                  <span className="font-semibold text-sm">{client?.name || "—"}</span>
                                  <ArrowUpRight className="h-3 w-3 text-muted-foreground" />
                                  <span className="font-medium text-sm text-foreground/80">{wt?.sub_work || "Unknown"}</span>
                                </div>
                                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground pl-4">
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 font-normal bg-muted/50 border-muted-foreground/20 text-muted-foreground">{wt?.type_of_work}</Badge>
                                  <span>Qty: <span className="font-mono font-medium text-foreground">{item.quantity || "—"}</span></span>
                                  <span className="w-1 h-1 bg-muted-foreground/30 rounded-full" />
                                  <span>{format(parseISO(item.created_at), "dd MMM, hh:mm a")}</span>
                                </div>
                              </div>

                              <div className="flex items-center justify-between sm:justify-end gap-4 mt-3 sm:mt-0 pl-4 sm:pl-0 border-t sm:border-0 pt-3 sm:pt-0">
                                <div className="min-w-[80px] text-right">
                                  {verified ? (
                                    <Badge className="bg-[hsl(var(--status-converted))/15] text-[hsl(var(--status-converted))] hover:bg-[hsl(var(--status-converted))/25] border-0">Verified</Badge>
                                  ) : (
                                    <Badge variant="secondary" className="bg-orange-500/10 text-orange-600 hover:bg-orange-500/20">Pending</Badge>
                                  )}
                                </div>
                              </div>
                            </motion.div>
                          );
                        })
                      )}
                    </AnimatePresence>
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      )}

      <Separator className="my-8 opacity-50" />

      <motion.div variants={containerVariants} className="grid gap-6 md:grid-cols-2">
        {/* EVR Report — Partner Visits */}
        <motion.div variants={itemVariants} className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Building2 className="h-5 w-5 text-purple-500" />
              Partner Visits
            </h2>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono">{partnerVisitList.length}</Badge>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => exportToCSV(partnerVisitList, "Partner_EVR", true)} title="Export to CSV">
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <Card className="overflow-hidden h-full border-none shadow-md">
            <CardContent className="p-0">
              <ScrollArea className="h-[400px]">
                <Table>
                  <TableHeader className="bg-muted/50 sticky top-0 z-10 backdrop-blur-sm">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[50%]">Partner</TableHead>
                      <TableHead className="text-right">Visits</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {partnerVisitList.map((p, i) => (
                      <motion.tr
                        key={i}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="group border-b transition-colors hover:bg-muted/30"
                      >
                        <TableCell className="py-3">
                          <div className="font-medium">{p.name}</div>
                          <div className="text-xs text-muted-foreground truncate max-w-[200px]">{p.address}</div>
                        </TableCell>
                        <TableCell className="text-right font-bold py-3 text-primary">{p.count}</TableCell>
                      </motion.tr>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </motion.div>

        {/* EVR Report — Client Visits */}
        <motion.div variants={itemVariants} className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-500" />
              Client Visits
            </h2>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono">{clientVisitList.length}</Badge>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => exportToCSV(clientVisitList, "Client_EVR", false)} title="Export to CSV">
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <Card className="overflow-hidden h-full border-none shadow-md">
            <CardContent className="p-0">
              <ScrollArea className="h-[400px]">
                <Table>
                  <TableHeader className="bg-muted/50 sticky top-0 z-10 backdrop-blur-sm">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[50%]">Client</TableHead>
                      <TableHead className="text-right">Visits</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clientVisitList.map((c, i) => (
                      <motion.tr
                        key={i}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="group border-b transition-colors hover:bg-muted/30"
                      >
                        <TableCell className="py-3">
                          <div className="font-medium">{c.name}</div>
                          <div className="text-xs text-muted-foreground truncate max-w-[200px]">{c.address}</div>
                        </TableCell>
                        <TableCell className="text-right font-bold py-3 text-primary">{c.count}</TableCell>
                      </motion.tr>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* Conveyance Audit Report */}
      {isManager && (
      <motion.div variants={containerVariants} className="space-y-6 mt-16 pt-8 border-t border-border/40">
          {/* Header */}
          <motion.div variants={itemVariants} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="h-8 w-1 bg-primary rounded-full" />
              <h2 className="text-xl font-bold">Conveyance Audit Report</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={filterExecutive}
                onChange={(e) => setFilterExecutive(e.target.value)}
                className="text-sm bg-card border border-border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="all">All Executives</option>
                {executivesList.map((ex) => (
                  <option key={ex.user_id} value={ex.user_id}>{ex.full_name}</option>
                ))}
              </select>
              <Badge variant="outline" className="px-3 py-1 bg-green-500/10 text-green-600 border-none whitespace-nowrap">
                ₹{filteredTotalAmount.toFixed(2)} | {filteredTotalKm.toFixed(1)} km
              </Badge>
            </div>
          </motion.div>

          {/* Per-Executive Summary Cards (only when showing all) */}
          {filterExecutive === "all" && execSummaryList.length > 0 && (
            <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {execSummaryList.map((exec) => (
                <button
                  key={exec.name}
                  onClick={() => {
                    const found = executivesList.find((e) => e.full_name === exec.name);
                    if (found) setFilterExecutive(found.user_id);
                  }}
                  className="bg-card border border-border rounded-xl p-4 text-left hover:border-primary/40 hover:shadow-md transition-all group"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-primary">{exec.name.charAt(0)}</span>
                    </div>
                    <p className="font-semibold text-sm truncate group-hover:text-primary transition-colors">{exec.name}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Trips</p>
                      <p className="font-bold text-base font-mono">{exec.trips}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Distance</p>
                      <p className="font-bold text-base font-mono">{exec.km.toFixed(1)}<span className="text-xs text-muted-foreground ml-0.5">km</span></p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Amount</p>
                      <p className="font-bold text-base font-mono text-green-500">₹{exec.amount.toFixed(0)}</p>
                    </div>
                  </div>
                </button>
              ))}
            </motion.div>
          )}

          {/* Trip-by-trip table */}
          <motion.div variants={itemVariants}>
              <Card className="overflow-hidden border-none shadow-md">
                <CardHeader className="bg-muted/30 border-b pb-4">
                  <div className="flex items-center justify-between">
                     <div className="space-y-1">
                         <CardTitle className="text-lg flex items-center gap-2">
                             <Navigation className="h-5 w-5 text-primary" />
                             Trip by Trip Breakdown
                             {filterExecutive !== "all" && (
                               <Badge variant="secondary" className="ml-1 text-[10px]">
                                 {executivesList.find(e => e.user_id === filterExecutive)?.full_name}
                               </Badge>
                             )}
                         </CardTitle>
                         <CardDescription>Auditable records of sequenced distance tracking</CardDescription>
                     </div>
                     <div className="flex gap-2 items-center">
                       {filterExecutive !== "all" && (
                         <Button size="sm" variant="ghost" onClick={() => setFilterExecutive("all")} className="text-xs h-7 px-2">Clear filter</Button>
                       )}
                       <Badge variant="secondary" className="font-mono text-xs">{filteredConveyance.length} Records</Badge>
                     </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0 bg-card/50">
                   <ScrollArea className="h-[400px]">
                      <Table>
                        <TableHeader className="bg-muted/50 sticky top-0 z-10 backdrop-blur-sm">
                            <TableRow>
                               <TableHead>Date</TableHead>
                               <TableHead>Executive</TableHead>
                               <TableHead>Journey</TableHead>
                               <TableHead>Mode / Rate</TableHead>
                               <TableHead className="text-right">Distance</TableHead>
                               <TableHead className="text-right">Amount</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredConveyance.map((r) => {
                               const matchedExec = executivesList.find(e => e.user_id === r.user_id);
                               const execName = matchedExec ? matchedExec.full_name : "Unknown";
                               return (
                               <TableRow key={r.id}>
                                   <TableCell className="whitespace-nowrap font-medium text-xs">{format(parseISO(r.date), "dd MMM yyyy")}</TableCell>
                                   <TableCell className="text-sm font-semibold text-primary/80">{execName}</TableCell>
                                   <TableCell>
                                       <div className="text-xs truncate max-w-[220px]"><span className="text-muted-foreground mr-1">From:</span> {r.from_location_name}</div>
                                       <div className="text-xs truncate max-w-[220px] mt-1"><span className="text-muted-foreground mr-1">To:</span> {r.to_location_name}</div>
                                   </TableCell>
                                   <TableCell className="text-xs">
                                       <Badge variant="outline" className="capitalize text-[10px] mb-1">{r.vehicle_type}</Badge>
                                       <div className="text-muted-foreground">₹{r.rate_per_km}/km</div>
                                   </TableCell>
                                   <TableCell className="text-right font-mono text-sm">{r.distance_km} km</TableCell>
                                   <TableCell className="text-right font-mono text-green-500 font-bold tracking-tight">₹{r.amount}</TableCell>
                               </TableRow>
                             );
                            })}
                            {filteredConveyance.length === 0 && (
                                <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">No conveyance records found for this selection.</TableCell></TableRow>
                            )}
                        </TableBody>
                      </Table>
                   </ScrollArea>
                </CardContent>
              </Card>
          </motion.div>
      </motion.div>
      )}

      </div>
      )}

      {/* 📊 Executive & Sales Report Dialog Box for MD / Management */}
      <Dialog open={isReportDialogOpen} onOpenChange={setIsReportDialogOpen}>
        <DialogContent className="max-w-3xl bg-slate-950 border border-slate-800 text-white rounded-3xl shadow-2xl p-6 overflow-y-auto max-h-[90vh]">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold">
                📊
              </div>
              <div>
                <DialogTitle className="text-xl font-extrabold text-white">
                  Executive Performance & Deals Report
                </DialogTitle>
                <DialogDescription className="text-slate-400 text-xs mt-0.5">
                  Summary of WON Deals, LOST Deals, and Field Visit activity for MD & Management.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-6 mt-4">
            {/* Quick Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-emerald-950/40 border border-emerald-500/20 rounded-2xl p-3.5 text-center">
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">Deals Won ✅</span>
                <span className="text-2xl font-black text-emerald-300 mt-1 block">
                  {reportClients.filter((c: any) => c.status === "converted").length}
                </span>
              </div>
              <div className="bg-rose-950/40 border border-rose-500/20 rounded-2xl p-3.5 text-center">
                <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider block">Deals Lost ❌</span>
                <span className="text-2xl font-black text-rose-300 mt-1 block">
                  {reportClients.filter((c: any) => c.status === "lost").length}
                </span>
              </div>
              <div className="bg-blue-950/40 border border-blue-500/20 rounded-2xl p-3.5 text-center">
                <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider block">Completed Visits</span>
                <span className="text-2xl font-black text-blue-300 mt-1 block">{done}</span>
              </div>
              <div className="bg-purple-950/40 border border-purple-500/20 rounded-2xl p-3.5 text-center">
                <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider block">Planned Visits</span>
                <span className="text-2xl font-black text-purple-300 mt-1 block">{planned}</span>
              </div>
            </div>

            {/* WON Deals List */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-emerald-400 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" /> WON Deals Breakdown
                </h3>
                <span className="text-[10px] text-slate-400">
                  {reportClients.filter((c: any) => c.status === "converted").length} total won
                </span>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {reportClients.filter((c: any) => c.status === "converted").length === 0 ? (
                  <p className="text-xs text-slate-500 py-3 text-center">No WON deals recorded yet.</p>
                ) : (
                  reportClients.filter((c: any) => c.status === "converted").map((client: any) => (
                    <div key={client.id} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs">
                      <div>
                        <p className="font-bold text-slate-200">{client.name}</p>
                        <p className="text-[10px] text-slate-400">{client.phone || "No phone"}</p>
                      </div>
                      <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[10px]">
                        WON ✅
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* LOST Deals List */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-rose-400 flex items-center gap-2">
                  <Clock className="h-4 w-4" /> LOST Deals Summary
                </h3>
                <span className="text-[10px] text-slate-400">
                  {reportClients.filter((c: any) => c.status === "lost").length} total lost
                </span>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {reportClients.filter((c: any) => c.status === "lost").length === 0 ? (
                  <p className="text-xs text-slate-500 py-3 text-center">No LOST deals recorded.</p>
                ) : (
                  reportClients.filter((c: any) => c.status === "lost").map((client: any) => (
                    <div key={client.id} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs">
                      <div>
                        <p className="font-bold text-slate-200">{client.name}</p>
                        <p className="text-[10px] text-slate-400">{client.phone || "No phone"}</p>
                      </div>
                      <Badge className="bg-rose-500/20 text-rose-300 border-rose-500/30 text-[10px]">
                        LOST ❌
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </motion.div>
  );
};

// Local icon to avoid extra import
const BarChart3Icon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);

export default function WrappedReports() {
  return (
    <ReportsErrorBoundary>
      <Reports />
    </ReportsErrorBoundary>
  );
}
