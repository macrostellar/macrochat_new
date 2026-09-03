// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

serve(async (request) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('authorization');

  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json({ error: 'Cleanup environment is not configured.' }, { status: 500 });
  }
  if (authorization !== `Bearer ${serviceRoleKey}`) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: expiredMedia, error: cleanupError } = await supabase.rpc('macrochat_cleanup_expired_updates');
  if (cleanupError) return Response.json({ error: cleanupError.message }, { status: 500 });

  const paths = (expiredMedia ?? []).map((item) => item.media_path).filter(Boolean);
  if (paths.length > 0) {
    const { error: storageError } = await supabase.storage.from('macrochat-updates').remove(paths);
    if (storageError) return Response.json({ error: storageError.message, deletedRows: expiredMedia?.length ?? 0 }, { status: 500 });
  }

  return Response.json({ deletedRows: expiredMedia?.length ?? 0, deletedMedia: paths.length });
});
