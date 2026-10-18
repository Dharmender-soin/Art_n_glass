type Visit = {status:string;visit_date:string;done_at?:string|null};
export function dsrActivityDate(visit:Visit): string {
  if(visit.status==='done' && visit.done_at && Number.isFinite(Date.parse(visit.done_at))) {
    return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(visit.done_at));
  }
  return visit.visit_date; // Legacy completed visits retain their recorded date; no timestamp is invented.
}
export function dsrRows<T extends Visit>(visits:T[],from:string,to:string,includePlanned=false): T[] {
  return visits.filter(v=>v.status!=='cancelled'&&(includePlanned||v.status==='done')&&dsrActivityDate(v)>=from&&dsrActivityDate(v)<=to)
    .sort((a,b)=>dsrActivityDate(a).localeCompare(dsrActivityDate(b))||(a.done_at||'').localeCompare(b.done_at||''));
}
export function dsrPlanTotals<T extends Visit>(visits:T[],from:string,to:string) {
  const planned=visits.filter(v=>['planned','in_progress','done'].includes(v.status)&&v.visit_date>=from&&v.visit_date<=to);
  const done=dsrRows(visits,from,to).length;
  const completedPlans=planned.filter(v=>v.status==='done'&&dsrActivityDate(v)>=from&&dsrActivityDate(v)<=to).length;
  return {planned:planned.length,done,rate:planned.length?Math.round(completedPlans/planned.length*100):0};
}
