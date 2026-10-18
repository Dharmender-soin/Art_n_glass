import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export function VisitPurposeEditor({ id, purpose, beforeSave }: { id: string; purpose: string; beforeSave: () => Promise<void> }) {
  const [editing,setEditing] = useState(false);
  const [text,setText] = useState(purpose);
  const queries = useQueryClient();
  const save = useMutation({
    mutationFn: async () => {
      if (!text.trim()) throw new Error('Visit purpose is required');
      await beforeSave();
      const {error} = await supabase.from('visits').update({purpose:text.trim()}).eq('id',id)
        .in('status',['planned','in_progress'] as any).select('id').single();
      if(error) throw error;
    },
    onSuccess: async () => { await queries.invalidateQueries(); setEditing(false); toast.success('Visit purpose updated'); },
    onError: (error:Error) => toast.error(error.message),
  });
  return editing ? <div className="flex flex-wrap gap-2">
    <Input aria-label="Edit showroom visit purpose" value={text} onChange={event=>setText(event.target.value)} className="h-8" />
    <Button size="sm" disabled={save.isPending || !text.trim()} onClick={()=>save.mutate()}>Save purpose</Button>
    <Button size="sm" variant="outline" disabled={save.isPending} onClick={()=>setEditing(false)}>Cancel</Button>
  </div> : <Button variant="outline" size="sm" onClick={()=>{setText(purpose);setEditing(true);}}>Edit purpose / remark</Button>;
}
