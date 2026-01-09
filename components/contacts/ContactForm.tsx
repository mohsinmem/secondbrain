'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import type { Contact, ContactInsert } from '@/lib/types/database.types';

interface ContactFormProps {
  contact?: Contact;
  mode: 'create' | 'edit';
}

export function ContactForm({ contact, mode }: ContactFormProps) {
  const router = useRouter();
  // Create the client lazily so a missing env doesn't crash render.
  const getSupabase = () => {
    try {
      return createClient();
    } catch (err: any) {
      throw new Error(err?.message || 'Missing Supabase env vars');
    }
  };
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<ContactInsert>({
    full_name: contact?.full_name || '',
    email: contact?.email || '',
    phone: contact?.phone || '',
    contact_type: contact?.contact_type || 'other',
    notes: contact?.notes || '',
    current_intent_state: contact?.current_intent_state || '',
    relationship_trajectory: contact?.relationship_trajectory || 'unknown',
    relationship_history_depth: contact?.relationship_history_depth || 'short',
    primary_engagement_mode: contact?.primary_engagement_mode || 'unknown',
    trust_level: contact?.trust_level || null,
    energy_impact: contact?.energy_impact || null,
    mutuality: contact?.mutuality || null,
    relationship_strength: contact?.relationship_strength || null,
    strategic_relevance: contact?.strategic_relevance || null,
    review_cadence: contact?.review_cadence || 'as_needed',
    last_contact_date: contact?.last_contact_date || null,
    last_reviewed_at: contact?.last_reviewed_at || null,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = getSupabase();
      if (mode === 'create') {
        const { error: insertError } = await supabase
          .from('contacts')
          .insert([formData]);

        if (insertError) throw insertError;
      } else {
        const { error: updateError } = await supabase
          .from('contacts')
          .update(formData)
          .eq('id', contact!.id);

        if (updateError) throw updateError;
      }

      router.push('/contacts');
      router.refresh();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this contact?')) return;

    setLoading(true);
    let supabase;
    try {
      supabase = getSupabase();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
      return;
    }
    const { error: deleteError } = await supabase
      .from('contacts')
      .delete()
      .eq('id', contact!.id);

    if (deleteError) {
      setError(deleteError.message);
      setLoading(false);
    } else {
      router.push('/contacts');
      router.refresh();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Basic Information */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Basic Information</h3>
        
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="full_name">Full Name *</Label>
            <Input
              id="full_name"
              required
              value={formData.full_name}
              onChange={(e) =>
                setFormData({ ...formData, full_name: e.target.value })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email || ''}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              value={formData.phone || ''}
              onChange={(e) =>
                setFormData({ ...formData, phone: e.target.value })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact_type">Contact Type</Label>
            <Select
              id="contact_type"
              value={formData.contact_type}
              onChange={(e) =>
                setFormData({ ...formData, contact_type: e.target.value as any })
              }
            >
              <option value="client">Client</option>
              <option value="partner">Partner</option>
              <option value="mentor">Mentor</option>
              <option value="team_member">Team Member</option>
              <option value="advisor">Advisor</option>
              <option value="friend">Friend</option>
              <option value="family">Family</option>
              <option value="other">Other</option>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <textarea
            id="notes"
            className="flex min-h-[100px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            value={formData.notes || ''}
            onChange={(e) =>
              setFormData({ ...formData, notes: e.target.value })
            }
          />
        </div>
      </div>

      {/* AFERR Relationship Fields */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Relationship Dynamics</h3>
        
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="relationship_trajectory">Trajectory</Label>
            <Select
              id="relationship_trajectory"
              value={formData.relationship_trajectory}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  relationship_trajectory: e.target.value as any,
                })
              }
            >
              <option value="emerging">Emerging</option>
              <option value="stable">Stable</option>
              <option value="dormant">Dormant</option>
              <option value="re_emerging">Re-emerging</option>
              <option value="declining">Declining</option>
              <option value="unknown">Unknown</option>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="relationship_history_depth">History Depth</Label>
            <Select
              id="relationship_history_depth"
              value={formData.relationship_history_depth}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  relationship_history_depth: e.target.value as any,
                })
              }
            >
              <option value="short">Short</option>
              <option value="medium">Medium</option>
              <option value="long_term">Long-term</option>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="primary_engagement_mode">Engagement Mode</Label>
            <Select
              id="primary_engagement_mode"
              value={formData.primary_engagement_mode}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  primary_engagement_mode: e.target.value as any,
                })
              }
            >
              <option value="collaborative">Collaborative</option>
              <option value="transactional">Transactional</option>
              <option value="mentorship">Mentorship</option>
              <option value="social">Social</option>
              <option value="mixed">Mixed</option>
              <option value="unknown">Unknown</option>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="review_cadence">Review Cadence</Label>
            <Select
              id="review_cadence"
              value={formData.review_cadence}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  review_cadence: e.target.value as any,
                })
              }
            >
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option>
              <option value="as_needed">As Needed</option>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="current_intent_state">Current Intent</Label>
            <Input
              id="current_intent_state"
              placeholder="e.g., Exploring collaboration"
              value={formData.current_intent_state || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  current_intent_state: e.target.value,
                })
              }
            />
          </div>
        </div>
      </div>

      {/* AFERR Metrics */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Relationship Metrics</h3>
        
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="trust_level">Trust Level (1-5)</Label>
            <Input
              id="trust_level"
              type="number"
              min="1"
              max="5"
              value={formData.trust_level || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  trust_level: e.target.value ? Number(e.target.value) : null,
                })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="energy_impact">Energy Impact (-5 to +5)</Label>
            <Input
              id="energy_impact"
              type="number"
              min="-5"
              max="5"
              value={formData.energy_impact || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  energy_impact: e.target.value ? Number(e.target.value) : null,
                })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="mutuality">Mutuality (1-5)</Label>
            <Input
              id="mutuality"
              type="number"
              min="1"
              max="5"
              value={formData.mutuality || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  mutuality: e.target.value ? Number(e.target.value) : null,
                })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="relationship_strength">
              Relationship Strength (1-5)
            </Label>
            <Input
              id="relationship_strength"
              type="number"
              min="1"
              max="5"
              value={formData.relationship_strength || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  relationship_strength: e.target.value
                    ? Number(e.target.value)
                    : null,
                })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="strategic_relevance">
              Strategic Relevance (1-5)
            </Label>
            <Input
              id="strategic_relevance"
              type="number"
              min="1"
              max="5"
              value={formData.strategic_relevance || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  strategic_relevance: e.target.value
                    ? Number(e.target.value)
                    : null,
                })
              }
            />
          </div>
        </div>
      </div>

      {/* Dates */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Dates</h3>
        
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="last_contact_date">Last Contact Date</Label>
            <Input
              id="last_contact_date"
              type="date"
              value={formData.last_contact_date || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  last_contact_date: e.target.value,
                })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="last_reviewed_at">Last Reviewed</Label>
            <Input
              id="last_reviewed_at"
              type="date"
              value={
                formData.last_reviewed_at
                  ? new Date(formData.last_reviewed_at)
                      .toISOString()
                      .split('T')[0]
                  : ''
              }
              onChange={(e) =>
                setFormData({
                  ...formData,
                  last_reviewed_at: e.target.value
                    ? new Date(e.target.value).toISOString()
                    : null,
                })
              }
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-4">
        <Button type="submit" disabled={loading}>
          {loading ? 'Saving...' : mode === 'create' ? 'Create Contact' : 'Save Changes'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/contacts')}
        >
          Cancel
        </Button>
        {mode === 'edit' && (
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={loading}
            className="ml-auto"
          >
            Delete Contact
          </Button>
        )}
      </div>
    </form>
  );
}