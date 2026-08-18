import { useState, useMemo, useEffect, Fragment } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import {
  GitBranch, Filter, CheckCircle2, XCircle, Clock, Send,
  Loader2, TrendingUp, Building2, Search, RotateCcw,
  Award, BarChart2, Target, Zap, ChevronRight, ChevronDown, Download,
  FolderCheck, Archive, AlertTriangle, PauseCircle, ArrowLeft, Handshake
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { motion, AnimatePresence } from "framer-motion";
import * as XLSX from "xlsx";
import { sendNotification } from "@/lib/notifications";

type WorkStatus = "pending" | "submitted" | "won" | "lost" | "draft" | "rejected" | "hold";

interface WOSRecord {
  id: string; client_id: string; work_type_id: string;
  work_status: WorkStatus; created_at: string; submitted_at: string | null;
  verified_at: string | null; quantity: number | null;
  description: string | null; created_by: string;
}
interface RawWOS {
  id: string; client_id: string; work_type_id: string;
  work_status: string; created_at: string; submitted_at: string | null;
  verified_at: string | null; quantity: number | null;
  description: string | null; created_by: string;
  clients: { name: string; address: string | null; mobile: string; project_status: string | null; created_by?: string | null; partners: { name: string } | null } | null;
  master_work_types: { type_of_work: string; sub_work: string } | null;
}
interface PivotClient {
  client_id: string; client_name: string; client_address: string;
  client_mobile: string; partner_name: string | null; partner_id?: string | null;
  project_status: string;
  created_by?: string;
  wos: Record<string, WOSRecord>;
  partners: string[];
}
interface PivotExecutive {
  executive_id: string; executive_name: string;
  showroom_id: string | null; clients: PivotClient[];
  wonCount?: number;
  quotationCount?: number;
  pendingCount?: number;
  partnerCount?: number;
  directCount?: number;
}
interface WorkTypeGroup {
  typeOfWork: string; subTypes: { id: string; subWork: string }[];
}

const STATUS_PRIORITY: Record<string, number> = { won:5, submitted:4, pending:3, hold:3, draft:2, lost:1, rejected:0 };

const STATUS_CFG = {
  pending:   { label:"WOS",        icon:<Clock       className="h-2.5 w-2.5"/>, cls:"text-sky-700 bg-sky-50 border-sky-200 dark:text-sky-300 dark:bg-sky-900/30 dark:border-sky-700/50",       dot:"bg-sky-500",      dateLabel:"Added"   },
  submitted: { label:"Quotation",  icon:<Send        className="h-2.5 w-2.5"/>, cls:"text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-900/30 dark:border-amber-600/50",  dot:"bg-amber-400",   dateLabel:"Quoted"  },
  won:       { label:"Won ✓",      icon:<CheckCircle2 className="h-2.5 w-2.5"/>, cls:"text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-900/30 dark:border-emerald-700/50", dot:"bg-emerald-500", dateLabel:"Closed"  },
  lost:      { label:"Lost",       icon:<XCircle     className="h-2.5 w-2.5"/>, cls:"text-rose-600 bg-rose-50 border-rose-200 dark:text-rose-400 dark:bg-rose-900/30 dark:border-rose-700/50",     dot:"bg-rose-500",    dateLabel:"Closed"  },
  hold:      { label:"Hold",       icon:<PauseCircle className="h-2.5 w-2.5"/>, cls:"text-purple-700 bg-purple-50 border-purple-200 dark:text-purple-300 dark:bg-purple-900/30 dark:border-purple-700/50", dot:"bg-purple-500",  dateLabel:"Hold"    },
  rejected:  { label:"Rejected",   icon:<XCircle     className="h-2.5 w-2.5"/>, cls:"text-rose-600 bg-rose-50 border-rose-200 dark:text-rose-400 dark:bg-rose-900/30 dark:border-rose-700/50",     dot:"bg-rose-400",    dateLabel:"Closed"  },
  draft:     { label:"WOS",        icon:<Clock       className="h-2.5 w-2.5"/>, cls:"text-slate-500 bg-slate-50 border-slate-200 dark:text-slate-400 dark:bg-slate-800 dark:border-slate-700",        dot:"bg-slate-400",   dateLabel:"Added"   },
} as const;

function safeFormatDate(dateStr: string | null | undefined, pattern: string = "d MMM yyyy"): string {
  if (!dateStr) return "—";
  try {
    const d = parseISO(dateStr);
    if (isNaN(d.getTime())) return "—";
    return format(d, pattern);
  } catch {
    return "—";
  }
}

function displayDate(r: WOSRecord): string {
  const d = (r.work_status==="won"||r.work_status==="lost"||r.work_status==="rejected") ? r.verified_at
    : r.work_status==="submitted" ? r.submitted_at : r.created_at;
  if (!d) return "";
  return safeFormatDate(d, "d MMM");
}

const GRADIENTS = ["from-violet-500 to-indigo-600","from-rose-500 to-pink-600","from-amber-500 to-orange-500","from-emerald-500 to-teal-600","from-sky-500 to-blue-600","from-fuchsia-500 to-purple-600"];
const avatarGrad = (n:string) => GRADIENTS[(n.charCodeAt(0)||0)%GRADIENTS.length];
const initials = (n:string) => n.split(" ").slice(0,2).map(x=>x[0]).join("").toUpperCase();

// ─── Compact Status Badge ─────────────────────────────────────────────────────
const Badge = ({ rec, onClick }: { rec: WOSRecord; onClick: () => void }) => {
  const s = STATUS_CFG[rec.work_status] ?? STATUS_CFG.pending;
  const d = displayDate(rec);
  const tooltipMap: Record<string, string> = {
    pending:   `WOS added on ${safeFormatDate(rec.created_at)}`,
    draft:     `WOS added on ${safeFormatDate(rec.created_at)}`,
    submitted: `Quotation on ${safeFormatDate(rec.submitted_at)}`,
    won:       `Won on ${safeFormatDate(rec.verified_at)}`,
    lost:      `Lost on ${safeFormatDate(rec.verified_at)}`,
    rejected:  `Rejected on ${safeFormatDate(rec.verified_at)}`,
    hold:      `Hold status`,
  };
  return (
    <button onClick={onClick} title={tooltipMap[rec.work_status] ?? ""}
      className={`group inline-flex flex-col items-center justify-center gap-px px-1.5 py-1 rounded-md border text-[9px] font-semibold w-full transition-all hover:scale-105 active:scale-95 hover:shadow ${s.cls}`}>
      <span className="flex items-center gap-0.5">{s.icon}{s.label}</span>
      {d && <span className="opacity-55 font-normal tabular-nums">{d}</span>}
    </button>
  );
};

import React from "react";

class HierarchyErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: string }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: "" };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error?.message || "Render Error" };
  }
  componentDidCatch(error: Error, errorInfo: any) {
    console.error("Hierarchy Table Error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 text-center bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl my-4">
          <p className="text-sm font-bold text-rose-600 dark:text-rose-400">Something went wrong rendering table data.</p>
          <p className="text-xs text-rose-500 mt-1">{this.state.error}</p>
          <button onClick={() => this.setState({ hasError: false })} className="mt-3 px-3 py-1 bg-rose-600 text-white rounded text-xs font-bold">
            Retry Rendering
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Shared Table Component ───────────────────────────────────────────────────
const PivotTable = ({
  pivotData, colIds, workTypeGroups, isClosed, onStatusClick, onProjectStatusClick, isManager, allWorkTypes, expandedExecs, toggleExec, isSearchActive, viewGrouping, profileMap, onPartnerClick
}: {
  pivotData: PivotExecutive[];
  colIds: string[];
  workTypeGroups: WorkTypeGroup[];
  isClosed: boolean;
  onStatusClick: (rec: WOSRecord) => void;
  onProjectStatusClick: (clientId: string, clientName: string, currentStatus: string) => void;
  isManager: boolean;
  allWorkTypes: any[];
  expandedExecs: Record<string, boolean>;
  toggleExec: (id: string) => void;
  isSearchActive: boolean;
  viewGrouping: "executive" | "architect" | "partner";
  profileMap: Record<string, string>;
  onPartnerClick?: (clientId: string, clientName: string, partnerName: string | null, partnerId?: string | null, createdBy?: string) => void;
}) => {
  return (
    <>
      {/* ── DESKTOP LAYOUT (Hidden on mobile/tablet) ── */}
      <div className="hidden lg:block rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="overflow-auto" style={{ maxHeight: isClosed ? "360px" : "calc(100vh - 340px)" }}>
          <table className="w-full text-xs border-collapse table-fixed">
            <colgroup>
              <col style={{ width: "9%" }} />  {/* Executive / SR NO */}
              <col style={{ width: "7%" }} />  {/* Partner */}
              <col style={{ width: "10%" }} /> {/* Client Name */}
              <col style={{ width: "12%" }} /> {/* Address */}
              <col style={{ width: "8%" }} />  {/* Mobile */}
              {colIds.map(wtId => (
                <col key={wtId} style={{ width: "4%" }} /> /* Work Subtypes */
              ))}
              <col style={{ width: "6%" }} />  {/* WOSs Summary */}
              <col style={{ width: "8%" }} />  {/* Project Status */}
            </colgroup>
            {/* ── THEAD ── */}
            <thead className="sticky top-0 z-10">
              <tr>
                <th rowSpan={2} className="bg-slate-900 dark:bg-slate-950 text-slate-300 border-b-2 border-r border-slate-700 px-3 py-2.5 text-left font-bold uppercase tracking-wider text-[10px] sticky left-0 z-20 align-bottom">
                  {viewGrouping === "executive" ? "SR NO" : "EXECUTIVE"}
                </th>
                <th rowSpan={2} className="bg-slate-800 dark:bg-slate-800/80 text-slate-400 border-b-2 border-r border-slate-700 px-3 py-2.5 text-left font-bold uppercase tracking-wider text-[10px] align-bottom">Partner</th>
                <th rowSpan={2} className="bg-slate-800 dark:bg-slate-900 text-slate-400 border-b-2 border-r border-slate-700 px-3 py-2.5 text-left font-bold uppercase tracking-wider text-[10px] align-bottom">Client Name</th>
                <th rowSpan={2} className="bg-slate-800 dark:bg-slate-900 text-slate-400 border-b-2 border-r border-slate-700 px-3 py-2.5 text-left font-bold uppercase tracking-wider text-[10px] align-bottom">Address</th>
                <th rowSpan={2} className="bg-slate-800 dark:bg-slate-900 text-slate-400 border-b-2 border-r border-slate-700 px-3 py-2.5 text-center font-bold uppercase tracking-wider text-[10px] align-bottom">Mobile</th>
                {workTypeGroups.map(g => (
                  <th key={g.typeOfWork} colSpan={g.subTypes.length}
                    className="bg-indigo-700 dark:bg-indigo-800 text-white border-b border-r border-indigo-500/40 px-1.5 py-2 text-center font-bold text-[9px] uppercase tracking-wider truncate">
                    {g.typeOfWork}
                  </th>
                ))}
                <th rowSpan={2} className="bg-slate-700 dark:bg-slate-700 text-slate-300 border-b-2 border-r border-slate-600 px-3 py-2.5 text-center font-bold uppercase tracking-wider text-[10px] align-bottom">WOSs</th>
                <th rowSpan={2} className={`border-b-2 border-slate-600 px-3 py-2.5 text-center font-bold uppercase tracking-wider text-[10px] align-bottom ${isClosed ? "bg-slate-700 text-slate-300" : "bg-emerald-800 text-emerald-200"}`}>
                  Project Status
                </th>
              </tr>
              <tr>
                {workTypeGroups.flatMap(g => g.subTypes.map(st => (
                  <th key={st.id}
                    className="bg-indigo-900/70 dark:bg-indigo-950 text-indigo-200 border-b-2 border-r border-indigo-500/30 px-1 py-1 text-center font-semibold text-[8.5px] uppercase truncate"
                    title={st.subWork}>
                    {st.subWork}
                  </th>
                )))}
              </tr>
            </thead>

            {/* ── TBODY ── */}
            <tbody>
              {pivotData.map((exec, ei) => {
                const isExpanded = isSearchActive || !!expandedExecs[exec.executive_id];
                return (
                  <Fragment key={`group-wrapper-${exec.executive_id}`}>
                    {/* ── Group Banner Row ── */}
                    <tr
                      onClick={() => toggleExec(exec.executive_id)}
                      className="bg-slate-100/90 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-200/90 dark:hover:bg-slate-700/90 transition-colors"
                    >
                      <td colSpan={colIds.length + 7} className="px-3 py-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 font-bold text-xs text-slate-800 dark:text-slate-100 flex-wrap">
                            <div className="p-1 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                              {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            </div>
                            <div className={`h-6 w-6 rounded-md bg-gradient-to-br ${avatarGrad(exec.executive_name)} flex items-center justify-center text-white text-[10px] font-extrabold shadow-sm shrink-0`}>
                              {initials(exec.executive_name)}
                            </div>
                            <span className="text-xs font-bold">{exec.executive_name}</span>
                            <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/80 px-2 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800">
                              {exec.clients.length} {exec.clients.length === 1 ? "Client" : "Clients"}
                            </span>
                            {(exec.wonCount ?? 0) > 0 && (
                              <span className="text-[9.5px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100/70 dark:bg-emerald-950/80 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800/60">
                                🟢 {exec.wonCount} Won
                              </span>
                            )}
                            {(exec.quotationCount ?? 0) > 0 && (
                              <span className="text-[9.5px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100/70 dark:bg-amber-950/80 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800/60">
                                🟡 {exec.quotationCount} Quotation
                              </span>
                            )}
                            {(exec.pendingCount ?? 0) > 0 && (
                              <span className="text-[9.5px] font-bold text-sky-700 dark:text-sky-300 bg-sky-100/70 dark:bg-sky-950/80 px-2 py-0.5 rounded-md border border-sky-200 dark:border-sky-800/60">
                                🔵 {exec.pendingCount} Pending
                              </span>
                            )}
                            {(exec.partnerCount ?? 0) > 0 && (
                              <span className="text-[9.5px] font-bold text-violet-700 dark:text-violet-300 bg-violet-100/70 dark:bg-violet-950/80 px-2 py-0.5 rounded-md border border-violet-200 dark:border-violet-800/60">
                                🤝 {exec.partnerCount} Partner
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-muted-foreground font-semibold">
                            {isExpanded ? "Click to collapse 🔼" : "Click to expand 🔽"}
                          </span>
                        </div>
                      </td>
                    </tr>

                    {/* ── Client Rows (Only rendered when expanded) ── */}
                    {isExpanded && exec.clients.map((client, ci) => (
                      <tr key={`${exec.executive_id}-${client.client_id}`}
                        className={`border-b border-slate-100 dark:border-slate-800 hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition-colors ${ci%2===1?"bg-slate-50/50":"bg-white dark:bg-transparent"}`}>

                        <td className={`border-r border-slate-200 dark:border-slate-700 px-2.5 py-2 align-middle sticky left-0 z-10 ${ei%2===0?"bg-slate-50 dark:bg-slate-800/50":"bg-slate-100/50 dark:bg-slate-800/80"}`}>
                          {viewGrouping === "executive" ? (
                            <span className="text-[10px] font-bold text-slate-400 font-mono pl-2">#{ci + 1}</span>
                          ) : (
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-[10px] font-bold text-indigo-500">👤</span>
                              <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[75px]" title={profileMap[client.created_by || ""] || exec.executive_name}>
                                {profileMap[client.created_by || ""] || exec.executive_name}
                              </span>
                            </div>
                          )}
                        </td>

                        <td className="px-2 py-2 border-r border-slate-100 dark:border-slate-800">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onPartnerClick?.(
                                client.client_id,
                                client.client_name,
                                client.partner_name,
                                client.partner_id,
                                client.created_by || exec.executive_id
                              );
                            }}
                            className="w-full text-left group/p focus:outline-none cursor-pointer"
                            title="Click to change or assign partner"
                          >
                            {client.partner_name && client.partner_name.trim() ? (
                              <span className="inline-flex items-center justify-between px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-700/50 group-hover/p:border-violet-400 group-hover/p:shadow-sm transition-all w-full">
                                <span className="truncate">{client.partner_name}</span>
                                <span className="opacity-0 group-hover/p:opacity-100 text-[8px] ml-1">✏️</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center justify-between px-1.5 py-0.5 text-[10px] font-medium rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700/50 group-hover/p:border-indigo-400 group-hover/p:text-indigo-600 transition-all w-full">
                                <span>Direct</span>
                                <span className="opacity-0 group-hover/p:opacity-100 text-[8px] ml-1">➕</span>
                              </span>
                            )}
                          </button>
                        </td>
                        <td className="px-2 py-2 border-r border-slate-100 dark:border-slate-800">
                          <p className="font-semibold text-slate-800 dark:text-slate-200 truncate" title={client.client_name}>{client.client_name}</p>
                        </td>
                        <td className="px-2 py-2 border-r border-slate-100 dark:border-slate-800">
                          <p className="text-slate-500 dark:text-slate-400 truncate" title={client.client_address}>{client.client_address}</p>
                        </td>
                        <td className="px-2 py-2 text-center border-r border-slate-100 dark:border-slate-800">
                          <span className="font-mono text-slate-500 dark:text-slate-400 truncate text-[11px]" title={client.client_mobile}>{client.client_mobile}</span>
                        </td>

                        {colIds.map(wtId => {
                          const rec = client.wos[wtId];
                          return (
                            <td key={wtId} className="px-0.5 py-1 border-r border-slate-100 dark:border-slate-800">
                              {rec
                                ? <Badge rec={rec} onClick={() => onStatusClick(rec)} />
                                : <div className="flex items-center justify-center text-slate-200 dark:text-slate-800 text-base select-none">·</div>
                              }
                            </td>
                          );
                        })}

                        {/* WOSs column */}
                        <td className="px-1 py-2 border-r border-slate-100 dark:border-slate-800">
                          <div className="flex flex-wrap gap-0.5 max-h-12 overflow-y-auto">
                            {client.partners.length > 0
                              ? client.partners.map(p => (
                                  <span key={p} className="inline-flex items-center px-1 py-0.2 text-[8px] font-bold rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700/50 whitespace-nowrap truncate max-w-[50px]" title={p}>{p}</span>
                                ))
                              : <span className="text-slate-300 dark:text-slate-700 text-xs">·</span>
                            }
                          </div>
                        </td>

                        {/* ── Project Status column ── */}
                        <td className="px-2 py-2 text-center">
                          {isClosed ? (
                            <div className="flex flex-col items-center gap-1">
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                                <Archive className="h-3 w-3" /> Closed
                              </span>
                              {isManager && (
                                <button
                                  onClick={() => onProjectStatusClick(client.client_id, client.client_name, "closed")}
                                  className="text-[9px] font-semibold text-indigo-500 hover:text-indigo-700 underline transition-colors"
                                >
                                  Reopen
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-1">
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700/40">
                                <CheckCircle2 className="h-3 w-3" /> Active
                              </span>
                              {isManager && (
                                <button
                                  onClick={() => onProjectStatusClick(client.client_id, client.client_name, "active")}
                                  className="text-[9px] font-semibold text-rose-500 hover:text-rose-700 underline transition-colors"
                                >
                                  Close Project
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── MOBILE / TABLET LAYOUT (Hidden on desktop) ── */}
      <div className="block lg:hidden space-y-3">
        {pivotData.map(exec =>
          exec.clients.map(client => (
            <div key={`${exec.executive_id}-${client.client_id}`}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm space-y-3">
              
              {/* Executive & Status Header */}
              <div className="flex items-start justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className={`h-7 w-7 rounded-lg bg-gradient-to-br ${avatarGrad(exec.executive_name)} flex items-center justify-center text-white text-[10px] font-extrabold shadow-sm shrink-0`}>
                    {initials(exec.executive_name)}
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 dark:text-slate-100 text-xs">{exec.executive_name}</p>
                    <p className="text-[10px] text-slate-400">Executive</p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  {isClosed ? (
                    <div className="flex flex-col items-end gap-1">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                        <Archive className="h-2.5 w-2.5"/> Closed
                      </span>
                      {isManager && (
                        <button onClick={() => onProjectStatusClick(client.client_id, client.client_name, "closed")}
                          className="text-[9px] font-semibold text-indigo-500 hover:text-indigo-700 underline transition-colors">
                          Reopen
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-end gap-1">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold rounded bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700/40">
                        <CheckCircle2 className="h-2.5 w-2.5"/> Active
                      </span>
                      {isManager && (
                        <button onClick={() => onProjectStatusClick(client.client_id, client.client_name, "active")}
                          className="text-[9px] font-semibold text-rose-500 hover:text-rose-700 underline transition-colors">
                          Close Project
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Client & Partner Details */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Client Name</p>
                  <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">{client.client_name}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Partner</p>
                  <p className="mt-0.5">
                    {client.partner_name ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-bold rounded bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border border-violet-200 whitespace-nowrap">
                        {client.partner_name}
                      </span>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-700">—</span>
                    )}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Address</p>
                  <p className="text-slate-600 dark:text-slate-400 mt-0.5">{client.client_address}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Mobile</p>
                  <p className="font-mono text-slate-600 dark:text-slate-400 mt-0.5 text-[11px]">{client.client_mobile}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">WOS Summary</p>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {client.partners.length > 0 ? (
                      client.partners.map(p => (
                        <span key={p} className="inline-flex items-center px-1.5 py-0.2 text-[8px] font-bold rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 whitespace-nowrap">
                          {p}
                        </span>
                      ))
                    ) : (
                      <span className="text-slate-300 dark:text-slate-700 text-xs">·</span>
                    )}
                  </div>
                </div>
              </div>

              {/* WOS Badges / Categories */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">WOS Pipeline Items</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {colIds.map(wtId => {
                    const rec = client.wos[wtId];
                    if (!rec) return null;
                    const wt = allWorkTypes.find(t => t.id === wtId);
                    const label = wt ? `${wt.type_of_work} (${wt.sub_work})` : "Work Item";
                    return (
                      <div key={wtId} className="bg-slate-50 dark:bg-slate-800/40 rounded-lg p-2 border border-slate-100 dark:border-slate-800 flex flex-col justify-between gap-1.5">
                        <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 truncate" title={label}>
                          {wt ? `${wt.type_of_work} - ${wt.sub_work}` : "Item"}
                        </span>
                        <div className="w-full">
                          <Badge rec={rec} onClick={() => onStatusClick(rec)} />
                        </div>
                      </div>
                    );
                  })}
                  {Object.keys(client.wos).length === 0 && (
                    <p className="text-xs text-slate-400 col-span-full">No WOS items added.</p>
                  )}
                </div>
              </div>

            </div>
          ))
        )}
      </div>
    </>
  );
};

// ─── Main ─────────────────────────────────────────────────────────────────────
const Hierarchy = () => {
  const navigate = useNavigate();
  const { role, user, showroomIds } = useAuth();
  const queryClient = useQueryClient();
  const canAccess = role==="admin"||role==="manager"||role==="md"||role==="tl";
  const isMdOrAdmin = role==="admin"||role==="md";
  const isManager = role==="manager"||role==="admin"||role==="md";
  const isTL = role==="tl";

  const [searchParams] = useSearchParams();
  const [fExec, setFExec]       = useState("all");
  const [fStatus, setFStatus]   = useState("all");
  const [fShowroom, setFShowroom] = useState("all");
  const [fSearch, setFSearch]   = useState("");

  useEffect(() => {
    const cId = searchParams.get("clientId");
    const q = searchParams.get("search");
    const ex = searchParams.get("execId");
    if (cId) setFSearch(cId);
    else if (q) setFSearch(q);
    if (ex) setFExec(ex);
  }, [searchParams]);
  const [viewGrouping, setViewGrouping] = useState<"executive" | "architect" | "partner">("executive");
  const [expandedExecs, setExpandedExecs] = useState<Record<string, boolean>>({});
  const [selectedCell, setSelectedCell] = useState<WOSRecord|null>(null);
  const [updateStatus, setUpdateStatus] = useState<WorkStatus>("won");
  const [confirmClose, setConfirmClose] = useState<{ clientId: string; clientName: string; currentStatus: string } | null>(null);
  const [blockClose, setBlockClose] = useState<{ clientName: string; blockers: string[] } | null>(null);
  const [showClosedTable, setShowClosedTable] = useState(false);

  // Partner Change Modal State
  const [changePartnerModal, setChangePartnerModal] = useState<{
    clientId: string;
    clientName: string;
    currentPartnerName: string | null;
    currentPartnerId: string | null;
    createdBy: string;
  } | null>(null);
  const [selectedNewPartnerId, setSelectedNewPartnerId] = useState<string>("none");
  const [partnerSearchQuery, setPartnerSearchQuery] = useState<string>("");

  const toggleExec = (id: string) => {
    setExpandedExecs((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const expandAll = () => {
    const m: Record<string, boolean> = {};
    activePivot.forEach((e) => { m[e.executive_id] = true; });
    closedPivot.forEach((e) => { m[e.executive_id] = true; });
    setExpandedExecs(m);
  };

  const collapseAll = () => {
    setExpandedExecs({});
  };

  const { data: showrooms=[] } = useQuery({ queryKey:["sr-h3"], enabled:isMdOrAdmin || (role === "manager" && showroomIds && showroomIds.length > 1),
    queryFn: async()=>{ const{data}=await supabase.from("showrooms").select("id,name").order("name"); return data||[]; } });
  const { data: userRoles=[] } = useQuery({ queryKey:["ur-h3"], enabled:canAccess,
    queryFn: async()=>{ const{data}=await supabase.from("user_roles").select("user_id,showroom_id"); return data||[]; } });
  const { data: profiles=[] } = useQuery({ queryKey:["pr-h3"], enabled:canAccess,
    queryFn: async()=>{ const{data}=await supabase.from("profiles").select("user_id,full_name"); return data||[]; } });
  const { data: allWorkTypes=[] } = useQuery({ queryKey:["wt-h3"], enabled:canAccess,
    queryFn: async()=>{ const{data}=await supabase.from("master_work_types").select("id,type_of_work,sub_work").order("type_of_work"); return data||[]; } });
  const { data: allPartners=[] } = useQuery({ queryKey:["partners-h3"], enabled:canAccess,
    queryFn: async()=>{ const{data}=await supabase.from("partners").select("id,name,type,city,created_by").order("name"); return data||[]; } });

  const updatePartnerMutation = useMutation({
    mutationFn: async ({ clientId, partnerId }: { clientId: string; partnerId: string | null }) => {
      const { error } = await supabase
        .from("clients")
        .update({ partner_id: partnerId })
        .eq("id", clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Partner updated successfully ✓");
      queryClient.invalidateQueries({ queryKey: ["clients-h3"] });
      queryClient.invalidateQueries({ queryKey: ["wos-h3"] });
      setChangePartnerModal(null);
    },
    onError: (err: any) => {
      toast.error(`Failed to update partner: ${err.message}`);
    },
  });
  const { data: rawWOS=[], isLoading } = useQuery({ queryKey:["wos-h3", user?.id, role, showroomIds], enabled:canAccess && !!user,
    queryFn: async()=>{
      let q = supabase.from("work_scope_items")
        .select(`id,client_id,work_type_id,work_status,created_at,submitted_at,verified_at,quantity,description,created_by,clients(name,address,mobile,project_status,architect_name,created_by,partner_id,partners(id,name)),master_work_types(type_of_work,sub_work)`);

      if (role === "tl" && user) {
        // TL: own WOS + all executives who report to this TL
        const { data: myExecs } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("reports_to", user.id)
          .eq("role", "executive");
        const execIds = (myExecs || []).map((r: any) => r.user_id);
        const ids = [user.id, ...execIds];
        q = q.in("created_by", ids);
      } else if (role === "manager" && showroomIds.length > 0) {
        // Manager: WOS of all users in their showrooms
        const { data: teamRoles } = await supabase
          .from("user_roles")
          .select("user_id")
          .in("showroom_id", showroomIds);
        const teamIds = (teamRoles || []).map((r: any) => r.user_id);
        if (teamIds.length > 0) q = q.in("created_by", teamIds);
      }

      const {data,error} = await q.order("created_at",{ascending:false});
      if(error) throw error;
      return (data||[]) as unknown as RawWOS[];
    }
  });

  const { data: allClients=[] } = useQuery({ queryKey:["clients-h3", user?.id, role, showroomIds], enabled:canAccess && !!user,
    queryFn: async()=>{
      let q = supabase.from("clients")
        .select(`id, name, address, mobile, project_status, architect_name, created_by, partner_id, partners(id,name)`);

      if (role === "tl" && user) {
        const { data: myExecs } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("reports_to", user.id)
          .eq("role", "executive");
        const execIds = (myExecs || []).map((r: any) => r.user_id);
        const ids = [user.id, ...execIds];
        q = q.in("created_by", ids);
      } else if (role === "manager" && showroomIds.length > 0) {
        const { data: teamRoles } = await supabase
          .from("user_roles")
          .select("user_id")
          .in("showroom_id", showroomIds);
        const teamIds = (teamRoles || []).map((r: any) => r.user_id);
        if (teamIds.length > 0) q = q.in("created_by", teamIds);
      }

      const { data, error } = await q.order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    }
  });

  // Pre-filter table if clientId is passed in the URL parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const clientId = params.get("clientId");
    if (clientId && rawWOS.length > 0) {
      const match = rawWOS.find(item => item.client_id === clientId);
      if (match && match.clients && (match.clients as any).name) {
        setFSearch((match.clients as any).name);
      }
    }
  }, [rawWOS]);

  const profileMap = useMemo(()=>{ const m:Record<string,string>={}; profiles.forEach(p=>{ m[p.user_id]=p.full_name||"Unknown"; }); return m; },[profiles]);
  const showroomMap = useMemo(()=>{ const m:Record<string,string|null>={}; userRoles.forEach(r=>{ m[r.user_id]=r.showroom_id; }); return m; },[userRoles]);

  const workTypeGroups = useMemo(():WorkTypeGroup[]=>{
    const gm=new Map<string,Map<string,string>>();
    allWorkTypes.forEach(wt=>{ if(!gm.has(wt.type_of_work)) gm.set(wt.type_of_work,new Map()); gm.get(wt.type_of_work)!.set(wt.id,wt.sub_work); });
    return Array.from(gm.entries()).sort(([a],[b])=>a.localeCompare(b))
      .map(([typeOfWork,sm])=>({ typeOfWork, subTypes:Array.from(sm.entries()).map(([id,subWork])=>({id,subWork})).sort((a,b)=>a.subWork.localeCompare(b.subWork)) }));
  },[allWorkTypes]);

  const colIds = useMemo(()=>workTypeGroups.flatMap(g=>g.subTypes.map(s=>s.id)),[workTypeGroups]);

  // Build pivot for given project_status filter
  const buildPivot = (statusFilter: "active" | "closed"): PivotExecutive[] => {
    const em = new Map<string, { exec: PivotExecutive; clientMap: Map<string, PivotClient> }>();
    const wtPartnerMap: Record<string, string> = {};
    allWorkTypes.forEach(wt => { if (wt && wt.id) wtPartnerMap[wt.id] = wt.sub_work || ""; });

    // Helper to extract partner name safely
    const getPartnerName = (partners: any): string | null => {
      if (!partners) return null;
      if (Array.isArray(partners)) {
        const valid = partners.find((p: any) => p && typeof p.name === "string" && p.name.trim());
        return valid ? valid.name.trim() : null;
      }
      if (typeof partners === "object" && typeof partners.name === "string" && partners.name.trim()) {
        return partners.name.trim();
      }
      return null;
    };

    // 1. Populate all clients first
    allClients.forEach(c => {
      if (!c) return;
      const clientProjStatus = c.project_status || "active";
      if (clientProjStatus !== statusFilter) return;

      const creatorId = c.created_by || "unknown";
      const creatorShowroom = showroomMap[creatorId] ?? null;
      // Showroom/executive filters must be applied before grouping. Otherwise
      // Architect/Partner views keep showing records from every executive.
      if (fShowroom !== "all" && creatorShowroom !== fShowroom) return;
      if (fExec !== "all" && creatorId !== fExec) return;
      const builderName = getPartnerName((c as any).partners);
      const archName = (c.architect_name && typeof c.architect_name === "string") ? c.architect_name.trim() : "";
      const groupKey = viewGrouping === "partner"
        ? (builderName && builderName.trim() ? `Partner: ${builderName.trim()}` : "Direct / No Partner")
        : viewGrouping === "architect"
        ? (archName ? `Arch: ${archName}` : "Direct / No Architect")
        : creatorId;
      const displayName = (viewGrouping === "architect" || viewGrouping === "partner") ? groupKey : (profileMap[groupKey] || "Unassigned User");

      if (!em.has(groupKey)) {
        em.set(groupKey, {
          exec: {
            executive_id: groupKey,
            executive_name: displayName,
            showroom_id: (viewGrouping === "architect" || viewGrouping === "partner") ? null : (showroomMap[groupKey] ?? null),
            clients: []
          },
          clientMap: new Map()
        });
      }
      const { exec, clientMap } = em.get(groupKey)!;
      if (!clientMap.has(c.id)) {
        const pId = c.partner_id || (Array.isArray((c as any).partners) ? (c as any).partners[0]?.id : (c as any).partners?.id) || null;
        const cl: PivotClient = {
          client_id: c.id,
          client_name: c.name || "Unnamed Client",
          client_address: c.address || "—",
          client_mobile: c.mobile || "—",
          partner_name: builderName,
          partner_id: pId,
          project_status: clientProjStatus,
          created_by: c.created_by,
          wos: {},
          partners: []
        };
        clientMap.set(c.id, cl);
        exec.clients.push(cl);
      }
    });

    // 2. Overlay WOS items
    rawWOS.forEach(r => {
      if (!r || !r.clients) return;
      const clientObj = r.clients as any;
      const clientProjStatus = clientObj.project_status || "active";
      if (clientProjStatus !== statusFilter) return;
      // Older WOS rows can have a missing creator. In that case use the
      // owning client's creator so the row stays under the correct person.
      const creatorId = r.created_by || clientObj.created_by || "unassigned";
      const creatorShowroom = showroomMap[creatorId] ?? null;
      if (fShowroom !== "all" && creatorShowroom !== fShowroom) return;
      if (fExec !== "all" && creatorId !== fExec) return;

      const builderName = getPartnerName(clientObj.partners);
      const archName = (clientObj.architect_name && typeof clientObj.architect_name === "string") ? clientObj.architect_name.trim() : "";
      const groupKey = viewGrouping === "partner"
        ? (builderName && builderName.trim() ? `Partner: ${builderName.trim()}` : "Direct / No Partner")
        : viewGrouping === "architect"
        ? (archName ? `Arch: ${archName}` : "Direct / No Architect")
        : creatorId;
      const displayName = (viewGrouping === "architect" || viewGrouping === "partner") ? groupKey : (profileMap[groupKey] || "Unassigned User");

      if (!em.has(groupKey)) {
        em.set(groupKey, {
          exec: {
            executive_id: groupKey,
            executive_name: displayName,
            showroom_id: (viewGrouping === "architect" || viewGrouping === "partner") ? null : (showroomMap[groupKey] ?? null),
            clients: []
          },
          clientMap: new Map()
        });
      }
      const { exec, clientMap } = em.get(groupKey)!;
      let cl = clientMap.get(r.client_id);
      if (!cl) {
        const builderName = getPartnerName(clientObj.partners);
        const pId = clientObj.partner_id || (Array.isArray(clientObj.partners) ? clientObj.partners[0]?.id : clientObj.partners?.id) || null;
        cl = {
          client_id: r.client_id,
          client_name: clientObj.name || "Unnamed Client",
          client_address: clientObj.address || "—",
          client_mobile: clientObj.mobile || "—",
          partner_name: builderName,
          partner_id: pId,
          project_status: clientProjStatus,
          created_by: creatorId === "unassigned" ? "" : creatorId,
          wos: {},
          partners: []
        };
        clientMap.set(r.client_id, cl);
        exec.clients.push(cl);
      }
      const ex = cl.wos[r.work_type_id];
      const newStatus = (r.work_status || "pending") as WorkStatus;
      const exStatus = ex ? ex.work_status : "";
      if (!ex || (STATUS_PRIORITY[newStatus] ?? 0) > (STATUS_PRIORITY[exStatus] ?? 0)) {
        cl.wos[r.work_type_id] = {
          id: r.id,
          client_id: r.client_id,
          work_type_id: r.work_type_id,
          work_status: newStatus,
          created_at: r.created_at,
          submitted_at: r.submitted_at,
          verified_at: r.verified_at,
          quantity: r.quantity,
          description: r.description,
          created_by: creatorId === "unassigned" ? "" : creatorId
        };
      }
      const pName = wtPartnerMap[r.work_type_id];
      if (pName && !cl.partners.includes(pName)) cl.partners.push(pName);
    });
    let res = Array.from(em.values()).map(item => item.exec).sort((a, b) => a.executive_name.localeCompare(b.executive_name));
    if (fShowroom !== "all" && viewGrouping === "executive") res = res.filter(e => e.showroom_id === fShowroom);
    if (fExec !== "all" && viewGrouping === "executive") res = res.filter(e => e.executive_id === fExec);
    if (fStatus !== "all") res = res.map(e => ({ ...e, clients: e.clients.filter(c => Object.values(c.wos || {}).some(w => w && w.work_status === fStatus)) })).filter(e => e.clients.length > 0);
    if (fSearch.trim()) {
      const q = fSearch.toLowerCase();
      res = res.map(e => ({
        ...e,
        clients: e.clients.filter(c =>
          (c.client_id || "").toLowerCase().includes(q) ||
          (c.client_name || "").toLowerCase().includes(q) ||
          (c.client_address || "").toLowerCase().includes(q) ||
          (c.client_mobile || "").toLowerCase().includes(q) ||
          (c.partner_name || "").toLowerCase().includes(q)
        )
      })).filter(e => e.clients.length > 0 || (e.executive_name || "").toLowerCase().includes(q));
    }

    // Calculate metrics for each group banner
    res = res.map(e => {
      let wonCount = 0;
      let quotationCount = 0;
      let pendingCount = 0;
      let partnerCount = 0;
      let directCount = 0;

      e.clients.forEach(c => {
        if (c.partner_name && c.partner_name.trim()) {
          partnerCount++;
        } else {
          directCount++;
        }

        const statuses = Object.values(c.wos || {}).map(w => w?.work_status);
        if (c.project_status === "closed" || statuses.includes("won")) {
          wonCount++;
        } else if (statuses.includes("submitted")) {
          quotationCount++;
        } else {
          pendingCount++;
        }
      });

      return {
        ...e,
        wonCount,
        quotationCount,
        pendingCount,
        partnerCount,
        directCount
      };
    });

    return res;
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const activePivot = useMemo(()=>buildPivot("active"),[rawWOS,allClients,profileMap,showroomMap,fExec,fStatus,fShowroom,fSearch,allWorkTypes,viewGrouping]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const closedPivot = useMemo(()=>buildPivot("closed"),[rawWOS,allClients,profileMap,showroomMap,fExec,fStatus,fShowroom,fSearch,allWorkTypes,viewGrouping]);

  const stats = useMemo(() => {
    let total = 0, won = 0, quotation = 0, lost = 0, pending = 0;
    rawWOS.forEach(r => {
      if (!r.clients) return;
      
      // Filter by showroom
      const execShowroom = showroomMap[r.created_by] ?? null;
      if (fShowroom !== "all" && execShowroom !== fShowroom) return;
      
      // Filter by executive
      if (fExec !== "all" && r.created_by !== fExec) return;
      
      // Filter by search
      if (fSearch.trim()) {
        const q = fSearch.toLowerCase();
        const clientName = r.clients.name.toLowerCase();
        const clientAddress = (r.clients.address || "").toLowerCase();
        const execName = (profileMap[r.created_by] || "").toLowerCase();
        if (!clientName.includes(q) && !clientAddress.includes(q) && !execName.includes(q)) return;
      }

      total++;
      if (r.work_status === "won") won++;
      else if (r.work_status === "lost") lost++;
      else if (r.work_status === "submitted") quotation++;
      else if (r.work_status === "pending" || r.work_status === "draft") pending++;
    });
    return {
      total,
      won,
      quotation,
      lost,
      pending,
      rate: total > 0 ? Math.round((won / total) * 100) : 0
    };
  }, [rawWOS, fExec, fShowroom, fSearch, showroomMap, profileMap]);

  const execList = useMemo(()=>[...new Map(rawWOS.map(r=>[r.created_by,profileMap[r.created_by]||"Unknown"])).entries()].map(([id,name])=>({id,name})).sort((a,b)=>a.name.localeCompare(b.name)),[rawWOS,profileMap]);
  const hasFilters = fShowroom!=="all"||fExec!=="all"||fStatus!=="all"||fSearch!=="";
  const activeRows = activePivot.reduce((s,e)=>s+e.clients.length,0);
  const closedRows = closedPivot.reduce((s,e)=>s+e.clients.length,0);

  const updateMutation = useMutation({
    mutationFn: async({id,status}:{id:string;status:WorkStatus})=>{
      const upd:Record<string,unknown>={work_status:status};
      if(status==="won"||status==="lost"||status==="rejected"){ upd.verified_at=new Date().toISOString(); upd.is_verified=status==="won"; }
      else if(status==="submitted"){ upd.submitted_at=new Date().toISOString(); }
      const{error}=await supabase.from("work_scope_items").update(upd).eq("id",id);
      if(error) throw error;

      if (status === "won" || status === "lost" || status === "submitted") {
        try {
          const { data: wosItem } = await supabase
            .from("work_scope_items")
            .select("created_by, client_id, master_work_types(sub_work), clients(name)")
            .eq("id", id)
            .single();

          if (wosItem) {
            const clientName = (wosItem as any).clients?.name || "Client";
            const subWork = (wosItem as any).master_work_types?.sub_work || "WOS Item";
            const title = `WOS ${status === "won" ? "Won ✅" : status === "lost" ? "Lost ❌" : "Quoted 🟡"}`;
            const message = `WOS Item "${subWork}" for ${clientName} was updated to ${status.toUpperCase()}`;

            // 1. Fetch MDs & Admins
            const { data: mdAdmins } = await supabase
              .from("user_roles")
              .select("user_id")
              .in("role", ["md", "admin"]);
            const targetIds = (mdAdmins || []).map((m) => m.user_id);

            // 2. Fetch Creator's Showroom Manager & TL
            if (wosItem.created_by) {
              const { data: creatorRole } = await supabase
                .from("user_roles")
                .select("showroom_id, reports_to")
                .eq("user_id", wosItem.created_by)
                .maybeSingle();

              if (creatorRole?.showroom_id) {
                const { data: managers } = await supabase
                  .from("user_roles")
                  .select("user_id")
                  .eq("showroom_id", creatorRole.showroom_id)
                  .eq("role", "manager");
                (managers || []).forEach((m) => targetIds.push(m.user_id));
              }
              if (creatorRole?.reports_to) {
                targetIds.push(creatorRole.reports_to);
              }
            }

            const uniqueTargetIds = [...new Set(targetIds)];
            await Promise.all(
              uniqueTargetIds.map((uid) =>
                sendNotification({
                  userId: uid,
                  title,
                  message,
                  targetUrl: "/hierarchy",
                })
              )
            );
          }
        } catch (e) {
          console.error("Failed to notify WOS update:", e);
        }
      }
    },
    onSuccess:()=>{ toast.success("Status updated!"); setSelectedCell(null); queryClient.invalidateQueries({queryKey:["wos-h3"]}); },
    onError:()=>toast.error("Update failed"),
  });

  const projectStatusMutation = useMutation({
    mutationFn: async({ clientId, newStatus }: { clientId: string; newStatus: "active" | "closed" }) => {
      const { error } = await supabase.from("clients").update({ project_status: newStatus }).eq("id", clientId);
      if (error) throw error;
    },
    onSuccess: (_, { newStatus }) => {
      toast.success(newStatus === "closed" ? "Project marked as Closed ✓" : "Project reopened as Active ✓");
      setConfirmClose(null);
      queryClient.invalidateQueries({ queryKey: ["wos-h3"] });
    },
    onError: () => toast.error("Failed to update project status"),
  });

  const handleProjectStatusClick = (clientId: string, clientName: string, currentStatus: string) => {
    // Only validate when trying to CLOSE (not reopen)
    if (currentStatus === "active") {
      // Find all WOS records for this client across all pivotData
      const allClientWOS: WOSRecord[] = [];
      [...activePivot, ...closedPivot].forEach(exec => {
        const cl = exec.clients.find(c => c.client_id === clientId);
        if (cl) Object.values(cl.wos).forEach(w => allClientWOS.push(w));
      });

      // Check for any pending / submitted / draft WOS
      const blockers = allClientWOS
        .filter(w => w.work_status === "pending" || w.work_status === "submitted" || w.work_status === "draft")
        .map(w => {
          const stageName = w.work_status === "pending" || w.work_status === "draft" ? "WOS (Pending)" : "Quotation (Submitted)";
          const wt = allWorkTypes.find(t => t.id === w.work_type_id);
          return `${wt?.sub_work || "Work Item"} → ${stageName}`;
        });

      if (blockers.length > 0) {
        setBlockClose({ clientName, blockers });
        return;
      }
    }
    setConfirmClose({ clientId, clientName, currentStatus });
  };

  // ── Export active pivot data to Excel ────────────────────────────────────
  const exportToExcel = () => {
    const headers = [
      "Executive", "Partner", "Client Name", "Address", "Mobile",
      ...colIds.map(id => {
        const wt = allWorkTypes.find(t => t.id === id);
        return wt ? `${wt.type_of_work} - ${wt.sub_work}` : id;
      }),
      "WOS Summary", "Project Status"
    ];

    const rows: any[] = [];
    activePivot.forEach(exec => {
      exec.clients.forEach(client => {
        const rowData: Record<string, any> = {
          "Executive": exec.executive_name,
          "Partner": client.partner_name || "-",
          "Client Name": client.client_name,
          "Address": client.client_address || "-",
          "Mobile": client.client_mobile || "-"
        };

        colIds.forEach(id => {
          const wt = allWorkTypes.find(t => t.id === id);
          const colName = wt ? `${wt.type_of_work} - ${wt.sub_work}` : id;
          const rec = client.wos[id];
          rowData[colName] = rec ? rec.work_status.charAt(0).toUpperCase() + rec.work_status.slice(1) : "-";
        });

        rowData["WOS Summary"] = client.partners.join(", ") || "-";
        rowData["Project Status"] = client.project_status === "closed" ? "Closed" : "Active";

        rows.push(rowData);
      });
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "WOS Pipeline");

    // Auto-fit column widths
    const maxProps = headers.map(() => ({ wch: 15 }));
    maxProps[0] = { wch: 20 }; // Executive
    maxProps[1] = { wch: 18 }; // Partner
    maxProps[2] = { wch: 22 }; // Client Name
    maxProps[3] = { wch: 35 }; // Address
    maxProps[4] = { wch: 15 }; // Mobile
    worksheet['!cols'] = maxProps;

    XLSX.writeFile(workbook, `wos-pipeline-${new Date().toISOString().split("T")[0]}.xlsx`);
    toast.success("Exported to Excel successfully ✓");
  };

  if(!canAccess) return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-3">
      <GitBranch className="h-12 w-12 text-slate-300"/>
      <p className="text-slate-500 font-semibold">TL / Manager / MD / Admin only.</p>
    </div>
  );

  return (
    <div className="w-full bg-slate-50 dark:bg-slate-950 pb-24 text-sm">

      {/* ══ TOP HEADER ══════════════════════════════════════════════════════════ */}
      <div className="hidden md:block bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-5 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={() => navigate("/")}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 transition-all cursor-pointer shrink-0"
              title="Go back to Dashboard"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm shrink-0">
              <GitBranch className="h-4 w-4 text-white"/>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1 text-[10px] text-slate-400 font-medium mb-0.5">
                <span>Dashboard</span><ChevronRight className="h-3 w-3"/><span className="text-indigo-500">Hierarchy</span>
              </div>
              <h1 className="text-base font-extrabold text-slate-900 dark:text-white leading-none">WOS Pipeline Tracker</h1>
            </div>
            {isLoading && <Loader2 className="h-3.5 w-3.5 text-slate-400 animate-spin ml-1"/>}
          </div>
          <button onClick={exportToExcel} className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-all cursor-pointer">
            <Download className="h-3.5 w-3.5"/>Export Excel
          </button>
        </div>
      </div>

      {/* ══ STICKY FILTER BAR ════════════════════════════════════════════════ */}
      <div className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-3 sm:px-5 py-2 shadow-sm">
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-none">
          <div className="relative shrink-0 w-36 sm:w-48">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none"/>
            <input type="text" placeholder="Search..." value={fSearch} onChange={e=>setFSearch(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-7 pr-2 py-1 text-xs font-medium text-slate-800 dark:text-slate-200 placeholder:text-slate-400 outline-none focus:border-indigo-400"/>
          </div>
          {(isMdOrAdmin || (role === "manager" && showroomIds && showroomIds.length > 1)) && (
            <div className="relative">
              <Building2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none"/>
              <select value={fShowroom} onChange={e=>{setFShowroom(e.target.value);setFExec("all");}}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-7 pr-5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 outline-none focus:border-indigo-400 appearance-none min-w-[110px] cursor-pointer">
                <option value="all">All Showrooms</option>
                {showrooms
                  .filter(s => isMdOrAdmin || (showroomIds && showroomIds.includes(s.id)))
                  .map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
          <div className="relative">
            <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none"/>
            <select value={fExec} onChange={e=>setFExec(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-7 pr-5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 outline-none focus:border-indigo-400 appearance-none min-w-[120px] cursor-pointer">
              <option value="all">All Executives</option>
              {execList.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <select value={viewGrouping} onChange={e=>setViewGrouping(e.target.value as "executive" | "architect" | "partner")}
            className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700/50 text-indigo-700 dark:text-indigo-300 rounded-lg px-3 py-1.5 text-xs font-bold outline-none focus:border-indigo-400 appearance-none cursor-pointer">
            <option value="executive">👤 Group: Executive Wise</option>
            <option value="architect">📐 Group: Architect Wise</option>
            <option value="partner">🤝 Group: Partner Wise</option>
          </select>
          <select value={fStatus} onChange={e=>setFStatus(e.target.value)}
            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 outline-none focus:border-indigo-400 appearance-none cursor-pointer">
            <option value="all">All Stages</option>
            <option value="pending">🔵 WOS Added</option>
            <option value="submitted">🟡 Quotation</option>
            <option value="won">🟢 Won</option>
            <option value="lost">🔴 Lost</option>
          </select>
          <AnimatePresence>
            {hasFilters && (
              <motion.button initial={{opacity:0,scale:.9}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:.9}}
                onClick={()=>{setFShowroom("all");setFExec("all");setFStatus("all");setFSearch("");}}
                className="flex items-center gap-1 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-700/50 hover:bg-rose-100 rounded-lg px-2.5 py-1.5 transition-all cursor-pointer">
                <RotateCcw className="h-3 w-3"/>Reset
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="px-4 sm:px-5 pt-3 pb-0">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 mb-3">
          {[
            { id: "all", label: "Total WOS", value: stats.total, icon: <Target className="h-4 w-4" />, grad: "from-slate-600 to-slate-700", extra: null },
            { id: "submitted", label: "Quotation", value: stats.quotation, icon: <Send className="h-4 w-4" />, grad: "from-amber-500 to-orange-500", extra: null },
            { id: "won", label: "Won", value: stats.won, icon: <Award className="h-4 w-4" />, grad: "from-emerald-500 to-teal-600", extra: `${stats.rate}%` },
            { id: "lost", label: "Lost", value: stats.lost, icon: <XCircle className="h-4 w-4" />, grad: "from-rose-500 to-red-600", extra: null },
            { id: "pending", label: "Pending", value: stats.pending, icon: <BarChart2 className="h-4 w-4" />, grad: "from-sky-500 to-indigo-500", extra: null },
          ].map((c, i) => {
            const isActive = fStatus === c.id;
            return (
              <motion.button
                key={c.label}
                type="button"
                onClick={() => setFStatus(c.id)}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`relative text-left border rounded-xl px-3.5 py-2.5 flex items-center gap-3 shadow-sm hover:shadow-md transition-all cursor-pointer ${
                  isActive
                    ? "bg-indigo-50/90 dark:bg-indigo-950/60 border-indigo-500 ring-2 ring-indigo-500/30"
                    : "bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/50 hover:border-slate-300"
                }`}
                title={`Click to filter by ${c.label}`}
              >
                <div className={`h-8 w-8 rounded-lg bg-gradient-to-br ${c.grad} flex items-center justify-center text-white shadow-sm shrink-0`}>
                  {c.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-1">
                    <span className="text-xl font-extrabold text-slate-900 dark:text-white">{c.value}</span>
                    {c.extra && <span className="text-[10px] font-bold text-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700/40 px-1.5 py-0.5 rounded-full">{c.extra}</span>}
                  </div>
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 leading-none mt-0.5 truncate">{c.label}</p>
                </div>
                {isActive && (
                  <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-indigo-500" />
                )}
              </motion.button>
            );
          })}
        </div>
        {stats.total > 0 && (
          <div className="flex items-center gap-3 mb-3 bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-2.5">
            <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0"/>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 shrink-0">Win Rate</span>
            <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
              <motion.div initial={{width:0}} animate={{width:`${stats.rate}%`}} transition={{duration:1,ease:"easeOut"}}
                className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full"/>
            </div>
            <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400 shrink-0">{stats.won}/{stats.total} · {stats.rate}%</span>
          </div>
        )}
      </div>

      {/* ══ ACTIVE HIERARCHY TABLE ══════════════════════════════════════════ */}
      <div className="px-4 sm:px-5 pb-4">
        {/* Section Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <FolderCheck className="h-4 w-4 text-emerald-500"/>
            <h2 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">Active Projects</h2>
            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700/40 px-2 py-0.5 rounded-full">
              {activeRows} records
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={expandAll}
              className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition-all"
            >
              📂 Expand All
            </button>
            <button
              onClick={collapseAll}
              className="text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 px-2.5 py-1 rounded-lg transition-all"
            >
              📁 Collapse All
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1,2].map(i=><div key={i} className="h-24 bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl animate-pulse"/>)}
          </div>
        ) : activePivot.length===0 ? (
          <div className="flex flex-col items-center py-12 gap-3 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl">
            <FolderCheck className="h-10 w-10 text-slate-200 dark:text-slate-700"/>
            <p className="text-sm font-bold text-slate-500">{rawWOS.length===0?"No WOS data yet":"No active project records"}</p>
            {hasFilters && <button onClick={()=>{setFShowroom("all");setFExec("all");setFStatus("all");setFSearch("");}} className="text-xs text-indigo-500 underline">Clear filters</button>}
          </div>
        ) : (
          <HierarchyErrorBoundary>
            <PivotTable
              pivotData={activePivot}
              colIds={colIds}
              workTypeGroups={workTypeGroups}
              isClosed={false}
              onStatusClick={rec=>{ setSelectedCell(rec); setUpdateStatus(rec.work_status); }}
              onProjectStatusClick={handleProjectStatusClick}
              isManager={isManager}
              allWorkTypes={allWorkTypes}
              expandedExecs={expandedExecs}
              toggleExec={toggleExec}
              isSearchActive={!!fSearch.trim()}
              viewGrouping={viewGrouping}
              profileMap={profileMap}
              onPartnerClick={(clientId, clientName, currentPartnerName, partnerId, createdBy) => {
                const pId = partnerId || allPartners.find((p: any) => p.name === currentPartnerName)?.id || "none";
                setChangePartnerModal({
                  clientId,
                  clientName,
                  currentPartnerName,
                  currentPartnerId: partnerId || null,
                  createdBy: createdBy || "unknown"
                });
                setSelectedNewPartnerId(pId);
                setPartnerSearchQuery("");
              }}
            />
          </HierarchyErrorBoundary>
        )}
      </div>

      {/* ══ CLOSED PROJECTS TABLE (below) ═══════════════════════════════════ */}
      <div className="px-4 sm:px-5 pb-8">
        {/* Toggle Header */}
        <button
          onClick={()=>setShowClosedTable(v=>!v)}
          className="flex items-center gap-2.5 w-full mb-2 group"
        >
          <Archive className="h-4 w-4 text-slate-400"/>
          <h2 className="text-sm font-extrabold text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-colors">
            Closed Projects
          </h2>
          <span className="text-[10px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-full">
            {closedRows} records
          </span>
          <motion.div animate={{ rotate: showClosedTable ? 90 : 0 }} transition={{ duration: 0.2 }} className="ml-auto">
            <ChevronRight className="h-4 w-4 text-slate-400"/>
          </motion.div>
        </button>

        <AnimatePresence>
          {showClosedTable && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
            >
              {closedPivot.length === 0 ? (
                <div className="flex flex-col items-center py-10 gap-3 text-center bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                  <Archive className="h-8 w-8 text-slate-200 dark:text-slate-700"/>
                  <p className="text-sm font-bold text-slate-400">No closed projects yet</p>
                  <p className="text-xs text-slate-400">Closed clients will appear here</p>
                </div>
              ) : (
                <HierarchyErrorBoundary>
                  <PivotTable
                    pivotData={closedPivot}
                    colIds={colIds}
                    workTypeGroups={workTypeGroups}
                    isClosed={true}
                    onStatusClick={rec=>{ setSelectedCell(rec); setUpdateStatus(rec.work_status); }}
                    onProjectStatusClick={handleProjectStatusClick}
                    isManager={isManager}
                    allWorkTypes={allWorkTypes}
                    expandedExecs={expandedExecs}
                    toggleExec={toggleExec}
                    isSearchActive={!!fSearch.trim()}
                    viewGrouping={viewGrouping}
                    profileMap={profileMap}
                    onPartnerClick={(clientId, clientName, currentPartnerName, partnerId, createdBy) => {
                      const pId = partnerId || allPartners.find((p: any) => p.name === currentPartnerName)?.id || "none";
                      setChangePartnerModal({
                        clientId,
                        clientName,
                        currentPartnerName,
                        currentPartnerId: partnerId || null,
                        createdBy: createdBy || "unknown"
                      });
                      setSelectedNewPartnerId(pId);
                      setPartnerSearchQuery("");
                    }}
                  />
                </HierarchyErrorBoundary>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ══ WOS STATUS UPDATE DIALOG ═══════════════════════════════════════ */}
      <Dialog open={!!selectedCell} onOpenChange={o=>{if(!o) setSelectedCell(null);}}>
        <DialogContent className="max-w-sm mx-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                <TrendingUp className="h-3 w-3 text-white"/>
              </div>
              Update WOS Status
            </DialogTitle>
          </DialogHeader>
          {selectedCell && (
            <div className="space-y-3 mt-1">
              <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3.5 space-y-2 border border-slate-200 dark:border-slate-700 text-xs">
                {selectedCell.quantity!=null && <div className="flex justify-between"><span className="text-slate-500">Qty</span><span className="font-bold text-slate-800 dark:text-white">{selectedCell.quantity}</span></div>}
                {selectedCell.description && <div className="flex justify-between gap-3"><span className="text-slate-500 shrink-0">Note</span><span className="font-semibold text-slate-700 dark:text-slate-300 text-right">{selectedCell.description}</span></div>}
                <div className="flex justify-between">
                  <span className="text-slate-500">Stage</span>
                  <span className={`font-bold text-[11px] px-2 py-0.5 rounded-full border ${STATUS_CFG[selectedCell.work_status]?.cls}`}>{STATUS_CFG[selectedCell.work_status]?.label}</span>
                </div>
                <div className="pt-1.5 border-t border-slate-200 dark:border-slate-700 space-y-1.5">
                  <div className="flex justify-between">
                    <span className="flex items-center gap-1 text-sky-600 dark:text-sky-400"><Clock className="h-3 w-3"/>WOS Added</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">{format(parseISO(selectedCell.created_at),"d MMM yyyy")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400"><Send className="h-3 w-3"/>Quotation</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">{selectedCell.submitted_at ? format(parseISO(selectedCell.submitted_at),"d MMM yyyy") : <span className="text-slate-400">—</span>}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3 w-3"/>Won / Lost</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">{selectedCell.verified_at ? format(parseISO(selectedCell.verified_at),"d MMM yyyy") : <span className="text-slate-400">—</span>}</span>
                  </div>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Change Pipeline Stage</p>
                <div className="grid grid-cols-2 gap-2">
                  {([{s:"pending",label:"WOS",icon:<Clock className="h-3 w-3"/>},{s:"submitted",label:"Quotation",icon:<Send className="h-3 w-3"/>},{s:"hold",label:"Hold",icon:<PauseCircle className="h-3 w-3"/>},{s:"won",label:"Won ✓",icon:<CheckCircle2 className="h-3 w-3"/>},{s:"lost",label:"Lost",icon:<XCircle className="h-3 w-3"/>}] as {s:WorkStatus;label:string;icon:React.ReactNode}[]).map(({s,label,icon})=>{
                    const sc=STATUS_CFG[s]; const sel=updateStatus===s;
                    return (
                      <button key={s} onClick={()=>setUpdateStatus(s)}
                        className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all ${sel?`${sc.cls} scale-[1.02] shadow-sm`:"bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300"}`}>
                        {icon}{label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <button onClick={()=>updateMutation.mutate({id:selectedCell.id,status:updateStatus})}
                disabled={updateMutation.isPending||updateStatus===selectedCell.work_status}
                className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:opacity-90 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-md shadow-indigo-500/20">
                {updateMutation.isPending?<Loader2 className="h-4 w-4 animate-spin"/>:<TrendingUp className="h-4 w-4"/>}
                {updateMutation.isPending?"Saving...":"Update Status"}
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ══ CONFIRM CLOSE/REOPEN DIALOG ═══════════════════════════════════ */}
      <Dialog open={!!confirmClose} onOpenChange={o=>{ if(!o) setConfirmClose(null); }}>
        <DialogContent className="max-w-sm mx-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              {confirmClose?.currentStatus === "active" ? (
                <>
                  <div className="h-6 w-6 rounded-lg bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center">
                    <AlertTriangle className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400"/>
                  </div>
                  Close This Project?
                </>
              ) : (
                <>
                  <div className="h-6 w-6 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                    <FolderCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400"/>
                  </div>
                  Reopen This Project?
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          {confirmClose && (
            <div className="space-y-4 mt-1">
              <div className={`rounded-xl p-4 border text-xs ${confirmClose.currentStatus === "active" ? "bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-700/40" : "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700/40"}`}>
                <p className="font-bold text-slate-800 dark:text-slate-100 text-sm mb-1">
                  {confirmClose.clientName}
                </p>
                <p className={`text-[11px] font-medium ${confirmClose.currentStatus === "active" ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                  {confirmClose.currentStatus === "active"
                    ? "This client will be moved to the Closed Projects section. You can reopen it anytime."
                    : "This client will be moved back to the Active Projects section."
                  }
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmClose(null)}
                  className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold py-2.5 rounded-xl text-sm border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => projectStatusMutation.mutate({
                    clientId: confirmClose.clientId,
                    newStatus: confirmClose.currentStatus === "active" ? "closed" : "active"
                  })}
                  disabled={projectStatusMutation.isPending}
                  className={`flex-1 font-bold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50 ${
                    confirmClose.currentStatus === "active"
                      ? "bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-500/20"
                      : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-500/20"
                  }`}
                >
                  {projectStatusMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin"/> : confirmClose.currentStatus === "active" ? <Archive className="h-4 w-4"/> : <FolderCheck className="h-4 w-4"/>}
                  {projectStatusMutation.isPending ? "Saving..." : confirmClose.currentStatus === "active" ? "Confirm Close" : "Confirm Reopen"}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ══ BLOCK CLOSE DIALOG — when pending/submitted WOS exist ═══════════ */}
      <Dialog open={!!blockClose} onOpenChange={o=>{ if(!o) setBlockClose(null); }}>
        <DialogContent className="max-w-sm mx-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <div className="h-7 w-7 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400"/>
              </div>
              Cannot Close Project
            </DialogTitle>
          </DialogHeader>
          {blockClose && (
            <div className="space-y-4 mt-1">
              {/* Client name */}
              <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3">
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{blockClose.clientName}</p>
              </div>

              {/* Main message */}
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                  You need to update the status of every WOS to <span className="font-extrabold">Won</span> or <span className="font-extrabold">Lost</span> before closing this project.
                </p>
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                    Pending items ({blockClose.blockers.length}):
                  </p>
                  {blockClose.blockers.map((b, i) => (
                    <div key={i} className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-700/40 rounded-lg px-3 py-2">
                      <div className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0"/>
                      <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">{b}</span>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center">
                Click on any WOS badge in the table to update its status.
              </p>

              {/* Close button */}
              <button
                onClick={() => setBlockClose(null)}
                className="w-full bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 dark:hover:bg-slate-600 text-white font-bold py-2.5 rounded-xl text-sm transition-all cursor-pointer"
              >
                OK, Got It
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ══ CHANGE / ASSIGN PARTNER DIALOG ═════════════════════════════════ */}
      <Dialog open={!!changePartnerModal} onOpenChange={(open) => !open && setChangePartnerModal(null)}>
        <DialogContent className="sm:max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-extrabold text-slate-900 dark:text-white">
              <Handshake className="h-5 w-5 text-indigo-500" />
              Change / Assign Partner
            </DialogTitle>
          </DialogHeader>

          {changePartnerModal && (() => {
            const execName = profileMap[changePartnerModal.createdBy] || "Executive";
            const execPartners = allPartners.filter((p: any) => p.created_by === changePartnerModal.createdBy);
            const otherPartners = allPartners.filter((p: any) => p.created_by !== changePartnerModal.createdBy);

            const filterFn = (p: any) => {
              if (!partnerSearchQuery.trim()) return true;
              const q = partnerSearchQuery.toLowerCase().trim();
              return (
                (p.name || "").toLowerCase().includes(q) ||
                (p.type || "").toLowerCase().includes(q) ||
                (p.city || "").toLowerCase().includes(q)
              );
            };

            const filteredExecPartners = execPartners.filter(filterFn);
            const filteredOtherPartners = otherPartners.filter(filterFn);

            return (
              <div className="space-y-3 pt-1">
                {/* Client Summary Header */}
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Client Name</p>
                    <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/80 px-2 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800 truncate">
                      Executive: {execName}
                    </span>
                  </div>
                  <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{changePartnerModal.clientName}</p>
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <span className="text-slate-500">Current Partner:</span>
                    <span className="font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-md border border-indigo-200 dark:border-indigo-800">
                      {changePartnerModal.currentPartnerName || "Direct (No Partner)"}
                    </span>
                  </div>
                </div>

                {/* Search Input Box */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="🔍 Search partner by name, type, city..."
                    value={partnerSearchQuery}
                    onChange={(e) => setPartnerSearchQuery(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-8 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 placeholder:text-slate-400 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all"
                  />
                  {partnerSearchQuery && (
                    <button
                      onClick={() => setPartnerSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Custom Scrollable Partner List */}
                <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800 shadow-inner">
                  {/* Option 1: Direct */}
                  <div
                    onClick={() => setSelectedNewPartnerId("none")}
                    className={`p-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                      selectedNewPartnerId === "none"
                        ? "bg-indigo-50 dark:bg-indigo-950/60 font-bold"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs">🚫</span>
                      <div>
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Direct (No Partner / Blank)</p>
                        <p className="text-[10px] text-slate-400">Client came directly without any partner</p>
                      </div>
                    </div>
                    {selectedNewPartnerId === "none" && (
                      <CheckCircle2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    )}
                  </div>

                  {/* Executive Partners Section */}
                  {filteredExecPartners.length > 0 && (
                    <div className="bg-slate-50/50 dark:bg-slate-950/50">
                      <div className="px-3 py-1.5 bg-indigo-50/60 dark:bg-indigo-950/40 border-y border-indigo-100 dark:border-indigo-900/30">
                        <span className="text-[10px] font-extrabold text-indigo-700 dark:text-indigo-300 tracking-wider uppercase">
                          ⭐ {execName}'s Partners ({filteredExecPartners.length})
                        </span>
                      </div>
                      {filteredExecPartners.map((p: any) => {
                        const isSel = selectedNewPartnerId === p.id;
                        return (
                          <div
                            key={p.id}
                            onClick={() => setSelectedNewPartnerId(p.id)}
                            className={`px-3 py-2 flex items-center justify-between cursor-pointer transition-colors ${
                              isSel
                                ? "bg-indigo-50 dark:bg-indigo-950/80 font-bold"
                                : "hover:bg-slate-100/60 dark:hover:bg-slate-800/60"
                            }`}
                          >
                            <div className="min-w-0 pr-2">
                              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                                🤝 {p.name}
                              </p>
                              <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                                {p.type && (
                                  <span className="capitalize font-semibold bg-violet-50 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 px-1.5 py-0.2 rounded border border-violet-200 dark:border-violet-800">
                                    {p.type}
                                  </span>
                                )}
                                {p.city && <span>📍 {p.city}</span>}
                              </div>
                            </div>
                            {isSel && <CheckCircle2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* All Other Partners Section */}
                  {filteredOtherPartners.length > 0 && (
                    <div>
                      <div className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800/80 border-y border-slate-200 dark:border-slate-700">
                        <span className="text-[10px] font-extrabold text-slate-600 dark:text-slate-400 tracking-wider uppercase">
                          🌐 All Other Partners ({filteredOtherPartners.length})
                        </span>
                      </div>
                      {filteredOtherPartners.map((p: any) => {
                        const isSel = selectedNewPartnerId === p.id;
                        return (
                          <div
                            key={p.id}
                            onClick={() => setSelectedNewPartnerId(p.id)}
                            className={`px-3 py-2 flex items-center justify-between cursor-pointer transition-colors ${
                              isSel
                                ? "bg-indigo-50 dark:bg-indigo-950/80 font-bold"
                                : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                            }`}
                          >
                            <div className="min-w-0 pr-2">
                              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                                🤝 {p.name}
                              </p>
                              <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                                {p.type && (
                                  <span className="capitalize bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-1.5 py-0.2 rounded border border-slate-200 dark:border-slate-700">
                                    {p.type}
                                  </span>
                                )}
                                {p.city && <span>📍 {p.city}</span>}
                              </div>
                            </div>
                            {isSel && <CheckCircle2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {filteredExecPartners.length === 0 && filteredOtherPartners.length === 0 && (
                    <div className="p-6 text-center text-xs font-semibold text-slate-400">
                      No partner found matching "{partnerSearchQuery}"
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setChangePartnerModal(null)}
                    className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={updatePartnerMutation.isPending}
                    onClick={() => {
                      const partnerId = selectedNewPartnerId === "none" ? null : selectedNewPartnerId;
                      updatePartnerMutation.mutate({
                        clientId: changePartnerModal.clientId,
                        partnerId,
                      });
                    }}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {updatePartnerMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Save Partner Changes
                  </button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Hierarchy;
