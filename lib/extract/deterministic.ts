export type ExtractedItemType =
  | 'person'
  | 'organization'
  | 'project'
  | 'commitment'
  | 'next_action'
  | 'insight';

export interface ExtractedItem {
  type: ExtractedItemType;
  label: string;
  excerpt: string;
  confidence: number; // 0..1
  suggested_tags?: string[];
}

// A deterministic, non-AI parser so the Inbox → Review → Accept loop works end-to-end
// before we plug in Claude/OpenAI.
//
// It intentionally prioritizes precision over recall.
export function extractFromConversation(raw: string): ExtractedItem[] {
  const text = (raw || '').trim();
  if (!text) return [];

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const items: ExtractedItem[] = [];

  // WhatsApp-ish: "Name: message". Capture distinct names.
  const speakerRegex = /^([A-Z][^:]{1,40}):\s+(.*)$/;
  const speakers = new Set<string>();
  for (const l of lines) {
    const m = l.match(speakerRegex);
    if (m) {
      const name = m[1].trim();
      // Avoid capturing timestamps like "12/01/2026" etc.
      if (!/\d{1,2}[\/\-]\d{1,2}/.test(name)) speakers.add(name);
    }
  }
  for (const s of speakers) {
    items.push({
      type: 'person',
      label: s,
      excerpt: `Mentioned as a participant: ${s}`,
      confidence: 0.9,
      suggested_tags: ['source:conversation'],
    });
  }

  // Commitments / next actions.
  const commitmentKeywords = [
    'i will',
    "i'll",
    'we will',
    "we'll",
    'let\'s',
    'next step',
    'follow up',
    'sync',
    'call',
    'meeting',
    'introduce',
    'pilot',
    'walkthrough',
  ];
  const kw = new RegExp(`\\b(${commitmentKeywords.join('|')})\\b`, 'i');

  for (const l of lines) {
    if (kw.test(l)) {
      items.push({
        type: /introduce|pilot|walkthrough|follow up|next step|meeting|call|sync/i.test(l)
          ? 'next_action'
          : 'commitment',
        label: l.length > 80 ? l.slice(0, 77) + '…' : l,
        excerpt: l,
        confidence: 0.65,
        suggested_tags: ['needs_review'],
      });
    }
  }

  // Very light org detection: tokens with Inc, Ltd, LLC, “Global Services”, etc.
  const orgRegex = /\b([A-Z][A-Za-z&.\- ]{2,60}\s(?:Inc|Ltd|LLC|Services|Group|Company|Co\.|Corp|Corporation))\b/g;
  const orgs = new Set<string>();
  for (const l of lines) {
    let m: RegExpExecArray | null;
    while ((m = orgRegex.exec(l))) orgs.add(m[1].trim());
  }
  for (const o of orgs) {
    items.push({
      type: 'organization',
      label: o,
      excerpt: `Mentioned organization: ${o}`,
      confidence: 0.6,
    });
  }

  // Deduplicate by type+label.
  const seen = new Set<string>();
  return items.filter((it) => {
    const key = `${it.type}::${it.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
