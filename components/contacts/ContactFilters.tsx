'use client';

import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import type { RelationshipTrajectory } from '@/lib/types/database.types';

interface ContactFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  trajectory: RelationshipTrajectory | 'all';
  onTrajectoryChange: (value: RelationshipTrajectory | 'all') => void;
  minRelevance: number;
  onMinRelevanceChange: (value: number) => void;
}

export function ContactFilters({
  search,
  onSearchChange,
  trajectory,
  onTrajectoryChange,
  minRelevance,
  onMinRelevanceChange,
}: ContactFiltersProps) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="space-y-2">
        <Label htmlFor="search">Search by name</Label>
        <Input
          id="search"
          type="search"
          placeholder="Search contacts..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="trajectory">Relationship Trajectory</Label>
        <Select
          id="trajectory"
          value={trajectory}
          onChange={(e) =>
            onTrajectoryChange(e.target.value as RelationshipTrajectory | 'all')
          }
        >
          <option value="all">All</option>
          <option value="emerging">Emerging</option>
          <option value="stable">Stable</option>
          <option value="dormant">Dormant</option>
          <option value="re_emerging">Re-emerging</option>
          <option value="declining">Declining</option>
          <option value="unknown">Unknown</option>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="relevance">Min Strategic Relevance</Label>
        <Select
          id="relevance"
          value={minRelevance.toString()}
          onChange={(e) => onMinRelevanceChange(Number(e.target.value))}
        >
          <option value="1">1 (Any)</option>
          <option value="2">2+</option>
          <option value="3">3+</option>
          <option value="4">4+</option>
          <option value="5">5 (Critical)</option>
        </Select>
      </div>
    </div>
  );
}