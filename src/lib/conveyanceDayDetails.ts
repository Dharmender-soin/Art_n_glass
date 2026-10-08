import { visitDisplayName } from './visitDisplay';
import { visitMapUrl } from './visitLocation';

export type DayVisit = { id: string; created_by: string; visit_date: string; status: string; done_at?: string | null;
  visit_with_type?: string | null; address?: string | null; actual_address?: string | null;
  gps_latitude?: number | null; gps_longitude?: number | null; clients?: { name: string } | null; partners?: { name: string } | null };
export type DayAttendance = { user_id: string; date: string; created_at: string; ended_at?: string | null };
export type ConveyanceDay = { key: string; userId: string; date: string; start: string | null; end: string | null; visits: DayVisit[] };

export function buildConveyanceDays(attendance: DayAttendance[], visits: DayVisit[], trips: { user_id: string; date: string }[] = []): ConveyanceDay[] {
  const days = new Map<string, ConveyanceDay>();
  const get = (userId: string, date: string) => {
    const key = `${userId}:${date}`;
    if (!days.has(key)) days.set(key, { key, userId, date, start: null, end: null, visits: [] });
    return days.get(key)!;
  };
  attendance.forEach(row => { const day = get(row.user_id, row.date); day.start = row.created_at; day.end = row.ended_at || null; });
  trips.forEach(row => get(row.user_id, row.date));
  visits.filter(row => row.status === 'done').forEach(row => {
    const day = get(row.created_by, row.visit_date);
    if (!day.visits.some(visit => visit.id === row.id)) day.visits.push(row);
  });
  for (const day of days.values()) day.visits.sort((a,b) => (a.done_at || '').localeCompare(b.done_at || ''));
  return [...days.values()].sort((a,b) => b.date.localeCompare(a.date) || a.userId.localeCompare(b.userId));
}

export function actualVisitLocation(visit: DayVisit): string {
  if (visit.actual_address?.trim()) return visit.actual_address.trim();
  return visitMapUrl(visit.gps_latitude, visit.gps_longitude)
    ? `${visit.gps_latitude}, ${visit.gps_longitude}` : 'GPS not recorded';
}

export function dayDetailRows(days: ConveyanceDay[], names: Record<string,string>) {
  const time = (value: string | null | undefined) => value ? new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true }) : 'Not recorded';
  return days.flatMap(day => (day.visits.length ? day.visits : [null]).map(visit => ({
    Date: day.date, Employee: names[day.userId] || day.userId,
    'Employee ID': day.userId, 'Start Day/Time (IST)': time(day.start), 'End Day/Time (IST)': time(day.end),
    'Visits Done': day.visits.length, 'Visit ID': visit?.id || '',
    'Visit': visit ? visitDisplayName(visit) : 'No completed visits',
    'Completed At (IST)': time(visit?.done_at),
    'Planned Address': visit?.address || '',
    'Actual Visit Address / GPS': visit ? actualVisitLocation(visit) : '',
    'Map': visit ? visitMapUrl(visit.gps_latitude, visit.gps_longitude) || '' : '',
  })));
}
