import {describe,it,expect} from 'vitest';
import {employeeName} from '@/lib/employeeDisplay';
import {dsrRows,dsrPlanTotals,dsrActivityDate} from '@/lib/dsrReport';
import {buildReport,reportDue} from '../../supabase/functions/whatshub/reports';

describe('Employee presentation preserves records',()=>{
  it.each(['Mr. Naresh Kumar','mr Naresh Kumar','MR.Naresh Kumar'])('removes the prefix from %s',value=>expect(employeeName(value)).toBe('Naresh Kumar'));
  it('does not change IDs or the original profile and does not shorten Mrinal',()=>{
    const profile={user_id:'employee-123',full_name:'Mr. Naresh Kumar'};
    expect(employeeName(profile.full_name)).toBe('Naresh Kumar');
    expect(profile).toEqual({user_id:'employee-123',full_name:'Mr. Naresh Kumar'});
    expect(employeeName('Mrinal Singh')).toBe('Mrinal Singh');
  });
});
describe('Actual DSR',()=>{
  const rows=[
    {id:'booked',status:'planned',visit_date:'2026-10-07',created_at:'2026-10-07T04:00:00Z'},
    {id:'completed-later',status:'done',visit_date:'2026-10-06',done_at:'2026-10-06T20:00:00Z'},
    {id:'future-completion',status:'done',visit_date:'2026-10-07',done_at:'2026-10-08T04:00:00Z'},
    {id:'legacy',status:'done',visit_date:'2026-10-07',done_at:null},
    {id:'cancelled',status:'cancelled',visit_date:'2026-10-07'},
  ];
  it('counts actual completions using IST, not booked plans or future completions',()=>{
    expect(dsrRows(rows,'2026-10-07','2026-10-07').map(v=>v.id).sort()).toEqual(['completed-later','legacy']);
    expect(dsrActivityDate(rows[1])).toBe('2026-10-07');
    expect(dsrPlanTotals(rows,'2026-10-07','2026-10-07')).toEqual({planned:3,done:2,rate:33});
  });
  it('allows pending-plan comparison without converting plans into actuals',()=>{
    expect(dsrRows(rows,'2026-10-07','2026-10-07',true).map(v=>v.id).sort()).toEqual(['booked','completed-later','legacy']);
    expect(rows[0].status).toBe('planned');
  });
});
describe('Requested WhatsApp reports',()=>{
  const people=[{user_id:'a',full_name:'Mr. Amit'}];
  it('shows location and plain employee names, suppressing only empty follow-ups',()=>{
    const visits=[{created_by:'a',status:'done',clients:{name:'Client'},address:'Sector 9, Gurgaon',purpose:'Meeting',remarks:'Met client'}];
    const planning=buildReport('daily_planning','Gurgaon','2026-10-18',people,visits);
    expect(planning).toContain('1. Amit\n');
    expect(planning).not.toContain('*1. Amit*');
    expect(planning).toContain('Location: Sector 9, Gurgaon');
    expect(buildReport('outcomes','Gurgaon','2026-10-18',people,visits)).not.toContain('Next follow-up:');
    expect(buildReport('outcomes','Gurgaon','2026-10-18',people,[{...visits[0],next_followup:'2026-10-20'}])).toContain('Next follow-up: 2026-10-20');
  });
  it('runs at 10 AM and 9 PM IST; uses true 15-day intervals across month boundaries',()=>{
    expect(reportDue('daily_planning',new Date('2026-10-18T04:30:00Z'))).toBe(true);
    expect(reportDue('daily_planning',new Date('2026-10-18T05:00:00Z'))).toBe(false);
    expect(reportDue('outcomes',new Date('2026-10-18T15:30:00Z'))).toBe(true);
    expect(reportDue('pending_partners',new Date('2026-11-03T04:45:00Z'),'2026-10-19')).toBe(true);
    expect(reportDue('pending_partners',new Date('2026-11-02T04:45:00Z'),'2026-10-19')).toBe(false);
    expect(reportDue('pending_partners',new Date('2026-11-03T04:45:00Z'))).toBe(false);
  });
  it('clears pending using any employee’s completed visit, not just the new owner or a booking',()=>{
    const partners=['recent','old','never','planned'].map(id=>({id,name:id,type:'architect',created_by:'a',city:'Delhi'}));
    const visits=[{partner_id:'recent',created_by:'old-owner',status:'done',done_at:'2026-10-17T04:00:00Z'},
      {partner_id:'old',created_by:'a',status:'done',done_at:'2026-10-03T04:00:00Z'},
      {partner_id:'planned',created_by:'a',status:'planned',visit_date:'2026-10-18'}];
    const message=buildReport('pending_partners','Gurgaon','2026-10-18',people,visits,[],[],partners);
    expect(message).toContain('Total pending partners: 3');
    expect(message).not.toContain('. recent');
    expect(message).toContain('Last completed visit: Never visited');
    expect(message).toContain('Employee: Amit');
  });
});
