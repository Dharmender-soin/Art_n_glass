// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it } from 'vitest';

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const files = ['20261005090000_visit_reporting_and_shared_ownership.sql','20261005091000_wos_execution_progress.sql','20261005092000_conveyance_day_details.sql','20261018090000_record_transfers_and_wos_stages.sql','20261018091000_pending_partner_reports.sql'];
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
    CREATE TABLE public.work_scope_items(id uuid PRIMARY KEY,created_by uuid,client_id uuid,work_status text DEFAULT 'won',last_status_change_reason text);
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
    INSERT INTO work_scope_items(id,created_by,client_id,work_status) VALUES ('${id(400)}','${id(1)}','${id(200)}','won');
    ALTER TABLE showrooms ADD COLUMN whatsapp_group_id text;
    ALTER TABLE whatshub_report_settings ADD COLUMN enabled boolean NOT NULL DEFAULT false;
    ALTER TABLE whatshub_report_settings ADD PRIMARY KEY(showroom_id,report_key);
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

describe('Record transfer release',()=>{
  it('starts the group pending-partner schedule tomorrow and preserves a disabled setting on rerun',async()=>{
    await db.query('UPDATE showrooms SET whatsapp_group_id=$1 WHERE id=$2',['test-group@g.us',id(100)]);
    const migration=readFileSync(resolve('supabase/migrations',files[4]),'utf8');
    await db.exec(migration);
    const first=await db.query(`SELECT enabled,schedule_start_date=((now() AT TIME ZONE 'Asia/Kolkata')::date+1) AS starts_tomorrow FROM whatshub_report_settings WHERE showroom_id=$1 AND report_key='pending_partners'`,[id(100)]);
    expect(first.rows).toEqual([{enabled:true,starts_tomorrow:true}]);
    await db.query(`UPDATE whatshub_report_settings SET enabled=false WHERE showroom_id=$1 AND report_key='pending_partners'`,[id(100)]);
    await db.exec(migration);
    expect((await db.query(`SELECT enabled FROM whatshub_report_settings WHERE showroom_id=$1 AND report_key='pending_partners'`,[id(100)])).rows).toEqual([{enabled:false}]);
    // Older migrations intentionally accept only the older report keys.
    await db.exec("DELETE FROM whatshub_report_settings WHERE report_key='pending_partners'; UPDATE showrooms SET whatsapp_group_id=NULL");
  });
  afterEach(async()=>{
    await db.exec('RESET ROLE');
    await db.query("SELECT set_config('request.jwt.claim.sub','',false)");
    for(const table of ['work_scope_items','visits','clients','partners']) await db.query(`DELETE FROM ${table} WHERE id BETWEEN $1 AND $2`,[id(1000),id(1999)]);
    await db.query('DELETE FROM record_transfer_history WHERE record_id BETWEEN $1 AND $2',[id(1000),id(1999)]);
  });
  it('transfers a client without changing its ID, original creator, WOS author or employee profile',async()=>{
    await db.exec(`INSERT INTO clients(id,created_by,architect_name,secondary_owner_id) VALUES('${id(1000)}','${id(1)}','Architect','${id(2)}');
      INSERT INTO work_scope_items(id,created_by,client_id) VALUES('${id(1001)}','${id(1)}','${id(1000)}');
      INSERT INTO visits(id,created_by,client_id) VALUES('${id(1002)}','${id(1)}','${id(1000)}');`);
    await login(4);
    const result=await db.query<{value:{transferred_count:number}}>(`SELECT manage_crm_record('client',$1,'transfer',$2,false,'Territory reassigned') AS value`,[id(1000),id(2)]);
    expect(result.rows[0].value.transferred_count).toBe(1);
    await login(2);
    const client=await db.query(`SELECT id,created_by,original_created_by,secondary_owner_id FROM clients WHERE id=$1`,[id(1000)]);
    expect(client.rows).toEqual([{id:id(1000),created_by:id(2),original_created_by:id(1),secondary_owner_id:null}]);
    expect((await db.query(`SELECT created_by FROM work_scope_items WHERE id=$1`,[id(1001)])).rows).toEqual([{created_by:id(1)}]);
    expect((await db.query(`SELECT created_by FROM visits WHERE id=$1`,[id(1002)])).rows).toEqual([{created_by:id(1)}]);
    expect((await db.query(`SELECT full_name FROM profiles WHERE user_id=$1`,[id(1)])).rows).toEqual([{full_name:'Employee 1'}]);
    await login(4);
    expect((await db.query(`SELECT previous_owner,new_owner,reason FROM record_transfer_history WHERE record_id=$1`,[id(1000)])).rows).toEqual([{previous_owner:id(1),new_owner:id(2),reason:'Territory reassigned'}]);
  });
  it('rejects transfers by an executive and to inactive/out-of-showroom targets',async()=>{
    await login(1);
    await expect(db.query(`SELECT manage_crm_record('client',$1,'transfer',$2,false,'Reassign')`,[id(200),id(2)])).rejects.toThrow(/Only Admin/);
    await login(4);
    for(const target of [5,8]) await expect(db.query(`SELECT manage_crm_record('client',$1,'transfer',$2,false,'Reassign')`,[id(200),id(target)])).rejects.toThrow(/active executive/);
  });
  it('rolls back the entire partner transfer if a linked client is outside the manager scope',async()=>{
    await db.exec(`INSERT INTO partners(id,created_by) VALUES('${id(1010)}','${id(1)}');
      INSERT INTO clients(id,created_by,architect_name,partner_id) VALUES('${id(1011)}','${id(1)}','Architect','${id(1010)}'),('${id(1012)}','${id(5)}','Architect','${id(1010)}');`);
    await login(4);
    await expect(db.query(`SELECT manage_crm_record('partner',$1,'transfer',$2,true,'Transfer portfolio')`,[id(1010),id(2)])).rejects.toThrow(/outside your managed showrooms/);
    await db.exec('RESET ROLE');
    expect((await db.query(`SELECT created_by FROM partners WHERE id=$1`,[id(1010)])).rows).toEqual([{created_by:id(1)}]);
    expect((await db.query(`SELECT created_by FROM clients WHERE id=$1`,[id(1011)])).rows).toEqual([{created_by:id(1)}]);
    expect((await db.query(`SELECT count(*)::int AS count FROM record_transfer_history WHERE record_id IN ($1,$2)`,[id(1010),id(1011)])).rows).toEqual([{count:0}]);
  });
  it('transfers linked clients only when requested and preserves every WOS record',async()=>{
    await db.exec(`INSERT INTO partners(id,created_by) VALUES('${id(1020)}','${id(1)}');
      INSERT INTO clients(id,created_by,architect_name,partner_id) VALUES('${id(1021)}','${id(1)}','Architect','${id(1020)}');
      INSERT INTO work_scope_items(id,created_by,client_id) VALUES('${id(1022)}','${id(1)}','${id(1021)}');`);
    await login(4);
    await db.query(`SELECT manage_crm_record('partner',$1,'transfer',$2,false,'Partner only')`,[id(1020),id(2)]);
    expect((await db.query(`SELECT created_by FROM clients WHERE id=$1`,[id(1021)])).rows).toEqual([{created_by:id(1)}]);
    await db.query(`SELECT manage_crm_record('partner',$1,'transfer',$2,true,'Full portfolio')`,[id(1020),id(1)]);
    await db.query(`SELECT manage_crm_record('partner',$1,'transfer',$2,true,'Full portfolio')`,[id(1020),id(2)]);
    await login(2);
    expect((await db.query(`SELECT created_by FROM clients WHERE id=$1`,[id(1021)])).rows).toEqual([{created_by:id(2)}]);
    expect((await db.query(`SELECT created_by FROM work_scope_items WHERE id=$1`,[id(1022)])).rows).toEqual([{created_by:id(1)}]);
  });
  it('blocks deletion with linked records and permits only an empty client',async()=>{
    await db.exec(`INSERT INTO clients(id,created_by,architect_name) VALUES('${id(1030)}','${id(1)}','Architect');`);
    await login(4);
    await expect(db.query(`SELECT manage_crm_record('client',$1,'delete',NULL,false,'Duplicate')`,[id(200)])).rejects.toThrow(/linked WOS or visits/);
    await db.query(`SELECT manage_crm_record('client',$1,'delete',NULL,false,'Duplicate empty client')`,[id(1030)]);
    expect((await db.query(`SELECT id FROM clients WHERE id=$1`,[id(1030)])).rows).toEqual([]);
  });
  it('supports each execution stage and enforces Lost/Hold reasons in the database',async()=>{
    await db.exec(`INSERT INTO clients(id,created_by,architect_name) VALUES('${id(1040)}','${id(1)}','Architect');
      INSERT INTO work_scope_items(id,created_by,client_id,work_status) VALUES('${id(1041)}','${id(1)}','${id(1040)}','pending');`);
    await login(1);
    for(const stage of ['pre_production','production','installation','handover']) await db.query(`SELECT set_wos_execution_status($1,$2)`,[id(1041),stage]);
    await expect(db.query(`UPDATE work_scope_items SET work_status='lost' WHERE id=$1`,[id(1041)])).rejects.toThrow(/reason is required/);
    await db.query(`UPDATE work_scope_items SET work_status='hold',last_status_change_reason='Awaiting site readiness' WHERE id=$1`,[id(1041)]);
    expect((await db.query(`SELECT execution_status,work_status FROM work_scope_items WHERE id=$1`,[id(1041)])).rows).toEqual([{execution_status:'handover',work_status:'hold'}]);
    await db.exec('RESET ROLE');
    for(const file of files.slice(3)) await db.exec(readFileSync(resolve('supabase/migrations',file),'utf8'));
    expect((await db.query(`SELECT execution_status FROM work_scope_items WHERE id=$1`,[id(1041)])).rows).toEqual([{execution_status:'handover'}]);
  });
});

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
