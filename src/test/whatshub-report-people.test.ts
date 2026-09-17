import { describe, expect, it, vi } from 'vitest';
import { buildReport, loadReportPeople } from '../../supabase/functions/whatshub/reports';

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
function database(roles = roleRows) {
  return { from: vi.fn((table: string) => {
    let rows = table === 'user_roles' ? roles : profiles;
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
  it('includes all three roles once, only when active in the selected showroom', async () => {
    const people = await loadReportPeople(database(), 'gurgaon', 'daily_planning');
    expect(people.map(person => person.user_id).sort()).toEqual(['exec', 'manager', 'tl', 'zero']);
    const visits = profiles.filter(person => person.user_id !== 'zero').map(person => ({
      created_by: person.user_id, status: 'planned', clients: { name: `${person.user_id} visit` }, purpose: 'Meeting',
    }));
    visits.push({ created_by: 'manager', status: 'cancelled', clients: { name: 'Cancelled stop' }, purpose: 'Meeting' });
    const message = buildReport('daily_planning', 'Gurgaon', '2026-09-17', people, visits);
    for (const id of ['exec', 'tl', 'manager']) expect(message).toContain(`${id} visit — Meeting`);
    expect(message).toContain('*4. zero*\n\nNo planned visits');
    expect(message).toContain('*Total planned visits: 3*');
    for (const excluded of ['inactive-', 'other-', 'admin visit', 'md visit', 'accountant visit', 'backhand_executive visit', 'Cancelled stop']) {
      expect(message).not.toContain(excluded);
    }
  });

  it('uses each showroom assignment independently for a multi-showroom manager', async () => {
    const people = await loadReportPeople(database(), 'kirti', 'daily_planning');
    expect(people.map(person => person.user_id).sort()).toEqual(['manager', 'other-executive', 'other-manager', 'other-tl']);
  });

  it('handles no eligible staff without querying unrelated profiles', async () => {
    const client = database([]);
    const people = await loadReportPeople(client, 'gurgaon', 'daily_planning');
    expect(people).toEqual([]);
    expect(client.from).toHaveBeenCalledTimes(1);
    expect(buildReport('daily_planning', 'Gurgaon', '2026-09-17', people, [])).toContain('No active executives, team leaders or managers found.');
  });

  it('surfaces database failures rather than presenting incomplete staff as a valid report', async () => {
    const query = { select: () => query, eq: () => query, in: () => query, order: () => query,
      range: async () => ({ data: null, error: { message: 'Unable to load showroom staff' } }) };
    await expect(loadReportPeople({ from: () => query }, 'gurgaon', 'daily_planning')).rejects.toThrow('Unable to load showroom staff');
  });

  it.each(['plan_actual', 'followups', 'outcomes', 'weekly_summary', 'conveyance'])('preserves the existing participant scope for %s', async key => {
    const people = await loadReportPeople(database(), 'gurgaon', key);
    expect(people.map(person => person.user_id).sort()).toEqual(['exec', 'tl']);
  });
});
