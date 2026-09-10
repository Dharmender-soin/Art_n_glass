export const reportDefinitions = [
  { key: 'daily_planning', title: 'Daily Planned Visits', time: '10:30', weekly: false },
  { key: 'plan_actual', title: 'Plan vs Actual', time: '19:00', weekly: false },
  { key: 'followups', title: 'Pending Follow-ups', time: '10:00', weekly: false },
  { key: 'outcomes', title: 'Visit Outcomes', time: '19:15', weekly: false },
  { key: 'weekly_summary', title: 'Weekly Showroom Summary', time: '18:00', weekly: true },
  { key: 'conveyance', title: 'Conveyance Review', time: '18:15', weekly: true },
] as const;

export function indiaDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function reportDue(key: string, now = new Date()) {
  const definition = reportDefinitions.find(r => r.key === key);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  const day = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' }).format(now);
  return !!definition && definition.time === time && (!definition.weekly || day === 'Sat');
}
export function weekStart(date: string) {
  return new Date(Date.parse(`${date}T00:00:00Z`) - 6 * 86400000).toISOString().slice(0, 10);
}
type Row = Record<string, any>;
export function buildReport(key: string, showroom: string, date: string, people: Row[], visits: Row[], claims: Row[] = [], clients: Row[] = []) {
  const definition = reportDefinitions.find(r => r.key === key);
  if (!definition) throw new Error('Unknown report');
  const ids = new Set(people.map(p => p.user_id));
  visits = visits.filter(v => ids.has(v.created_by) && v.status !== 'cancelled');
  claims = claims.filter(c => ids.has(c.user_id));
  clients = clients.filter(c => ids.has(c.created_by));
  const title = key === 'daily_planning' ? 'DAILY PLANNED VISITS REPORT' : `${definition.title.toUpperCase()} REPORT`;
  const sections = [...people].sort((a,b) => (a.full_name || '').localeCompare(b.full_name || '')).map((p, i) => {
    const rows = visits.filter(v => v.created_by === p.user_id);
    const target = (v: Row) => v.clients?.name || v.partners?.name || 'Unlinked visit';
    let detail = '';
    if (key === 'daily_planning') detail = rows.map((v,j) => `${j+1}. ${target(v)} — ${v.purpose || 'Purpose not specified'}`).join('\n') || 'No planned visits';
    if (key === 'plan_actual' || key === 'weekly_summary') {
      const done = rows.filter(v => v.status === 'done').length;
      detail = `Recorded visits: ${rows.length} | Completed: ${done} | Pending: ${rows.length-done}\nCompletion: ${rows.length ? Math.round(done/rows.length*100) : 0}%`;
      if (key === 'plan_actual') {
        const cutoff = Date.parse(`${date}T10:30:00+05:30`);
        const planned = rows.filter(v => v.created_at && Date.parse(v.created_at) <= cutoff);
        const later = rows.filter(v => v.created_at && Date.parse(v.created_at) > cutoff);
        const completed = planned.filter(v => v.status === 'done').length;
        detail = `Planned by 10:30: ${planned.length} | Completed: ${completed} | Pending: ${planned.length-completed}\nPlan completion: ${planned.length ? Math.round(completed/planned.length*100) : 0}%\nAdded after 10:30: ${later.length} | Completed: ${later.filter(v => v.status === 'done').length}\nTotal completed: ${done}`;
      } else {
        const added = clients.filter(c => c.created_by === p.user_id);
        detail += `\nNew clients: ${added.length}\nNew clients now converted: ${added.filter(c => c.status === 'converted').length}`;
      }
    }
    if (key === 'followups') detail = rows.map((v,j) => `${j+1}. ${target(v)} — ${v.purpose}\nDue: ${v.visit_date}${v.visit_date < date ? ' (Overdue)' : ' (Today)'}`).join('\n') || 'No pending follow-ups';
    if (key === 'outcomes') detail = rows.filter(v => v.status === 'done').map((v,j) => `${j+1}. ${target(v)} — ${v.purpose}\nRemarks: ${v.remarks || 'Not entered'}\nNext follow-up: ${v.next_followup || 'Not entered'}`).join('\n') || 'No completed visits';
    if (key === 'conveyance') {
      const trips = claims.filter(c => c.user_id === p.user_id);
      const review = trips.filter(c => [c.from_lat,c.from_lng,c.to_lat,c.to_lng].some(x => x == null) || (c.from_lat === 0 && c.from_lng === 0) || (c.to_lat === 0 && c.to_lng === 0)).length;
      detail = `Trips: ${trips.length} | KM: ${trips.reduce((s,c) => s+Number(c.distance_km || 0),0).toFixed(1)}\nClaim: INR ${trips.reduce((s,c) => s+Number(c.amount || 0),0).toFixed(2)}\nMissing trip coordinates: ${review} — ${review ? 'Review required' : 'None'}\nGPS route continuity: not verified by this report`;
    }
    return `*${i+1}. ${p.full_name || 'Executive'}*\n\n${detail}`;
  });
  return `*${title}*\n*Showroom:* ${showroom}\n*Date:* ${definition.weekly ? `${weekStart(date)} to ${date}` : date}\n\n${sections.join('\n\n') || 'No active executives found.'}\n\n${key === 'daily_planning' ? `*Total planned visits: ${visits.length}*\n` : ''}${key === 'followups' ? 'Based on pending visits due today or earlier.\n' : ''}${key === 'plan_actual' ? 'Plan uses visit creation time with a 10:30 AM IST cutoff.\n' : ''}${key === 'weekly_summary' ? 'Conversions show current status of clients created in this period.\n' : ''}— Art N Glass`;
}

// Fetch every page and fail visibly rather than sending a truncated/empty report on errors.
export async function allRows(query: any): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await query.range(from, from+499);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < 500) return rows;
  }
}
