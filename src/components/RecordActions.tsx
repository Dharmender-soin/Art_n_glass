import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useAssignableUsers } from '@/hooks/useAssignableUsers';
import { employeeName } from '@/lib/employeeDisplay';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription } from '@/components/ui/dialog';
import { Select,SelectTrigger,SelectValue,SelectContent,SelectItem } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

export function RecordActions({kind,id,name,ownerId,allowDelete=false,compact=false}: {kind:'client'|'partner';id:string;name:string;ownerId?:string;allowDelete?:boolean;compact?:boolean}) {
  const {role}=useAuth();
  const [action,setAction]=useState<'transfer'|'delete'|null>(null);
  const [target,setTarget]=useState('');
  const [reason,setReason]=useState('');
  const [includeClients,setIncludeClients]=useState(false);
  const people=useAssignableUsers();
  const queries=useQueryClient();
  const save=useMutation({
    mutationFn:async()=>{
      if(!reason.trim()) throw new Error('Enter a reason');
      if(action==='transfer' && !target) throw new Error('Select the receiving executive');
      const {data,error}=await (supabase.rpc as any)('manage_crm_record',{p_kind:kind,p_id:id,p_action:action,p_target:action==='transfer'?target:null,p_include_clients:kind==='partner'&&includeClients,p_reason:reason.trim()});
      if(error) throw error;
      if(action==='transfer' ? !data?.transferred_count : data?.deleted!==true) throw new Error('The action was not confirmed. Refresh before retrying.');
      return data;
    },
    onSuccess:async data=>{await queries.invalidateQueries();toast.success(action==='transfer'?`${data.transferred_count} record(s) transferred`:'Record deleted');setAction(null);},
    onError:(error:Error)=>toast.error(error.message),
  });
  if(!['admin','md','manager'].includes(role||''))return null;
  const open=(next:'transfer'|'delete')=>{setTarget('');setReason('');setIncludeClients(false);save.reset();setAction(next);};
  return <div className="flex flex-wrap gap-2" onClick={event=>event.stopPropagation()}>
    {compact ? <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" size="sm" variant="outline" className="h-6 px-1.5 text-[10px] capitalize">{kind} actions</Button></DropdownMenuTrigger><DropdownMenuContent>
      <DropdownMenuItem onSelect={()=>open('transfer')}>Transfer {kind}</DropdownMenuItem>
      {allowDelete&&<DropdownMenuItem className="text-destructive" onSelect={()=>open('delete')}>Delete {kind}</DropdownMenuItem>}
    </DropdownMenuContent></DropdownMenu> : <>
      <Button type="button" size="sm" variant="outline" onClick={()=>open('transfer')}>Transfer {kind}</Button>
      {allowDelete&&<Button type="button" size="sm" variant="outline" className="text-destructive" onClick={()=>open('delete')}>Delete {kind}</Button>}
    </>}
    <Dialog open={!!action} onOpenChange={value=>{if(!value&&!save.isPending)setAction(null);}}><DialogContent>
      <DialogHeader><DialogTitle>{action==='transfer'?'Transfer':'Delete'} {kind}: {name}</DialogTitle><DialogDescription>{action==='transfer'?'Assign the record to another executive. Original creator and past visit/conveyance history are retained.':'Only records without linked visits or WOS can be deleted. Transfer or close linked records to keep their history.'}</DialogDescription></DialogHeader>
      {action==='transfer'&&<>
        <Select value={target} onValueChange={setTarget} disabled={people.isPending||people.isError||save.isPending}><SelectTrigger aria-label="Receiving executive"><SelectValue placeholder="Select receiving executive"/></SelectTrigger><SelectContent>{(people.data||[]).filter(p=>p.role==='executive'&&p.user_id!==ownerId).map(p=><SelectItem key={p.user_id} value={p.user_id}>{employeeName(p.full_name)}</SelectItem>)}</SelectContent></Select>
        {kind==='partner'&&<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeClients} onChange={e=>setIncludeClients(e.target.checked)}/>Also transfer this partner’s linked clients</label>}
        {people.isError&&<p role="alert" className="text-destructive">{people.error.message}</p>}
      </>}
      <Textarea aria-label="Reason for record action" placeholder="Reason (required)" value={reason} onChange={e=>setReason(e.target.value)}/>
      {save.isError&&<p role="alert" className="text-sm text-destructive">{save.error.message}</p>}
      <Button disabled={save.isPending||!reason.trim()||(action==='transfer'&&!target)} variant={action==='delete'?'destructive':'default'} onClick={()=>save.mutate()}>{save.isPending?'Saving…':action==='transfer'?'Confirm transfer':'Confirm delete'}</Button>
    </DialogContent></Dialog>
  </div>;
}
