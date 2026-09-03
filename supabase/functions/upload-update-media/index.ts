import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.0'

interface UploadRequest {
  mediaPath: string
  contentType: string
  base64Data: string
}

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    // Get auth header from client
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No auth token' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })
    }

    // Create Supabase client with service role (bypasses RLS)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
      { auth: { persistSession: false } }
    )

    const body = (await req.json()) as UploadRequest
    const { mediaPath, contentType, base64Data } = body

    if (!mediaPath || !base64Data) {
      return new Response(JSON.stringify({ error: 'Missing mediaPath or base64Data' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })
    }

    // Decode base64 to bytes
    const binaryString = atob(base64Data)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }

    // Upload using service role (bypasses RLS)
    const { data, error } = await supabase.storage
      .from('macrochat-updates')
      .upload(mediaPath, bytes, {
        contentType,
        upsert: false,
      })

    if (error) {
      console.error('[uploadUpdateMedia] Upload error:', error)
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ data }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  } catch (error) {
    console.error('[uploadUpdateMedia] Exception:', error)
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }
}
