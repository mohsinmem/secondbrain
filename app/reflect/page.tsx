'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type Action = 'accept' | 'reject' | 'defer' | 'edit';

interface Candidate {
  id: string;
  user_id: string;
  signal_type: string;
  label: string;
  description: string | null;
  confidence: number | null;
  confidence_level?: string | null;
  risk_of_misinterpretation: string | null;
  constraint_type: string | null;
  trust_evidence: string | null;
  action_suggested: boolean;
  related_themes: string[] | null;
  temporal_context: string | null;
  suggested_links: unknown;
  source_conversation_id: string | null;
  source_excerpt: string | null;
  excerpt_location: string | null;
  segment_id: string | null;
  review_status: string;
  deferred_until: string | null;
  created_at: string;
  updated_at: string | null;
}

interface ReviewResponse {
  data?: {
    status: string;
    signal_id?: string;
    already_existed?: boolean;
  };
  error?: string;
}

function jsonErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Unknown error';
}

async function safeJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function apiGetCandidates(conversationId: string): Promise<Candidate[]> {
  const res = await fetch(
    `/api/reflection/candidates?conversation_id=${encodeURIComponent(
      conversationId
    )}&review_status=pending`,
    {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    }
  );

  const json = await safeJson(res);
  if (!res.ok) {
    const msg = json?.error || `Failed to fetch candidates (${res.status})`;
    throw new Error(msg);
  }
  return (json?.data as Candidate[]) || [];
}

type ReviewBody =
  | { action: 'reject'; review_notes?: string | null }
  | { action: 'defer'; deferred_until: string; review_notes?: string | null }
  | {
      action: 'edit';
      updates: { label?: string; description?: string };
      review_notes?: string | null;
    }
  | {
      action: 'accept';
      elevated?: boolean;
      reflection_data?: { elevated?: boolean };
      user_notes?: string | null;
      review_notes?: string | null;
    };

async function apiReviewCandidate(
  candidateId: string,
  body: ReviewBody
): Promise<ReviewResponse> {
  const res = await fetch(`/api/reflection/candidates/${candidateId}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const json = await safeJson(res);

  if (!res.ok) {
    return { error: json?.error || 'Review action failed' };
  }

  return (json as ReviewResponse) || { error: 'Unexpected response' };
}

function addDaysYYYYMMDD(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  // YYYY-MM-DD
  return d.toISOString().slice(0, 10);
}

function formatDateTime(value: string): string {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

type NotesMode = 'accept' | 'elevate';

function ReflectPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const conversationId = searchParams.get('conversation_id');

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInFlight, setActionInFlight] = useState<boolean>(false);

  // Notes modal
  const [notesModalOpen, setNotesModalOpen] = useState<boolean>(false);
  const [notesDraft, setNotesDraft] = useState<string>('');

  // Edit modal
  const [editModalOpen, setEditModalOpen] = useState<boolean>(false);
  const [editLabelDraft, setEditLabelDraft] = useState<string>('');
  const [editDescriptionDraft, setEditDescriptionDraft] = useState<string>('');

  const currentCandidate = candidates[currentIndex] || null;

  const progressText = useMemo(() => {
    if (!candidates.length) return '0 / 0';
    const idx = Math.min(currentIndex + 1, candidates.length);
    return `${idx} / ${candidates.length}`;
  }, [currentIndex, candidates.length]);

  // --- Load
  useEffect(() => {
    if (!conversationId) {
      setError('Missing conversation_id');
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        const data = await apiGetCandidates(conversationId);
        if (cancelled) return;
        setCandidates(data);
        setCurrentIndex(0);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(jsonErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  // --- Navigation helpers
  const advanceToNext = () => {
    setNotesDraft('');
    setEditModalOpen(false);
    if (currentIndex < candidates.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      setCurrentIndex(candidates.length); // done state
    }
  };

  // --- Actions
  const handleReject = async () => {
    if (!currentCandidate || actionInFlight) return;
    setActionInFlight(true);

    const res = await apiReviewCandidate(currentCandidate.id, { action: 'reject' });

    setActionInFlight(false);

    if (res.error) {
      alert(`Error: ${res.error}`);
      return;
    }
    advanceToNext();
  };

  const handleAccept = async (elevated: boolean, userNotes?: string) => {
    if (!currentCandidate || actionInFlight) return;
    setActionInFlight(true);

    const body: ReviewBody = elevated
      ? {
          action: 'accept',
          elevated: true,
          reflection_data: { elevated: true },
          user_notes: userNotes?.trim() ? userNotes.trim() : null,
        }
      : {
          action: 'accept',
          user_notes: userNotes?.trim() ? userNotes.trim() : null,
        };

    const res = await apiReviewCandidate(currentCandidate.id, body);

    setActionInFlight(false);

    if (res.error) {
      alert(`Error: ${res.error}`);
      return;
    }

    advanceToNext();
  };

  const handleDefer = async () => {
    if (!currentCandidate || actionInFlight) return;
    setActionInFlight(true);

    const deferredUntil = addDaysYYYYMMDD(7);

    const res = await apiReviewCandidate(currentCandidate.id, {
      action: 'defer',
      deferred_until: deferredUntil,
    });

    setActionInFlight(false);

    if (res.error) {
      alert(`Error: ${res.error}`);
      return;
    }

    advanceToNext();
  };

  const openEditModal = () => {
    if (!currentCandidate) return;
    setEditLabelDraft(currentCandidate.label || '');
    setEditDescriptionDraft(currentCandidate.description || '');
    setEditModalOpen(true);
  };

  const handleEditSave = async () => {
    if (!currentCandidate || actionInFlight) return;

    const labelNext = editLabelDraft.trim();
    const descNext = editDescriptionDraft.trim();

    const updates: { label?: string; description?: string } = {};
    if (labelNext && labelNext !== currentCandidate.label) updates.label = labelNext;
    if (descNext !== (currentCandidate.description || '')) updates.description = descNext;

    // If nothing changed, just close
    if (Object.keys(updates).length === 0) {
      setEditModalOpen(false);
      return;
    }

    setActionInFlight(true);

    const res = await apiReviewCandidate(currentCandidate.id, {
      action: 'edit',
      updates,
    });

    setActionInFlight(false);

    if (res.error) {
      alert(`Error: ${res.error}`);
      return;
    }

    // Update locally, stay on same card
    setCandidates((prev) => {
      const next = [...prev];
      const c = next[currentIndex];
      if (!c) return prev;
      next[currentIndex] = {
        ...c,
        label: updates.label ?? c.label,
        description: updates.description ?? c.description,
      };
      return next;
    });

    setEditModalOpen(false);
  };

  // --- Notes modal (supports both accept & elevate)
  const openNotesModal = () => setNotesModalOpen(true);
  const closeNotesModal = () => setNotesModalOpen(false);

  const submitNotesWith = async (mode: NotesMode) => {
    const notes = notesDraft.trim() ? notesDraft.trim() : undefined;
    setNotesModalOpen(false);
    await handleAccept(mode === 'elevate', notes);
  };

  // --- Swipe gestures (touch + mouse drag)
  const cardRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    pointerId: number | null;
  }>({ active: false, startX: 0, startY: 0, lastX: 0, lastY: 0, pointerId: null });

  const resetCardTransform = () => {
    const el = cardRef.current;
    if (!el) return;
    el.style.transform = 'translate3d(0px,0px,0px)';
    el.style.transition = 'transform 120ms ease';
    window.setTimeout(() => {
      if (el) el.style.transition = '';
    }, 140);
  };

  const applyCardTransform = (dx: number, dy: number) => {
    const el = cardRef.current;
    if (!el) return;
    el.style.transform = `translate3d(${dx}px, ${dy}px, 0px)`;
  };

  const tryCommitSwipe = async (dx: number, dy: number) => {
    // thresholds tuned for mobile
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    // If vertical swipe up is significant and dominates, elevate
    if (dy < -90 && absY > absX * 1.1) {
      resetCardTransform();
      await handleAccept(true);
      return;
    }

    // Horizontal swipes
    if (dx > 110 && absX > absY) {
      resetCardTransform();
      await handleAccept(false);
      return;
    }
    if (dx < -110 && absX > absY) {
      resetCardTransform();
      await handleReject();
      return;
    }

    // Not enough gesture
    resetCardTransform();
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (actionInFlight || notesModalOpen || editModalOpen) return;
    dragRef.current.active = true;
    dragRef.current.startX = e.clientX;
    dragRef.current.startY = e.clientY;
    dragRef.current.lastX = e.clientX;
    dragRef.current.lastY = e.clientY;
    dragRef.current.pointerId = e.pointerId;
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.active || dragRef.current.pointerId !== e.pointerId) return;
    dragRef.current.lastX = e.clientX;
    dragRef.current.lastY = e.clientY;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;

    // prevent huge drag
    const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v));
    applyCardTransform(clamp(dx, 180), clamp(dy, 180));
  };

  const onPointerUp = async (e: React.PointerEvent) => {
    if (!dragRef.current.active || dragRef.current.pointerId !== e.pointerId) return;
    dragRef.current.active = false;
    const dx = dragRef.current.lastX - dragRef.current.startX;
    const dy = dragRef.current.lastY - dragRef.current.startY;
    dragRef.current.pointerId = null;
    await tryCommitSwipe(dx, dy);
  };

  // --- Rendering states
  if (!conversationId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <h1 className="text-xl font-semibold mb-4">Missing Conversation ID</h1>
        <p className="text-sm text-gray-600 mb-4">
          Open this page as <code className="px-1 py-0.5 bg-gray-100 rounded">/reflect?conversation_id=...</code>
        </p>
        <button
          onClick={() => router.push('/inbox')}
          className="px-4 py-2 bg-blue-600 text-white rounded"
        >
          Back to Inbox
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-600">Loading candidates…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <h1 className="text-xl font-semibold mb-4 text-red-600">Error</h1>
        <p className="mb-4 text-gray-700">{error}</p>
        <button
          onClick={() => router.push('/inbox')}
          className="px-4 py-2 bg-blue-600 text-white rounded"
        >
          Back to Inbox
        </button>
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <h1 className="text-xl font-semibold mb-2">No Pending Candidates</h1>
        <p className="text-sm text-gray-600 mb-4">
          Nothing to review for this conversation.
        </p>
        <button
          onClick={() => router.push('/inbox')}
          className="px-4 py-2 bg-blue-600 text-white rounded"
        >
          Back to Inbox
        </button>
      </div>
    );
  }

  if (currentIndex >= candidates.length || !currentCandidate) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <h1 className="text-xl font-semibold mb-2">All Done!</h1>
        <p className="text-sm text-gray-600 mb-4">You reviewed all candidates.</p>
        <button
          onClick={() => router.push('/inbox')}
          className="px-4 py-2 bg-blue-600 text-white rounded"
        >
          Back to Inbox
        </button>
      </div>
    );
  }

  const excerptToShow = currentCandidate.source_excerpt?.trim() || '';
  const excerptLocation = currentCandidate.excerpt_location?.trim() || '';

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="flex items-center justify-between p-4 bg-white shadow">
        <button onClick={() => router.push('/inbox')} className="text-blue-600 text-sm">
          ← Inbox
        </button>
        <span className="text-sm font-medium text-gray-700">{progressText}</span>
      </div>

      {/* Card */}
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        <div
          ref={cardRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="w-full max-w-md bg-white rounded-lg shadow-lg p-6 touch-none select-none"
          style={{ willChange: 'transform' }}
        >
          <div className="mb-3">
            <h2 className="text-2xl font-bold leading-tight">{currentCandidate.label}</h2>
            <div className="mt-1 text-xs text-gray-500">
              <span className="inline-block mr-2">
                <span className="font-medium">Type:</span> {currentCandidate.signal_type}
              </span>
              {currentCandidate.confidence !== null && (
                <span className="inline-block">
                  <span className="font-medium">Confidence:</span>{' '}
                  {Math.round(currentCandidate.confidence * 100)}%
                </span>
              )}
            </div>
          </div>

          {currentCandidate.description && (
            <p className="text-gray-700 mb-4 whitespace-pre-wrap">
              {currentCandidate.description}
            </p>
          )}

          {excerptToShow ? (
            <blockquote className="border-l-4 border-gray-300 pl-4 italic text-gray-700 mb-4 whitespace-pre-wrap">
              {excerptToShow}
            </blockquote>
          ) : (
            <div className="border border-dashed border-gray-300 rounded p-3 text-sm text-gray-600 mb-4">
              No excerpt available for this candidate.
            </div>
          )}

          {excerptLocation && (
            <p className="text-xs text-gray-500 mb-3">
              <span className="font-medium">Excerpt location:</span> {excerptLocation}
            </p>
          )}

          <div className="text-sm text-gray-600 space-y-1 mb-4">
            {currentCandidate.risk_of_misinterpretation && (
              <p>
                <span className="font-semibold">Risk:</span>{' '}
                {currentCandidate.risk_of_misinterpretation}
              </p>
            )}
            {currentCandidate.constraint_type && (
              <p>
                <span className="font-semibold">Constraint:</span>{' '}
                {currentCandidate.constraint_type}
              </p>
            )}
            <p className="text-xs text-gray-400">
              Created: {formatDateTime(currentCandidate.created_at)}
            </p>
          </div>

          {/* Gesture hint */}
          <div className="mb-4 text-xs text-gray-500">
            Swipe: Left=Reject • Right=Accept • Up=Elevate
          </div>

          {/* Controls */}
          <div className="grid grid-cols-2 gap-2 mb-2">
            <button
              onClick={handleReject}
              disabled={actionInFlight}
              className="px-4 py-2 bg-red-500 text-white rounded disabled:opacity-50"
            >
              Reject
            </button>
            <button
              onClick={() => handleAccept(false)}
              disabled={actionInFlight}
              className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
            >
              Accept
            </button>
            <button
              onClick={() => handleAccept(true)}
              disabled={actionInFlight}
              className="px-4 py-2 bg-purple-600 text-white rounded disabled:opacity-50"
            >
              Elevate
            </button>
            <button
              onClick={handleDefer}
              disabled={actionInFlight}
              className="px-4 py-2 bg-yellow-500 text-white rounded disabled:opacity-50"
            >
              Defer (+7d)
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={openEditModal}
              disabled={actionInFlight}
              className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
            >
              Edit
            </button>
            <button
              onClick={openNotesModal}
              disabled={actionInFlight}
              className="px-4 py-2 bg-gray-700 text-white rounded disabled:opacity-50"
            >
              Notes
            </button>
          </div>
        </div>
      </div>

      {/* Notes Modal */}
      {notesModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-2">Add notes</h3>
            <p className="text-sm text-gray-600 mb-4">
              Notes will be saved on the created signal when you Accept or Elevate.
            </p>

            <textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              className="w-full border border-gray-300 rounded p-2 mb-4"
              rows={5}
              placeholder="Enter your reflection notes…"
            />

            <div className="flex gap-2 mb-2">
              <button
                onClick={closeNotesModal}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded"
              >
                Cancel
              </button>
              <button
                onClick={() => setNotesDraft('')}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded"
                title="Clear notes"
              >
                Clear
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => submitNotesWith('accept')}
                disabled={actionInFlight}
                className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
              >
                Accept + Notes
              </button>
              <button
                onClick={() => submitNotesWith('elevate')}
                disabled={actionInFlight}
                className="px-4 py-2 bg-purple-600 text-white rounded disabled:opacity-50"
              >
                Elevate + Notes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Edit candidate</h3>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Label
              </label>
              <input
                type="text"
                value={editLabelDraft}
                onChange={(e) => setEditLabelDraft(e.target.value)}
                className="w-full border border-gray-300 rounded p-2"
                maxLength={160}
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={editDescriptionDraft}
                onChange={(e) => setEditDescriptionDraft(e.target.value)}
                className="w-full border border-gray-300 rounded p-2"
                rows={4}
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setEditModalOpen(false)}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleEditSave}
                disabled={actionInFlight}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
              >
                Save
              </button>
            </div>

            <p className="text-xs text-gray-500 mt-3">
              Saving does not advance to the next card.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReflectPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <p className="text-gray-600">Loading…</p>
        </div>
      }
    >
      <ReflectPageContent />
    </Suspense>
  );
}
