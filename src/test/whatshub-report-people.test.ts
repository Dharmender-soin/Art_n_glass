import { describe, expect, it, vi } from 'vitest';
import { buildReport, loadReportPeople, loadManagerReportAssignments } from '../../supabase/functions/whatshub/reports';

type Row = Record<string, unknown>;
const roleRows: Row[] = [
  { user_id: 'exec', role: 'executive', showroom_id: 'gurgaon', is_active: true },
  { user_id: 'tl', role: 'tl', showroom_id: 'gurgaon', is_active: true },
  { user_id: 'manager', role: 'manager', showroom_id: 'gurgaon', is_active: true },
  { user_id: 'zero', role: 'manager', showroom_id: 'gurgaon', is_active: true },
  { user_id: 'tl', role: 'executive', showroom_id: 'gurgaon', is_active: true },
  { user_id: 'manager', role: 'manager', showroom_id: 'kirti', is_active: true },
  ...['admin', 'md', 'accountant', 'backhand_executive'].map(role => ({ user_id: role, role, showroom_id: 'gurgaon', is_active: true })),
  ...['executive', 'tl', 'manager'].flatMap(role => [
    { user_id: `inactive-${role}`, role, showroom_id: 'gurgaon', is_active: false },
    { user_id: `other-${role}`, role, showroom_id: 'kirti', is_active: true },
  ]),
];
const profiles = [...new Set(roleRows.map(row => row.user_id))].map(user_id => ({ user_id, full_name: user_id }));

// Execute the production query's filters against a mixed-showroom fixture.
function database(roles = roleRows, exclusions: Row[] = []) {
  return { from: vi.fn((table: string) => {
    let rows = table === 'user_roles' ? roles : table === 'whatshub_report_exclusions' ? exclusions : profiles;
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => { rows = rows.filter(row => row[column] === value); return query; },
      in: (column: string, values: unknown[]) => { rows = rows.filter(row => values.includes(row[column])); return query; },
      order: () => query,
      range: async (from: number, to: number) => ({ data: rows.slice(from, to + 1), error: null }),
    };
    return query;
  }) };
}

describe('Daily planning report staff', () => {
  it('includes active executives and TLs once while excluding managers from showroom planning', async () => {
    const people = await loadReportPeople(database(), 'gurgaon', 'daily_planning');
    expect(people.map(person => person.user_id).sort()).toEqual(['exec', 'tl']);
    const visits = profiles.filter(person => person.user_id !== 'zero').map(person => ({
      created_by: person.user_id, status: 'planned', clients: { name: `${person.user_id} visit` }, purpose: 'Meeting',
    }));
    visits.push({ created_by: 'manager', status: 'cancelled', clients: { name: 'Cancelled stop' }, purpose: 'Meeting' });
    const message = buildReport('daily_planning', 'Gurgaon', '2026-09-17', people, visits);
    for (const id of ['exec', 'tl']) expect(message).toContain(`${id} visit — Meeting`);
    expect(message).not.toContain('manager visit');
    expect(message).toContain('*Total planned visits: 2*');
    for (const excluded of ['inactive-', 'other-', 'admin visit', 'md visit', 'accountant visit', 'backhand_executive visit', 'Cancelled stop']) {
      expect(message).not.toContain(excluded);
    }
  });

  it('uses each showroom assignment independently for a multi-showroom manager', async () => {
    const people = await loadReportPeople(database(), 'kirti', 'plan_actual');
    expect(people.map(person => person.user_id).sort()).toEqual(['manager', 'other-manager']);
  });

  it('omits an excluded manager from every showroom and the consolidated roster while retaining zero-plan managers', async () => {
    const client = database(roleRows, [{ user_id: 'manager', report_key: 'plan_actual' }]);
    expect((await loadManagerReportAssignments(client)).some(row => row.user_id === 'manager')).toBe(false);
    const people = await loadReportPeople(client, 'gurgaon', 'plan_actual');
    expect(people.map(person => person.user_id)).toEqual(['zero']);
    const report = buildReport('plan_actual', 'Gurgaon', '2026-10-22', people, [
      { created_by: 'manager', status: 'done', created_at: '2026-10-22T04:00:00Z' },
    ]);
    expect(report).toContain('1. zero');
    expect(report).toContain('Total completed: 0');
    expect(report).not.toContain('manager');
    expect((await loadReportPeople(client, 'kirti', 'plan_actual')).map(person => person.user_id)).toEqual(['other-manager']);
    expect(roleRows.filter(row => row.user_id === 'manager').every(row => row.is_active)).toBe(true);
  });

  it('keeps an excluded manager excluded after a rename or unassigned-showroom change', async () => {
    const client = database([{ user_id: 'manager', role: 'manager', showroom_id: null, is_active: true }],
      [{ user_id: 'manager', report_key: 'plan_actual' }]);
    expect(await loadManagerReportAssignments(client)).toEqual([]);
  });

  it('does not use Manager-report exclusions to remove people from other reports', async () => {
    const client = database(roleRows, [{ user_id: 'exec', report_key: 'plan_actual' }]);
    expect((await loadReportPeople(client, 'gurgaon', 'daily_planning')).map(person => person.user_id)).toContain('exec');
  });

  it('stops rather than including excluded managers when exclusion settings cannot be read', async () => {
    const client = database();
    const originalFrom = client.from;
    const broken = { select: () => broken, eq: () => broken, order: () => broken,
      range: async () => ({ data: null, error: { message: 'Report exclusions unavailable' } }) };
    await expect(loadManagerReportAssignments({ from: (table: string) =>
      table === 'whatshub_report_exclusions' ? broken : originalFrom(table)
    })).rejects.toThrow('Report exclusions unavailable');
  });

  it('handles no eligible staff without querying unrelated profiles', async () => {
    const client = database([]);
    const people = await loadReportPeople(client, 'gurgaon', 'daily_planning');
    expect(people).toEqual([]);
    expect(client.from).toHaveBeenCalledTimes(1);
    expect(buildReport('daily_planning', 'Gurgaon', '2026-09-17', people, [])).toContain('No active executives or team leaders found.');
  });

  it('surfaces database failures rather than presenting incomplete staff as a valid report', async () => {
    const query = { select: () => query, eq: () => query, in: () => query, order: () => query,
      range: async () => ({ data: null, error: { message: 'Unable to load showroom staff' } }) };
    await expect(loadReportPeople({ from: () => query }, 'gurgaon', 'daily_planning')).rejects.toThrow('Unable to load showroom staff');
  });

  it.each(['followups', 'weekly_summary', 'conveyance'])('preserves the existing participant scope for %s', async key => {
    const people = await loadReportPeople(database(), 'gurgaon', key);
    expect(people.map(person => person.user_id).sort()).toEqual(['exec', 'tl']);
  });
  it.each(['plan_actual', 'outcomes'])('keeps manager activity separate from showroom outcomes for %s', async key => {
    const people = await loadReportPeople(database(), 'gurgaon', key);
    expect(people.map(person => person.user_id).sort()).toEqual(key === 'plan_actual' ? ['manager','zero'] : ['exec','tl']);
  });
  it('generates the dedicated TL report only for active TLs', async () => {
    const people = await loadReportPeople(database(), 'gurgaon', 'tl_outcomes');
    expect(people.map(person => person.user_id)).toEqual(['tl']);
  });
  it('excludes managers with a second TL or executive role from every group visit report',async()=>{
    const db=database([...roleRows,{user_id:'manager',role:'tl',showroom_id:'gurgaon',is_active:true}]);
    for(const key of ['daily_planning','outcomes','tl_outcomes','pending_partners']) {
      expect((await loadReportPeople(db,'gurgaon',key)).map(p=>p.user_id)).not.toContain('manager');
    }
  });
});
