export type RelationshipTrajectory = 
  | 'emerging' 
  | 'stable' 
  | 'dormant' 
  | 're_emerging' 
  | 'declining' 
  | 'unknown';

export type RelationshipHistoryDepth = 
  | 'short' 
  | 'medium' 
  | 'long_term';

export type ReviewCadence = 
  | 'monthly' 
  | 'quarterly' 
  | 'annual' 
  | 'as_needed';

export type EngagementMode = 
  | 'collaborative' 
  | 'transactional' 
  | 'mentorship' 
  | 'social' 
  | 'mixed' 
  | 'unknown';

export type ContactType = 
  | 'client' 
  | 'partner' 
  | 'mentor' 
  | 'team_member' 
  | 'advisor' 
  | 'friend' 
  | 'family' 
  | 'other';

export interface Contact {
  id: string;
  user_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  contact_type: ContactType;
  notes: string | null;
  tags: string[] | null;
  last_contact_date: string | null;
  
  // AFERR fields
  relationship_trajectory: RelationshipTrajectory;
  relationship_history_depth: RelationshipHistoryDepth;
  current_intent_state: string | null;
  primary_engagement_mode: EngagementMode;
  trust_level: number | null;
  energy_impact: number | null;
  mutuality: number | null;
  relationship_strength: number | null;
  strategic_relevance: number | null;
  review_cadence: ReviewCadence;
  last_reviewed_at: string | null;
  
  created_at: string;
  updated_at: string;
}

export interface ContactInsert {
  full_name: string;
  email?: string | null;
  phone?: string | null;
  contact_type?: ContactType;
  notes?: string | null;
  tags?: string[] | null;
  last_contact_date?: string | null;
  
  relationship_trajectory?: RelationshipTrajectory;
  relationship_history_depth?: RelationshipHistoryDepth;
  current_intent_state?: string | null;
  primary_engagement_mode?: EngagementMode;
  trust_level?: number | null;
  energy_impact?: number | null;
  mutuality?: number | null;
  relationship_strength?: number | null;
  strategic_relevance?: number | null;
  review_cadence?: ReviewCadence;
  last_reviewed_at?: string | null;
}

export interface ContactUpdate extends Partial<ContactInsert> {}