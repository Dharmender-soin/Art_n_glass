import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, subDays, parseISO } from "date-fns";
import { CalendarCheck, Search, Users, CheckCircle2, Clock, AlertCircle, TrendingUp, MapPin } from "lucide-react";
import { Navigate } from "react-router-dom";

const DailyVisitDashboard = () => {
  const { role, showroomId } = useAuth();
  const isAdmin = role === "admin";
  const isManager = role === "manager";

  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [searchExec, setSearchExec] = useState("");
  const [filterShowroom, setFilterShowroom] = useState<string>(isManager && showroomId ? showroomId : "all");

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
    queryKey: ["executives-for-dashboard", filterShowroom],
    queryFn: async () => {
      let query = supabase
        .from("user_roles")
        .select("user_id, role, showroom_id")
        .eq("role", "executive");
      if (filterShowroom && filterShowroom !== "all") {
        query = query.eq("showroom_id", filterShowroom);
      }
      const { data: roles, error: rolesError } = await query;
      if (rolesError) throw rolesError;
      const userIds = [...new Set((roles || []).map((r) => r.user_id))];
      if (userIds.length === 0) return [];
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);
      if (profilesError) throw profilesError;
      const profileMap = Object.fromEntries((profiles || []).map((p) => [p.user_id, p]));
      return (roles || []).map((r) => ({
        ...r,
        profiles: profileMap[r.user_id] || { full_name: "Unknown" },
      }));
    },
  });

  const { data: visits = [], isLoading } = useQuery({
    queryKey: ["dashboard-visits", yesterday, today, filterShowroom],
    queryFn: async () => {
      const execIds = executives.map((e) => e.user_id);
      if (execIds.length === 0) return [];
      const { data, error } = await supabase
        .from("visits")
        .select("*, clients(name), partners(name)")
        .in("created_by", execIds)
        .in("visit_date", [yesterday, today])
        .order("visit_date", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: executives.length > 0,
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
          ((e as any).profiles?.full_name || "").toLowerCase().includes(searchExec.toLowerCase())
        )
      : executives;

    return filtered.map((exec) => {
      const execVisits = visits.filter((v) => v.created_by === exec.user_id);
      const ydayAll = execVisits.filter((v) => v.visit_date === yesterday);
      const todayAll = execVisits.filter((v) => v.visit_date === today);
      return {
        userId: exec.user_id,
        name: (exec as any).profiles?.full_name || "Unknown",
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

  const getEntityName = (v: any) => v.clients?.name || v.partners?.name || "—";

  if (!isAdmin && !isManager) return <Navigate to="/" replace />;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarCheck className="h-6 w-6 text-primary" />
            Daily Visit Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Compare Yesterday (planned & actual) vs Today (planned)
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-[160px]" />
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8 w-[180px]" placeholder="Search employee..." value={searchExec} onChange={(e) => setSearchExec(e.target.value)} />
          </div>
          {isAdmin && (
            <Select value={filterShowroom} onValueChange={setFilterShowroom}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="All Showrooms" /></SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="all">All Showrooms</SelectItem>
                {showrooms.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard icon={<Clock className="h-5 w-5 text-blue-500" />} label="Yesterday Planned" value={stats.ydayPlanned} accent="border-l-blue-500" />
        <SummaryCard icon={<CheckCircle2 className="h-5 w-5 text-emerald-500" />} label="Yesterday Done" value={stats.ydayDone} accent="border-l-emerald-500" />
        <SummaryCard icon={<CalendarCheck className="h-5 w-5 text-primary" />} label="Today Planned" value={stats.todayPlanned} accent="border-l-primary" />
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4 flex items-center gap-3">
            <TrendingUp className="h-5 w-5 text-amber-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground font-medium uppercase">Completion</p>
              <p className="text-2xl font-bold">{stats.completionRate}%</p>
              <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
                <div className="h-1.5 rounded-full bg-amber-500 transition-all" style={{ width: `${stats.completionRate}%` }} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Executive Cards */}
      {isLoading ? (
        <p className="text-muted-foreground text-center py-8">Loading...</p>
      ) : execData.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">No executives found.</p>
      ) : (
        <div className="space-y-4">
          {execData.map((exec) => {
            const showroom = showrooms.find((s) => s.id === exec.showroomId);
            return (
              <Card key={exec.userId} className="overflow-hidden">
                {/* Executive Header */}
                <div className="flex items-center justify-between gap-3 px-4 py-3 bg-muted/50 border-b">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Users className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm">{exec.name}</h3>
                      {showroom && (
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <MapPin className="h-3 w-3" />{showroom.name}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap justify-end">
                    <MiniStat label="Y'day" value={exec.ydayDone} total={exec.ydayPlanned} color="emerald" />
                    {exec.ydayPending > 0 && <MiniStat label="Pending" value={exec.ydayPending} color="amber" />}
                    <MiniStat label="Today" value={exec.todayPlanned} color="blue" />
                  </div>
                </div>

                {/* Visit Details — 3-column layout */}
                <CardContent className="p-0">
                  <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">
                    {/* Yesterday Planned */}
                    <VisitColumn
                      title="Yesterday — Planned"
                      titleColor="text-blue-600"
                      bgColor="bg-blue-50/50"
                      visits={exec.ydayVisits.filter((v) => v.status === "planned")}
                      getEntityName={getEntityName}
                      showRemarks={false}
                    />
                    {/* Yesterday Done */}
                    <VisitColumn
                      title="Yesterday — Done"
                      titleColor="text-emerald-600"
                      bgColor="bg-emerald-50/50"
                      visits={exec.ydayVisits.filter((v) => v.status === "done")}
                      getEntityName={getEntityName}
                      showRemarks={true}
                    />
                    {/* Today Planned */}
                    <VisitColumn
                      title="Today — Planned"
                      titleColor="text-primary"
                      bgColor="bg-primary/5"
                      visits={exec.todayVisits}
                      getEntityName={getEntityName}
                      showRemarks={false}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

const SummaryCard = ({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number; accent: string }) => (
  <Card className={`border-l-4 ${accent}`}>
    <CardContent className="p-4 flex items-center gap-3">
      <div className="shrink-0">{icon}</div>
      <div>
        <p className="text-xs text-muted-foreground font-medium uppercase">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
      </div>
    </CardContent>
  </Card>
);

const MiniStat = ({ label, value, total, color }: { label: string; value: number; total?: number; color: string }) => {
  const colorMap: Record<string, string> = {
    emerald: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-700",
    blue: "bg-blue-100 text-blue-700",
  };
  return (
    <span className={`text-xs font-medium px-2 py-1 rounded-full ${colorMap[color] || "bg-muted text-muted-foreground"}`}>
      {label}: {total !== undefined ? `${value}/${total}` : value}
    </span>
  );
};

const VisitColumn = ({
  title, titleColor, bgColor, visits, getEntityName, showRemarks,
}: {
  title: string; titleColor: string; bgColor: string;
  visits: any[]; getEntityName: (v: any) => string; showRemarks: boolean;
}) => (
  <div className="min-h-[80px]">
    <div className={`px-3 py-1.5 ${bgColor} border-b`}>
      <p className={`text-xs font-semibold uppercase ${titleColor}`}>{title}</p>
    </div>
    {visits.length === 0 ? (
      <p className="text-xs text-muted-foreground text-center py-4">No visits</p>
    ) : (
      <div className="divide-y divide-border">
        {visits.map((v, i) => (
          <div key={v.id} className="px-3 py-2 flex gap-2 text-xs">
            <span className="text-muted-foreground font-medium w-4 shrink-0">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{getEntityName(v)}</p>
              <p className="text-muted-foreground truncate">{v.purpose}</p>
              {showRemarks && v.remarks && (
                <p className="text-emerald-600 truncate mt-0.5">✓ {v.remarks}</p>
              )}
            </div>
            <Badge variant="outline" className="text-[10px] h-5 shrink-0 capitalize">
              {v.visit_with_type}
            </Badge>
          </div>
        ))}
      </div>
    )}
  </div>
);

export default DailyVisitDashboard;
