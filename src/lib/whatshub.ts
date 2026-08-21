import { supabase } from "@/integrations/supabase/client";

async function invoke(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("whatshub", { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export const sendInternalShowroomMessage = (showroomId: string, message: string) => invoke({ action: "send_internal", showroomId, message });
export const sendShowroomPlanningNow = (showroomId?: string) => invoke({ action: "send_planning_summaries", ...(showroomId ? { showroomId } : {}) });
