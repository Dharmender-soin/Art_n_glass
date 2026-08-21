import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, subDays, parseISO } from "date-fns";
import { CalendarCheck, Search, Users, CheckCircle2, Clock, AlertCircle, TrendingUp, MapPin, Sparkles, LayoutGrid, List, Download, FileText } from "lucide-react";
import { Navigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { escapeReportHtml, openPdfPrintDialog } from "@/lib/printPdf";

const formatPlannedTimestamp = (dateStr?: string | null) => {
  if (!dateStr) return null;
  try {
    const d = parseISO(dateStr);
    if (isNaN(d.getTime())) return null;
    return format(d, "dd MMM, hh:mm a");
  } catch {
    return null;
  }
};


const DailyVisitDashboard = () => {
  const { user, role, showroomId, showroomIds } = useAuth();
  const isAdmin = role === "admin";
  const isManager = role === "manager";
  const isMd = role === "md";
  const isTl = role === "tl";
  const hasAccess = isAdmin || isManager || isMd || isTl;

  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [searchExec, setSearchExec] = useState("");
  const [filterShowroom, setFilterShowroom] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [visibleCount, setVisibleCount] = useState(20);

  useEffect(() => {
    if (isManager) {
      if (showroomIds && showroomIds.length === 1 && showroomId) {
        setFilterShowroom(showroomId);
      } else {
        setFilterShowroom("all");
      }
    }
  }, [isManager, showroomId, showroomIds]);

  const today = selectedDate;
  const yesterday = format(subDays(parseISO(selectedDate), 1), "yyyy-MM-dd");

  const { data: showrooms = [] } = useQuery({
    queryKey: ["showrooms"],
    queryFn: async () => {
      const { data, error } = await supabase.from("showrooms").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: executives = [] } = useQuery({
    queryKey: ["executives-for-dashboard", filterShowroom, showroomIds, role, user?.id],
    enabled: !!role && hasAccess,
    queryFn: async () => {
      if (isManager) {
        // Multi-showroom managers: bypass RLS by using get_showroom_leaderboard RPC
        const targetShowrooms = (filterShowroom && filterShowroom !== "all")
          ? [filterShowroom]
          : (showroomIds || []);

        if (targetShowrooms.length === 0) return [];

        const results = await Promise.all(
          targetShowrooms.map(async (sid) => {
            const { data, error } = await supabase.rpc("get_showroom_leaderboard", { p_showroom_id: sid });
            if (error) throw error;
            return ((data || []) as { user_id: string; role: string; full_name: string }[]).map((item) => {
              return {
                user_id: item.user_id,
                role: item.role as "executive" | "manager" | "tl" | "admin" | "accountant" | "backhand_executive",
                showroom_id: sid,
                profiles: { full_name: item.full_name }
              };
            }).filter((item) => item.role === "executive" || item.role === "tl" || item.role === "backhand_executive");
          })
        );
        return results.flat();
      }

      // A Team Leader sees only their own record and direct-report team.
      if (isTl && user) {
        const { data: teamRoles, error: teamError } = await supabase
          .from("user_roles")
          .select("user_id, role, showroom_id")
          .or(`user_id.eq.${user.id},reports_to.eq.${user.id}`)
          .in("role", ["executive", "tl", "backhand_executive"]);
        if (teamError) throw teamError;
        const teamUserIds = [...new Set((teamRoles || []).map((item) => item.user_id))];
        if (teamUserIds.length === 0) return [];
        const { data: teamProfiles, error: profileError } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", teamUserIds);
        if (profileError) throw profileError;
        const teamProfileMap = Object.fromEntries((teamProfiles || []).map((profile) => [profile.user_id, profile]));
        return (teamRoles || []).map((item) => ({ ...item, profiles: teamProfileMap[item.user_id] || { full_name: "Team Member" } }));
      }

      // Admin / MD: query all operational roles.
      let query = supabase
        .from("user_roles")
        .select("user_id, role, showroom_id")
        .in("role", ["executive", "tl", "backhand_executive"]);
      if (filterShowroom && filterShowroom !== "all") {
        query = query.eq("showroom_id", filterShowroom);
      }
      const { data: roles, error: rolesError } = await query;
      if (rolesError) throw rolesError;
      const userIds = [...new Set((roles || []).map((r) => r.user_id))];

      // Also include any user who has visits logged for yesterday/today
      const { data: visitUsers } = await supabase
        .from("visits")
        .select("created_by")
        .in("visit_date", [yesterday, today]);
      (visitUsers || []).forEach(v => { if (v.created_by) userIds.push(v.created_by); });

      const uniqueUserIds = [...new Set(userIds)];
      if (uniqueUserIds.length === 0) return [];
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", uniqueUserIds);
      if (profilesError) throw profilesError;
      const profileMap = Object.fromEntries((profiles || []).map((p) => [p.user_id, p]));
      return uniqueUserIds.map((uid) => {
        const r = (roles || []).find(roleItem => roleItem.user_id === uid);
        return {
          user_id: uid,
          role: r?.role || "executive",
          showroom_id: r?.showroom_id || null,
          profiles: profileMap[uid] || { full_name: "Team Member" },
        };
      });
    },
  });

  const { data: visits = [], isLoading } = useQuery({
    queryKey: ["dashboard-visits", yesterday, today, filterShowroom],
    queryFn: async () => {
      const execIds = executives.map((e) => e.user_id);
      if (execIds.length === 0) return [];
      const { data, error } = await supabase
        .from("visits")
        .select("*, clients(name, address), partners(name, address)")
        .in("created_by", execIds)
        .in("visit_date", [yesterday, today])
        .order("visit_date", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: executives.length > 0,
  });

  const { data: visitWosItems = [] } = useQuery({
    queryKey: ["daily-visit-wos", yesterday, today, visits.map((visit) => visit.client_id).filter(Boolean).join(",")],
    enabled: visits.some((visit) => Boolean(visit.client_id)),
    queryFn: async () => {
      const clientIds = [...new Set(visits.map((visit) => visit.client_id).filter(Boolean))] as string[];
      const executiveIds = [...new Set(visits.map((visit) => visit.created_by).filter(Boolean))] as string[];
      if (!clientIds.length || !executiveIds.length) return [];
      const from = new Date(`${yesterday}T00:00:00+05:30`).toISOString();
      const to = new Date(`${today}T23:59:59.999+05:30`).toISOString();
      const { data, error } = await supabase
        .from("work_scope_items")
        .select("id, client_id, created_by, created_at, work_status, master_work_types(type_of_work, sub_work)")
        .in("client_id", clientIds)
        .in("created_by", executiveIds)
        .gte("created_at", from)
        .lte("created_at", to);
      if (error) throw error;
      return data || [];
    },
  });

  const stats = useMemo(() => {
    const ydayVisits = visits.filter((v) => v.visit_date === yesterday);
    const todayVisits = visits.filter((v) => v.visit_date === today);
    const ydayPlanned = ydayVisits.length;
    const ydayDone = ydayVisits.filter((v) => v.status === "done").length;
    const todayPlanned = todayVisits.filter((v) => v.status === "planned" || v.status === "done").length;
    const completionRate = ydayPlanned > 0 ? Math.round((ydayDone / ydayPlanned) * 100) : 0;
    return { ydayPlanned, ydayDone, todayPlanned, completionRate };
  }, [visits, yesterday, today]);

  const execData = useMemo(() => {
    const filtered = searchExec
      ? executives.filter((e) =>
        ((e as { profiles?: { full_name: string } }).profiles?.full_name || "").toLowerCase().includes(searchExec.toLowerCase())
      )
      : executives;

    return filtered.map((exec) => {
      const execVisits = visits.filter((v) => v.created_by === exec.user_id);
      const ydayAll = execVisits.filter((v) => v.visit_date === yesterday);
      const todayAll = execVisits.filter((v) => v.visit_date === today);
      return {
        userId: exec.user_id,
        name: (exec as { profiles?: { full_name: string } }).profiles?.full_name || "Unknown",
        showroomId: exec.showroom_id,
        ydayPlanned: ydayAll.length,
        ydayDone: ydayAll.filter((v) => v.status === "done").length,
        ydayPending: ydayAll.filter((v) => v.status === "planned").length,
        todayPlanned: todayAll.filter((v) => v.status === "planned" || v.status === "done").length,
        ydayVisits: ydayAll,
        todayVisits: todayAll,
      };
    });
  }, [executives, visits, yesterday, today, searchExec]);

  const getEntityName = (v: { clients?: { name: string } | null; partners?: { name: string } | null }) => v.clients?.name || v.partners?.name || "—";
  const getVisitWos = (visit: { client_id?: string | null; created_by: string; visit_date: string }) => {
    if (!visit.client_id) return [];
    return visitWosItems.filter((item) => item.client_id === visit.client_id
      && item.created_by === visit.created_by
      && format(new Date(item.created_at), "yyyy-MM-dd") === visit.visit_date);
  };

  const handleExport = () => {
    let html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8" />
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>Daily Visits</x:Name>
                <x:WorksheetOptions>
                  <x:DisplayGridlines/>
                </x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
        <style>
          table { border-collapse: collapse; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; width: 100%; }
          td { border: 1px solid #D1D5DB; padding: 8px 12px; font-size: 11px; color: #1E293B; vertical-align: middle; }
          th { border: 1px solid #94A3B8; padding: 10px 12px; font-size: 11px; text-align: left; }
          .title-row { font-size: 16px; font-weight: bold; color: #0F172A; background-color: #F8FAFC; text-align: center; height: 42px; border-bottom: 2px solid #0284C7; }
          .banner-row { background-color: #0F172A; color: #F8FAFC; font-weight: bold; font-size: 12px; height: 32px; letter-spacing: 0.5px; }
          .main-header-yplan { background-color: #1E3A8A; color: #FFFFFF; font-weight: bold; text-align: center; height: 28px; }
          .main-header-yact { background-color: #065F46; color: #FFFFFF; font-weight: bold; text-align: center; height: 28px; }
          .main-header-tplan { background-color: #3730A3; color: #FFFFFF; font-weight: bold; text-align: center; height: 28px; }
          .sub-header-row th { background-color: #F1F5F9; color: #334155; font-weight: bold; height: 24px; font-size: 10px; text-transform: uppercase; }
          .status-done { color: #059669; font-weight: bold; background-color: #D1FAE5; text-align: center; }
          .status-pending { color: #DC2626; font-weight: bold; background-color: #FEE2E2; text-align: center; }
          .time-cell { font-family: monospace; color: #475569; text-align: center; white-space: nowrap; font-size: 10px; }
          .empty-row { height: 20px; }
          .empty-cell { border: none; background: transparent; }
        </style>
      </head>
      <body>
        <table>
          <tr>
            <td colspan="10" class="title-row">DAILY VISITS PERFORMANCE REPORT — ${format(parseISO(selectedDate), "dd MMM yyyy")}</td>
          </tr>
          <tr class="empty-row"><td colspan="10" class="empty-cell"></td></tr>
    `;

    execData.forEach((exec) => {
      const showroom = showrooms.find((s) => s.id === exec.showroomId);
      const showroomName = showroom?.name || "Unknown";
      const successRate = exec.ydayPlanned > 0 ? Math.round((exec.ydayDone / exec.ydayPlanned) * 100) : 0;

      // Executive Banner
      html += `
        <tr>
          <td colspan="10" class="banner-row" style="vertical-align: middle; padding-left: 12px;">
            EXECUTIVE: ${exec.name.toUpperCase()} &nbsp;&nbsp;|&nbsp;&nbsp; SHOWROOM: ${showroomName.toUpperCase()} &nbsp;&nbsp;|&nbsp;&nbsp; YESTERDAY SUCCESS RATE: ${successRate}%
          </td>
        </tr>
      `;

      // Main Headers
      html += `
        <tr>
          <th colspan="4" class="main-header-yplan">YESTERDAY PLANNING</th>
          <th colspan="3" class="main-header-yact">YESTERDAY ACTUAL (COMPLETED)</th>
          <th colspan="3" class="main-header-tplan">TODAY PLANNING</th>
        </tr>
      `;

      // Sub Headers
      html += `
        <tr class="sub-header-row">
          <th style="width: 250px;">Visit (Client/Partner & Purpose)</th>
          <th style="width: 130px; text-align: center;">Planned Timestamp</th>
          <th style="width: 80px; text-align: center;">Status</th>
          <th style="width: 180px;">Remarks</th>

          <th style="width: 250px;">Visit (Client/Partner & Purpose)</th>
          <th style="width: 130px; text-align: center;">Planned Timestamp</th>
          <th style="width: 180px;">Remarks</th>

          <th style="width: 250px;">Visit (Client/Partner & Purpose)</th>
          <th style="width: 130px; text-align: center;">Planned Timestamp</th>
          <th style="width: 180px;">Remarks</th>
        </tr>
      `;

      // Collect lists
      const ydayPlanned = exec.ydayVisits;
      const ydayActual = exec.ydayVisits.filter(v => v.status === 'done');
      const todayPlanned = exec.todayVisits;

      const rowCount = Math.max(ydayPlanned.length, ydayActual.length, todayPlanned.length, 1);

      for (let i = 0; i < rowCount; i++) {
        const yPlan = ydayPlanned[i];
        const yAct = ydayActual[i];
        const tPlan = todayPlanned[i];

        html += `
          <tr>
            <td>${yPlan ? `${getEntityName(yPlan)} [${yPlan.purpose || 'General Meeting'}]` : ""}</td>
            <td class="time-cell">${yPlan?.created_at ? (formatPlannedTimestamp(yPlan.created_at) || "—") : ""}</td>
            <td class="${yPlan ? (yPlan.status === 'done' ? 'status-done' : 'status-pending') : ''}">
              ${yPlan ? (yPlan.status === 'done' ? 'Done' : 'Pending') : ""}
            </td>
            <td>${yPlan ? (yPlan.remarks || "—") : ""}</td>

            <td>${yAct ? `${getEntityName(yAct)} [${yAct.purpose || 'General Meeting'}]` : ""}</td>
            <td class="time-cell">${yAct?.created_at ? (formatPlannedTimestamp(yAct.created_at) || "—") : ""}</td>
            <td>${yAct ? (yAct.remarks || "—") : ""}</td>

            <td>${tPlan ? `${getEntityName(tPlan)} [${tPlan.purpose || 'General Meeting'}]` : ""}</td>
            <td class="time-cell">${tPlan?.created_at ? (formatPlannedTimestamp(tPlan.created_at) || "—") : ""}</td>
            <td>${tPlan ? (tPlan.remarks || "—") : ""}</td>
          </tr>
        `;
      }

      // Space row
      html += `<tr class="empty-row"><td colspan="10" class="empty-cell"></td></tr>`;
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
    a.download = `Daily_Visits_Report_${selectedDate}.xls`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Daily Visits exported successfully ✓");
  };

  const handleExportPdf = () => {
    const showroomLabel = filterShowroom === "all" ? "All permitted showrooms" : showrooms.find((showroom) => showroom.id === filterShowroom)?.name || "Selected showroom";
    const pdfStats = execData.reduce((total, exec) => ({
      ydayPlanned: total.ydayPlanned + exec.ydayPlanned,
      ydayDone: total.ydayDone + exec.ydayDone,
      todayPlanned: total.todayPlanned + exec.todayPlanned,
    }), { ydayPlanned: 0, ydayDone: 0, todayPlanned: 0 });
    const pdfSuccessRate = pdfStats.ydayPlanned ? Math.round((pdfStats.ydayDone / pdfStats.ydayPlanned) * 100) : 0;
    const renderRows = (items: typeof visits, section: "planning" | "actual") => {
      const rows = items.map((visit) => {
        const address = visit.address || visit.clients?.address || visit.partners?.address || "—";
        const entityType = visit.client_id ? "Client" : visit.partner_id ? "Partner" : "Unlinked";
        const wosItems = getVisitWos(visit);
        const wosText = visit.client_id
          ? wosItems.length
            ? `Yes (${wosItems.length}) - ${wosItems.map((item: any) => item.master_work_types?.sub_work || item.master_work_types?.type_of_work || item.work_status).join(", ")}`
            : "No WOS added on visit date"
          : "Not applicable for Partner visit";
        const plannedAt = visit.created_at ? format(new Date(visit.created_at), "dd MMM, hh:mm a") : "—";
        const checkedInAt = visit.check_in_at ? format(new Date(visit.check_in_at), "hh:mm a") : "—";
        const finishedAt = visit.done_at ? format(new Date(visit.done_at), "hh:mm a") : visit.status === "cancelled" ? format(new Date(visit.updated_at), "hh:mm a") : "—";
        const statusLabel = String(visit.status || "planned").replaceAll("_", " ");
        const remarks = visit.remarks || (visit.status === "cancelled" ? "Cancellation reason not recorded" : "—");
        return `<tr>
          <td><b>${escapeReportHtml(getEntityName(visit))}</b><span class="visit-tag ${entityType.toLowerCase()}">${entityType}</span><small>${escapeReportHtml(address)}</small></td>
          <td><b>${escapeReportHtml(visit.purpose || "General Meeting")}</b><small>Status: <strong>${escapeReportHtml(statusLabel)}</strong></small><small>WOS: ${escapeReportHtml(wosText)}</small></td>
          <td><small>Planned: ${escapeReportHtml(plannedAt)}</small><small>Check-in: ${escapeReportHtml(checkedInAt)}</small><small>${visit.status === "cancelled" ? "Cancelled" : "Done"}: ${escapeReportHtml(finishedAt)}</small><p>${escapeReportHtml(section === "actual" ? remarks : visit.remarks || "—")}</p></td>
        </tr>`;
      }).join("");
      return rows || '<tr class="empty-data"><td colspan="3">No visits</td></tr>';
    };
    const executiveCards = execData.map((exec) => {
      const showroomName = showrooms.find((showroom) => showroom.id === exec.showroomId)?.name || "—";
      const ydayActual = exec.ydayVisits.filter((visit) => visit.status !== "planned");
      return `<article class="executive-card">
        <div class="executive-head"><b>${escapeReportHtml(exec.name)}</b><span>${escapeReportHtml(showroomName)} · Planned(Y): ${exec.ydayPlanned} · Actual(Y): ${exec.ydayDone} · Planned(Today): ${exec.todayPlanned}</span></div>
        <section class="visit-section planning"><h3>Planning (Yesterday)</h3><table><thead><tr><th>Client / Partner</th><th>Purpose, Status & WOS</th><th>Timeline & Remarks</th></tr></thead><tbody>${renderRows(exec.ydayVisits, "planning")}</tbody></table></section>
        <section class="visit-section actual"><h3>Actual (Yesterday)</h3><table><thead><tr><th>Client / Partner</th><th>Purpose, Status & WOS</th><th>Timeline & Remarks / MOM</th></tr></thead><tbody>${renderRows(ydayActual, "actual")}</tbody></table></section>
        <section class="visit-section today"><h3>Planning (Today)</h3><table><thead><tr><th>Client / Partner</th><th>Purpose, Status & WOS</th><th>Timeline & Remarks</th></tr></thead><tbody>${renderRows(exec.todayVisits, "planning")}</tbody></table></section>
      </article>`;
    }).join("");
    const body = `
      <style>
        .daily-report-summary { margin-bottom: 10px; text-align: left; }
        .executive-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; align-items: start; }
        .executive-card { border: 1px solid #b8c3cf; break-inside: avoid; page-break-inside: avoid; background: #fff; }
        .executive-head { min-height: 28px; padding: 6px 7px; background: #dff1ff; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .executive-head b { color: #101828; font-size: 10px; }
        .executive-head span { color: #475467; font-size: 7px; text-align: right; }
        .visit-section h3 { margin: 0; padding: 3px 5px; background: #fff5ce; color: #172033; font-size: 8px; }
        .visit-section table { font-size: 7.5px; }
        .visit-section th { padding: 3px 4px; background: #d9e1e8; color: #101828; font-size: 7px; }
        .visit-section td { min-height: 20px; padding: 4px; line-height: 1.3; }
        .visit-section td small { display: block; margin-top: 2px; color: #667085; font-size: 6.7px; }
        .visit-section td p { margin: 3px 0 0; padding-top: 3px; border-top: 1px dotted #cbd5e1; color: #344054; font-size: 6.8px; }
        .visit-tag { display: inline-block; margin-left: 4px; border-radius: 999px; padding: 1px 4px; color: #fff; font-size: 5.8px; text-transform: uppercase; }
        .visit-tag.client { background: #2563eb; } .visit-tag.partner { background: #7c3aed; } .visit-tag.unlinked { background: #667085; }
        .visit-section th:nth-child(1), .visit-section td:nth-child(1) { width: 30%; }
        .visit-section th:nth-child(2), .visit-section td:nth-child(2) { width: 32%; }
        .visit-section th:nth-child(3), .visit-section td:nth-child(3) { width: 38%; }
        .empty-data td { height: 23px; color: #98a2b3; text-align: center; font-style: italic; }
        .actual h3 { background: #fff0bf; }
        .today h3 { background: #fff5ce; }
        @media print { .executive-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      </style>
      <div class="meta daily-report-summary"><b>Selected date:</b> ${escapeReportHtml(format(parseISO(selectedDate), "dd MMM yyyy"))} &nbsp;·&nbsp; <b>Showroom:</b> ${escapeReportHtml(showroomLabel)} &nbsp;·&nbsp; <b>Executive search:</b> ${escapeReportHtml(searchExec || "None")}</div>
      <div class="kpis"><div class="kpi"><b>${pdfStats.ydayPlanned}</b><span>Yesterday planned</span></div><div class="kpi"><b>${pdfStats.ydayDone}</b><span>Yesterday done</span></div><div class="kpi"><b>${pdfStats.todayPlanned}</b><span>Today planned</span></div><div class="kpi"><b>${pdfSuccessRate}%</b><span>Success rate</span></div><div class="kpi"><b>${execData.length}</b><span>Executives</span></div></div>
      <div class="executive-grid">${executiveCards || '<p class="muted">No records match the current filters.</p>'}</div>`;
    try {
      openPdfPrintDialog(`Daily Visit Report · ${selectedDate}`, body, true);
      toast.success("PDF report opened. Choose Save as PDF in the print dialog.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open PDF report.");
    }
  };

  // Auth session becomes available slightly before the asynchronous role query.
  // Do not redirect during that short gap, otherwise authorized TLs/managers land
  // on Dashboard before their role has finished loading.
  if (!role) {
    return <div className="min-h-[50vh] flex items-center justify-center text-sm text-muted-foreground">Loading Daily Visits…</div>;
  }
  if (!hasAccess) return <Navigate to="/" replace />;

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <div className="space-y-6 min-h-screen bg-[#0A0B0E] text-[#F5F5F7] p-6 -m-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between sticky top-0 z-20 bg-[#0A0B0E]/90 backdrop-blur-lg pb-4 border-b border-[#F5F5F7]/5">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2 text-[#F5F5F7]">
            <Sparkles className="h-6 w-6 text-primary" />
            Daily Visit
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review and verify executive performance | {format(parseISO(selectedDate), "MMM dd, yyyy")}
          </p>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <div className="bg-[#12141A] backdrop-blur-sm p-1 rounded-lg border border-[#F5F5F7]/5 shadow-sm flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9 w-[180px] bg-transparent border-none focus-visible:ring-0 h-9"
                placeholder="Search executive..."
                value={searchExec}
                onChange={(e) => setSearchExec(e.target.value)}
              />
            </div>
            <div className="h-4 w-px bg-border" />
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-[140px] bg-transparent border-none focus-visible:ring-0 h-9"
            />
          </div>

          {(isAdmin || isMd || (isManager && showroomIds && showroomIds.length > 1)) && (
            <Select value={filterShowroom} onValueChange={setFilterShowroom}>
              <SelectTrigger className="w-[160px] bg-[#12141A] border-[#F5F5F7]/10 text-[#F5F5F7]">
                <SelectValue placeholder="All Showrooms" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Showrooms</SelectItem>
                {showrooms
                  .filter((s) => isAdmin || isMd || (showroomIds && showroomIds.includes(s.id)))
                  .map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          <Button
            onClick={handleExport}
            variant="outline"
            disabled={execData.length === 0}
            className="bg-[#12141A] border-[#F5F5F7]/10 hover:bg-[#1A1D24] text-[#F5F5F7] h-9 gap-2 shadow-sm"
          >
            <Download className="h-4 w-4 text-primary" />
            <span>Export Excel</span>
          </Button>
          <Button
            onClick={handleExportPdf}
            variant="outline"
            disabled={execData.length === 0}
            className="bg-[#12141A] border-[#F5F5F7]/10 hover:bg-[#1A1D24] text-[#F5F5F7] h-9 gap-2 shadow-sm"
          >
            <FileText className="h-4 w-4 text-primary" />
            <span>Export PDF</span>
          </Button>

          <div className="flex bg-[#12141A] rounded-md border border-[#F5F5F7]/5 p-1">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-sm transition-all ${viewMode === 'grid' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-[#A1A5AE] hover:bg-[#1A1D24]'}`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded-sm transition-all ${viewMode === 'list' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-[#A1A5AE] hover:bg-[#1A1D24]'}`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          icon={<Clock className="h-5 w-5 text-blue-500" />}
          label="Yesterday Planned"
          value={stats.ydayPlanned}
          color="blue"
          delay={0}
        />
        <StatsCard
          icon={<CheckCircle2 className="h-5 w-5 text-emerald-500" />}
          label="Yesterday Done"
          value={stats.ydayDone}
          color="emerald"
          delay={0.1}
        />
        <StatsCard
          icon={<CalendarCheck className="h-5 w-5 text-purple-500" />}
          label="Today Planned"
          value={stats.todayPlanned}
          color="purple"
          delay={0.2}
        />
        <CompletionCard rate={stats.completionRate} delay={0.3} />
      </div>

      {/* Main Content */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <p className="text-muted-foreground animate-pulse">Loading dashboard elements...</p>
        </div>
      ) : execData.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center justify-center py-20 text-center space-y-4"
        >
          <div className="h-24 w-24 rounded-full bg-[#1A1D24] flex items-center justify-center">
            <Users className="h-10 w-10 text-[#A1A5AE]" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-[#F5F5F7]">No Executives Found</h3>
            <p className="text-[#A1A5AE]">Try adjusting your filters or search criteria.</p>
          </div>
        </motion.div>
      ) : viewMode === "list" ? (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="overflow-x-auto rounded-xl border border-[#F5F5F7]/5 bg-[#12141A] shadow-md scrollbar-thin"
        >
          <table className="w-full text-left border-collapse min-w-max">
            <thead>
              <tr className="bg-[#1A1D24] text-xs font-bold uppercase tracking-wider text-[#A1A5AE] border-b border-[#F5F5F7]/5">
                <th className="p-4">Executive</th>
                <th className="p-4">Showroom</th>
                <th className="p-4">Yesterday Planned</th>
                <th className="p-4">Yesterday Actual (Done)</th>
                <th className="p-4 text-center">Success Rate</th>
                <th className="p-4">Today Planned</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F5F5F7]/5 text-sm">
              {execData.slice(0, visibleCount).map((exec) => {
                const showroom = showrooms.find((s) => s.id === exec.showroomId);
                const successRate = exec.ydayPlanned > 0 ? Math.round((exec.ydayDone / exec.ydayPlanned) * 100) : 0;
                return (
                  <tr key={exec.userId} className="hover:bg-[#1A1D24]/50 transition-colors duration-200">
                    <td className="p-4 align-top font-semibold text-[#F5F5F7]">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-purple-600 p-[1.5px] shrink-0">
                          <div className="h-full w-full rounded-full bg-[#12141A] flex items-center justify-center">
                            <Users className="h-3.5 w-3.5 text-primary" />
                          </div>
                        </div>
                        <span className="truncate max-w-[150px]">{exec.name}</span>
                      </div>
                    </td>
                    <td className="p-4 align-top text-[#A1A5AE] whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 text-[#8E939D] shrink-0" />
                        <span>{showroom?.name || "—"}</span>
                      </div>
                    </td>
                    <td className="p-4 align-top">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full whitespace-nowrap">
                            {exec.ydayPlanned} visits
                          </span>
                        </div>
                        <div className="max-w-[280px] max-h-[150px] overflow-y-auto space-y-1.5 mt-2 pr-1 scrollbar-thin">
                          {exec.ydayVisits.map((v, idx) => (
                            <div key={v.id} className="text-xs bg-[#1A1D24] p-2 rounded-lg border border-[#F5F5F7]/5 flex flex-col gap-1">
                              <div className="flex items-center justify-between gap-1.5">
                                <span className="font-semibold text-[#F5F5F7] leading-tight flex-1 truncate">
                                  {idx + 1}. {getEntityName(v)}
                                </span>
                                <span className={`text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded shrink-0 ${
                                  v.status === 'done' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                                }`}>
                                  {v.status === 'done' ? 'Done' : 'Pending'}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-[10px] text-[#8E939D] flex-wrap gap-1">
                                <span className="truncate max-w-[120px]">{v.purpose || "General Meeting"}</span>
                                {v.created_at && formatPlannedTimestamp(v.created_at) && (
                                  <span className="inline-flex items-center gap-1 text-[9px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20 shrink-0">
                                    <Clock className="h-2.5 w-2.5" />
                                    {formatPlannedTimestamp(v.created_at)}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                          {exec.ydayVisits.length === 0 && <span className="text-xs text-[#8E939D] italic">No visits planned</span>}
                        </div>
                      </div>
                    </td>
                    <td className="p-4 align-top">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full whitespace-nowrap">
                            {exec.ydayDone} completed
                          </span>
                        </div>
                        <div className="max-w-[280px] max-h-[150px] overflow-y-auto space-y-1.5 mt-2 pr-1 scrollbar-thin">
                          {exec.ydayVisits.filter(v => v.status === "done").map((v, idx) => (
                            <div key={v.id} className="text-xs bg-[#1A1D24] p-2 rounded-lg border border-[#F5F5F7]/5 space-y-1">
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-[#F5F5F7] font-medium leading-tight truncate">
                                  {idx + 1}. {getEntityName(v)}
                                </span>
                                {v.created_at && formatPlannedTimestamp(v.created_at) && (
                                  <span className="inline-flex items-center gap-1 text-[9px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 shrink-0">
                                    <Clock className="h-2.5 w-2.5" />
                                    {formatPlannedTimestamp(v.created_at)}
                                  </span>
                                )}
                              </div>
                              {v.remarks && (
                                <p className="text-[10px] text-emerald-300 bg-emerald-500/5 p-1 rounded border border-emerald-500/10 leading-snug">
                                  {v.remarks}
                                </p>
                              )}
                            </div>
                          ))}
                          {exec.ydayVisits.filter(v => v.status === "done").length === 0 && (
                            <span className="text-xs text-[#8E939D] italic">No visits completed</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-4 align-top text-center">
                      <div className="inline-flex flex-col items-center">
                        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                          successRate >= 80 ? 'bg-emerald-500/15 text-emerald-400' :
                          successRate >= 50 ? 'bg-amber-500/15 text-amber-400' :
                          'bg-red-500/15 text-red-400'
                        }`}>
                          {successRate}%
                        </span>
                        <div className="mt-2 w-16 h-1 rounded-full bg-white/10 overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${
                              successRate >= 80 ? 'bg-emerald-500' :
                              successRate >= 50 ? 'bg-amber-500' :
                              'bg-red-500'
                            }`}
                            style={{ width: `${successRate}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="p-4 align-top">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full whitespace-nowrap">
                            {exec.todayPlanned} planned
                          </span>
                        </div>
                        <div className="max-w-[280px] max-h-[150px] overflow-y-auto space-y-1.5 mt-2 pr-1 scrollbar-thin">
                          {exec.todayVisits.map((v, idx) => (
                            <div key={v.id} className="text-xs bg-[#1A1D24] p-2 rounded-lg border border-[#F5F5F7]/5 flex flex-col gap-1">
                              <div className="flex items-center justify-between gap-1.5">
                                <span className="font-semibold text-[#F5F5F7] leading-tight flex-1 truncate">
                                  {idx + 1}. {getEntityName(v)}
                                </span>
                                {v.created_at && formatPlannedTimestamp(v.created_at) && (
                                  <span className="inline-flex items-center gap-1 text-[9px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20 shrink-0">
                                    <Clock className="h-2.5 w-2.5" />
                                    {formatPlannedTimestamp(v.created_at)}
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-[#8E939D] truncate">{v.purpose || "General Meeting"}</span>
                            </div>
                          ))}
                          {exec.todayVisits.length === 0 && <span className="text-xs text-[#8E939D] italic">No visits planned</span>}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </motion.div>
      ) : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 xl:grid-cols-2 gap-6"
        >
          {execData.slice(0, visibleCount).map((exec) => {
            const showroom = showrooms.find((s) => s.id === exec.showroomId);
            return (
              <motion.div key={exec.userId} variants={itemVariants}>
                <ExecutiveCard
                  exec={exec}
                  showroomName={showroom?.name}
                  getEntityName={getEntityName}
                />
              </motion.div>
            );
          })}
          {visibleCount < execData.length && (
            <motion.div
              onViewportEnter={() => setVisibleCount(prev => Math.min(prev + 20, execData.length))}
              className="col-span-full py-8 flex justify-center w-full"
            >
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary/50" />
            </motion.div>
          )}
        </motion.div>
      )}
    </div >
  );
};

// --- Subcomponents ---

const StatsCard = ({ icon, label, value, color, delay }: { icon: React.ReactNode, label: string, value: number, color: string, delay: number }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay, duration: 0.4 }}
  >
    <Card className="border-[#F5F5F7]/5 shadow-md hover:shadow-lg transition-all duration-300 overflow-hidden relative group bg-[#12141A]">
      <div className={`absolute inset-0 bg-gradient-to-r from-${color}-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
      <div className={`absolute left-0 top-0 bottom-0 w-1 bg-${color}-500 rounded-l-full`} />
      <CardContent className="p-4 flex items-center gap-4 relative z-10">
        <div className={`p-3 rounded-2xl bg-${color}-500/10 text-${color}-400 group-hover:scale-110 transition-transform duration-300`}>
          {icon}
        </div>
        <div>
          <p className="text-[10px] text-[#A1A5AE] font-medium uppercase tracking-wider">{label}</p>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold tracking-tight text-[#F5F5F7]">{value}</span>
            <span className="text-xs text-[#8E939D] font-medium">visits</span>
          </div>
        </div>
      </CardContent>
    </Card>
  </motion.div>
);

const CompletionCard = ({ rate, delay }: { rate: number, delay: number }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay, duration: 0.4 }}
  >
    <Card className="border-none shadow-md hover:shadow-lg transition-all duration-300 bg-gradient-to-br from-amber-500 to-orange-600 text-white overflow-hidden relative">
      <div className="absolute top-0 right-0 p-8 bg-white/10 rounded-full blur-2xl transform translate-x-1/2 -translate-y-1/2" />
      <CardContent className="p-4 flex items-center gap-4 relative z-10">
        <div className="p-3 rounded-2xl bg-white/20 text-white backdrop-blur-md">
          <TrendingUp className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-white/80">Success Rate</p>
          <div className="flex items-end justify-between">
            <p className="text-3xl font-bold">{rate}%</p>
            <span className="text-xs text-white/80 mb-1">completed</span>
          </div>
          <div className="mt-2 h-1.5 w-full rounded-full bg-black/20 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${rate}%` }}
              transition={{ duration: 1, delay: 0.5, ease: "easeOut" }}
              className="h-full bg-white rounded-full"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  </motion.div>
);

interface VisitRecord {
  id: string;
  visit_date: string;
  status: string;
  purpose: string | null;
  remarks: string | null;
  visit_with_type: string | null;
  created_at?: string | null;
  clients?: { name: string } | null;
  partners?: { name: string } | null;
}

interface ExecutiveData {
  userId: string;
  name: string;
  showroomId: string | null;
  ydayPlanned: number;
  ydayDone: number;
  ydayPending: number;
  todayPlanned: number;
  ydayVisits: VisitRecord[];
  todayVisits: VisitRecord[];
}

const ExecutiveCard = ({ exec, showroomName, getEntityName }: { exec: ExecutiveData, showroomName?: string, getEntityName: (v: VisitRecord) => string }) => {
  return (
    <Card className="group overflow-hidden border-[#F5F5F7]/5 shadow-sm hover:shadow-xl transition-all duration-300 bg-[#12141A]">
      {/* Executive Header */}
      <div className="relative p-4 border-b border-[#F5F5F7]/5 bg-[#1A1D24]">
        <div className="flex items-center justify-between gap-3 relative z-10">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-purple-600 p-[2px] shadow-sm">
              <div className="h-full w-full rounded-full bg-[#12141A] flex items-center justify-center overflow-hidden">
                <Users className="h-5 w-5 text-primary" />
              </div>
            </div>
            <div>
              <h3 className="font-bold text-base text-[#F5F5F7]">{exec.name}</h3>
              {showroomName && (
                <div className="flex items-center gap-1 text-xs text-[#A1A5AE] mt-0.5">
                  <MapPin className="h-3 w-3" />
                  <span>{showroomName}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <div className="flex flex-col items-end">
              <span className="text-[10px] uppercase text-[#8E939D] font-semibold">Today</span>
              <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                {exec.todayPlanned} Planned
              </Badge>
            </div>
          </div>
        </div>
      </div>

      <CardContent className="p-0">
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[#F5F5F7]/5">

          <VisitColumn
            title="Yesterday Planned"
            subtitle="All scheduled stops"
            visits={exec.ydayVisits}
            type="pending"
            getEntityName={getEntityName}
            showStatus
          />

          <VisitColumn
            title="Yesterday Actual"
            subtitle="Completed visits"
            visits={exec.ydayVisits.filter((v) => v.status === "done")}
            type="success"
            getEntityName={getEntityName}
            showRemarks
          />

          <VisitColumn
            title="Today Planned"
            subtitle="Upcoming schedule"
            visits={exec.todayVisits}
            type="info"
            getEntityName={getEntityName}
            showStatus
          />

        </div>
      </CardContent>
    </Card>
  );
};

const VisitColumn = ({ title, subtitle, visits, type, getEntityName, showRemarks, showStatus }: {
  title: string,
  subtitle: string,
  visits: VisitRecord[],
  type: 'pending' | 'success' | 'info',
  getEntityName: (v: VisitRecord) => string,
  showRemarks?: boolean,
  showStatus?: boolean
}) => {
  const styles = {
    pending: { header: "text-amber-400", bg: "bg-amber-500/5", badge: "text-amber-400 bg-amber-500/15" },
    success: { header: "text-emerald-400", bg: "bg-emerald-500/5", badge: "text-emerald-400 bg-emerald-500/15" },
    info: { header: "text-blue-400", bg: "bg-blue-500/5", badge: "text-blue-400 bg-blue-500/15" },
  };

  const style = styles[type];

  return (
    <div className={`flex flex-col h-full ${style.bg} transition-colors duration-300 hover:bg-opacity-50`}>
      <div className="p-3 border-b border-[#F5F5F7]/5 flex items-center justify-between">
        <div>
          <p className={`text-xs font-bold uppercase tracking-tight ${style.header}`}>{title}</p>
          <p className="text-[10px] text-[#8E939D]">{subtitle}</p>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${style.badge}`}>
          {visits.length}
        </span>
      </div>

      <div className="flex-1 max-h-[300px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200 p-2 space-y-2">
        {visits.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-4 text-center opacity-40">
            <div className="p-3 rounded-full bg-[#1A1D24] mb-2">
              <List className="h-4 w-4 text-[#A1A5AE]" />
            </div>
            <p className="text-xs font-medium text-[#A1A5AE]">No visits found</p>
          </div>
        ) : (
          <AnimatePresence>
            {visits.map((v, i) => (
              <motion.div
                key={v.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="group relative bg-[#1A1D24] rounded-xl p-3 shadow-xs border border-[#F5F5F7]/10 hover:border-primary/40 hover:shadow-md transition-all duration-200 cursor-default"
              >
                <div className="absolute left-0 top-3 bottom-3 w-1 bg-[#F5F5F7]/10 group-hover:bg-primary transition-colors rounded-r-full" />

                <div className="flex justify-between items-start gap-2 pl-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-1.5 flex-wrap w-full">
                      <p className="font-bold text-xs text-[#F5F5F7] truncate leading-tight group-hover:text-primary transition-colors flex-1">
                        {getEntityName(v)}
                      </p>
                      {showStatus && v.status && (
                        <span className={`text-[8px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-full border shrink-0 ${
                          v.status === 'done'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-red-500/10 text-red-400 border-red-500/20'
                        }`}>
                          {v.status === 'done' ? 'Done' : 'Pending'}
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-[#8E939D] line-clamp-1">{v.purpose || "General Meeting"}</p>

                    {/* Planned Timestamp Pill */}
                    {v.created_at && formatPlannedTimestamp(v.created_at) && (
                      <div className="mt-1 flex items-center gap-1 text-[10px] text-blue-300/90 bg-blue-500/10 px-2 py-0.5 rounded-md border border-blue-500/20 w-fit">
                        <Clock className="h-3 w-3 text-blue-400 shrink-0" />
                        <span>Planned: <strong className="font-semibold text-blue-200">{formatPlannedTimestamp(v.created_at)}</strong></span>
                      </div>
                    )}

                    {showRemarks && v.remarks && (
                      <div className="mt-2 flex items-start gap-1.5 p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        <p className="text-[10px] text-emerald-300 leading-snug">{v.remarks}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-between border-t pt-2 border-dashed border-[#F5F5F7]/10 pl-2">
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="text-[10px] px-1.5 h-4.5 font-medium bg-[#12141A] border-[#F5F5F7]/10 text-[#A1A5AE] capitalize">
                      {v.visit_with_type || 'Solo'}
                    </Badge>
                  </div>
                  <span className="text-[10px] text-[#8E939D] font-mono">#{i + 1}</span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
};

export default DailyVisitDashboard;
