import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ShieldCheck, Package, CheckCircle, XCircle, Clock, Filter, Search, Sparkles, Building2, User, FileText } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const Verification = () => {
  const { user, role, showroomIds } = useAuth();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showroomFilter, setShowroomFilter] = useState<string>("all");
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [verificationRemarks, setVerificationRemarks] = useState("");
  const [verificationReason, setVerificationReason] = useState("");
  const [workStatus, setWorkStatus] = useState<string>("pending");
  const [visibleCount, setVisibleCount] = useState(20);

  const canAccess = role === "admin" || role === "manager" || role === "md";

  // Fetch all work scope items with client & work type info
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["verification-items", showroomIds],
    enabled: canAccess,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_scope_items")
        .select("*, master_work_types(type_of_work, sub_work), clients(name, city)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch showrooms for MD grouping and multi-showroom manager filtering
  const { data: showrooms = [] } = useQuery({
    queryKey: ["showrooms"],
    enabled: role === "md" || (role === "manager" && showroomIds && showroomIds.length > 1),
    queryFn: async () => {
      const { data, error } = await supabase.from("showrooms").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch user roles for showroom mapping (MD and Manager views)
  const { data: userRoles = [] } = useQuery({
    queryKey: ["user-roles-for-verification", showroomIds],
    enabled: role === "md" || role === "manager",
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, showroom_id");
      if (error) throw error;
      return data;
    },
  });

  // Fetch profiles for executives
  const userIds = useMemo(() => [...new Set(items.map((i: any) => i.created_by))], [items]);
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-for-verification", userIds],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);
      if (error) throw error;
      return data;
    },
  });

  const profileMap = useMemo(() => {
    return (profiles || []).reduce((acc: any, profile: any) => {
      acc[profile.user_id] = profile;
      return acc;
    }, {});
  }, [profiles]);

  // Summary stats
  const stats = useMemo(() => {
    const wonCount = items.filter((i: any) => i.work_status === "won").length;
    const lostCount = items.filter((i: any) => i.work_status === "lost").length;
    const pendingCount = items.filter((i: any) => i.work_status === "pending").length;
    const holdCount = items.filter((i: any) => i.work_status === "hold").length;
    return { wonCount, lostCount, pendingCount, holdCount, totalItems: items.length };
  }, [items]);

  const verifyMutation = useMutation({
    mutationFn: async () => {
      if (!selectedItem) throw new Error("No item selected");
      const { error } = await supabase
        .from("work_scope_items")
        .update({
          work_status: workStatus as "pending" | "submitted" | "draft" | "won" | "lost" | "rejected" | "hold",
          verification_remarks: verificationRemarks,
          verification_reason: verificationReason || null,
          is_verified: workStatus === "won" || workStatus === "lost",
          verified_by: user?.id,
          verified_at: new Date().toISOString(),
        })
        .eq("id", selectedItem.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["verification-items"] });
      toast.success("Work scope verified and updated!");
      setSelectedItem(null);
      resetForm();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetForm = () => {
    setVerificationRemarks("");
    setVerificationReason("");
    setWorkStatus("pending");
  };

  const openVerifyDialog = (item: any) => {
    setSelectedItem(item);
    setVerificationRemarks(item.verification_remarks || "");
    setVerificationReason(item.verification_reason || "");
    // Preserve current status if it's a recognized status, otherwise default to pending
    const recognized = ["won", "lost", "pending", "hold", "submitted"];
    setWorkStatus(recognized.includes(item.work_status) ? item.work_status : "pending");
  };

  const getShowroomForItem = useCallback((item: any) => {
    const userRole = userRoles.find((ur) => ur.user_id === item.created_by);
    if (!userRole?.showroom_id) return null;
    return showrooms.find((s) => s.id === userRole.showroom_id) || null;
  }, [userRoles, showrooms]);

  const filteredItems = useMemo(() => {
    let result = items;
    if (statusFilter !== "all") {
      result = result.filter((i: any) => i.work_status === statusFilter);
    }
    if (showroomFilter !== "all") {
      result = result.filter((i: any) => {
        const sr = getShowroomForItem(i);
        return sr?.id === showroomFilter;
      });
    }
    return result;
  }, [items, statusFilter, showroomFilter, getShowroomForItem]);

  if (!canAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <ShieldCheck className="h-16 w-16 text-muted-foreground/30 mb-4" />
        <h2 className="text-xl font-semibold">Access Denied</h2>
        <p className="text-muted-foreground">You do not have permission to view this page.</p>
      </div>
    );
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.05 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <div className="space-y-6 min-h-screen bg-background p-6 -m-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between sticky top-0 z-20 bg-background/80 backdrop-blur-lg pb-4 border-b">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2 bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">
            <ShieldCheck className="h-8 w-8 text-primary" />
            Work Verification
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Verify scope, update amounts, and track status
          </p>
        </div>

        <div className="flex items-center gap-3">
          {(role === "md" || (role === "manager" && showroomIds && showroomIds.length > 1)) && showrooms.length > 0 && (
            <div className="bg-card/50 backdrop-blur-sm p-1 rounded-lg border shadow-sm flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground ml-2" />
              <Select value={showroomFilter} onValueChange={setShowroomFilter}>
                <SelectTrigger className="w-[160px] bg-transparent border-none focus-visible:ring-0 h-9">
                  <SelectValue placeholder="All Showrooms" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Showrooms</SelectItem>
                  {showrooms
                    .filter((s) => role === "md" || (showroomIds && showroomIds.includes(s.id)))
                    .map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="bg-card/50 backdrop-blur-sm p-1 rounded-lg border shadow-sm flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground ml-2" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px] bg-transparent border-none focus-visible:ring-0 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="hold">Hold</SelectItem>
                <SelectItem value="won">Won</SelectItem>
                <SelectItem value="lost">Lost</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard icon={<Package className="h-5 w-5 text-primary" />} label="Total Items" value={stats.totalItems} color="primary" delay={0} />
        <StatsCard icon={<CheckCircle className="h-5 w-5 text-emerald-500" />} label="Won" value={stats.wonCount} color="emerald" delay={0.1} />
        <StatsCard icon={<XCircle className="h-5 w-5 text-rose-500" />} label="Lost" value={stats.lostCount} color="rose" delay={0.2} />
        <StatsCard icon={<Clock className="h-5 w-5 text-amber-500" />} label="Pending" value={stats.pendingCount} color="amber" delay={0.3} />
        <StatsCard icon={<Filter className="h-5 w-5 text-purple-500" />} label="On Hold" value={stats.holdCount} color="purple" delay={0.4} />
      </div>

      <Separator className="bg-border/50" />

      {/* Main Content */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <p className="text-muted-foreground animate-pulse">Loading verification items...</p>
        </div>
      ) : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="space-y-8"
        >
          {role === "md" && showrooms.length > 0 ? (
            // MD View: Grouped by Showroom -> Executive
            <div className="space-y-8">
              {showrooms.map((showroom) => {
                const showroomItems = filteredItems.filter((item: any) => {
                  const sr = getShowroomForItem(item);
                  return sr?.id === showroom.id;
                });
                if (showroomItems.length === 0) return null;

                // Group by Executive within Showroom
                const execGroups = showroomItems.reduce((acc: any, item: any) => {
                  const execId = item.created_by;
                  if (!acc[execId]) acc[execId] = [];
                  acc[execId].push(item);
                  return acc;
                }, {});

                return (
                  <motion.div key={showroom.id} variants={itemVariants} className="space-y-4">
                    <div className="flex items-center gap-3 sticky top-20 z-10 bg-background/95 backdrop-blur py-2 px-4 rounded-lg shadow-sm border">
                      <Building2 className="h-5 w-5 text-muted-foreground" />
                      <h2 className="text-lg font-bold">{showroom.name}</h2>
                      <Badge variant="secondary" className="ml-auto">{showroomItems.length} items</Badge>
                    </div>

                    <Accordion type="multiple" className="space-y-4">
                      {Object.entries(execGroups).map(([execId, items]: [string, any]) => {
                        const profile = profileMap[execId];
                        return (
                          <AccordionItem key={execId} value={execId} className="border rounded-lg bg-card overflow-hidden px-2">
                            <AccordionTrigger className="hover:no-underline py-3 px-2">
                              <div className="flex items-center gap-3 w-full">
                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                  <User className="h-4 w-4" />
                                </div>
                                <div className="text-left">
                                  <p className="font-semibold text-sm">{profile?.full_name || "Unknown Executive"}</p>
                                  <p className="text-xs text-muted-foreground">{items.length} items</p>
                                </div>
                                <Badge variant="outline" className="ml-auto mr-2">
                                  {items.length}
                                </Badge>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="pt-2 pb-4 px-2">
                              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                {items.map((item: any) => (
                                  <VerificationCard
                                    key={item.id}
                                    item={item}
                                    onVerify={() => openVerifyDialog(item)}
                                  />
                                ))}
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        );
                      })}
                    </Accordion>
                  </motion.div>
                );
              })}

              {/* Unassigned Showroom */}
              {(() => {
                const unassigned = filteredItems.filter((item: any) => !getShowroomForItem(item));
                if (unassigned.length === 0) return null;

                // Group by Executive within Unassigned
                const execGroups = unassigned.reduce((acc: any, item: any) => {
                  const execId = item.created_by;
                  if (!acc[execId]) acc[execId] = [];
                  acc[execId].push(item);
                  return acc;
                }, {});

                return (
                  <motion.div variants={itemVariants} className="space-y-4">
                    <h2 className="text-lg font-bold px-4">Unassigned Showroom</h2>
                    <Accordion type="multiple" className="space-y-4">
                      {Object.entries(execGroups).map(([execId, items]: [string, any]) => {
                        const profile = profileMap[execId];
                        return (
                          <AccordionItem key={execId} value={execId} className="border rounded-lg bg-card overflow-hidden px-2">
                            <AccordionTrigger className="hover:no-underline py-3 px-2">
                              <div className="flex items-center gap-3 w-full">
                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                  <User className="h-4 w-4" />
                                </div>
                                <div className="text-left">
                                  <p className="font-semibold text-sm">{profile?.full_name || "Unknown Executive"}</p>
                                  <p className="text-xs text-muted-foreground">{items.length} items</p>
                                </div>
                                <Badge variant="outline" className="ml-auto mr-2">
                                  {items.length}
                                </Badge>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="pt-2 pb-4 px-2">
                              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                {items.map((item: any) => (
                                  <VerificationCard
                                    key={item.id}
                                    item={item}
                                    onVerify={() => openVerifyDialog(item)}
                                  />
                                ))}
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        );
                      })}
                    </Accordion>
                  </motion.div>
                );
              })()}
            </div>
          ) : (
            // Standard View (Manager/Admin): Grouped by Executive
            <>
              {filteredItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center opacity-60">
                  <Package className="h-16 w-16 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">No items found</h3>
                  <p className="text-muted-foreground">Try changing the status filter.</p>
                </div>
              ) : (
                <Accordion type="multiple" className="space-y-4" defaultValue={[]}>
                  {(() => {
                    const execGroups = filteredItems.reduce((acc: any, item: any) => {
                      const execId = item.created_by;
                      if (!acc[execId]) acc[execId] = [];
                      acc[execId].push(item);
                      return acc;
                    }, {});

                    return Object.entries(execGroups).map(([execId, items]: [string, any]) => {
                      const profile = profileMap[execId];
                      return (
                          <AccordionItem key={execId} value={execId} className="border rounded-lg bg-card overflow-hidden px-2">
                          <AccordionTrigger className="hover:no-underline py-3 px-2">
                            <div className="flex items-center gap-3 w-full">
                              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                <User className="h-4 w-4" />
                              </div>
                              <div className="text-left">
                                <p className="font-semibold text-sm">{profile?.full_name || "Unknown Executive"}</p>
                                <p className="text-xs text-muted-foreground">{items.length} items</p>
                              </div>
                              <Badge variant="outline" className="ml-auto mr-2">
                                {items.length}
                              </Badge>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="pt-2 pb-4 px-2">
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                              {items.map((item: any) => (
                                <VerificationCard
                                  key={item.id}
                                  item={item}
                                  onVerify={() => openVerifyDialog(item)}
                                />
                              ))}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    });
                  })()}
                </Accordion>
              )}
            </>
          )}
        </motion.div>
      )}

      {/* Dialog */}
      <Dialog open={!!selectedItem} onOpenChange={(open) => { if (!open) { setSelectedItem(null); resetForm(); } }}>
        <DialogContent className="sm:max-w-md bg-popover">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Sparkles className="h-5 w-5 text-primary" />
              {selectedItem?.is_verified ? "Update Verification" : "Verify Work Scope"}
            </DialogTitle>
          </DialogHeader>

          {selectedItem && (
            <div className="space-y-5 py-2">
              <div className="rounded-xl bg-muted/30 p-4 border border-border/50">
                <div className="flex justify-between items-start mb-2">
                  <p className="font-semibold text-base text-foreground">{selectedItem.clients?.name || "—"}</p>
                  {selectedItem.clients?.city && <Badge variant="outline" className="text-[10px] bg-background">{selectedItem.clients.city}</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">
                  {selectedItem.master_work_types?.type_of_work} <span className="text-muted-foreground/40 mx-1">/</span> <span className="text-foreground/80 font-medium">{selectedItem.master_work_types?.sub_work}</span>
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase">Status</Label>
                  <Select value={workStatus} onValueChange={setWorkStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">⏳ Pending — Awaiting Decision</SelectItem>
                      <SelectItem value="hold">⏸️ Hold — Decision Deferred</SelectItem>
                      <SelectItem value="won">✅ Won — Order Confirmed</SelectItem>
                      <SelectItem value="lost">❌ Lost — Order Not Received</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Note: Quotation status is managed by executives from their Visit page.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase">Remarks</Label>
                  <Textarea
                    placeholder="Add any verification notes..."
                    value={verificationRemarks}
                    onChange={(e) => setVerificationRemarks(e.target.value)}
                    rows={2}
                    className="resize-none"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase">Verification Reason <span className="text-[10px] text-muted-foreground font-normal">(optional)</span></Label>
                  <Textarea
                    placeholder="Provide reason for verifying won/lost status..."
                    value={verificationReason}
                    onChange={(e) => setVerificationReason(e.target.value)}
                    rows={2}
                    className="resize-none"
                  />
                </div>
              </div>

              <Button
                className="w-full h-11 text-base font-medium shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-shadow"
                onClick={() => verifyMutation.mutate()}
                disabled={verifyMutation.isPending}
              >
                {verifyMutation.isPending ? "Saving..." : selectedItem.is_verified ? "Update Verification" : "Verify & Save"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

// --- Subcomponents ---

const StatsCard = ({ icon, label, value, color, delay }: { icon: React.ReactNode, label: string, value: number | string, color: string, delay: number }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay, duration: 0.4 }}
  >
    <Card className="border-none shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden group bg-card">
      <div className={`absolute inset-0 bg-gradient-to-br from-${color}-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
      <div className={`absolute left-0 bottom-0 top-0 w-1 bg-${color}-500/50 rounded-r-full`} />
      <CardContent className="p-3 text-center relative z-10">
        <div className={`mx-auto w-8 h-8 rounded-full bg-${color}-100 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform`}>
          {icon}
        </div>
        <p className="text-lg font-bold tracking-tight">{value}</p>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">{label}</p>
      </CardContent>
    </Card>
  </motion.div>
);

const VerificationCard = ({ item, onVerify }: { item: any, onVerify: () => void }) => {
  const statusColors = {
    won: "text-emerald-600 bg-emerald-50 border-emerald-100",
    lost: "text-rose-600 bg-rose-50 border-rose-100",
    pending: "text-amber-600 bg-amber-50 border-amber-100",
    hold: "text-purple-600 bg-purple-50 border-purple-100",
    draft: "text-gray-600 bg-gray-50 border-gray-100",
    submitted: "text-blue-600 bg-blue-50 border-blue-100",
    rejected: "text-red-600 bg-red-50 border-red-100"
  };

  const statusIcon = {
    won: <CheckCircle className="h-3 w-3" />,
    lost: <XCircle className="h-3 w-3" />,
    pending: <Clock className="h-3 w-3" />,
    hold: <Filter className="h-3 w-3" />,
    draft: <FileText className="h-3 w-3" />,
    submitted: <Package className="h-3 w-3" />,
    rejected: <XCircle className="h-3 w-3" />
  };

  const status = item.work_status as keyof typeof statusColors || "submitted";

  return (
    <Card className="border-none shadow-sm hover:shadow-xl transition-all duration-300 bg-card overflow-hidden group h-full flex flex-col">
      <div className="p-4 flex-1">
        <div className="flex justify-between items-start gap-4 mb-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground truncate pr-2">{item.clients?.name || "—"}</h3>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
              <Building2 className="h-3 w-3" />
              {item.clients?.city || "Unknown City"}
            </div>
          </div>
          <Badge variant="outline" className={`shrink-0 capitalize gap-1 ${statusColors[status]} border shadow-sm`}>
            {statusIcon[status]} {status}
          </Badge>
        </div>

        <div className="space-y-3">
          <div className="bg-muted/50 p-2.5 rounded-lg border border-border group-hover:border-primary/20 transition-colors">
            <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider font-semibold">Scope of Work</p>
            <div className="text-sm font-medium text-foreground">
              {item.master_work_types?.type_of_work}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {item.master_work_types?.sub_work}
              {item.quantity && <span className="ml-1">• Qty: {item.quantity}</span>}
            </div>
          </div>

          {item.verification_remarks && (
            <div className="text-xs italic text-muted-foreground px-2 py-1 border-l-2 border-primary/20">
              <span className="font-semibold not-italic text-[10px] text-foreground block">Verification Remarks:</span>
              {item.verification_remarks}
            </div>
          )}

          {item.verification_reason && (
            <div className="text-xs italic text-muted-foreground px-2 py-1 border-l-2 border-amber-500/40 mt-1">
              <span className="font-semibold not-italic text-[10px] text-amber-600 dark:text-amber-400 block">Verification Reason:</span>
              {item.verification_reason}
            </div>
          )}
        </div>
      </div>

      <div className="p-3 bg-muted/30 border-t flex items-center justify-between gap-3">
        {item.is_verified ? (
          <div className="flex items-center gap-1.5 text-emerald-600 text-xs font-medium px-2">
            <ShieldCheck className="h-4 w-4" /> Verified
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-amber-600 text-xs font-medium px-2">
            <Clock className="h-4 w-4" /> Pending Verification
          </div>
        )}
        <Button size="sm" onClick={onVerify} className={item.is_verified ? "h-8 text-xs bg-white text-primary border border-primary/20 hover:bg-primary/5 shadow-sm" : "h-8 text-xs shadow-sm bg-primary text-primary-foreground hover:bg-primary/90"}>
          {item.is_verified ? "Update" : "Verify Now"}
        </Button>
      </div>
    </Card>
  );
};

export default Verification;
