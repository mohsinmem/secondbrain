'use client';

export default function TestEnvPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="rounded-lg border p-8 max-w-2xl">
        <h1 className="text-2xl font-bold mb-4">Environment Variables Test</h1>
        <div className="space-y-2 font-mono text-sm">
          <div>
            <strong>SUPABASE_URL:</strong>
            <div className="bg-gray-100 p-2 rounded mt-1 break-all">
              {process.env.NEXT_PUBLIC_SUPABASE_URL || '❌ NOT SET'}
            </div>
          </div>
          <div>
            <strong>SUPABASE_ANON_KEY:</strong>
            <div className="bg-gray-100 p-2 rounded mt-1 break-all">
              {process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY 
                ? `✅ Set (${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.substring(0, 20)}...)` 
                : '❌ NOT SET'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}