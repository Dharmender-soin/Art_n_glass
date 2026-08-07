import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Search, Users, Building2, CalendarCheck, Home, Loader2 } from "lucide-react";

export const GlobalSearch = () => {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const { data: results = [], isLoading } = useQuery({
    queryKey: ["global-search", query],
    enabled: query.trim().length >= 2,
    queryFn: async () => {
      const qStr = `%${query.trim()}%`;
      
      const [clientsRes, partnersRes, visitsRes] = await Promise.all([
        supabase.from("clients").select("id, name, mobile, address, status").or(`name.ilike.${qStr},mobile.ilike.${qStr},address.ilike.${qStr}`).limit(5),
        supabase.from("partners").select("id, name, company_name, mobile").or(`name.ilike.${qStr},company_name.ilike.${qStr},mobile.ilike.${qStr}`).limit(5),
        supabase.from("visits").select("id, purpose, address, visit_date, status").or(`purpose.ilike.${qStr},address.ilike.${qStr}`).limit(5),
      ]);

      const items: { id: string; type: "client" | "partner" | "visit"; title: string; subtitle: string; path: string }[] = [];

      (clientsRes.data || []).forEach((c) => {
        items.push({
          id: `client-${c.id}`,
          type: "client",
          title: c.name,
          subtitle: `${c.mobile} ${c.address ? `• ${c.address}` : ""}`,
          path: `/hierarchy?clientId=${c.id}`,
        });
      });

      (partnersRes.data || []).forEach((p) => {
        items.push({
          id: `partner-${p.id}`,
          type: "partner",
          title: p.name,
          subtitle: `${p.company_name || "Channel Partner"} • ${p.mobile}`,
          path: `/partners`,
        });
      });

      (visitsRes.data || []).forEach((v) => {
        items.push({
          id: `visit-${v.id}`,
          type: "visit",
          title: v.purpose || "Site Visit",
          subtitle: `${v.visit_date} • ${v.address || "Visit location"}`,
          path: `/visits`,
        });
      });

      return items;
    },
  });

  const handleSelect = (path: string) => {
    setOpen(false);
    setQuery("");
    navigate(path);
  };

  return (
    <div ref={containerRef} className="relative flex-1 max-w-sm">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search Property, Lead, Client, Phone..."
          className="pl-8 h-8 text-xs bg-muted/50 border-border/60 focus-visible:bg-background focus-visible:ring-1 transition-all rounded-lg"
        />
        {isLoading && <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>

      {open && query.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-popover border border-border/80 rounded-xl shadow-xl overflow-hidden max-h-80 overflow-y-auto">
          {results.length === 0 && !isLoading ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
              No matching Property, Lead, or Customer found
            </div>
          ) : (
            <div className="p-1 space-y-0.5">
              {results.map((r) => {
                const Icon = r.type === "client" ? Users : r.type === "partner" ? Building2 : CalendarCheck;
                return (
                  <button
                    key={r.id}
                    onClick={() => handleSelect(r.path)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent text-xs flex items-center gap-2.5 transition-colors group"
                  >
                    <div className="p-1.5 rounded-md bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">{r.title}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{r.subtitle}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
