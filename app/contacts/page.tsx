'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { ContactList } from '@/components/contacts/ContactList';
import { ContactFilters } from '@/components/contacts/ContactFilters';
import type { Contact, RelationshipTrajectory } from '@/lib/types/database.types';

export default function ContactsPage() {
  const [supabase, setSupabase] = useState<ReturnType<typeof createClient> | null>(null);
  const [envError, setEnvError] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filter state
  const [search, setSearch] = useState('');
  const [trajectory, setTrajectory] = useState<RelationshipTrajectory | 'all'>('all');
  const [minRelevance, setMinRelevance] = useState(1);

  useEffect(() => {
    try {
      setSupabase(createClient());
    } catch (err: any) {
      setEnvError(err?.message || 'Missing Supabase env vars');
      setLoading(false);
      return;
    }
  }, []);

  useEffect(() => {
    if (supabase) loadContacts();
  }, [supabase]);

  useEffect(() => {
    applyFilters();
  }, [contacts, search, trajectory, minRelevance]);

  const loadContacts = async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from('contacts')
      .select('*')
      .order('created_at', { ascending: false });

    if (data) {
      setContacts(data);
    }
    setLoading(false);
  };

  const applyFilters = () => {
    let filtered = [...contacts];

    // Search by name
    if (search) {
      filtered = filtered.filter((c) =>
        c.full_name.toLowerCase().includes(search.toLowerCase())
      );
    }

    // Filter by trajectory
    if (trajectory !== 'all') {
      filtered = filtered.filter((c) => c.relationship_trajectory === trajectory);
    }

    // Filter by minimum strategic relevance
    filtered = filtered.filter(
      (c) => (c.strategic_relevance || 0) >= minRelevance
    );

    setFilteredContacts(filtered);
  };

  if (loading) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <p>Loading...</p>
        </main>
      </>
    );
  }

  if (envError) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="rounded-md border p-4">
            <h1 className="text-lg font-semibold">Supabase not configured</h1>
            <p className="mt-1 text-sm text-muted-foreground">{envError}</p>
            <p className="mt-3 text-sm">Set Netlify env vars: <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.</p>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Contacts</h1>
            <p className="mt-2 text-gray-600">
              {filteredContacts.length} of {contacts.length} contacts
            </p>
          </div>
          <Link href="/contacts/new">
            <Button>Add Contact</Button>
          </Link>
        </div>

        <div className="mb-6">
          <ContactFilters
            search={search}
            onSearchChange={setSearch}
            trajectory={trajectory}
            onTrajectoryChange={setTrajectory}
            minRelevance={minRelevance}
            onMinRelevanceChange={setMinRelevance}
          />
        </div>

        <ContactList contacts={filteredContacts} />
      </main>
    </>
  );
}