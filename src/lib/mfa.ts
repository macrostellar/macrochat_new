import { supabase } from '@/lib/supabase';

export type MFAFactor = {
  id: string;
  friendlyName: string | null;
  factorType: string;
  status: string;
};

export async function listMFAFactors(): Promise<MFAFactor[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  const totp = data.totp ?? [];
  return totp.map((factor) => ({
    id: factor.id,
    friendlyName: factor.friendly_name ?? null,
    factorType: factor.factor_type,
    status: factor.status,
  }));
}

export async function enrollTOTP(friendlyName: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName,
  });
  if (error) throw error;
  return data;
}

export async function verifyTOTP(factorId: string, code: string, challengeId?: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  let localChallengeId = challengeId;
  if (!localChallengeId) {
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError) throw challengeError;
    localChallengeId = challenge.id;
  }

  const { data, error } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: localChallengeId,
    code,
  });
  if (error) throw error;
  return data;
}

export async function removeMFAFactor(factorId: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw error;
  return data;
}
