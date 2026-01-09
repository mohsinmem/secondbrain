'use client';

import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { extractFromConversation, type ExtractedItem } from '@/lib/extract/deterministic';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

type SaveMode = 'supabase' | 'local';

interface LocalConversation {
  id: string;
  title: string;
  raw: string;
  createdAt: string;
}

const LOCAL_KEY = 'aferr_secondbrain_inbox';

function loadLocal(): LocalConversation[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LocalConversation[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocal(convos: LocalConversation[]) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(convos.slice(0, 50)));
}

export function ConversationInbox() {
  const [title, setTitle] = useState('');
  const [source, setSource] = useState<'whatsapp' | 'linkedin' | 'other'>('whatsapp');
  const [rawText, setRawText] = useState('');
  const [items, setItems] = useState<ExtractedItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveMode, setSaveMode] = useState<SaveMode>('supabase');
  const [status, setStatus] = useState<string>('');

  const hasEnv = useMemo(() => {
    try {
      // If env vars are missing, createClient will throw.
      createClient();
      return true;
    } catch {
      return false;
    }
  }, []);

  const handleExtract = () => {
    const extracted = extractFromConversation(rawText);
    setItems(extracted);
    setStatus(extracted.length ? `Extracted ${extracted.length} candidate signals.` : 'Nothing extracted yet.');
  };

  const handleSaveConversation = async () => {
    setSaving(true);
    setStatus('');
    const t = title.trim() || `${source.toUpperCase()} Conversation`;

    // Fallback to local storage if Supabase env missing or user selects it.
    if (!hasEnv || saveMode === 'local') {
      const convos = loadLocal();
      const id = crypto.randomUUID();
      convos.unshift({ id, title: t, raw: rawText, createdAt: new Date().toISOString() });
      saveLocal(convos);
      setStatus('Saved locally (Supabase env not configured or Local mode selected).');
      setSaving(false);
      return;
    }

    try {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) {
        setStatus('You are not logged in. Please log in first.');
        setSaving(false);
        return;
      }

      // NOTE: This assumes your enum source_type includes 'manual'. If your enum differs,
      // switch this to the correct value in Supabase.
      const { error } = await supabase.from('raw_conversations').insert({
        user_id: userId,
        raw_text: rawText,
        title: t,
        source_type: 'manual',
        source_metadata: { source },
      } as any);

      if (error) {
        setStatus(`Saved failed in Supabase: ${error.message}. Saving locally instead.`);
        const convos = loadLocal();
        const id = crypto.randomUUID();
        convos.unshift({ id, title: t, raw: rawText, createdAt: new Date().toISOString() });
        saveLocal(convos);
      } else {
        setStatus('Saved to Supabase: raw_conversations');
      }
    } catch (e: any) {
      setStatus(`Supabase error: ${e?.message || 'unknown'}. Saved locally instead.`);
      const convos = loadLocal();
      const id = crypto.randomUUID();
      convos.unshift({ id, title: t, raw: rawText, createdAt: new Date().toISOString() });
      saveLocal(convos);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Inbox</CardTitle>
          <p className="text-sm text-muted-foreground">
            Paste a WhatsApp or LinkedIn thread. Extract candidates. Review before saving into your Rolodex graph.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="text-sm font-medium">Title (optional)</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Joel — DGS Pilot" />
            </div>
            <div>
              <label className="text-sm font-medium">Source</label>
              <select
                className="mt-2 w-full rounded-md border px-3 py-2 text-sm"
                value={source}
                onChange={(e) => setSource(e.target.value as any)}
              >
                <option value="whatsapp">WhatsApp</option>
                <option value="linkedin">LinkedIn</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Conversation</label>
            <Textarea
              className="mt-2 min-h-[260px]"
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Paste the full thread here…"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleExtract} disabled={!rawText.trim()}>
              Extract candidates
            </Button>
            <Button variant="secondary" onClick={handleSaveConversation} disabled={!rawText.trim() || saving}>
              {saving ? 'Saving…' : 'Save conversation'}
            </Button>
            <div className="ml-auto flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Save mode:</span>
              <select
                className="rounded-md border px-2 py-1"
                value={saveMode}
                onChange={(e) => setSaveMode(e.target.value as SaveMode)}
              >
                <option value="supabase">Supabase</option>
                <option value="local">Local only</option>
              </select>
            </div>
          </div>

          {status ? <div className="text-sm text-muted-foreground">{status}</div> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Review candidates</CardTitle>
          <p className="text-sm text-muted-foreground">
            This is the differentiator: you approve what becomes memory. AI comes later; this stub proves the loop.
          </p>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="text-sm text-muted-foreground">Run “Extract candidates” to see suggestions here.</div>
          ) : (
            <div className="space-y-3">
              {items.map((it, idx) => (
                <div key={`${it.type}-${it.label}-${idx}`} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">{it.type}</div>
                      <div className="font-medium">{it.label}</div>
                      <div className="mt-1 text-sm text-muted-foreground">{it.excerpt}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">confidence</div>
                      <div className="font-semibold">{Math.round(it.confidence * 100)}%</div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}>
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      onClick={async () => {
                        // For v0.1 we only auto-create Contacts for extracted people.
                        if (it.type !== 'person') {
                          setStatus('Accepted (UI only). We will wire signals/projects in the next iteration.');
                          return;
                        }

                        if (!hasEnv || saveMode === 'local') {
                          setStatus(`Accepted “${it.label}” (local mode). Next: wire to Supabase contacts.`);
                          return;
                        }

                        try {
                          const supabase = createClient();
                          const { data: auth } = await supabase.auth.getUser();
                          const userId = auth.user?.id;
                          if (!userId) {
                            setStatus('Please log in before accepting.');
                            return;
                          }

                          const { error } = await supabase.from('contacts').insert({
                            user_id: userId,
                            full_name: it.label,
                            contact_type: 'partner',
                            notes: `Auto-created from Inbox extraction.\\n\\nExcerpt: ${it.excerpt}`,
                            tags: ['inbox_extracted'],
                          } as any);

                          if (error) {
                            setStatus(`Could not create contact: ${error.message}`);
                          } else {
                            setStatus(`Created contact: ${it.label}`);
                            setItems((prev) => prev.filter((_, i) => i !== idx));
                          }
                        } catch (e: any) {
                          setStatus(`Supabase error: ${e?.message || 'unknown'}`);
                        }
                      }}
                    >
                      Accept
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
