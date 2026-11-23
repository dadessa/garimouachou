CREATE TABLE public.admin_password_requirements (
  user_id uuid PRIMARY KEY,
  required boolean NOT NULL DEFAULT false,
  exempt_session_id text,
  requested_at timestamptz
);
GRANT SELECT ON public.admin_password_requirements TO authenticated;
GRANT ALL ON public.admin_password_requirements TO service_role;
ALTER TABLE public.admin_password_requirements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Conta lê sua exigência de senha" ON public.admin_password_requirements FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE FUNCTION public.password_change_required() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_password_requirements
    WHERE user_id = auth.uid() AND required
      AND (exempt_session_id IS NULL OR exempt_session_id IS DISTINCT FROM (auth.jwt()->>'session_id'))
  );
$$;
REVOKE ALL ON FUNCTION public.password_change_required() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.password_change_required() TO authenticated, service_role;

CREATE FUNCTION public.request_password_change() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin') OR public.password_change_required() THEN
    RAISE EXCEPTION 'Sem permissão para agendar troca de senha.';
  END IF;
  INSERT INTO public.admin_password_requirements (user_id, required, exempt_session_id, requested_at)
  VALUES (auth.uid(), true, auth.jwt()->>'session_id', now())
  ON CONFLICT (user_id) DO UPDATE SET required = true, exempt_session_id = EXCLUDED.exempt_session_id, requested_at = EXCLUDED.requested_at;
END;
$$;
REVOKE ALL ON FUNCTION public.request_password_change() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_password_change() TO authenticated;

CREATE FUNCTION public.clear_requirement_after_password_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password THEN
    UPDATE public.admin_password_requirements SET required = false, exempt_session_id = NULL WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.clear_requirement_after_password_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER app_clear_password_requirement AFTER UPDATE OF encrypted_password ON auth.users FOR EACH ROW EXECUTE FUNCTION public.clear_requirement_after_password_change();

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
    AND NOT public.password_change_required();
$$;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;