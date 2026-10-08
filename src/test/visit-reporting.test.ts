import { describe, expect, it } from 'vitest';
import { buildReport, reportDue } from '../../supabase/functions/whatshub/reports';
import { reportDestination } from '../../supabase/functions/whatshub/report-routing';
import { isCountedVisit, visitDisplayName, visitTypeLabel } from '@/lib/visitDisplay';
import { buildConveyanceDays, dayDetailRows, actualVisitLocation } from '@/lib/conveyanceDayDetails';

describe('Location visit reporting', () => {
  it('includes an own-showroom visit without labelling it as an unlinked client', () => {
    const visit = { id:'showroom',created_by:'employee',visit_date:'2026-10-05',status:'done',visit_with_type:'showroom',address:'Gurgaon Showroom, Gurgaon',purpose:'Meeting' };
    expect(visitTypeLabel(visit)).toBe('Showroom');
    expect(visitDisplayName(visit)).toBe('Gurgaon Showroom, Gurgaon');
    const report = buildReport('daily_planning','Gurgaon','2026-10-05',[{user_id:'employee',full_name:'Employee'}],[visit]);
    expect(report).toContain('Gurgaon Showroom, Gurgaon — Meeting');
    expect(report).toContain('Total planned visits: 1');
    expect(report).not.toContain('Unlinked');
  });
  it('distinguishes a genuinely broken client link from a location-only visit', () => {
    expect(visitDisplayName({visit_with_type:'client',address:'Site 42'})).toBe('Unlinked visit — Site 42');
    expect(visitDisplayName({visit_with_type:'home'})).toBe('Home Visit');
    expect(['planned','in_progress','done','cancelled'].map(status => isCountedVisit({status}))).toEqual([true,true,true,false]);
  });
  it('never routes Plan vs Actual to a showroom and schedules TL outcomes on an actual cron tick', () => {
    expect(reportDestination('plan_actual')).toBe('director');
    expect(reportDestination('daily_planning')).toBe('showroom');
    expect(reportDestination('conveyance')).toBe('management');
    expect(reportDue('tl_outcomes',new Date('2026-10-05T14:00:00Z'))).toBe(true);
  });
});

describe('Conveyance day details', () => {
  const showroom = { id:'visit-1',created_by:'employee',visit_date:'2026-10-05',status:'done',visit_with_type:'showroom',address:'Planned showroom',actual_address:'GPS showroom address',gps_latitude:28.5,gps_longitude:77.1 };
  it('counts unique completed visits including zero-claim/pooled visits and excludes return trips', () => {
    const days = buildConveyanceDays([{user_id:'employee',date:'2026-10-05',created_at:'2026-10-05T04:00:00Z',ended_at:'2026-10-05T13:30:00Z'}],
      [showroom,showroom,{...showroom,id:'pooled'}, {...showroom,id:'pending',status:'planned'}],
      [{user_id:'employee',date:'2026-10-05'},{user_id:'employee',date:'2026-10-05'}]);
    expect(days).toHaveLength(1);
    expect(days[0].visits).toHaveLength(2);
    const rows = dayDetailRows(days,{employee:'Employee'});
    expect(rows[0]['Visits Done']).toBe(2);
    expect(rows[0]['Actual Visit Address / GPS']).toBe('GPS showroom address');
    expect(rows[0]['Planned Address']).toBe('Planned showroom');
    expect(rows[0]['Map']).toContain('28.5,77.1');
    expect(rows[0]['Start Day/Time (IST)']).toContain('9:30');
  });
  it('keeps employee/date boundaries and does not invent missing GPS or day-end time', () => {
    const days = buildConveyanceDays([], [showroom,{...showroom,id:'other',created_by:'other'}]);
    expect(days).toHaveLength(2);
    expect(days.every(day => day.end === null && day.start === null)).toBe(true);
    expect(actualVisitLocation({...showroom,actual_address:null,gps_latitude:null,gps_longitude:null})).toBe('GPS not recorded');
    expect(actualVisitLocation({...showroom,actual_address:null})).toBe('28.5, 77.1');
  });
});
