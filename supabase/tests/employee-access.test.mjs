// Isolated PostgreSQL regression test; never connects to a Supabase project.
// Setup: npm install --prefix tmp/employee-access-check --no-save --package-lock=false @electric-sql/pglite
// Run: node supabase/tests/employee-access.test.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(path.resolve('tmp/employee-access-check/package.json'));
const { PGlite } = require('@electric-sql/pglite');
const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const login = async (n, role = 'authenticated') => {
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [id(n)]);
  await db.exec(`SET ROLE ${role}`);
};
try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, raw_user_meta_data jsonb);
    CREATE TYPE public.app_role AS ENUM ('admin','md','manager','tl','executive');
    CREATE TABLE public.profiles(user_id uuid PRIMARY KEY, full_name text);
    CREATE TABLE public.user_roles(user_id uuid, role app_role, showroom_id uuid);
    -- Production may predate the optional shared-owner migration.
    CREATE TABLE public.clients(id uuid PRIMARY KEY);
    CREATE TABLE public.work_scope_items(id uuid PRIMARY KEY, created_by uuid, client_id uuid);
    CREATE TABLE public.daily_attendance(user_id uuid);
    CREATE TABLE public.live_locations(user_id uuid);
    CREATE TABLE public.location_history(user_id uuid);
    CREATE FUNCTION public.has_role(_user_id uuid, _role app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS
    $$ SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=_user_id AND role=_role) $$;
    GRANT SELECT ON public.user_roles, public.clients TO authenticated;
    GRANT SELECT,INSERT,UPDATE ON public.work_scope_items TO authenticated;
    GRANT SELECT ON public.profiles, public.daily_attendance, public.live_locations, public.location_history TO authenticated;
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
    CREATE POLICY own_profile ON public.profiles FOR SELECT USING(user_id=auth.uid());
    ALTER TABLE public.work_scope_items ENABLE ROW LEVEL SECURITY;
    -- Simulate historical/shared work visible to managers outside profile scope.
    CREATE POLICY visible_work ON public.work_scope_items TO authenticated USING(true) WITH CHECK(true);
    ALTER TABLE public.daily_attendance ENABLE ROW LEVEL SECURITY;
    CREATE POLICY own_attendance ON public.daily_attendance FOR SELECT USING(user_id=auth.uid());
    ALTER TABLE public.live_locations ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.location_history ENABLE ROW LEVEL SECURITY;
  `);
  for (const [n, role, room, name] of [[1,'admin',null,'Admin'],[2,'md',null,'MD'],[3,'manager',11,'Manager'],[4,'executive',11,'Room A'],[5,'executive',12,'Room B'],[6,'executive',13,'Outside'],[7,'executive',11,'Metadata name']]) {
    await db.query('INSERT INTO auth.users VALUES ($1,$2)', [id(n), { full_name: name }]);
    if (n !== 7) await db.query('INSERT INTO public.profiles VALUES ($1,$2)', [id(n), name]);
    await db.query('INSERT INTO public.user_roles VALUES ($1,$2,$3)', [id(n), role, room ? id(room) : null]);
    await db.query('INSERT INTO public.daily_attendance VALUES ($1)', [id(n)]);
  }
  await db.query('INSERT INTO public.user_roles VALUES ($1,$2,$3)', [id(3), 'manager', id(12)]);
  await db.query('INSERT INTO public.work_scope_items VALUES ($1,$2,NULL)', [id(21), id(6)]);
  await db.query('INSERT INTO public.live_locations VALUES ($1)', [id(4)]);
  await db.query('INSERT INTO public.location_history VALUES ($1)', [id(4)]);
  const sql = await readFile(new URL('../migrations/20260923110000_employee_names_and_tracking_access.sql', import.meta.url), 'utf8');
  // Reproduce the failed SQL Editor transaction and test the retry instructions.
  await assert.rejects(() => db.exec('BEGIN; SELECT c.secondary_owner_id FROM public.clients c; COMMIT;'), /column c.secondary_owner_id does not exist/);
  await db.exec(`ROLLBACK;\n${sql}`);
  await db.exec(sql); // Safe manual rerun.

  const names = () => db.query('SELECT * FROM public.get_employee_display_names($1::uuid[]) ORDER BY user_id', [[4,5,6,7].map(id)]);
  await login(1);
  assert.equal((await names()).rows.length, 4);
  assert.equal((await names()).rows.at(-1).full_name, 'Metadata name');
  await login(3);
  assert.deepEqual((await names()).rows.map(row => row.full_name), ['Room A','Room B','Metadata name']);
  assert.equal((await db.query('SELECT * FROM public.profiles WHERE user_id=$1',[id(6)])).rows.length, 0);
  assert.equal((await db.query('SELECT creator_name FROM public.work_scope_items')).rows[0].creator_name, 'Outside');
  assert.deepEqual((await db.query('SELECT user_id FROM public.daily_attendance ORDER BY user_id')).rows.map(row => row.user_id), [3,4,5,7].map(id));
  await db.query('UPDATE public.work_scope_items SET creator_name=$1 WHERE id=$2', ['Forged name',id(21)]);
  assert.equal((await db.query('SELECT creator_name FROM public.work_scope_items')).rows[0].creator_name, 'Outside');
  await login(4);
  assert.deepEqual((await names()).rows.map(row => row.full_name), ['Room A']);
  assert.equal((await db.query('SELECT * FROM public.daily_attendance')).rows.length, 1);
  await login(2);
  assert.equal((await names()).rows.length, 4);
  assert.equal((await db.query('SELECT * FROM public.daily_attendance')).rows.length, 7);
  assert.equal((await db.query('SELECT * FROM public.live_locations')).rows.length, 1);
  assert.equal((await db.query('SELECT * FROM public.location_history')).rows.length, 1);
  await login(1, 'anon');
  await assert.rejects(names, /permission denied/);
  // The same migration must also preserve explicit shared-owner name access
  // when this optional column is present on a newer schema.
  await db.exec('RESET ROLE');
  await db.exec('ALTER TABLE public.clients ADD COLUMN secondary_owner_id uuid');
  await db.query('INSERT INTO public.clients VALUES ($1,$2)', [id(31), id(3)]);
  await db.query('UPDATE public.work_scope_items SET client_id=$1 WHERE id=$2', [id(31), id(21)]);
  await db.exec(sql);
  await login(3);
  assert.deepEqual((await names()).rows.map(row => row.full_name), ['Room A','Room B','Outside','Metadata name']);
  await login(4);
  assert.deepEqual((await names()).rows.map(row => row.full_name), ['Room A']);
  await db.exec('RESET ROLE');
  await db.query('UPDATE public.clients SET secondary_owner_id=NULL WHERE id=$1', [id(31)]);
  await login(3);
  assert.deepEqual((await names()).rows.map(row => row.full_name), ['Room A','Room B','Metadata name']);
  console.log('PASS: legacy and shared-owner schemas, SQL rerun, snapshot backfill, metadata fallback, anti-spoofing, multi-showroom scope, employee/anon isolation, MD tracking access.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally { await db.close(); }
