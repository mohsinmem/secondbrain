import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Header } from '@/components/layout/Header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ContactForm } from '@/components/contacts/ContactForm';
import type { Contact } from '@/lib/types/database.types';

export default async function ContactDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createServerSupabaseClient();
  
  const { data: contact } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', params.id)
    .single();

  if (!contact) {
    notFound();
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <Card>
          <CardHeader>
            <CardTitle>Edit Contact</CardTitle>
          </CardHeader>
          <CardContent>
            <ContactForm contact={contact as Contact} mode="edit" />
          </CardContent>
        </Card>
      </main>
    </>
  );
}