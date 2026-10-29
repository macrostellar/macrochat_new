const { getBackendConfiguration } = require('./src/lib/backend-config');

module.exports = ({ config }) => {
  const release = process.env.NODE_ENV === 'production'
    || process.env.EAS_BUILD_PROFILE === 'production'
    || /Release/.test(process.env.CONFIGURATION || '');
  const backend = getBackendConfiguration({
    url: process.env.EXPO_PUBLIC_SUPABASE_URL,
    anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    demoEnabled: process.env.EXPO_PUBLIC_DEMO_MODE,
    development: !release,
  });
  if (release && backend.error) throw new Error(backend.error);
  return config;
};
