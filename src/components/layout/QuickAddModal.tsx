import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plus, Users, Home, CalendarCheck, GitBranch, Building2, ChevronRight, Sparkles } from "lucide-react";

export const QuickAddModal = () => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const handleAction = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  const quickActions = [
    {
      id: "lead",
      title: "New Lead / Client",
      description: "Add a new buyer, tenant, or lead profile",
      icon: Users,
      color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
      path: "/clients?action=new",
    },
    {
      id: "property",
      title: "Add Property",
      description: "List a new residential or commercial property",
      icon: Home,
      color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
      path: "/clients?action=new_property",
    },
    {
      id: "visit",
      title: "Schedule Site Visit",
      description: "Plan a property tour with customer",
      icon: CalendarCheck,
      color: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
      path: "/visits?action=new",
    },
    {
      id: "deal",
      title: "Create Deal",
      description: "Start negotiation or WOS pipeline entry",
      icon: GitBranch,
      color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
      path: "/hierarchy",
    },
    {
      id: "partner",
      title: "Add Owner / Partner",
      description: "Register a channel partner, builder, or owner",
      icon: Building2,
      color: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
      path: "/partners?action=new",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 h-8 font-bold shadow-xs">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Quick Add</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-popover sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Sparkles className="h-4 w-4 text-primary" />
            Quick Action Centre
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2 py-2">
          {quickActions.map((act) => {
            const Icon = act.icon;
            return (
              <button
                key={act.id}
                onClick={() => handleAction(act.path)}
                className="w-full text-left flex items-center justify-between p-3 rounded-xl border border-border/60 hover:border-primary/40 bg-card hover:bg-muted/50 transition-all duration-200 group"
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl border ${act.color} group-hover:scale-105 transition-transform`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">{act.title}</p>
                    <p className="text-[11px] text-muted-foreground">{act.description}</p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
};
