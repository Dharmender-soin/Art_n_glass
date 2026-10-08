import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { loadEmployeeNames } from '@/lib/employeeNames';
import { buildReport, indiaDate } from '../../supabase/functions/whatshub/reports';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Staff = { user_id: string; role: string; showroom_id: string | null };
export function LeadershipVisitReports() {
  const { role, user, showroomIds } = useAuth();
  const [mode, setMode] = useState<'tl_outcomes' | 'plan_actual'>('tl_outcomes');
  const [date, setDate] = useState(indiaDate());
  const report = useQuery({
    queryKey: ['leadership-visit-reports', user?.id, role, showroomIds, date, mode], enabled: !!user && !!role && !!date,
    queryFn: async () => {
      const staff = await fetchAllRows<Staff>((from,to) => {
        let query = supabase.from('user_roles').select('user_id,role,showroom_id').eq('is_active',true)
          .in('role',mode === 'tl_outcomes' ? ['tl'] : ['executive','tl','manager']);
        if (role === 'tl') query = query.eq('user_id',user!.id);
        if (role === 'manager') query = query.in('showroom_id',showroomIds.length ? showroomIds : ['00000000-0000-0000-0000-000000000000']);
        return query.order('id').range(from,to) as any;
      });
      const ids = [...new Set(staff.map(person => person.user_id))];
      if (!ids.length) return mode === 'tl_outcomes' ? 'No active team leaders found.' : 'No active managers or team members found.';
      const [{ names }, visits, showroomRows] = await Promise.all([
        loadEmployeeNames(ids),
        fetchAllRows<any>((from,to) => supabase.from('visits').select('*,clients(name),partners(name)').in('created_by',ids).eq('visit_date',date).order('id').range(from,to) as any),
        fetchAllRows<{id:string;name:string}>((from,to) => supabase.from('showrooms').select('id,name').order('id').range(from,to) as any),
      ]);
      let enriched = visits;
      if (mode === 'tl_outcomes') {
        const upcoming = await fetchAllRows<any>((from,to) => supabase.from('visits').select('created_by,client_id,partner_id,visit_date').in('created_by',ids).eq('status','planned').gt('visit_date',date).order('visit_date').order('id').range(from,to) as any);
        enriched = visits.map(visit => ({...visit, next_followup: upcoming.find(next => next.created_by === visit.created_by && ((visit.client_id && next.client_id === visit.client_id) || (visit.partner_id && next.partner_id === visit.partner_id)))?.visit_date }));
      }
      const sections: string[] = [];
      for (const showroomId of [...new Set(staff.map(person => person.showroom_id))]) {
        const team = staff.filter(person => person.showroom_id === showroomId);
        const managers = [...new Set(team.filter(person => person.role === 'manager').map(person => person.user_id))];
        if (mode === 'plan_actual' && !managers.length) continue;
        const people = [...new Set(team.map(person => person.user_id))].map(id => ({user_id:id,full_name:names[id] || 'Name unavailable'}));
        const title = mode === 'plan_actual' ? `Managers: ${managers.map(id => names[id] || 'Name unavailable').join(', ')}\n` : '';
        sections.push(title + buildReport(mode,showroomRows.find(row => row.id === showroomId)?.name || 'Unassigned',date,people,enriched));
      }
      return sections.join('\n\n────────────────────\n\n') || 'No active managers found.';
    },
  });
  const download = () => {
    const url = URL.createObjectURL(new Blob([report.data || ''], {type:'text/plain;charset=utf-8'}));
    const link = document.createElement('a'); link.href = url; link.download = `${mode}_${date}.txt`; link.click(); URL.revokeObjectURL(url);
  };
  return <section className="rounded-xl border bg-card p-4 space-y-4">
    <div className="flex flex-wrap gap-3 items-center">
      <select aria-label="Leadership report" value={mode} onChange={event => setMode(event.target.value as typeof mode)} className="rounded border bg-background px-3 py-2 text-sm">
        <option value="tl_outcomes">TL Outcome Report</option>
        {role !== 'tl' && <option value="plan_actual">Manager Daily Plan vs Actual</option>}
      </select>
      <Input aria-label="Leadership report date" type="date" className="w-auto" value={date} onChange={event => setDate(event.target.value)} />
      <Button variant="outline" onClick={() => report.refetch()} disabled={report.isFetching}>Refresh</Button>
      <Button variant="outline" onClick={download} disabled={!report.data || report.isFetching || report.isError}>Download report</Button>
    </div>
    <p className="text-xs text-muted-foreground">{mode === 'plan_actual' ? 'Includes each manager and their showroom team, including people with no plan. Director/Admin can view all managers. WhatsApp delivery goes to Director personal numbers only.' : 'Completed visits, remarks and next planned follow-up for active Team Leaders.'}</p>
    {report.isFetching ? <p>Generating report…</p> : report.error ? <p role="alert" className="text-destructive">Could not generate report: {report.error.message}</p> : <pre className="whitespace-pre-wrap break-words rounded bg-muted/40 p-4 text-sm">{report.data}</pre>}
  </section>;
}
