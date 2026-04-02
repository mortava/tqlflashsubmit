-- ============================================================
-- OpenPrice Chat — Role-Based User System
-- Run this in Supabase Dashboard → SQL Editor
-- Then enable Realtime on new tables as needed
-- ============================================================

-- Ensure pgcrypto is available for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Companies ──
CREATE TABLE IF NOT EXISTS public.chat_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── System Users (all chat roles) ──
CREATE TABLE IF NOT EXISTS public.chat_system_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'company_admin', 'sales_manager', 'client')),
  company_id UUID REFERENCES public.chat_companies(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES public.chat_system_users(id) ON DELETE SET NULL
);

-- ── Assignments (ties sales managers to clients) ──
CREATE TABLE IF NOT EXISTS public.chat_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_manager_id UUID NOT NULL REFERENCES public.chat_system_users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.chat_system_users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.chat_companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES public.chat_system_users(id) ON DELETE SET NULL,
  UNIQUE(sales_manager_id, client_id)
);

-- ── Add columns to existing chat_conversations ──
ALTER TABLE public.chat_conversations ADD COLUMN IF NOT EXISTS system_user_id UUID REFERENCES public.chat_system_users(id);
ALTER TABLE public.chat_conversations ADD COLUMN IF NOT EXISTS assigned_manager_id UUID REFERENCES public.chat_system_users(id);
ALTER TABLE public.chat_conversations ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.chat_companies(id);

-- ── Chat transcript copies (for super_admin & company_admin) ──
CREATE TABLE IF NOT EXISTS public.chat_transcript_copies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES public.chat_system_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Indexes ──
CREATE INDEX IF NOT EXISTS idx_chat_sys_users_email ON public.chat_system_users(email);
CREATE INDEX IF NOT EXISTS idx_chat_sys_users_role ON public.chat_system_users(role);
CREATE INDEX IF NOT EXISTS idx_chat_sys_users_company ON public.chat_system_users(company_id);
CREATE INDEX IF NOT EXISTS idx_chat_assignments_manager ON public.chat_assignments(sales_manager_id);
CREATE INDEX IF NOT EXISTS idx_chat_assignments_client ON public.chat_assignments(client_id);
CREATE INDEX IF NOT EXISTS idx_chat_conv_manager ON public.chat_conversations(assigned_manager_id);
CREATE INDEX IF NOT EXISTS idx_chat_conv_system_user ON public.chat_conversations(system_user_id);

-- ── RLS (open for now — anon key access) ──
ALTER TABLE public.chat_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_system_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_transcript_copies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on chat_companies" ON public.chat_companies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on chat_system_users" ON public.chat_system_users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on chat_assignments" ON public.chat_assignments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on chat_transcript_copies" ON public.chat_transcript_copies FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime
ALTER TABLE public.chat_companies REPLICA IDENTITY FULL;
ALTER TABLE public.chat_system_users REPLICA IDENTITY FULL;
ALTER TABLE public.chat_assignments REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_system_users;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_assignments;

-- ============================================================
-- RPC Functions
-- ============================================================

-- ── Authenticate a chat system user ──
CREATE OR REPLACE FUNCTION public.chat_authenticate(p_email TEXT, p_password TEXT)
RETURNS JSON AS $$
DECLARE
  v_user public.chat_system_users%ROWTYPE;
  v_company_name TEXT;
BEGIN
  SELECT * INTO v_user
  FROM public.chat_system_users
  WHERE email = lower(trim(p_email)) AND is_active = true;

  IF v_user.id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid credentials');
  END IF;

  IF v_user.password_hash = crypt(p_password, v_user.password_hash) THEN
    -- Get company name
    SELECT name INTO v_company_name FROM public.chat_companies WHERE id = v_user.company_id;

    RETURN json_build_object(
      'success', true,
      'user', json_build_object(
        'id', v_user.id,
        'email', v_user.email,
        'display_name', v_user.display_name,
        'role', v_user.role,
        'company_id', v_user.company_id,
        'company_name', COALESCE(v_company_name, 'OpenBroker Labs')
      )
    );
  ELSE
    RETURN json_build_object('success', false, 'error', 'Invalid credentials');
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Create a chat system user (with permission check) ──
CREATE OR REPLACE FUNCTION public.chat_create_user(
  p_caller_id UUID,
  p_email TEXT,
  p_password TEXT,
  p_display_name TEXT,
  p_role TEXT,
  p_company_id UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_caller public.chat_system_users%ROWTYPE;
  v_new_id UUID;
BEGIN
  SELECT * INTO v_caller FROM public.chat_system_users WHERE id = p_caller_id AND is_active = true;

  IF v_caller.id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Caller not found');
  END IF;

  -- Permission check
  IF v_caller.role = 'super_admin' THEN
    -- Can create any role
    NULL;
  ELSIF v_caller.role = 'company_admin' THEN
    IF p_role NOT IN ('sales_manager', 'client') THEN
      RETURN json_build_object('success', false, 'error', 'Company admins can only create sales managers and clients');
    END IF;
    -- Force company to caller's company
    p_company_id := v_caller.company_id;
  ELSE
    RETURN json_build_object('success', false, 'error', 'Insufficient permissions');
  END IF;

  INSERT INTO public.chat_system_users (email, password_hash, display_name, role, company_id, created_by)
  VALUES (lower(trim(p_email)), crypt(p_password, gen_salt('bf')), p_display_name, p_role, p_company_id, p_caller_id)
  RETURNING id INTO v_new_id;

  RETURN json_build_object('success', true, 'user_id', v_new_id);
EXCEPTION WHEN unique_violation THEN
  RETURN json_build_object('success', false, 'error', 'Email already exists');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Assign a client to a sales manager ──
CREATE OR REPLACE FUNCTION public.chat_assign_user(
  p_caller_id UUID,
  p_sales_manager_id UUID,
  p_client_id UUID
)
RETURNS JSON AS $$
DECLARE
  v_caller public.chat_system_users%ROWTYPE;
  v_manager public.chat_system_users%ROWTYPE;
  v_client public.chat_system_users%ROWTYPE;
  v_new_id UUID;
BEGIN
  SELECT * INTO v_caller FROM public.chat_system_users WHERE id = p_caller_id AND is_active = true;
  SELECT * INTO v_manager FROM public.chat_system_users WHERE id = p_sales_manager_id AND is_active = true;
  SELECT * INTO v_client FROM public.chat_system_users WHERE id = p_client_id AND is_active = true;

  IF v_caller.role NOT IN ('super_admin', 'company_admin') THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient permissions');
  END IF;

  IF v_manager.role != 'sales_manager' THEN
    RETURN json_build_object('success', false, 'error', 'Target user is not a sales manager');
  END IF;

  IF v_client.role != 'client' THEN
    RETURN json_build_object('success', false, 'error', 'Target user is not a client');
  END IF;

  -- Company admin can only assign within their company
  IF v_caller.role = 'company_admin' AND (v_manager.company_id != v_caller.company_id OR v_client.company_id != v_caller.company_id) THEN
    RETURN json_build_object('success', false, 'error', 'Cannot assign users from different companies');
  END IF;

  INSERT INTO public.chat_assignments (sales_manager_id, client_id, company_id, created_by)
  VALUES (p_sales_manager_id, p_client_id, v_manager.company_id, p_caller_id)
  RETURNING id INTO v_new_id;

  RETURN json_build_object('success', true, 'assignment_id', v_new_id);
EXCEPTION WHEN unique_violation THEN
  RETURN json_build_object('success', false, 'error', 'Assignment already exists');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Remove an assignment ──
CREATE OR REPLACE FUNCTION public.chat_unassign_user(
  p_caller_id UUID,
  p_assignment_id UUID
)
RETURNS JSON AS $$
DECLARE
  v_caller public.chat_system_users%ROWTYPE;
BEGIN
  SELECT * INTO v_caller FROM public.chat_system_users WHERE id = p_caller_id AND is_active = true;

  IF v_caller.role NOT IN ('super_admin', 'company_admin') THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient permissions');
  END IF;

  DELETE FROM public.chat_assignments WHERE id = p_assignment_id;
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Auto-create ChatCom client on OpenPrice signup ──
CREATE OR REPLACE FUNCTION public.chat_create_client_from_signup(
  p_email TEXT,
  p_password TEXT,
  p_display_name TEXT
)
RETURNS JSON AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.chat_system_users WHERE email = lower(trim(p_email))) THEN
    RETURN json_build_object('success', true, 'message', 'User already exists');
  END IF;

  INSERT INTO public.chat_system_users (email, password_hash, display_name, role, company_id)
  VALUES (
    lower(trim(p_email)),
    crypt(p_password, gen_salt('bf')),
    p_display_name,
    'client',
    NULL
  );

  RETURN json_build_object('success', true);
EXCEPTION WHEN unique_violation THEN
  RETURN json_build_object('success', true, 'message', 'User already exists');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Seed Data
-- ============================================================

-- DEFY TPO company
INSERT INTO public.chat_companies (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'DEFY TPO')
ON CONFLICT (id) DO NOTHING;

-- Super Admin: chatv1@qualr.com
INSERT INTO public.chat_system_users (email, password_hash, display_name, role, company_id)
VALUES (
  'chatv1@qualr.com',
  crypt('myPlantshop25$', gen_salt('bf')),
  'OpenBroker Labs Admin',
  'super_admin',
  NULL
) ON CONFLICT (email) DO NOTHING;

-- Company Admin: service@defytpo.com
INSERT INTO public.chat_system_users (email, password_hash, display_name, role, company_id)
VALUES (
  'service@defytpo.com',
  crypt('opPlantshop25%', gen_salt('bf')),
  'DEFY TPO Admin',
  'company_admin',
  '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (email) DO NOTHING;
