// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { loadDirectorReport, loadReportPeople, loadVisitReportRows, reportDue } from '../../supabase/functions/whatshub/reports';
import { runScheduledDirectorReports } from '../../supabase/functions/whatshub/director-schedules';
import { directorReportKeys, reportDestination, directorIdempotencyKey } from '../../supabase/functions/whatshub/report-routing';

const db = new PGlite();
// Execute the production query filters against PostgreSQL, including its timestamp semantics.
function query(table: string) {
  const clauses: string[] = [], values: unknown[] = [], order: string[] = [];
  const name = (value: string) => { if (!/^[a-z_]+$/.test(value)) throw new Error('Unsafe test identifier'); return value; };
  const parameter = (value: unknown) => { values.push(value); return '$' + values.length; };
  const condition = (column: string, operator: string, value: unknown) => {
    if (operator === 'is' && value === 'null') return `${name(column)} IS NULL`;
    const sql = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }[operator];
    if (!sql) throw new Error('Unsupported test operator');
    return `${name(column)} ${sql} ${parameter(value)}`;
  };
  const add = (column: string, op: string, value: unknown) => { clauses.push(condition(column, op, value)); return builder; };
  const execute = async (sql: string, params: unknown[]) => {
    try {
      const rows = (await db.query(sql, params)).rows as Record<string, unknown>[];
      // PostgREST serializes dates as strings; PGlite's driver returns Date objects.
      return { data: rows.map(row => Object.fromEntries(Object.entries(row).map(([column, value]) =>
        [column, value instanceof Date ? (column === 'visit_date' ? value.toISOString().slice(0, 10) : value.toISOString()) : value]))), error: null };
    }
    catch (error: any) { return { data: null, error: { message: error.message, code: error.code } }; }
  };
  const builder = {
    select: (_columns?: string) => builder,
    eq: (column: string, value: unknown) => add(column, 'eq', value),
    neq: (column: string, value: unknown) => add(column, 'neq', value),
    gt: (column: string, value: unknown) => add(column, 'gt', value),
    gte: (column: string, value: unknown) => add(column, 'gte', value),
    lte: (column: string, value: unknown) => add(column, 'lte', value),
    in: (column: string, items: unknown[]) => { clauses.push(items.length ? `${name(column)} IN (${items.map(parameter).join(',')})` : 'FALSE'); return builder; },
    or: (expression: string) => {
      const groups = [...expression.matchAll(/and\(([^)]+)\)/g)].map(match => match[1].split(',').map(term => {
        const [column, op, ...value] = term.split('.');
        return condition(column, op, value.join('.'));
      }).join(' AND '));
      if (groups.length !== 2) throw new Error('Unsupported test expression');
      clauses.push('(' + groups.map(group => '(' + group + ')').join(' OR ') + ')');
      return builder;
    },
    order: (column: string) => { order.push(name(column)); return builder; },
    range: (from: number, to: number) => execute(`SELECT * FROM ${name(table)}${clauses.length ? ' WHERE ' + clauses.join(' AND ') : ''}${order.length ? ' ORDER BY ' + order.join(',') : ''} LIMIT ${to - from + 1} OFFSET ${from}`, values),
    insert: (row: Record<string, unknown>) => execute(`INSERT INTO ${name(table)} (${Object.keys(row).map(name).join(',')}) VALUES (${Object.keys(row).map((_, i) => '$' + (i + 1)).join(',')}) RETURNING *`, Object.values(row)),
    update: (row: Record<string, unknown>) => ({ match: (match: Record<string, unknown>) => execute(
      `UPDATE ${name(table)} SET ${Object.keys(row).map((column, i) => name(column) + '=$' + (i + 1)).join(',')} WHERE ${Object.keys(match).map((column, i) => name(column) + '=$' + (i + 1 + Object.keys(row).length)).join(' AND ')}`,
      [...Object.values(row), ...Object.values(match)],
    ) }),
  };
  return builder;
}
const client = { from: query };
const date = '2026-10-23';
const legacySettings = [{ report_key: 'plan_actual', enabled: true, showroom_id: 'gurgaon' }];
const migration = readFileSync('supabase/migrations/20261023100000_director_planning_and_outcomes.sql', 'utf8');

beforeAll(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE whatshub_report_exclusions(report_key text, user_id text);
    CREATE TABLE whatshub_director_report_runs(report_key text CHECK(report_key = 'plan_actual'), report_date date, status text DEFAULT 'running', error text, PRIMARY KEY(report_key,report_date));
    CREATE TABLE whatshub_report_settings(showroom_id text, report_key text, enabled boolean);
    CREATE TABLE user_roles(id serial, user_id text, showroom_id text, role text, is_active boolean DEFAULT true);
    CREATE TABLE profiles(user_id text, full_name text);
    CREATE TABLE showrooms(id text, name text, whatsapp_planning_enabled boolean DEFAULT true);
    CREATE TABLE visits(id text, created_by text, status text, visit_date date, created_at timestamptz, done_at timestamptz, client_id text, partner_id text, clients jsonb, partners jsonb, purpose text, remarks text, address text);
    INSERT INTO whatshub_report_settings VALUES ('gurgaon','outcomes',true),('gurgaon','plan_actual',true),('kirti','outcomes',false);
    INSERT INTO showrooms VALUES ('gurgaon','Gurgaon',true),('kirti','Kirti Nagar',false);
  `);
  await db.exec(migration);
}, 30000);
afterAll(() => db.close());
beforeEach(async () => {
  await db.exec(`
    TRUNCATE user_roles, profiles, visits, whatshub_report_exclusions, whatshub_director_report_runs;
    UPDATE whatshub_director_report_settings SET enabled = true;
    INSERT INTO user_roles(user_id,showroom_id,role) VALUES
      ('test','gurgaon','manager'),('manager','gurgaon','manager'),('manager','kirti','manager'),
      ('zero','kirti','manager'),('unassigned',null,'manager'),('executive','gurgaon','executive'),('tl','gurgaon','tl');
    INSERT INTO profiles VALUES ('test','Gurgaon Manager'),('manager','Mr. Indal Singh'),('zero','Sandeep'),('unassigned','Pravesh'),('executive','Executive'),('tl','Team Leader');
    INSERT INTO whatshub_report_exclusions VALUES ('plan_actual','test');
    INSERT INTO visits VALUES
      ('planned','manager','planned','2026-10-23','2026-10-23T04:00:00Z',null,'planned-client',null,'{"name":"Planned client","address":"Sector 9"}',null,'Site visit',null,null),
      ('done','manager','done','2026-10-23','2026-10-23T04:00:00Z','2026-10-23T12:00:00Z','client',null,'{"name":"Completed client"}',null,'Meeting','Order confirmed','Delhi'),
      ('old-plan-done-today','unassigned','done','2026-10-22','2026-10-22T04:00:00Z','2026-10-22T18:30:00Z','older-client',null,'{"name":"Older plan completed today"}',null,'Follow up','Measured',null),
      ('end-boundary','unassigned','done','2026-10-23','2026-10-23T04:00:00Z','2026-10-23T18:30:00Z','tomorrow',null,'{"name":"Completed tomorrow"}',null,'Meeting','Late',null),
      ('legacy','manager','done','2026-10-23','2026-10-23T04:00:00Z',null,'legacy-client',null,'{"name":"Legacy completion"}',null,'Meeting','Legacy',null),
      ('cancelled','manager','cancelled','2026-10-23','2026-10-23T04:00:00Z',null,null,null,'{"name":"Cancelled client"}',null,'Meeting',null,null),
      ('test-visit','test','done','2026-10-23','2026-10-23T04:00:00Z','2026-10-23T12:00:00Z',null,null,'{"name":"Test-only visit"}',null,'Test','Test',null),
      ('executive-visit','executive','done','2026-10-23','2026-10-23T04:00:00Z','2026-10-23T12:00:00Z',null,null,'{"name":"Executive-only visit"}',null,'Meeting','Done',null),
      ('followup','manager','planned','2026-10-26','2026-10-23T12:00:00Z',null,'client',null,'{"name":"Future followup"}',null,'Meeting',null,null);
  `);
});

describe('Director planning and outcomes', () => {
  it('includes every eligible showroom and zero/unassigned managers, with location and no test account', async () => {
    const report = await loadDirectorReport(client, 'manager_planning', date);
    expect(report).toContain('DIRECTOR — ALL MANAGERS DAILY PLANNING');
    for (const text of ['Gurgaon', 'Kirti Nagar', 'Unassigned managers', 'Indal Singh', 'Sandeep', 'Pravesh', 'Planned client — Site visit', 'Location: Sector 9', 'No planned visits']) expect(report).toContain(text);
    for (const text of ['Gurgaon Manager', 'Test-only visit', 'Executive-only visit', 'Cancelled client', 'Future followup', 'Mr.']) expect(report).not.toContain(text);
  });
  it('uses IST completion dates including unassigned managers, without counting booked plans', async () => {
    const report = await loadDirectorReport(client, 'manager_outcomes', date);
    for (const text of ['VISIT OUTCOMES', 'Completed client', 'Remarks: Order confirmed', 'Next follow-up: 2026-10-26', 'Older plan completed today', 'Legacy completion', 'No completed visits']) expect(report).toContain(text);
    for (const text of ['Planned client', 'Completed tomorrow', 'Gurgaon Manager', 'Test-only visit', 'Executive-only visit', 'Not entered\nNext follow-up']) expect(report).not.toContain(text);
    expect(report).toContain('Total completed visits: 2');
    expect(report).toContain('Total completed visits: 1');
  });
  it.each(['manager_planning', 'manager_outcomes', 'plan_actual'])('keeps %s in the Director channel with the same excluded manager roster', async key => {
    expect(reportDestination(key)).toBe('director');
    const people = await loadReportPeople(client, 'gurgaon', key);
    expect(people.map(p => p.user_id)).toEqual(['manager']);
  });
  it('preserves group staff and shares the existing actual-date semantics with Manager outcomes', async () => {
    expect(reportDestination('daily_planning')).toBe('showroom');
    expect(reportDestination('outcomes')).toBe('showroom');
    for (const key of ['daily_planning','outcomes']) expect((await loadReportPeople(client,'gurgaon',key)).map(p => p.user_id)).toEqual(['executive','tl']);
    const ids = ['manager','unassigned'];
    expect((await loadVisitReportRows(client,ids,'manager_outcomes',date)).map(v=>v.id)).toEqual((await loadVisitReportRows(client,ids,'outcomes',date)).map(v=>v.id));
  });
});

describe('Director schedule isolation and duplicate protection', () => {
  it('uses distinct delivery keys per report, day and recipient while preserving the old 7 PM key', () => {
    const keys = directorReportKeys.flatMap(key => ['2026-10-23','2026-10-24'].flatMap(day =>
      ['910000000001','910000000002'].map(phone => directorIdempotencyKey(key,day,phone))));
    expect(new Set(keys).size).toBe(12);
    expect(directorIdempotencyKey('plan_actual',date,'910000000001')).toBe('director-plan-2026-10-23-910000000001');
  });
  it('sends one consolidated report at each of the three IST times, once per day', async () => {
    const deliver = vi.fn().mockResolvedValue({ recipients: 1, sent: 1 });
    for (const [key, utc] of [['manager_planning','04:30'],['plan_actual','13:30'],['manager_outcomes','15:30']]) {
      const now = new Date(`${date}T${utc}:00Z`);
      expect(reportDue(key, now)).toBe(true);
      await runScheduledDirectorReports(client, legacySettings, now, deliver);
      await runScheduledDirectorReports(client, legacySettings, now, deliver);
    }
    expect(deliver.mock.calls.map(call=>call[0])).toEqual([...directorReportKeys]);
    expect((await db.query("select * from whatshub_director_report_runs where status = 'sent'")).rows).toHaveLength(3);
  });
  it('respects each global OFF switch and does not use showroom switches for new reports', async () => {
    const deliver = vi.fn().mockResolvedValue({ recipients: 1, sent: 1 });
    await db.exec("UPDATE whatshub_director_report_settings SET enabled = false WHERE report_key = 'manager_planning'");
    await runScheduledDirectorReports(client, legacySettings, new Date(date+'T04:30:00Z'), deliver);
    expect(deliver).not.toHaveBeenCalled();
    await runScheduledDirectorReports(client, [], new Date(date+'T15:30:00Z'), deliver);
    expect(deliver).toHaveBeenCalledOnce();
    expect(deliver).toHaveBeenCalledWith('manager_outcomes');
  });
  it('records a failed delivery without throwing or sending a different report', async () => {
    const deliver = vi.fn().mockRejectedValue(new Error("A Director's WhatsApp number is missing or invalid"));
    const result = await runScheduledDirectorReports(client, legacySettings, new Date(date+'T04:30:00Z'), deliver);
    expect(result[0].error).toContain('missing or invalid');
    const rows = (await db.query('select * from whatshub_director_report_runs')).rows;
    expect(rows[0]).toMatchObject({ report_key: 'manager_planning', status: 'failed' });
    expect(deliver).toHaveBeenCalledOnce();
  });
  it('isolates missing new settings from the existing Plan vs Actual schedule', async () => {
    const broken = { from: (table: string) => table === 'whatshub_director_report_settings'
      ? { select: () => ({ order: () => ({ range: async () => ({error:{message:'Missing new settings'}}) }) }) }
      : query(table) };
    const deliver = vi.fn().mockResolvedValue({ recipients: 1, sent: 1 });
    const result = await runScheduledDirectorReports(broken, legacySettings, new Date(date+'T13:30:00Z'), deliver);
    expect(result[0].error).toBe('Missing new settings');
    expect(deliver).toHaveBeenCalledWith('plan_actual');
  });
  it('does not send outside the scheduled minute', async () => {
    const deliver = vi.fn();
    for (const utc of ['04:29','04:45','13:45','15:29','15:45']) await runScheduledDirectorReports(client,legacySettings,new Date(`${date}T${utc}:00Z`),deliver);
    expect(deliver).not.toHaveBeenCalled();
  });
});

it('SQL is rerunnable, preserves group settings/exclusions/history, and protects settings from app users', async () => {
  const before = await db.query('select * from whatshub_report_settings order by showroom_id, report_key');
  await db.exec("UPDATE whatshub_director_report_settings SET enabled=false WHERE report_key='manager_planning'; INSERT INTO whatshub_director_report_runs VALUES ('plan_actual','2026-10-22','failed','old error');");
  await db.exec(migration);
  expect((await db.query('select * from whatshub_report_settings order by showroom_id, report_key')).rows).toEqual(before.rows);
  expect((await db.query("select enabled from whatshub_director_report_settings where report_key='manager_planning'")).rows[0]).toEqual({enabled:false});
  expect((await db.query('select * from whatshub_director_report_runs')).rows).toHaveLength(1);
  expect((await db.query('select * from whatshub_report_exclusions')).rows).toEqual([{report_key:'plan_actual',user_id:'test'}]);
  const privileges = (await db.query("select has_table_privilege('authenticated','whatshub_director_report_settings','UPDATE') as app_can_edit, has_table_privilege('service_role','whatshub_director_report_settings','UPDATE') as service_can_edit")).rows[0];
  expect(privileges).toEqual({app_can_edit:false,service_can_edit:true});
});
