import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Header } from '@/components/layout/Header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  // Get contact stats
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, relationship_strength, strategic_relevance')
    .eq('user_id', user.id);

  const totalContacts = contacts?.length || 0;
  const highValueContacts = contacts?.filter(
    (c) => (c.strategic_relevance || 0) >= 4
  ).length || 0;

  return (
    <>
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
<div className="mb-8">
<h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
<p className="mt-2 text-gray-600">
Welcome back, {user.email}
</p>
</div>

<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Total Contacts</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">{totalContacts}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">High-Value Contacts</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">{highValueContacts}</p>
          <p className="mt-2 text-sm text-gray-600">
            Strategic relevance ≥ 4
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Link href="/contacts/new">
            <Button className="w-full">Add Contact</Button>
          </Link>
          <Link href="/contacts">
            <Button variant="outline" className="w-full">
              View All Contacts
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  </main>
</>
);
}