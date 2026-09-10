import { describe, it, expect, vi } from 'vitest';
import { buildReport, reportDefinitions, reportDue, indiaDate, allRows } from '../../supabase/functions/whatshub/reports';

const people = [{user_id:'active',full_name:'Amit'}];
const visits = [
  {created_by:'active',status:'done',purpose:'Site visit',clients:{name:'Client A'},visit_date:'2026-09-10',remarks:'Measured',next_followup:'2026-09-12'},
  {created_by:'inactive',status:'planned',purpose:'Hidden',clients:{name:'Hidden client'}},
  {created_by:'active',status:'cancelled',purpose:'Cancelled'},
];
describe('WhatsApp operational reports', () => {
  it('excludes inactive people and cancelled visits from all report totals', () => {
    for (const r of reportDefinitions) {
      const message = buildReport(r.key,'Gurgaon','2026-09-10',people,visits);
      expect(message).not.toContain('Hidden');
      expect(message).not.toContain('Cancelled');
    }
    expect(buildReport('daily_planning','Gurgaon','2026-09-10',people,visits)).toContain('*Total planned visits: 1*');
  });
  it('preserves the requested WhatsApp planning format and zero-plan executives', () => {
    const message = buildReport('daily_planning','Gurgaon','2026-09-10',[...people,{user_id:'second',full_name:'Bina'}],visits);
    expect(message).toContain('*1. Amit*\n\n1. Client A — Site visit');
    expect(message).toContain('*2. Bina*\n\nNo planned visits');
  });
  it('shows actual outcome and linked future visit without treating TAT as follow-up', () => {
    const message = buildReport('outcomes','Gurgaon','2026-09-10',people,visits);
    expect(message).toContain('Remarks: Measured\nNext follow-up: 2026-09-12');
  });
  it('separates visits added after the 10:30 IST cutoff from the morning plan', () => {
    const message = buildReport('plan_actual','Gurgaon','2026-09-10',people,[
      {...visits[0],created_at:'2026-09-10T04:59:00Z'},
      {...visits[0],status:'planned',created_at:'2026-09-10T04:30:00Z'},
      {...visits[0],created_at:'2026-09-10T05:01:00Z'},
    ]);
    expect(message).toContain('Planned by 10:30: 2 | Completed: 1 | Pending: 1');
    expect(message).toContain('Plan completion: 50%');
    expect(message).toContain('Added after 10:30: 1 | Completed: 1');
  });
  it('does not include deactivated claims and flags missing coordinates', () => {
    const message = buildReport('conveyance','Gurgaon','2026-09-10',people,[],[{user_id:'active',amount:80,distance_km:10,from_lat:null},{user_id:'inactive',amount:9999,distance_km:999}]);
    expect(message).toContain('Claim: INR 80.00');
    expect(message).toContain('Review required');
    expect(message).not.toContain('9999');
  });
  it('uses IST and sends weekly reports only on Saturday at their scheduled time', () => {
    expect(indiaDate(new Date('2026-09-10T19:00:00Z'))).toBe('2026-09-11');
    expect(reportDue('daily_planning',new Date('2026-09-10T05:00:00Z'))).toBe(true);
    expect(reportDue('weekly_summary',new Date('2026-09-12T12:30:00Z'))).toBe(true);
    expect(reportDue('weekly_summary',new Date('2026-09-11T12:30:00Z'))).toBe(false);
    expect(reportDue('weekly_summary',new Date('2026-09-12T12:45:00Z'))).toBe(false);
  });
  it('fetches all pages and surfaces query failure instead of a misleading empty report', async () => {
    const range = vi.fn().mockResolvedValueOnce({data:Array(500).fill({id:1}),error:null}).mockResolvedValueOnce({data:[{id:2}],error:null});
    expect(await allRows({range})).toHaveLength(501);
    expect(range).toHaveBeenLastCalledWith(500,999);
    await expect(allRows({range:vi.fn().mockResolvedValue({error:{message:'Database unavailable'}})})).rejects.toThrow('Database unavailable');
  });
});
