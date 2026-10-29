/**
 * @param {{ url?: string, anonKey?: string, demoEnabled?: string, development: boolean }} input
 * @returns {{ mode: 'supabase' | 'demo' | 'unconfigured', error: string | null }}
 */
function getBackendConfiguration({ url, anonKey, demoEnabled, development }) {
  const projectUrl = url?.trim();
  const publicKey = anonKey?.trim();
  if (development && demoEnabled === 'true' && !projectUrl && !publicKey) {
    return { mode: 'demo', error: null };
  }

  const invalid = (detail) => ({
    mode: /** @type {const} */ ('unconfigured'),
    error: `${detail} Configure EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY with the same project used by the web app, then rebuild. Demo mode is development-only and requires EXPO_PUBLIC_DEMO_MODE=true.`,
  });
  if (!projectUrl || !publicKey) return invalid('Online messaging is not configured.');

  try {
    const parsed = new URL(projectUrl);
    if (!parsed.hostname || (parsed.protocol !== 'https:' && !(development && parsed.protocol === 'http:'))) {
      return invalid('The Supabase URL must use HTTPS in release builds.');
    }
  } catch {
    return invalid('The Supabase URL is invalid.');
  }

  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publicKey)) {
    try {
      const parts = publicKey.split('.');
      if (parts.length !== 3 || !parts[0] || !parts[2]) return invalid('Use a Supabase public anon or publishable key, not a placeholder or secret key.');
      const encoded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(encoded.padEnd(encoded.length + ((4 - (encoded.length % 4)) % 4), '=')));
      if (payload.role !== 'anon') return invalid('Only a public anon or publishable key may be included in the app.');
    } catch {
      return invalid('Use a valid Supabase public anon or publishable key.');
    }
  }
  return { mode: 'supabase', error: null };
}

module.exports = { getBackendConfiguration };
