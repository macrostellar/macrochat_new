-- Fix RLS policies and unique constraints on public.macrochat_session_keys so both sender and recipient can read/manage session keys without losing historical session secrets.
BEGIN;

ALTER TABLE public.macrochat_session_keys DROP CONSTRAINT IF EXISTS macrochat_session_keys_user_id_peer_user_id_device_id_p_key;
ALTER TABLE public.macrochat_session_keys DROP CONSTRAINT IF EXISTS macrochat_session_keys_user_id_peer_user_id_device_id_key;

DROP POLICY IF EXISTS macrochat_session_keys_user_policy ON public.macrochat_session_keys;
DROP POLICY IF EXISTS macrochat_session_keys_select_policy ON public.macrochat_session_keys;
DROP POLICY IF EXISTS macrochat_session_keys_insert_policy ON public.macrochat_session_keys;
DROP POLICY IF EXISTS macrochat_session_keys_update_policy ON public.macrochat_session_keys;

CREATE POLICY macrochat_session_keys_select_policy 
  ON public.macrochat_session_keys FOR SELECT 
  TO authenticated 
  USING (user_id = auth.uid() OR peer_user_id = auth.uid());

CREATE POLICY macrochat_session_keys_insert_policy 
  ON public.macrochat_session_keys FOR INSERT 
  TO authenticated 
  WITH CHECK (user_id = auth.uid() OR peer_user_id = auth.uid());

CREATE POLICY macrochat_session_keys_update_policy 
  ON public.macrochat_session_keys FOR UPDATE 
  TO authenticated 
  USING (user_id = auth.uid() OR peer_user_id = auth.uid()) 
  WITH CHECK (user_id = auth.uid() OR peer_user_id = auth.uid());

COMMIT;
