'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils';
import type { Contact } from '@/lib/types/database.types';

interface ContactListProps {
  contacts: Contact[];
}

export function ContactList({ contacts }: ContactListProps) {
  if (contacts.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No contacts found</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {contacts.map((contact) => (
        <Link key={contact.id} href={`/contacts/${contact.id}`}>
          <Card className="transition-shadow hover:shadow-md">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {contact.full_name}
                  </h3>
                  {contact.email && (
                    <p className="text-sm text-gray-600">{contact.email}</p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant="default">
                      {contact.relationship_trajectory}
                    </Badge>
                    <Badge variant="secondary">
                      {contact.primary_engagement_mode}
                    </Badge>
                    {contact.relationship_strength && (
                      <Badge variant="success">
                        Strength: {contact.relationship_strength}/5
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  {contact.strategic_relevance && (
                    <div className="text-sm font-medium text-gray-900">
                      Relevance: {contact.strategic_relevance}/5
                    </div>
                  )}
                  <div className="mt-1 text-xs text-gray-500">
                    Last contact: {formatDate(contact.last_contact_date)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}