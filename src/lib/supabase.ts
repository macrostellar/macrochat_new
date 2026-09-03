import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createClient } from '@supabase/supabase-js';

WebBrowser.maybeCompleteAuthSession();

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

export const supabaseUrl = url;

type AuthFailure = Error & { code?: string; status?: number };

export function describeAuthFailure(error: unknown, action: 'mfa' | 'google-link' | 'email-link' | 'phone-link') {
  const failure = error as AuthFailure;
  const detail = failure?.message || 'The authentication request failed.';
  if (action === 'mfa' && failure?.status === 403) {
    return `Supabase rejected authenticator enrollment (403). Confirm TOTP is set to Enabled, its factor limit is at least 1, and save the TOTP section. Supabase: ${detail}`;
  }
  if (action === 'google-link' && failure?.status === 404) {
    return 'Google identity linking is disabled. In Supabase Authentication settings, enable Manual Linking and the Google provider.';
  }
  if (action === 'email-link' && /already (been )?registered|already exists/i.test(detail)) {
    return 'This email belongs to an existing MacroChat account. Recover that account instead, or connect a different email to this Macro ID.';
  }
  if (action === 'email-link' && (failure?.status === 400 || failure?.status === 422)) {
    return `Email could not be connected. Enable the Email provider and use an OTP template containing {{ .Token }}. Supabase: ${detail}`;
  }
  if (action === 'phone-link' && /unable to get sms provider/i.test(detail)) {
    return 'Phone sign-in needs an SMS gateway. In Supabase Authentication > Providers > Phone, add a Twilio, MessageBird, or Vonage account, then try again.';
  }
  if (action === 'phone-link' && (failure?.status === 400 || failure?.status === 422)) {
    return `Phone could not be connected. Enable the Phone provider and configure an SMS provider. Supabase: ${detail}`;
  }
  return detail;
}

export async function ensureAnonymousSession() {
  if (!supabase) return null;
  const { data: existing } = await supabase.auth.getSession();
  if (existing.session) return existing.session;
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.session;
}

export async function signInWithGoogle() {
  if (!supabase) throw new Error('Supabase is not configured. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.');

  const redirectTo = Linking.createURL('/auth/callback');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error) throw error;
  if (!data?.url) throw new Error('Google sign-in URL was not returned.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success' || !result.url) throw new Error('Google sign-in was cancelled.');

  const parsed = Linking.parse(result.url);
  const code = parsed.queryParams?.code;
  if (typeof code !== 'string' || !code) throw new Error('No auth code returned from Google sign-in.');

  const { data: sessionData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
  return sessionData.session;
}

export type AccountContactMethod = 'email' | 'phone';

export async function requestAccountSignIn(method: AccountContactMethod, destination: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const value = destination.trim();
  const credentials = method === 'email'
    ? { email: value, options: { shouldCreateUser: false } }
    : { phone: value, options: { shouldCreateUser: false } };
  const { error } = await supabase.auth.signInWithOtp(credentials);
  if (error) throw error;
}

export async function verifyAccountSignIn(method: AccountContactMethod, destination: string, token: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const value = destination.trim();
  const verification = method === 'email'
    ? { email: value, token: token.trim(), type: 'email' as const }
    : { phone: value, token: token.trim(), type: 'sms' as const };
  const { data, error } = await supabase.auth.verifyOtp(verification);
  if (error) throw error;
  return data.session;
}

export async function requestAccountContactLink(method: AccountContactMethod, destination: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const value = destination.trim();
  const attributes = method === 'email' ? { email: value } : { phone: value };
  const { data, error } = await supabase.auth.updateUser(attributes);
  if (error) throw error;
  return {
    confirmed: method === 'email' ? data.user.email === value : data.user.phone === value,
  };
}

export async function verifyAccountContactLink(method: AccountContactMethod, destination: string, token: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const value = destination.trim();
  const verification = method === 'email'
    ? { email: value, token: token.trim(), type: 'email_change' as const }
    : { phone: value, token: token.trim(), type: 'phone_change' as const };
  const { data, error } = await supabase.auth.verifyOtp(verification);
  if (error) throw error;
  return data.user;
}

export async function getAccountRecoveryState() {
  if (!supabase) return { email: null, phone: null, providers: [] as string[], recoverable: false };
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const providers = [...new Set((data.user.identities ?? []).map((identity) => identity.provider))];
  const email = data.user.email ?? null;
  const phone = data.user.phone ?? null;
  return {
    email,
    phone,
    providers,
    recoverable: Boolean(email || phone || providers.some((provider) => provider !== 'anonymous')),
  };
}

export async function linkGoogleIdentity() {
  if (!supabase) throw new Error('Supabase is not configured.');
  const redirectTo = Linking.createURL('/auth/callback');
  const { data, error } = await supabase.auth.linkIdentity({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('Google linking URL was not returned.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success' || !result.url) throw new Error('Google linking was cancelled.');
  const parsed = Linking.parse(result.url);
  const code = parsed.queryParams?.code;
  if (typeof code === 'string' && code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
  }
}

export async function getSupabaseAccessToken() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
