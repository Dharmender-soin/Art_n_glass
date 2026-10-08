// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const files = ['20261005090000_visit_reporting_and_shared_ownership.sql','20261005091000_wos_execution_progress.sql','20261005092000_conveyance_day_details.sql'];
let db: PGlite;
const login = async (user: number) => { await db.exec('RESET ROLE'); await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id(user)]); await db.exec('SET ROLE authenticated'); };

beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    CREATE TYPE public.app_role AS ENUM ('executive','tl','manager','admin','md','accountant','backhand_executive');
    CREATE TYPE public.visit_status AS ENUM ('planned','done','cancelled');
    CREATE TABLE public.profiles(user_id uuid PRIMARY KEY,full_name text);
    CREATE TABLE public.showrooms(id uuid PRIMARY KEY,name text,city text);
    CREATE TABLE public.user_roles(id uuid DEFAULT gen_random_uuid(), user_id uuid,role app_role,showroom_id uuid,reports_to uuid,is_active boolean DEFAULT true);
    CREATE TABLE public.clients(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),created_by uuid,architect_name text,partner_id uuid);
    CREATE TABLE public.partners(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),created_by uuid);
    CREATE TABLE public.visits(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),created_by uuid,client_id uuid,partner_id uuid,visit_with_type text,address text,status public.visit_status DEFAULT 'planned');
    CREATE TABLE public.work_scope_items(id uuid PRIMARY KEY,created_by uuid,client_id uuid,work_status text DEFAULT 'won');
    CREATE TABLE public.daily_attendance(id uuid DEFAULT gen_random_uuid(),user_id uuid,date date,created_at timestamptz DEFAULT now(),UNIQUE(user_id,date));
    CREATE TABLE public.conveyance_records(user_id uuid,date date,created_at timestamptz,visit_id uuid,to_location_name text);
    CREATE TABLE public.whatshub_report_settings(showroom_id uuid,report_key text CHECK (report_key IN ('plan_actual','outcomes')));
    CREATE FUNCTION public.accountant_can_view_conveyance(record_user_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
      SELECT EXISTS(SELECT 1 FROM user_roles a JOIN user_roles b ON a.showroom_id=b.showroom_id WHERE a.user_id=auth.uid() AND a.role='accountant' AND b.user_id=record_user_id) $$;
    INSERT INTO showrooms VALUES ('${id(100)}','Gurgaon','Gurgaon'),('${id(101)}','Zirakpur','Zirakpur');
    INSERT INTO profiles SELECT ('00000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,'Employee ' || n FROM generate_series(1,8) n;
    INSERT INTO user_roles(user_id,role,showroom_id,reports_to) VALUES
      ('${id(1)}','executive','${id(100)}','${id(3)}'),('${id(2)}','executive','${id(100)}','${id(3)}'),
      ('${id(3)}','tl','${id(100)}',NULL),('${id(4)}','manager','${id(100)}',NULL),
      ('${id(5)}','executive','${id(101)}',NULL),('${id(6)}','accountant','${id(100)}',NULL),
      ('${id(7)}','md',NULL,NULL),('${id(8)}','executive','${id(100)}',NULL);
    UPDATE user_roles SET is_active=false WHERE user_id='${id(8)}';
    INSERT INTO clients(id,created_by) VALUES ('${id(200)}','${id(1)}'),('${id(201)}','${id(5)}');
    INSERT INTO partners(id,created_by) VALUES ('${id(300)}','${id(1)}');
    INSERT INTO work_scope_items VALUES ('${id(400)}','${id(1)}','${id(200)}','won');
    INSERT INTO visits(created_by,visit_with_type,address) VALUES ('${id(1)}','showroom','Gurgaon Showroom, Gurgaon');
    INSERT INTO daily_attendance(user_id,date) VALUES ('${id(1)}',(now() AT TIME ZONE 'Asia/Kolkata')::date),('${id(5)}',(now() AT TIME ZONE 'Asia/Kolkata')::date);
    ALTER TABLE clients ENABLE ROW LEVEL SECURITY; ALTER TABLE partners ENABLE ROW LEVEL SECURITY;
    ALTER TABLE work_scope_items ENABLE ROW LEVEL SECURITY; ALTER TABLE visits ENABLE ROW LEVEL SECURITY;
    ALTER TABLE daily_attendance ENABLE ROW LEVEL SECURITY;
    GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO authenticated;
    CREATE POLICY own_client_insert ON clients FOR INSERT TO authenticated WITH CHECK (created_by=auth.uid());
  `);
  for (const file of files) await db.exec(readFileSync(resolve('supabase/migrations',file),'utf8'));
  await db.exec(`UPDATE clients SET secondary_owner_id='${id(2)}' WHERE id='${id(200)}'; UPDATE partners SET secondary_owner_id='${id(2)}' WHERE id='${id(300)}';`);
}, 60000);
beforeEach(async () => { await db.exec('RESET ROLE'); await db.query("SELECT set_config('request.jwt.claim.sub','',false)"); });
afterAll(async () => { await db?.close(); });

describe('October database migrations', () => {
  it('can be applied twice and only backfills exact showroom matches', async () => {
    for (const file of files) await db.exec(readFileSync(resolve('supabase/migrations',file),'utf8'));
    const result = await db.query<{showroom_id:string}>('SELECT showroom_id FROM visits');
    expect(result.rows[0].showroom_id).toBe(id(100));
  });
  it('requires an architect for new clients while preserving legacy records', async () => {
    await login(1);
    await expect(db.query('INSERT INTO clients(created_by,architect_name) VALUES ($1,$2)',[id(1),'  '])).rejects.toThrow('Architect Name is required');
    await db.query('INSERT INTO clients(created_by,architect_name) VALUES ($1,$2)',[id(1),' Architect A ']);
    expect((await db.query<{architect_name:string}>('SELECT architect_name FROM clients WHERE architect_name IS NOT NULL')).rows[0].architect_name).toBe('Architect A');
  });
  it('lets the secondary employee see the linked client, partner and work without exposing another showroom', async () => {
    await login(2);
    expect((await db.query('SELECT id FROM clients WHERE id=$1',[id(200)])).rows).toHaveLength(1);
    expect((await db.query('SELECT id FROM partners WHERE id=$1',[id(300)])).rows).toHaveLength(1);
    expect((await db.query('SELECT id FROM work_scope_items')).rows).toHaveLength(1);
    expect((await db.query('SELECT id FROM clients WHERE id=$1',[id(201)])).rows).toHaveLength(0);
  });
  it.each([1,2,3,4])('allows authorized employee/TL/manager %s to change progress without changing Won/Lost', async user => {
    await login(user);
    await db.query('SELECT set_wos_execution_status($1,$2)',[id(400),'in_progress']);
    await db.query('SELECT set_wos_execution_status($1,$2)',[id(400),'completed']);
    const row = (await db.query<{execution_status:string;work_status:string}>('SELECT execution_status,work_status FROM work_scope_items WHERE id=$1',[id(400)])).rows[0];
    expect(row).toEqual({execution_status:'completed',work_status:'won'});
    expect((await db.query('SELECT id FROM wos_execution_history')).rows.length).toBeGreaterThan(0);
  });
  it.each([5,6,8])('rejects unrelated, accountant or inactive user %s for WOS updates', async user => {
    await login(user);
    await expect(db.query('SELECT set_wos_execution_status($1,$2)',[id(400),'completed'])).rejects.toThrow('You cannot update');
  });
  it('rejects inactive/out-of-scope and duplicate-primary secondary owners', async () => {
    await login(1);
    await expect(db.query('UPDATE clients SET secondary_owner_id=$1 WHERE id=$2',[id(5),id(200)])).rejects.toThrow('active member');
    await expect(db.query('UPDATE clients SET secondary_owner_id=$1 WHERE id=$2',[id(8),id(200)])).rejects.toThrow('active member');
    await expect(db.query('UPDATE clients SET secondary_owner_id=$1 WHERE id=$2',[id(1),id(200)])).rejects.toThrow('must be different');
  });
  it('propagates partner sharing to related client records and work', async () => {
    await db.query('INSERT INTO clients(id,created_by,architect_name,partner_id) VALUES ($1,$2,$3,$4)',[id(202),id(1),'Architect',id(300)]);
    await db.query('INSERT INTO work_scope_items(id,created_by,client_id) VALUES ($1,$2,$3)',[id(402),id(1),id(202)]);
    await login(2);
    expect((await db.query('SELECT id FROM clients WHERE id=$1',[id(202)])).rows).toHaveLength(1);
    await db.query('SELECT set_wos_execution_status($1,$2)',[id(402),'in_progress']);
    expect((await db.query<{execution_status:string}>('SELECT execution_status FROM work_scope_items WHERE id=$1',[id(402)])).rows[0].execution_status).toBe('in_progress');
  });
  it('scopes accountant attendance reads to their showroom', async () => {
    await db.query('INSERT INTO visits(created_by,status) VALUES ($1,$2),($3,$2)',[id(1),'done',id(5)]);
    await login(6);
    const rows = (await db.query<{user_id:string}>('SELECT user_id FROM daily_attendance')).rows;
    expect(rows.map(row => row.user_id)).toEqual([id(1)]);
    const visits = (await db.query<{created_by:string}>('SELECT created_by FROM visits')).rows;
    expect(visits.map(row => row.created_by)).toEqual([id(1)]);
  });
  it('removes inherited client access when a partner secondary owner is cleared', async () => {
    await login(1);
    await db.query('UPDATE partners SET secondary_owner_id=NULL WHERE id=$1',[id(300)]);
    await login(2);
    expect((await db.query('SELECT id FROM clients WHERE id=$1',[id(202)])).rows).toHaveLength(0);
    expect((await db.query('SELECT id FROM clients WHERE id=$1',[id(200)])).rows).toHaveLength(1);
  });
  it('records End Day once, even without a conveyance claim', async () => {
    await login(1);
    await db.query("SELECT end_attendance_day((now() AT TIME ZONE 'Asia/Kolkata')::date,28.5,77.1)");
    const first = (await db.query<{ended_at:Date}>('SELECT ended_at FROM daily_attendance')).rows[0].ended_at;
    await db.query("SELECT end_attendance_day((now() AT TIME ZONE 'Asia/Kolkata')::date,28.6,77.2)");
    expect((await db.query<{ended_at:Date}>('SELECT ended_at FROM daily_attendance')).rows[0].ended_at).toEqual(first);
    expect(first).toBeTruthy();
  });
});
