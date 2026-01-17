import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Header } from '@/components/layout/Header';
import { LifeMapView } from '@/components/dashboard/LifeMapView';

export const dynamic = 'force-dynamic';

/**
 * Dashboard Page - Phase 3: Event-Centric Life Map
 * 
 * This is the primary navigation surface.
 * Events are the center of gravity, not conversations.
 * Structure precedes meaning. 
 */

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <LifeMapView />
      </main>
    </>
  );
}