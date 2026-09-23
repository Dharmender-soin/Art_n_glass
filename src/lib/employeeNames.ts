import { supabase } from "@/integrations/supabase/client";

type EmployeeName = { user_id: string; full_name: string | null };

export const unavailableEmployeeName = (userId: string) => `Name unavailable (${userId.slice(0, 8)})`;

/** Recover names omitted by profile RLS or missing profiles without exposing account details. */
export async function resolveEmployeeNames(userIds: string[], profiles: EmployeeName[]) {
  const ids = [...new Set(userIds.filter(Boolean))];
  const names: Record<string, string> = {};
  for (const profile of profiles) {
    if (profile.full_name?.trim()) names[profile.user_id] = profile.full_name.trim();
  }
  const missing = ids.filter(id => !names[id]);
  for (let offset = 0; offset < missing.length; offset += 100) {
    const requested = missing.slice(offset, offset + 100);
    // The RPC is restricted to the caller's permitted employees on the server.
    const { data, error } = await supabase.rpc("get_employee_display_names", { p_user_ids: requested });
    if (error) continue; // Keep known names usable while the database migration is pending.
    for (const row of (data || []) as EmployeeName[]) {
      if (requested.includes(row.user_id) && row.full_name?.trim()) names[row.user_id] = row.full_name.trim();
    }
  }
  return { names, unresolvedIds: ids.filter(id => !names[id]) };
}

export async function loadEmployeeNames(userIds: string[], workItemNames: EmployeeName[] = []) {
  const profiles: EmployeeName[] = [...workItemNames];
  const ids = [...new Set(userIds.filter(Boolean))];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { data, error } = await supabase.from("profiles").select("user_id, full_name").in("user_id", ids.slice(offset, offset + 100));
    if (error) throw error;
    profiles.push(...(data || []));
  }
  return resolveEmployeeNames(ids, profiles);
}
