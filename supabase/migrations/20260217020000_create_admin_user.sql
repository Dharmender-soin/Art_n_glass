-- Create or Update Admin User (application@artnglassinc.com)

DO $$
DECLARE
  v_user_id UUID;
  v_email TEXT := 'application@artnglassinc.com';
  v_password TEXT := 'password123';
BEGIN
  -- 1. Check if user exists
  SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;

  IF v_user_id IS NULL THEN
    -- Create new user
    v_user_id := gen_random_uuid();
    
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
      v_email,
      extensions.crypt(v_password, extensions.gen_salt('bf')),
      now(), -- Auto-confirm email
      '{"provider": "email", "providers": ["email"]}',
      jsonb_build_object('full_name', 'Application Admin'),
      now(),
      now()
    );
  ELSE
    -- Update existing user (ensure verified and password reset)
    UPDATE auth.users
    SET 
      encrypted_password = extensions.crypt(v_password, extensions.gen_salt('bf')),
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      updated_at = now()
    WHERE id = v_user_id;
  END IF;

  -- 2. Ensure Admin Role
  INSERT INTO public.user_roles (user_id, role, showroom_id)
  VALUES (v_user_id, 'admin', null)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- 3. Update Profile (Phone)
  -- The profile is created by a trigger on auth.users insert if new, or exists if old
  UPDATE public.profiles 
  SET 
    phone = '+919876543210',
    full_name = 'Application Admin'
  WHERE user_id = v_user_id;

END $$;
