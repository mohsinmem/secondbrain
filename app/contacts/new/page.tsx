import { Header } from '@/components/layout/Header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ContactForm } from '@/components/contacts/ContactForm';

export default function NewContactPage() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <Card>
          <CardHeader>
            <CardTitle>Create New Contact</CardTitle>
          </CardHeader>
          <CardContent>
            <ContactForm mode="create" />
          </CardContent>
        </Card>
      </main>
    </>
  );
}