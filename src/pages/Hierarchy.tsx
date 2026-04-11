import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import {
  GitBranch, Filter, CheckCircle2, XCircle, Clock, Send,
  Loader2, TrendingUp, Building2, Search, RotateCcw,
  Award, BarChart2, Target, Zap, ChevronRight, Download,
  FolderCheck, Archive, AlertTriangle
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { motion, AnimatePresence } from "framer-motion";

type WorkStatus = "pending" | "submitted" | "won" | "lost" | "draft" | "rejected";

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
  clients: { name: string; address: string | null; mobile: string; project_status: string | null; partners: { name: string } | null } | null;
  master_work_types: { type_of_work: string; sub_work: string } | null;
}
interface PivotClient {
  client_id: string; client_name: string; client_address: string;
  client_mobile: string; partner_name: string | null;
  project_status: string;
  wos: Record<string, WOSRecord>;
  partners: string[];
}
interface PivotExecutive {
  executive_id: string; executive_name: string;
  showroom_id: string | null; clients: PivotClient[];
}
interface WorkTypeGroup {
  typeOfWork: string; subTypes: { id: string; subWork: string }[];
}

const STATUS_PRIORITY: Record<string, number> = { won:5, submitted:4, pending:3, draft:2, lost:1, rejected:0 };

const STATUS_CFG = {
  pending:   { label:"WOS",        icon:<Clock    className="h-2.5 w-2.5"/>, cls:"text-sky-700 bg-sky-50 border-sky-200 dark:text-sky-300 dark:bg-sky-900/30 dark:border-sky-700/50",   dot:"bg-sky-500",    dateLabel:"Added"      },
  submitted: { label:"Quotation",  icon:<Send     className="h-2.5 w-2.5"/>, cls:"text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-900/30 dark:border-amber-600/50", dot:"bg-amber-400",  dateLabel:"Quoted"     },
  won:       { label:"Won ✓",      icon:<CheckCircle2 className="h-2.5 w-2.5"/>, cls:"text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-900/30 dark:border-emerald-700/50", dot:"bg-emerald-500", dateLabel:"Closed"    },
  lost:      { label:"Lost",       icon:<XCircle  className="h-2.5 w-2.5"/>, cls:"text-rose-600 bg-rose-50 border-rose-200 dark:text-rose-400 dark:bg-rose-900/30 dark:border-rose-700/50",   dot:"bg-rose-500",   dateLabel:"Closed"    },
  rejected:  { label:"Rejected",   icon:<XCircle  className="h-2.5 w-2.5"/>, cls:"text-rose-600 bg-rose-50 border-rose-200 dark:text-rose-400 dark:bg-rose-900/30 dark:border-rose-700/50",   dot:"bg-rose-400",   dateLabel:"Closed"    },
  draft:     { label:"WOS",        icon:<Clock    className="h-2.5 w-2.5"/>, cls:"text-slate-500 bg-slate-50 border-slate-200 dark:text-slate-400 dark:bg-slate-800 dark:border-slate-700",    dot:"bg-slate-400",  dateLabel:"Added"     },
} as const;

function displayDate(r: WOSRecord): string {
  const d = (r.work_status==="won"||r.work_status==="lost"||r.work_status==="rejected") ? r.verified_at
    : r.work_status==="submitted" ? r.submitted_at : r.created_at;
  if (!d) return "";
  try { return format(parseISO(d),"d MMM"); } catch { return ""; }
}

const GRADIENTS = ["from-violet-500 to-indigo-600","from-rose-500 to-pink-600","from-amber-500 to-orange-500","from-emerald-500 to-teal-600","from-sky-500 to-blue-600","from-fuchsia-500 to-purple-600"];
const avatarGrad = (n:string) => GRADIENTS[(n.charCodeAt(0)||0)%GRADIENTS.length];
const initials = (n:string) => n.split(" ").slice(0,2).map(x=>x[0]).join("").toUpperCase();

// ─── Compact Status Badge ─────────────────────────────────────────────────────
const Badge = ({ rec, onClick }: { rec: WOSRecord; onClick: () => void }) => {
  const s = STATUS_CFG[rec.work_status] ?? STATUS_CFG.pending;
  const d = displayDate(rec);
  const tooltipMap: Record<string, string> = {
    pending:   `WOS added on ${rec.created_at ? format(parseISO(rec.created_at),"d MMM yyyy") : "—"}`,
    draft:     `WOS added on ${rec.created_at ? format(parseISO(rec.created_at),"d MMM yyyy") : "—"}`,
    submitted: `Quotation on ${rec.submitted_at ? format(parseISO(rec.submitted_at),"d MMM yyyy") : "—"}`,
    won:       `Won on ${rec.verified_at ? format(parseISO(rec.verified_at),"d MMM yyyy") : "—"}`,
    lost:      `Lost on ${rec.verified_at ? format(parseISO(rec.verified_at),"d MMM yyyy") : "—"}`,
    rejected:  `Rejected on ${rec.verified_at ? format(parseISO(rec.verified_at),"d MMM yyyy") : "—"}`,
  };
  return (
    <button onClick={onClick} title={tooltipMap[rec.work_status] ?? ""}
      className={`group inline-flex flex-col items-center justify-center gap-px px-1.5 py-1 rounded-md border text-[9px] font-semibold w-full transition-all hover:scale-105 active:scale-95 hover:shadow ${s.cls}`}>
      <span className="flex items-center gap-0.5">{s.icon}{s.label}</span>
      {d && <span className="opacity-55 font-normal tabular-nums">{d}</span>}
    </button>
  );
};

// ─── Shared Table Component ───────────────────────────────────────────────────
const PivotTable = ({
  pivotData, colIds, workTypeGroups, isClosed, onStatusClick, onProjectStatusClick, isManager
}: {
  pivotData: PivotExecutive[];
  colIds: string[];
  workTypeGroups: WorkTypeGroup[];
  isClosed: boolean;
  onStatusClick: (rec: WOSRecord) => void;
  onProjectStatusClick: (clientId: string, clientName: string, currentStatus: string) => void;
  isManager: boolean;
}) => {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
      <div className="overflow-auto" style={{ maxHeight: isClosed ? "360px" : "calc(100vh - 340px)" }}>
        <table className="w-full text-xs border-collapse min-w-max">
          {/* ── THEAD ── */}
          <thead className="sticky top-0 z-10">
            <tr>
              <th rowSpan={2} className="bg-slate-900 dark:bg-slate-950 text-slate-300 border-b-2 border-r border-slate-700 px-3 py-2.5 text-left font-bold uppercase tracking-wider text-[10px] min-w-[120px] sticky left-0 z-20 align-bottom">Executive</th>
              <th rowSpan={2} className="bg-slate-800 dark:bg-slate-800/80 text-slate-400 border-b-2 border-r border-slate-700 px-3 py-2.5 text-left font-bold uppercase tracking-wider text-[10px] min-w-[90px] align-bottom">Partner</th>
              <th rowSpan={2} className="bg-slate-800 dark:bg-slate-900 text-slate-400 border-b-2 border-r border-slate-700 px-3 py-2.5 text-left font-bold uppercase tracking-wider text-[10px] min-w-[130px] align-bottom">Client Name</th>
              <th rowSpan={2} className="bg-slate-800 dark:bg-slate-900 text-slate-400 border-b-2 border-r border-slate-700 px-3 py-2.5 text-left font-bold uppercase tracking-wider text-[10px] min-w-[120px] align-bottom">Address</th>
              <th rowSpan={2} className="bg-slate-800 dark:bg-slate-900 text-slate-400 border-b-2 border-r border-slate-700 px-3 py-2.5 text-center font-bold uppercase tracking-wider text-[10px] min-w-[95px] align-bottom">Mobile</th>
              {workTypeGroups.map(g => (
                <th key={g.typeOfWork} colSpan={g.subTypes.length}
                  className="bg-indigo-700 dark:bg-indigo-800 text-white border-b border-r border-indigo-500/40 px-2 py-2 text-center font-bold text-[10px] uppercase tracking-wider whitespace-nowrap">
                  {g.typeOfWork}
                </th>
              ))}
              <th rowSpan={2} className="bg-slate-700 dark:bg-slate-700 text-slate-300 border-b-2 border-r border-slate-600 px-3 py-2.5 text-center font-bold uppercase tracking-wider text-[10px] min-w-[110px] align-bottom">WOSs</th>
              {/* ── NEW: Project Status column ── */}
              <th rowSpan={2} className={`border-b-2 border-slate-600 px-3 py-2.5 text-center font-bold uppercase tracking-wider text-[10px] min-w-[110px] align-bottom ${isClosed ? "bg-slate-700 text-slate-300" : "bg-emerald-800 text-emerald-200"}`}>
                Project Status
              </th>
            </tr>
            <tr>
              {workTypeGroups.flatMap(g => g.subTypes.map(st => (
                <th key={st.id}
                  className="bg-indigo-900/70 dark:bg-indigo-950 text-indigo-200 border-b-2 border-r border-indigo-500/30 px-2 py-1.5 text-center font-semibold text-[10px] min-w-[76px] whitespace-nowrap uppercase">
                  {st.subWork}
                </th>
              )))}
            </tr>
          </thead>

          {/* ── TBODY ── */}
          <tbody>
            {pivotData.map((exec, ei) =>
              exec.clients.map((client, ci) => (
                <tr key={`${exec.executive_id}-${client.client_id}`}
                  className={`border-b border-slate-100 dark:border-slate-800 hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition-colors ${ci%2===1?"bg-slate-50/50":"bg-white dark:bg-transparent"}`}>

                  {ci===0 && (
                    <td rowSpan={exec.clients.length}
                      className={`border-r border-slate-200 dark:border-slate-700 px-3 py-2.5 align-middle sticky left-0 z-10 ${ei%2===0?"bg-slate-50 dark:bg-slate-800/50":"bg-slate-100/50 dark:bg-slate-800/80"}`}>
                      <div className="flex items-center gap-2">
                        <div className={`h-8 w-8 rounded-lg bg-gradient-to-br ${avatarGrad(exec.executive_name)} flex items-center justify-center text-white text-[11px] font-extrabold shadow-sm shrink-0`}>
                          {initials(exec.executive_name)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-800 dark:text-slate-100 text-[11px] truncate max-w-[80px]">{exec.executive_name}</p>
                          <p className="text-[9px] text-indigo-500 dark:text-indigo-400 font-semibold mt-px">
                            {exec.clients.length} client{exec.clients.length!==1?"s":""}
                          </p>
                        </div>
                      </div>
                    </td>
                  )}

                  <td className="px-3 py-2 border-r border-slate-100 dark:border-slate-800">
                    {client.partner_name
                      ? <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-md bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-700/50 whitespace-nowrap">{client.partner_name}</span>
                      : <span className="text-slate-300 dark:text-slate-700">—</span>
                    }
                  </td>
                  <td className="px-3 py-2 border-r border-slate-100 dark:border-slate-800">
                    <p className="font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">{client.client_name}</p>
                  </td>
                  <td className="px-3 py-2 border-r border-slate-100 dark:border-slate-800">
                    <p className="text-slate-500 dark:text-slate-400 truncate max-w-[120px]">{client.client_address}</p>
                  </td>
                  <td className="px-3 py-2 text-center border-r border-slate-100 dark:border-slate-800">
                    <span className="font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap text-[11px]">{client.client_mobile}</span>
                  </td>

                  {colIds.map(wtId => {
                    const rec = client.wos[wtId];
                    return (
                      <td key={wtId} className="px-1.5 py-1.5 border-r border-slate-100 dark:border-slate-800">
                        {rec
                          ? <Badge rec={rec} onClick={() => onStatusClick(rec)} />
                          : <div className="flex items-center justify-center text-slate-200 dark:text-slate-800 text-base select-none">·</div>
                        }
                      </td>
                    );
                  })}

                  {/* WOSs column */}
                  <td className="px-2 py-2 border-r border-slate-100 dark:border-slate-800">
                    <div className="flex flex-wrap gap-1">
                      {client.partners.length > 0
                        ? client.partners.map(p => (
                            <span key={p} className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-bold rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700/50 whitespace-nowrap">{p}</span>
                          ))
                        : <span className="text-slate-300 dark:text-slate-700 text-base">·</span>
                      }
                    </div>
                  </td>

                  {/* ── Project Status column ── */}
                  <td className="px-2 py-2 text-center">
                    {isClosed ? (
                      // In closed table: show Closed badge + reopen option for manager
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
                      // In active table: show Active badge + Close Project button for manager
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
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── Main ─────────────────────────────────────────────────────────────────────
const Hierarchy = () => {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const canAccess = role==="admin"||role==="manager"||role==="md";
  const isMdOrAdmin = role==="admin"||role==="md";
  const isManager = role==="manager"||role==="admin"||role==="md";

  const [fExec, setFExec]       = useState("all");
  const [fStatus, setFStatus]   = useState("all");
  const [fShowroom, setFShowroom] = useState("all");
  const [fSearch, setFSearch]   = useState("");
  const [selectedCell, setSelectedCell] = useState<WOSRecord|null>(null);
  const [updateStatus, setUpdateStatus] = useState<WorkStatus>("won");
  const [confirmClose, setConfirmClose] = useState<{ clientId: string; clientName: string; currentStatus: string } | null>(null);
  const [blockClose, setBlockClose] = useState<{ clientName: string; blockers: string[] } | null>(null);
  const [showClosedTable, setShowClosedTable] = useState(false);

  const { data: showrooms=[] } = useQuery({ queryKey:["sr-h3"], enabled:isMdOrAdmin,
    queryFn: async()=>{ const{data}=await supabase.from("showrooms").select("id,name").order("name"); return data||[]; } });
  const { data: userRoles=[] } = useQuery({ queryKey:["ur-h3"], enabled:canAccess,
    queryFn: async()=>{ const{data}=await supabase.from("user_roles").select("user_id,showroom_id"); return data||[]; } });
  const { data: profiles=[] } = useQuery({ queryKey:["pr-h3"], enabled:canAccess,
    queryFn: async()=>{ const{data}=await supabase.from("profiles").select("user_id,full_name"); return data||[]; } });
  const { data: allWorkTypes=[] } = useQuery({ queryKey:["wt-h3"], enabled:canAccess,
    queryFn: async()=>{ const{data}=await supabase.from("master_work_types").select("id,type_of_work,sub_work").order("type_of_work"); return data||[]; } });
  const { data: rawWOS=[], isLoading } = useQuery({ queryKey:["wos-h3"], enabled:canAccess,
    queryFn: async()=>{
      const{data,error}=await supabase.from("work_scope_items")
        .select(`id,client_id,work_type_id,work_status,created_at,submitted_at,verified_at,quantity,description,created_by,clients(name,address,mobile,project_status,partners(name)),master_work_types(type_of_work,sub_work)`)
        .order("created_at",{ascending:false});
      if(error) throw error;
      return (data||[]) as unknown as RawWOS[];
    }
  });

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
    const em=new Map<string,PivotExecutive>();
    const wtPartnerMap: Record<string,string> = {};
    allWorkTypes.forEach(wt=>{ wtPartnerMap[wt.id]=wt.sub_work; });

    rawWOS.forEach(r=>{
      if(!r.clients) return;
      const clientProjStatus = (r.clients as any).project_status || "active";
      if (clientProjStatus !== statusFilter) return;

      const eid=r.created_by;
      if(!em.has(eid)) em.set(eid,{executive_id:eid,executive_name:profileMap[eid]||"Unknown",showroom_id:showroomMap[eid]??null,clients:[]});
      const exec=em.get(eid)!;
      let cl=exec.clients.find(c=>c.client_id===r.client_id);
      if(!cl){
        const builderName = (r.clients as any).partners?.name ?? null;
        cl={client_id:r.client_id,client_name:r.clients.name,client_address:r.clients.address||"—",client_mobile:r.clients.mobile,partner_name:builderName,project_status:clientProjStatus,wos:{},partners:[]};
        exec.clients.push(cl);
      }
      const ex=cl.wos[r.work_type_id];
      if(!ex||(STATUS_PRIORITY[r.work_status]??0)>(STATUS_PRIORITY[ex.work_status]??0))
        cl.wos[r.work_type_id]={id:r.id,client_id:r.client_id,work_type_id:r.work_type_id,work_status:r.work_status as WorkStatus,created_at:r.created_at,submitted_at:r.submitted_at,verified_at:r.verified_at,quantity:r.quantity,description:r.description,created_by:r.created_by};
      const pName=wtPartnerMap[r.work_type_id];
      if(pName && !cl.partners.includes(pName)) cl.partners.push(pName);
    });
    let res=Array.from(em.values()).sort((a,b)=>a.executive_name.localeCompare(b.executive_name));
    if(fShowroom!=="all") res=res.filter(e=>e.showroom_id===fShowroom);
    if(fExec!=="all") res=res.filter(e=>e.executive_id===fExec);
    if(fStatus!=="all") res=res.map(e=>({...e,clients:e.clients.filter(c=>Object.values(c.wos).some(w=>w.work_status===fStatus))})).filter(e=>e.clients.length>0);
    if(fSearch.trim()){ const q=fSearch.toLowerCase(); res=res.map(e=>({...e,clients:e.clients.filter(c=>c.client_name.toLowerCase().includes(q)||c.client_address.toLowerCase().includes(q))})).filter(e=>e.clients.length>0||e.executive_name.toLowerCase().includes(q)); }
    return res;
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const activePivot = useMemo(()=>buildPivot("active"),[rawWOS,profileMap,showroomMap,fExec,fStatus,fShowroom,fSearch,allWorkTypes]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const closedPivot = useMemo(()=>buildPivot("closed"),[rawWOS,profileMap,showroomMap,fExec,fStatus,fShowroom,fSearch,allWorkTypes]);

  const stats = useMemo(()=>{
    let total=0,won=0,sent=0,pending=0;
    rawWOS.forEach(r=>{ total++; if(r.work_status==="won") won++; else if(r.work_status==="submitted") sent++; else if(r.work_status==="pending"||r.work_status==="draft") pending++; });
    return {total,won,sent,pending,rate:total>0?Math.round((won/total)*100):0};
  },[rawWOS]);

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

  // ── Export active pivot data to CSV ──────────────────────────────────────
  const exportToCSV = () => {
    const headers = [
      "Executive", "Partner", "Client Name", "Address", "Mobile",
      ...colIds.map(id => {
        const wt = allWorkTypes.find(t => t.id === id);
        return wt ? `${wt.type_of_work} - ${wt.sub_work}` : id;
      }),
      "WOS Summary", "Project Status"
    ];

    const rows: string[][] = [];
    activePivot.forEach(exec => {
      exec.clients.forEach(client => {
        const wosStatuses = colIds.map(id => {
          const rec = client.wos[id];
          if (!rec) return "—";
          return rec.work_status.charAt(0).toUpperCase() + rec.work_status.slice(1);
        });
        rows.push([
          exec.executive_name,
          client.partner_name || "—",
          client.client_name,
          client.client_address,
          client.client_mobile,
          ...wosStatuses,
          client.partners.join(", ") || "—",
          client.project_status === "closed" ? "Closed" : "Active",
        ]);
      });
    });

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wos-pipeline-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported to CSV ✓");
  };

  if(!canAccess) return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-3">
      <GitBranch className="h-12 w-12 text-slate-300"/>
      <p className="text-slate-500 font-semibold">Manager / MD / Admin only.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-20 text-sm">

      {/* ══ TOP HEADER ══════════════════════════════════════════════════════════ */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-5 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
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
          <button onClick={exportToCSV} className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-all">
            <Download className="h-3.5 w-3.5"/>Export CSV
          </button>
        </div>
      </div>

      {/* ══ STICKY FILTER BAR ════════════════════════════════════════════════ */}
      <div className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-5 py-2.5 shadow-sm">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[150px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none"/>
            <input type="text" placeholder="Search client, address..." value={fSearch} onChange={e=>setFSearch(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-7 pr-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 placeholder:text-slate-400 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-300/30 transition-all"/>
          </div>
          {isMdOrAdmin && (
            <div className="relative">
              <Building2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none"/>
              <select value={fShowroom} onChange={e=>{setFShowroom(e.target.value);setFExec("all");}}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-7 pr-5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 outline-none focus:border-indigo-400 appearance-none min-w-[110px] cursor-pointer">
                <option value="all">All Showrooms</option>
                {showrooms.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
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
                className="flex items-center gap-1 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-700/50 hover:bg-rose-100 rounded-lg px-2.5 py-1.5 transition-all">
                <RotateCcw className="h-3 w-3"/>Reset
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ══ KPI CARDS ════════════════════════════════════════════════════════ */}
      <div className="px-5 pt-3 pb-0">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-3">
          {[
            { label:"Total WOS", value:stats.total, icon:<Target className="h-4 w-4"/>, grad:"from-slate-600 to-slate-700", extra:null },
            { label:"Won",       value:stats.won,   icon:<Award className="h-4 w-4"/>,  grad:"from-emerald-500 to-teal-600", extra:`${stats.rate}%` },
            { label:"Sent",      value:stats.sent,  icon:<Send className="h-4 w-4"/>,   grad:"from-amber-500 to-orange-500", extra:null },
            { label:"Pending",   value:stats.pending,icon:<BarChart2 className="h-4 w-4"/>,grad:"from-sky-500 to-indigo-500",extra:null },
          ].map((c,i)=>(
            <motion.div key={c.label} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:i*0.05}}
              className="bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm hover:shadow-md transition-all">
              <div className={`h-8 w-8 rounded-lg bg-gradient-to-br ${c.grad} flex items-center justify-center text-white shadow-sm shrink-0`}>
                {c.icon}
              </div>
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-extrabold text-slate-900 dark:text-white">{c.value}</span>
                  {c.extra && <span className="text-[10px] font-bold text-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700/40 px-1.5 py-0.5 rounded-full">{c.extra}</span>}
                </div>
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 leading-none mt-0.5">{c.label}</p>
              </div>
            </motion.div>
          ))}
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
      <div className="px-5 pb-4">
        {/* Section Header */}
        <div className="flex items-center gap-2 mb-2">
          <FolderCheck className="h-4 w-4 text-emerald-500"/>
          <h2 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">Active Projects</h2>
          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700/40 px-2 py-0.5 rounded-full">
            {activeRows} records
          </span>
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
          <PivotTable
            pivotData={activePivot}
            colIds={colIds}
            workTypeGroups={workTypeGroups}
            isClosed={false}
            onStatusClick={rec=>{ setSelectedCell(rec); setUpdateStatus(rec.work_status); }}
            onProjectStatusClick={handleProjectStatusClick}
            isManager={isManager}
          />
        )}
      </div>

      {/* ══ CLOSED PROJECTS TABLE (below) ═══════════════════════════════════ */}
      <div className="px-5 pb-8">
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
                <PivotTable
                  pivotData={closedPivot}
                  colIds={colIds}
                  workTypeGroups={workTypeGroups}
                  isClosed={true}
                  onStatusClick={rec=>{ setSelectedCell(rec); setUpdateStatus(rec.work_status); }}
                  onProjectStatusClick={handleProjectStatusClick}
                  isManager={isManager}
                />
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
                  {([{s:"pending",label:"WOS",icon:<Clock className="h-3 w-3"/>},{s:"submitted",label:"Quotation",icon:<Send className="h-3 w-3"/>},{s:"won",label:"Won ✓",icon:<CheckCircle2 className="h-3 w-3"/>},{s:"lost",label:"Lost",icon:<XCircle className="h-3 w-3"/>}] as {s:WorkStatus;label:string;icon:React.ReactNode}[]).map(({s,label,icon})=>{
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
                className="w-full bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 dark:hover:bg-slate-600 text-white font-bold py-2.5 rounded-xl text-sm transition-all"
              >
                OK, Got It
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Hierarchy;
