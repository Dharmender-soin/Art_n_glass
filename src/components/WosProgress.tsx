import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export const progressLabels: Record<string, string> = { not_started: 'Not Started', in_progress: 'In Progress', completed: 'Completed' };

/** Execution progress is independent of the commercial Won/Lost stage. */
export function WosProgress({ id, value }: { id: string; value?: string | null }) {
  const { role } = useAuth();
  const client = useQueryClient();
  const update = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await supabase.rpc('set_wos_execution_status', { p_id: id, p_status: status });
      if (error) throw error;
    },
    onSuccess: async () => {
      // The same item appears in Hierarchy, client WOS, verification and pipeline.
      await client.invalidateQueries();
      toast.success('WOS progress updated');
    },
    onError: (error: Error) => toast.error(`Could not update WOS progress: ${error.message}`),
  });
  const editable = ['executive', 'tl', 'manager', 'admin', 'md'].includes(role || '');
  if (!value) return <span className="block text-[10px] text-muted-foreground">Progress unavailable</span>;
  if (!editable) return <span className="text-xs">{progressLabels[value || 'not_started']}</span>;
  return <select aria-label="WOS execution status" title="Work progress" value={value || 'not_started'} disabled={update.isPending}
    onClick={event => event.stopPropagation()} onChange={event => update.mutate(event.target.value)}
    className="mt-1 w-full min-w-0 rounded border bg-background px-1 py-1 text-[10px] text-foreground disabled:opacity-50">
    {Object.entries(progressLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
  </select>;
}
