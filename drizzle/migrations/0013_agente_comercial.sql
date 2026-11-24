CREATE TABLE public.import_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  user_id uuid NOT NULL,
  opportunity_ids uuid[] NOT NULL,
  publish boolean NOT NULL DEFAULT false,
  preview jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  result jsonb
);
GRANT SELECT, INSERT, UPDATE ON public.import_approvals TO authenticated;
GRANT ALL ON public.import_approvals TO service_role;
ALTER TABLE public.import_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin own approvals" ON public.import_approvals FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND user_id = auth.uid())
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND user_id = auth.uid());

CREATE TABLE public.agent_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  channel text NOT NULL CHECK (channel IN ('painel','mcp','agendado')),
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.agent_audit TO authenticated;
GRANT ALL ON public.agent_audit TO service_role;
ALTER TABLE public.agent_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin reads audit" ON public.agent_audit FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin writes own audit" ON public.agent_audit FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND user_id = auth.uid());

CREATE TABLE public.commercial_preferences (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  priority_categories text[] NOT NULL DEFAULT '{}',
  min_price_cents integer,
  max_price_cents integer,
  min_commission_pct numeric,
  preferred_marketplaces text[] NOT NULL DEFAULT '{}',
  daily_count integer NOT NULL DEFAULT 10 CHECK (daily_count BETWEEN 1 AND 30),
  channel text NOT NULL DEFAULT 'instagram' CHECK (channel IN ('instagram','whatsapp','ambos')),
  monthly_goal_cents integer,
  daily_plan_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.commercial_preferences TO authenticated;
GRANT ALL ON public.commercial_preferences TO service_role;
ALTER TABLE public.commercial_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manages preferences" ON public.commercial_preferences FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.daily_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger text NOT NULL CHECK (trigger IN ('manual','agendada')),
  status text NOT NULL CHECK (status IN ('ok','failed')),
  plan jsonb NOT NULL DEFAULT '{}',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.daily_plans TO authenticated;
GRANT ALL ON public.daily_plans TO service_role;
ALTER TABLE public.daily_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manages plans" ON public.daily_plans FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));