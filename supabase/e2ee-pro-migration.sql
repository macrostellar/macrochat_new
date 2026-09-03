/**
 * Database migrations for production-grade E2EE.
 * 
 * Run these migrations in your Supabase SQL editor in order.
 */

-- ============================================================================
-- 1. USER IDENTITY KEYS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.macrochat_user_identity_keys (
  user_id UUID PRIMARY KEY REFERENCES public.macrochat_profiles(id) ON DELETE CASCADE,
  identity_public_key TEXT NOT NULL,
  identity_secret_key TEXT NOT NULL, -- Store securely; consider encryption at rest
  fingerprint TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rotated_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- ============================================================================
-- 2. DEVICE MANAGEMENT TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.macrochat_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.macrochat_profiles(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  device_name TEXT NOT NULL, -- e.g. "Sarah's iPhone", "MacBook Air"
  ephemeral_public_key TEXT NOT NULL,
  ephemeral_signature TEXT NOT NULL,
  device_fingerprint TEXT NOT NULL,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  verified_at TIMESTAMPTZ,
  verified_by_user_id UUID REFERENCES public.macrochat_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE(user_id, device_id),
  UNIQUE(device_fingerprint)
);

-- ============================================================================
-- 3. SESSION KEYS TABLE (for multi-device key exchange)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.macrochat_session_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.macrochat_profiles(id) ON DELETE CASCADE,
  peer_user_id UUID NOT NULL REFERENCES public.macrochat_profiles(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  peer_device_id TEXT NOT NULL,
  shared_secret TEXT NOT NULL, -- Encrypted with user's key (not stored plain)
  chain_key TEXT NOT NULL, -- Current ratchet key
  message_key_counter INT NOT NULL DEFAULT 0,
  x3dh_bundle_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE(user_id, peer_user_id, device_id, peer_device_id)
);

-- ============================================================================
-- 4. X3DH KEY BUNDLES TABLE (public key material for initiating sessions)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.macrochat_x3dh_key_bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.macrochat_profiles(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  identity_public_key TEXT NOT NULL,
  ephemeral_public_key TEXT NOT NULL,
  ephemeral_signature TEXT NOT NULL,
  device_fingerprint TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 days'),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE(user_id, device_id)
);

-- ============================================================================
-- 5. MESSAGE ENCRYPTION METADATA TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.macrochat_message_encryption_metadata (
  message_id UUID PRIMARY KEY REFERENCES public.macrochat_messages(id) ON DELETE CASCADE,
  encryption_version TEXT NOT NULL DEFAULT 'mc-e2ee-v2-pro',
  sender_device_id TEXT NOT NULL,
  sender_identity_public_key TEXT NOT NULL,
  receiver_device_ids TEXT[] NOT NULL DEFAULT '{}', -- JSON array of device IDs message was encrypted for
  message_key_counter INT NOT NULL, -- For ordering and replay detection
  x3dh_session_id UUID REFERENCES public.macrochat_session_keys(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 6. DEVICE VERIFICATION REQUESTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.macrochat_device_verification (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verifying_user_id UUID NOT NULL REFERENCES public.macrochat_profiles(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES public.macrochat_devices(id) ON DELETE CASCADE,
  verification_code TEXT NOT NULL UNIQUE, -- 6-digit or similar
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'expired', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes'),
  verified_at TIMESTAMPTZ
);

-- ============================================================================
-- 7. KEY ROTATION HISTORY TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.macrochat_key_rotation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.macrochat_profiles(id) ON DELETE CASCADE,
  rotation_type TEXT NOT NULL CHECK (rotation_type IN ('identity_key', 'session_key', 'ephemeral_key')),
  old_key_fingerprint TEXT,
  new_key_fingerprint TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 8. INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS macrochat_user_identity_keys_user_id_idx 
  ON public.macrochat_user_identity_keys(user_id, is_active);

CREATE INDEX IF NOT EXISTS macrochat_devices_user_id_idx 
  ON public.macrochat_devices(user_id, is_active);

CREATE INDEX IF NOT EXISTS macrochat_devices_fingerprint_idx 
  ON public.macrochat_devices(device_fingerprint);

CREATE INDEX IF NOT EXISTS macrochat_session_keys_users_idx 
  ON public.macrochat_session_keys(user_id, peer_user_id, is_active);

CREATE INDEX IF NOT EXISTS macrochat_x3dh_key_bundles_user_idx 
  ON public.macrochat_x3dh_key_bundles(user_id, is_active);

CREATE INDEX IF NOT EXISTS macrochat_message_encryption_metadata_message_idx 
  ON public.macrochat_message_encryption_metadata(message_id);

CREATE INDEX IF NOT EXISTS macrochat_message_encryption_metadata_sender_idx 
  ON public.macrochat_message_encryption_metadata(sender_device_id);

CREATE INDEX IF NOT EXISTS macrochat_device_verification_status_idx 
  ON public.macrochat_device_verification(status, created_at);

CREATE INDEX IF NOT EXISTS macrochat_key_rotation_history_user_idx 
  ON public.macrochat_key_rotation_history(user_id, created_at DESC);

-- ============================================================================
-- 9. ROW LEVEL SECURITY POLICIES
-- ============================================================================

ALTER TABLE public.macrochat_user_identity_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.macrochat_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.macrochat_session_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.macrochat_x3dh_key_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.macrochat_message_encryption_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.macrochat_device_verification ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.macrochat_key_rotation_history ENABLE ROW LEVEL SECURITY;

-- Identity keys: user can only read/update their own
CREATE POLICY macrochat_identity_keys_user_policy 
  ON public.macrochat_user_identity_keys FOR ALL 
  USING (user_id = auth.uid()) 
  WITH CHECK (user_id = auth.uid());

-- Devices: user can read/manage their own
CREATE POLICY macrochat_devices_user_policy 
  ON public.macrochat_devices FOR ALL 
  USING (user_id = auth.uid()) 
  WITH CHECK (user_id = auth.uid());

-- Session keys: user can read/create their own
CREATE POLICY macrochat_session_keys_user_policy 
  ON public.macrochat_session_keys FOR ALL 
  USING (user_id = auth.uid()) 
  WITH CHECK (user_id = auth.uid());

-- X3DH bundles: anyone can read active bundles, user can manage their own
CREATE POLICY macrochat_x3dh_public_read_policy 
  ON public.macrochat_x3dh_key_bundles FOR SELECT 
  USING (is_active = TRUE);

CREATE POLICY macrochat_x3dh_user_manage_policy 
  ON public.macrochat_x3dh_key_bundles FOR INSERT,UPDATE,DELETE 
  USING (user_id = auth.uid()) 
  WITH CHECK (user_id = auth.uid());

-- Message encryption metadata: anyone in conversation can read
CREATE POLICY macrochat_message_encryption_metadata_read_policy 
  ON public.macrochat_message_encryption_metadata FOR SELECT 
  USING (EXISTS (
    SELECT 1 FROM public.macrochat_messages m
    JOIN public.macrochat_conversation_members cm 
      ON m.conversation_id = cm.conversation_id
    WHERE m.id = macrochat_message_encryption_metadata.message_id 
      AND cm.user_id = auth.uid()
  ));

-- Device verification: user can only verify their own devices
CREATE POLICY macrochat_device_verification_policy 
  ON public.macrochat_device_verification FOR ALL 
  USING (verifying_user_id = auth.uid()) 
  WITH CHECK (verifying_user_id = auth.uid());

-- Key rotation history: user can only read their own
CREATE POLICY macrochat_key_rotation_history_policy 
  ON public.macrochat_key_rotation_history FOR SELECT 
  USING (user_id = auth.uid());

-- ============================================================================
-- 10. UPDATE MESSAGE TABLE TO REFERENCE ENCRYPTION METADATA
-- ============================================================================

ALTER TABLE public.macrochat_messages 
  ADD COLUMN IF NOT EXISTS encryption_metadata_id UUID REFERENCES public.macrochat_message_encryption_metadata(message_id);

-- ============================================================================
-- 11. HELPER FUNCTIONS
-- ============================================================================

-- Function to safely rotate user identity key
CREATE OR REPLACE FUNCTION public.rotate_user_identity_key(
  p_user_id UUID,
  p_new_identity_public_key TEXT,
  p_new_identity_secret_key TEXT,
  p_new_fingerprint TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_fingerprint TEXT;
BEGIN
  -- Get old fingerprint for history
  SELECT fingerprint INTO v_old_fingerprint 
  FROM public.macrochat_user_identity_keys 
  WHERE user_id = p_user_id AND is_active = TRUE;

  -- Mark old key as inactive
  UPDATE public.macrochat_user_identity_keys 
  SET is_active = FALSE, rotated_at = NOW() 
  WHERE user_id = p_user_id AND is_active = TRUE;

  -- Insert new key
  INSERT INTO public.macrochat_user_identity_keys 
    (user_id, identity_public_key, identity_secret_key, fingerprint, created_at, is_active)
  VALUES 
    (p_user_id, p_new_identity_public_key, p_new_identity_secret_key, p_new_fingerprint, NOW(), TRUE);

  -- Record in rotation history
  INSERT INTO public.macrochat_key_rotation_history 
    (user_id, rotation_type, old_key_fingerprint, new_key_fingerprint, reason)
  VALUES 
    (p_user_id, 'identity_key', v_old_fingerprint, p_new_fingerprint, 'Scheduled rotation');

  RETURN TRUE;
END;
$$;

-- Function to verify device and mark as trusted
CREATE OR REPLACE FUNCTION public.mark_device_as_verified(
  p_device_id UUID,
  p_verifying_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.macrochat_devices 
  SET is_verified = TRUE, verified_at = NOW(), verified_by_user_id = p_verifying_user_id 
  WHERE id = p_device_id AND user_id = p_verifying_user_id;

  RETURN TRUE;
END;
$$;

-- ============================================================================
-- 12. TRIGGERS FOR AUTOMATIC CLEANUP
-- ============================================================================

-- Expire old session keys
CREATE OR REPLACE FUNCTION public.cleanup_expired_session_keys()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.macrochat_session_keys 
  SET is_active = FALSE 
  WHERE expires_at < NOW() AND is_active = TRUE;
END;
$$;

-- This would be called by a cron job (Supabase Functions)
-- SELECT public.cleanup_expired_session_keys();
