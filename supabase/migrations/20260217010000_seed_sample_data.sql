-- Seed Data Migration simplified
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
DECLARE
  v_showroom RECORD;
  v_user_id UUID;
  v_partner_id UUID;
  v_client_id UUID;
  v_employee_count INT;
  v_i INT;
  v_j INT;
  v_k INT;
  v_visit_date DATE;
  v_work_types TEXT[];
  v_visit_statuses public.visit_status[];
  v_client_statuses public.client_status[];
BEGIN
  v_work_types := ARRAY['uPVC-uPVC', 'Aluminium-Aluminium', 'Skylight-ANG', 'GlassRailing-ANG', 'Showers-Axsys', 'Mirrors-ANG'];
  v_visit_statuses := ARRAY['planned', 'done', 'cancelled']::public.visit_status[];
  v_client_statuses := ARRAY['new', 'hot', 'converted', 'lost']::public.client_status[];

  -- Loop through each showroom
  FOR v_showroom IN SELECT * FROM public.showrooms LOOP
    
    -- Determine random number of employees (5 to 9)
    v_employee_count := floor(random() * 5 + 5)::INT;
    
    FOR v_i IN 1..v_employee_count LOOP
      v_user_id := gen_random_uuid();
      
      -- 1. Create User
      INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at
      ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        v_user_id,
        'authenticated',
        'authenticated',
        'sales.' || lower(replace(v_showroom.name, ' ', '')) || '.' || v_i || '@visitwiz.com',
        extensions.crypt('password123', extensions.gen_salt('bf')),
        now(),
        '{"provider": "email", "providers": ["email"]}',
        jsonb_build_object('full_name', 'Sales ' || v_showroom.name || ' ' || v_i),
        now(),
        now()
      );

      -- 2. Create User Role
      INSERT INTO public.user_roles (user_id, role, showroom_id)
      VALUES (v_user_id, 'executive', v_showroom.id);

      -- 3. Update Profile (trigger creates it, we update phone)
      -- Wait for trigger? No, it's same transaction usually.
      UPDATE public.profiles 
      SET phone = '+9199999' || floor(random() * 90000 + 10000)::TEXT
      WHERE user_id = v_user_id;

      -- 4. Create Partners
      FOR v_j IN 1..floor(random() * 3 + 3)::INT LOOP
        v_partner_id := gen_random_uuid();
        INSERT INTO public.partners (
          id, type, name, mobile, company_name, city, created_by
        ) VALUES (
          v_partner_id,
          (ARRAY['builder', 'architect']::public.partner_type[])[floor(random() * 2 + 1)],
          'Partner ' || substr(md5(random()::text), 1, 5),
          '+9198765' || floor(random() * 90000 + 10000)::TEXT,
          'Company ' || substr(md5(random()::text), 1, 5),
          v_showroom.city,
          v_user_id
        );

        -- 5. Create Clients
        FOR v_k IN 1..floor(random() * 3 + 1)::INT LOOP
          v_client_id := gen_random_uuid();
          INSERT INTO public.clients (
            id, name, mobile, address, city, partner_id, status, created_by
          ) VALUES (
            v_client_id,
            'Client ' || substr(md5(random()::text), 1, 5),
            '+9190000' || floor(random() * 90000 + 10000)::TEXT,
            'Address ' || floor(random() * 100)::TEXT,
            v_showroom.city,
            v_partner_id,
            v_client_statuses[floor(random() * 4 + 1)],
            v_user_id
          );

          -- 6. Create Work Scope
          INSERT INTO public.work_scope_items (
            client_id, work_type_id, quantity, amount_in_lac, created_by
          ) VALUES (
            v_client_id,
            v_work_types[floor(random() * array_length(v_work_types, 1) + 1)],
            floor(random() * 50 + 10)::INT,
            (random() * 10)::NUMERIC(10,2),
            v_user_id
          );

          -- 7. Create Visits
          IF random() > 0.3 THEN
             v_visit_date := date '2026-02-14' + (floor(random() * 3)::INT);
             INSERT INTO public.visits (
               visit_date, visit_with_type, client_id, partner_id, purpose, status, remarks, created_by
             ) VALUES (
               v_visit_date,
               'client',
               v_client_id,
               v_partner_id,
               'Site Measurement and Discussion',
               v_visit_statuses[floor(random() * 3 + 1)],
               'Follow up required',
               v_user_id
             );
          END IF;
        END LOOP;
      END LOOP;

    END LOOP;
  END LOOP;
END $$;
