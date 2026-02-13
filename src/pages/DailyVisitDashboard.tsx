import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, subDays, parseISO } from "date-fns";
import { CalendarCheck, Search, Users } from "lucide-react";
import { Navigate } from "react-router-dom";

const DailyVisitDashboard = () => {
  const { role, showroomId } = useAuth();
  const isAdmin = role === "admin";
  const isManager = role === "manager";

  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [searchExec, setSearchExec] = useState("");
  const [filterShowroom, setFilterShowroom] = useState<string>(isManager && showroomId ? showroomId : "all");
  const [filterStatus, setFilterStatus] = useState("all");

  const today = selectedDate;
  const yesterday = format(subDays(parseISO(selectedDate), 1), "yyyy-MM-dd");

  // Fetch showrooms
  const { data: showrooms = [] } = useQuery({
    queryKey: ["showrooms"],
    queryFn: async () => {
      const { data, error } = await supabase.from("showrooms").select("*");
      if (error) throw error;
      return data;
    },
  });

  // Fetch all user_roles with profiles
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

      const profileMap = Object.fromEntries(
        (profiles || []).map((p) => [p.user_id, p])
      );

      return (roles || []).map((r) => ({
        ...r,
        profiles: profileMap[r.user_id] || { full_name: "Unknown" },
      }));
    },
  });

  // Fetch visits for yesterday and today
  const { data: visits = [], isLoading } = useQuery({
    queryKey: ["dashboard-visits", yesterday, today, filterShowroom],
    queryFn: async () => {
      const execIds = executives.map((e) => e.user_id);
      if (execIds.length === 0) return [];

      const { data, error } = await supabase
        .from("visits")
        .select("*, clients(name, address, city), partners(name, address, city)")
        .in("created_by", execIds)
        .in("visit_date", [yesterday, today])
        .order("visit_date", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: executives.length > 0,
  });

  // Compute stats
  const stats = useMemo(() => {
    const ydayVisits = visits.filter((v) => v.visit_date === yesterday);
    const todayVisits = visits.filter((v) => v.visit_date === today);
    const ydayPlanned = ydayVisits.length;
    const ydayDone = ydayVisits.filter((v) => v.status === "done").length;
    const todayPlanned = todayVisits.filter((v) => v.status === "planned" || v.status === "done").length;
    const completionRate = ydayPlanned > 0 ? Math.round((ydayDone / ydayPlanned) * 100) : 0;
    return { ydayPlanned, ydayDone, todayPlanned, completionRate };
  }, [visits, yesterday, today]);

  // Group visits per executive
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

      const ydayPlanned = ydayAll.length;
      const ydayDone = ydayAll.filter((v) => v.status === "done").length;
      const ydayPending = ydayAll.filter((v) => v.status === "planned").length;
      const todayPlanned = todayAll.filter((v) => v.status === "planned" || v.status === "done").length;

      return {
        userId: exec.user_id,
        name: (exec as any).profiles?.full_name || "Unknown",
        showroomId: exec.showroom_id,
        ydayPlanned,
        ydayDone,
        ydayPending,
        todayPlanned,
        ydayVisits: ydayAll,
        todayVisits: todayAll,
      };
    });
  }, [executives, visits, yesterday, today, searchExec]);

  const getEntityName = (v: any) => v.clients?.name || v.partners?.name || "—";
  const getEntityLocation = (v: any) => {
    const c = v.clients || v.partners;
    return c?.address || c?.city || v.address || "";
  };

  const statusBadgeColor = (status: string) => {
    if (status === "done") return "bg-[hsl(var(--status-converted))] text-white";
    if (status === "cancelled") return "bg-[hsl(var(--status-lost))] text-white";
    return "bg-[hsl(var(--status-new))] text-white";
  };

  // Only admin/manager can access
  if (!isAdmin && !isManager) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="space-y-4">
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
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-[160px]"
          />
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8 w-[180px]"
              placeholder="Search employee..."
              value={searchExec}
              onChange={(e) => setSearchExec(e.target.value)}
            />
          </div>
          {isAdmin && (
            <Select value={filterShowroom} onValueChange={setFilterShowroom}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Showrooms" />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="all">All Showrooms</SelectItem>
                {showrooms.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase font-semibold">Yesterday Planned</p>
            <p className="text-3xl font-bold">{stats.ydayPlanned}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase font-semibold">Yesterday Completed</p>
            <p className="text-3xl font-bold">{stats.ydayDone}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase font-semibold">Today Planned</p>
            <p className="text-3xl font-bold">{stats.todayPlanned}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase font-semibold">Completion Rate</p>
            <p className="text-3xl font-bold">{stats.completionRate}%</p>
            <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
              <div
                className="h-1.5 rounded-full bg-primary transition-all"
                style={{ width: `${stats.completionRate}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Executive Columns */}
      {isLoading ? (
        <p className="text-muted-foreground text-center py-8">Loading...</p>
      ) : execData.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">No executives found.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {execData.map((exec) => (
            <Card key={exec.userId} className="overflow-hidden">
              <div className="bg-primary/10 p-3 border-b">
                <h3 className="font-bold text-sm flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-primary" />
                  {exec.name}
                </h3>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  <Badge variant="outline" className="text-[10px] bg-[hsl(var(--status-new))]/10 text-[hsl(var(--status-new))]">
                    Y'day Planned: {exec.ydayPlanned}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] bg-[hsl(var(--status-converted))]/10 text-[hsl(var(--status-converted))]">
                    Y'day Done: {exec.ydayDone}
                  </Badge>
                  {exec.ydayPending > 0 && (
                    <Badge variant="outline" className="text-[10px] bg-[hsl(var(--status-hot))]/10 text-[hsl(var(--status-hot))]">
                      Y'day Pending: {exec.ydayPending}
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary">
                    Today Planned: {exec.todayPlanned}
                  </Badge>
                </div>
              </div>
              <CardContent className="p-3 space-y-3 max-h-[400px] overflow-y-auto">
                {/* Yesterday Planned */}
                {exec.ydayVisits.filter((v) => v.status === "planned").length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1 bg-[hsl(var(--status-new))]/10 px-2 py-0.5 rounded text-center">
                      Planned (Yesterday)
                    </p>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-muted-foreground">
                          <th className="text-left font-medium py-0.5">#</th>
                          <th className="text-left font-medium py-0.5">Client / Location</th>
                          <th className="text-left font-medium py-0.5">Purpose</th>
                        </tr>
                      </thead>
                      <tbody>
                        {exec.ydayVisits
                          .filter((v) => v.status === "planned")
                          .map((v, i) => (
                            <tr key={v.id} className="border-t border-muted/30">
                              <td className="py-1">{i + 1}</td>
                              <td className="py-1">
                                <span className="font-medium">{getEntityName(v)}</span>
                                {getEntityLocation(v) && (
                                  <span className="text-muted-foreground block text-[10px]">{getEntityLocation(v)}</span>
                                )}
                              </td>
                              <td className="py-1">{v.purpose}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Yesterday Actual (Done) */}
                {exec.ydayVisits.filter((v) => v.status === "done").length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1 bg-[hsl(var(--status-converted))]/10 px-2 py-0.5 rounded text-center">
                      Actual (Yesterday)
                    </p>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-muted-foreground">
                          <th className="text-left font-medium py-0.5">#</th>
                          <th className="text-left font-medium py-0.5">Client / Location</th>
                          <th className="text-left font-medium py-0.5">Remark</th>
                        </tr>
                      </thead>
                      <tbody>
                        {exec.ydayVisits
                          .filter((v) => v.status === "done")
                          .map((v, i) => (
                            <tr key={v.id} className="border-t border-muted/30">
                              <td className="py-1">{i + 1}</td>
                              <td className="py-1">
                                <span className="font-medium">{getEntityName(v)}</span>
                                {getEntityLocation(v) && (
                                  <span className="text-muted-foreground block text-[10px]">{getEntityLocation(v)}</span>
                                )}
                              </td>
                              <td className="py-1">{v.remarks || "Done"}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Today Planned */}
                {exec.todayVisits.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1 bg-primary/10 px-2 py-0.5 rounded text-center">
                      Planned (Today)
                    </p>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-muted-foreground">
                          <th className="text-left font-medium py-0.5">#</th>
                          <th className="text-left font-medium py-0.5">Client / Location</th>
                          <th className="text-left font-medium py-0.5">Purpose</th>
                        </tr>
                      </thead>
                      <tbody>
                        {exec.todayVisits.map((v, i) => (
                          <tr key={v.id} className="border-t border-muted/30">
                            <td className="py-1">{i + 1}</td>
                            <td className="py-1">
                              <span className="font-medium">{getEntityName(v)}</span>
                              {getEntityLocation(v) && (
                                <span className="text-muted-foreground block text-[10px]">{getEntityLocation(v)}</span>
                              )}
                            </td>
                            <td className="py-1">{v.purpose}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {exec.ydayVisits.length === 0 && exec.todayVisits.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">No visits</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default DailyVisitDashboard;
