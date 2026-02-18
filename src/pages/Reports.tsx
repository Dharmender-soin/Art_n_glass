import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, parseISO, startOfMonth } from "date-fns";
import { CalendarCheck, Users, Building2, CheckCircle, Clock, Package, Filter, ArrowUpRight } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion, AnimatePresence } from "framer-motion";

const Reports = () => {
  const { role } = useAuth();
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data: visits = [], isLoading: isLoadingVisits } = useQuery({
    queryKey: ["report-visits", dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visits")
        .select("*, clients(name), partners(name)")
        .gte("visit_date", dateFrom)
        .lte("visit_date", dateTo)
        .order("visit_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Work scope report for managers/admins
  const isManager = role === "admin" || role === "manager" || role === "md";

  const { data: workScopeItems = [], isLoading: isLoadingWork } = useQuery({
    queryKey: ["report-work-scope", dateFrom, dateTo],
    enabled: isManager,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_scope_items")
        .select("*, master_work_types(type_of_work, sub_work), clients(name)")
        .gte("created_at", dateFrom)
        .lte("created_at", dateTo + "T23:59:59")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const planned = visits.filter((v) => v.status === "planned").length;
  const done = visits.filter((v) => v.status === "done").length;
  const uniqueClients = new Set(visits.filter((v) => v.client_id).map((v) => v.client_id)).size;
  const uniquePartners = new Set(visits.filter((v) => v.partner_id).map((v) => v.partner_id)).size;

  const totalWorkAmount = workScopeItems.reduce((sum, i) => sum + ((i as any).amount_in_lac || 0), 0);
  const verifiedWorkAmount = workScopeItems.filter((i) => (i as any).is_verified).reduce((sum, i) => sum + ((i as any).amount_in_lac || 0), 0);
  const verifiedCount = workScopeItems.filter((i) => (i as any).is_verified).length;

  // EVR Reports Processing
  const processVisits = (type: 'partner' | 'client') => {
    const map = new Map<string, { name: string; address: string; count: number }>();
    visits.filter((v) => type === 'partner' ? v.partner_id : v.client_id).forEach((v) => {
      const id = type === 'partner' ? v.partner_id : v.client_id;
      const split = (v as any)[type === 'partner' ? 'partners' : 'clients'];
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
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <motion.h1
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent"
          >
            Reports & Analytics
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-muted-foreground"
          >
            Comprehensive overview of performance and activities
          </motion.p>
        </div>

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
      </div>

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

          <motion.div variants={containerVariants} className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <motion.div variants={itemVariants}>
              <Card className="bg-gradient-to-br from-card to-muted border-none shadow-sm">
                <CardContent className="p-4 flex flex-col items-center justify-center text-center space-y-2">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Total Items</span>
                  <span className="text-3xl font-bold">{workScopeItems.length}</span>
                </CardContent>
              </Card>
            </motion.div>
            <motion.div variants={itemVariants}>
              <Card className="bg-gradient-to-br from-card to-muted border-none shadow-sm">
                <CardContent className="p-4 flex flex-col items-center justify-center text-center space-y-2">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Total Value</span>
                  <span className="text-3xl font-bold text-primary">₹{totalWorkAmount.toFixed(1)}<span className="text-sm text-muted-foreground ml-1">L</span></span>
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
            <motion.div variants={itemVariants}>
              <Card className="bg-gradient-to-br from-[hsl(var(--status-converted))]/10 to-[hsl(var(--status-converted))]/20 border-none shadow-sm">
                <CardContent className="p-4 flex flex-col items-center justify-center text-center space-y-2">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-[hsl(var(--status-converted))]">Verified Value</span>
                  <span className="text-3xl font-bold text-[hsl(var(--status-converted))]">₹{verifiedWorkAmount.toFixed(1)}<span className="text-sm opacity-70 ml-1">L</span></span>
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
                          const wt = (item as any).master_work_types;
                          const client = (item as any).clients;
                          const verified = (item as any).is_verified;
                          const amt = (item as any).amount_in_lac;
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
                                {amt != null && amt > 0 && (
                                  <div className="text-right">
                                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Amount</p>
                                    <p className="font-bold text-sm">₹{amt} Lac</p>
                                  </div>
                                )}
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
            <Badge variant="outline" className="font-mono">{partnerVisitList.length}</Badge>
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
            <Badge variant="outline" className="font-mono">{clientVisitList.length}</Badge>
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
    </motion.div>
  );
};

export default Reports;
