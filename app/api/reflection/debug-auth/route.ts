import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createServerSupabaseClient();

  // If this hangs, your server-side auth cookie/session is the issue
  const { data, error } = await supabase.auth.getUser();

  return NextResponse.json({
    ok: !error && !!data?.user,
    user_id: data?.user?.id ?? null,
    error: error?.message ?? null,
  });
}
