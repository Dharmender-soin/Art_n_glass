import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  showroomId: string | null;    // Primary showroom (first) — backward compat
  showroomIds: string[];        // ALL showrooms for this role (multi-showroom managers)
  reportsTo: string | null;    // TL's user_id (for exec), Manager's user_id (for TL)
  loading: boolean;
  authError: string | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  role: null,
  showroomId: null,
  showroomIds: [],
  reportsTo: null,
  loading: true,
  authError: null,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [showroomId, setShowroomId] = useState<string | null>(null);
  const [showroomIds, setShowroomIds] = useState<string[]>([]);
  const [reportsTo, setReportsTo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const rolePriority: Record<AppRole, number> = {
    md: 6,
    admin: 5,
    manager: 4,
    tl: 3,
    accountant: 2,  // Higher than executive so accountant wins if both exist
    executive: 1,
    backhand_executive: 1,
  };

  const fetchRole = async (userId: string) => {
    // Cast to unknown[] to handle reports_to column before DB migration
    const { data: rawData, error } = await supabase
      .from("user_roles")
      .select("role, showroom_id, reports_to")
      .eq("user_id", userId);

    type RoleRow = { role: AppRole; showroom_id: string | null; reports_to?: string | null };
    const data = rawData as RoleRow[] | null;

    if (error) throw error;

    if (data && data.length > 0) {
      // Pick highest priority role
      const best = data.reduce((a, b) =>
        (rolePriority[a.role] || 0) >= (rolePriority[b.role] || 0) ? a : b
      );

      // Collect ALL showroom_ids for the best role (multi-showroom managers)
      const sameRoleRows = data.filter(r => r.role === best.role);
      const allShowroomIds = sameRoleRows
        .map(r => r.showroom_id)
        .filter((id): id is string => !!id);

      return { role: best.role, showroomIds: allShowroomIds, reportsTo: best.reports_to ?? null };
    } else {
      // Auto-assign executive role for new users
      const { error: insertError } = await supabase.from("user_roles").insert({
        user_id: userId,
        role: "executive" as AppRole,
      });
      if (insertError) throw insertError;
      return { role: "executive" as AppRole, showroomIds: [], reportsTo: null };
    }
  };

  const ensureProfile = async (userId: string, fullName: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) return;
    if (!data) {
      await supabase.from("profiles").insert({
        user_id: userId,
        full_name: fullName || "",
      });
    }
  };

  useEffect(() => {
    let active = true;
    let revision = 0;
    let loadedUserId: string | null = null;
    const deferred = new Set<ReturnType<typeof setTimeout>>();
    const failureMessage = "Your account could not be loaded. Check your connection and retry.";
    const clearRole = () => {
      setRole(null);
      setShowroomId(null);
      setShowroomIds([]);
      setReportsTo(null);
    };
    const applySession = (next: Session | null, event?: string) => {
      if (!active) return;
      setSession(next);
      setUser(next?.user ?? null);
      // A routine token refresh should not unmount the page or interrupt a form.
      if (next?.user.id === loadedUserId && (event === "TOKEN_REFRESHED" || event === "SIGNED_IN")) return;
      const request = ++revision;
      loadedUserId = null;
      clearRole();
      setAuthError(null);
      if (!next?.user) {
        setLoading(false);
        return;
      }
      setLoading(true);
      // Supabase auth callbacks run under an auth lock. Fetch database rows
      // only after the callback returns, and ignore results from older sessions.
      const timer = setTimeout(async () => {
        deferred.delete(timer);
        if (!active || request !== revision) return;
        try {
          const resolved = await withAuthTimeout(fetchRole(next.user.id));
          if (!active || request !== revision) return;
          setRole(resolved.role);
          setShowroomIds(resolved.showroomIds);
          setShowroomId(resolved.showroomIds[0] ?? null);
          setReportsTo(resolved.reportsTo);
          loadedUserId = next.user.id;
          void ensureProfile(next.user.id, next.user.user_metadata?.full_name || "").catch(() => {});
        } catch {
          if (active && request === revision) setAuthError(failureMessage);
        } finally {
          if (active && request === revision) setLoading(false);
        }
      }, 0);
      deferred.add(timer);
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, next) => applySession(next, event)
    );

    const initialRevision = revision;
    withAuthTimeout(supabase.auth.getSession()).then(({ data, error }) => {
      if (!active || revision !== initialRevision) return;
      if (error) throw error;
      applySession(data.session);
    }).catch(() => {
      if (!active || revision !== initialRevision) return;
      setAuthError(failureMessage);
      setLoading(false);
    });

    return () => {
      active = false;
      deferred.forEach(clearTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, role, showroomId, showroomIds, reportsTo, loading, authError, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

async function withAuthTimeout<T>(request: PromiseLike<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      request,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Account loading timed out")), 15000);
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}
