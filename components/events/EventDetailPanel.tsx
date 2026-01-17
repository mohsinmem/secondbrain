'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';

interface CalendarEvent {
    id: string;
    title: string;
    start_at: string;
    end_at: string;
    location?: string;
    attendees?: string[];
    raw_payload?: any;
}

interface EventContext {
    id: string;
    event_id: string;
    context_type: 'note' | 'conversation' | 'document';
    content: string;
    created_at: string;
    updated_at: string;
}

interface SignalCandidate {
    candidate_text: string;
    why_surfaced: string;
    ambiguity_note: string;
}

interface EventDetailPanelProps {
    event: CalendarEvent | null;
    onClose: () => void;
}

export function EventDetailPanel({ event, onClose }: EventDetailPanelProps) {
    const [contexts, setContexts] = useState<EventContext[]>([]);
    const [loading, setLoading] = useState(false);
    const [isAddingNote, setIsAddingNote] = useState(false);
    const [newNote, setNewNote] = useState('');
    const [isLinkingConv, setIsLinkingConv] = useState(false);
    const [availableConvs, setAvailableConvs] = useState<any[]>([]);
    const [draftCandidates, setDraftCandidates] = useState<SignalCandidate[]>([]);
    const [extracting, setExtracting] = useState(false);

    useEffect(() => {
        if (event) {
            fetchContexts();
            setIsAddingNote(false);
            setIsLinkingConv(false);
            setDraftCandidates([]);
        }
    }, [event?.id]);

    async function fetchContexts() {
        if (!event) return;
        setLoading(true);
        try {
            const resp = await fetch(`/api/events/${event.id}/contexts`);
            if (resp.ok) {
                const data = await resp.json();
                setContexts(data);
            }
        } catch (err) {
            console.error('Failed to fetch contexts:', err);
        } finally {
            setLoading(false);
        }
    }

    async function handleAddNote() {
        if (!event || !newNote.trim()) return;
        setLoading(true);
        try {
            const resp = await fetch(`/api/events/${event.id}/contexts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ context_type: 'note', content: newNote.trim() })
            });
            if (resp.ok) {
                setNewNote('');
                setIsAddingNote(false);
                await fetchContexts();
            }
        } catch (err) {
            console.error('Failed to add note:', err);
        } finally {
            setLoading(false);
        }
    }

    async function handleDeleteContext(id: string) {
        if (!confirm('Are you sure you want to remove this context?')) return;
        setLoading(true);
        try {
            const resp = await fetch(`/api/events/contexts/${id}`, { method: 'DELETE' });
            if (resp.ok) {
                await fetchContexts();
            }
        } catch (err) {
            console.error('Failed to delete context:', err);
        } finally {
            setLoading(false);
        }
    }

    async function fetchConversations() {
        try {
            const resp = await fetch('/api/reflection/conversations');
            if (resp.ok) {
                const result = await resp.json();
                setAvailableConvs(result.data || []);
            }
        } catch (err) {
            console.error('Failed to fetch conversations:', err);
        }
    }

    async function handleLinkConversation(convId: string) {
        if (!event) return;
        setLoading(true);
        try {
            const resp = await fetch(`/api/events/${event.id}/contexts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ context_type: 'conversation', content: convId })
            });
            if (resp.ok) {
                setIsLinkingConv(false);
                await fetchContexts();
            }
        } catch (err) {
            console.error('Failed to link conversation:', err);
        } finally {
            setLoading(false);
        }
    }

    async function handleExtractSignals() {
        if (!event) return;
        setExtracting(true);
        try {
            const resp = await fetch(`/api/reflection/events/${event.id}/extract`, {
                method: 'POST'
            });
            if (resp.ok) {
                const data = await resp.json();
                setDraftCandidates(data.candidates || []);
            } else {
                const err = await resp.json();
                alert(`Extraction failed: ${err.details || err.error}`);
            }
        } catch (err) {
            console.error('Failed to extract signals:', err);
        } finally {
            setExtracting(false);
        }
    }

    if (!event) return null;

    const startDate = new Date(event.start_at);
    const endDate = new Date(event.end_at);
    const duration = (endDate.getTime() - startDate.getTime()) / (1000 * 60);

    const notes = contexts.filter(c => c.context_type === 'note');
    const convLinks = contexts.filter(c => c.context_type === 'conversation');

    return (
        <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl z-50 flex flex-col border-l border-gray-200 animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="p-4 border-b flex items-center justify-between bg-gray-50">
                <h2 className="text-lg font-bold truncate pr-4">Event Inspection</h2>
                <Button variant="outline" size="sm" onClick={onClose}>
                    Close
                </Button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8">
                {/* Core Metadata */}
                <section className="space-y-3">
                    <h1 className="text-2xl font-bold text-gray-900 leading-tight">
                        {event.title}
                    </h1>

                    <div className="grid grid-cols-[100px_1fr] gap-x-4 gap-y-2 text-sm text-gray-600">
                        <span className="font-medium text-gray-400">Time</span>
                        <span>
                            {startDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}<br />
                            {startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – {endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            {duration > 0 && <span className="text-gray-400 ml-2">({Math.round(duration)} min)</span>}
                        </span>

                        {event.location && (
                            <>
                                <span className="font-medium text-gray-400">Location</span>
                                <span>{event.location}</span>
                            </>
                        )}
                    </div>
                </section>

                {/* Attendees */}
                {event.attendees && event.attendees.length > 0 && (
                    <section className="space-y-3">
                        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">
                            Attendees ({event.attendees.length})
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {event.attendees.map((attendee, i) => (
                                <span
                                    key={i}
                                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200"
                                >
                                    {attendee}
                                </span>
                            ))}
                        </div>
                    </section>
                )}

                {/* Raw Payload (Truth Layer) - Collapsed by default */}
                <section className="space-y-3">
                    <details className="group">
                        <summary className="flex items-center justify-between text-[11px] font-bold text-gray-400 uppercase tracking-widest cursor-pointer list-none hover:text-gray-600 transition-colors">
                            <span>Inspect Raw Truth Atom</span>
                            <span className="text-[10px] font-normal group-open:hidden">▼</span>
                            <span className="text-[10px] font-normal group-open:inline hidden">▲</span>
                        </summary>
                        <div className="mt-3 p-3 border rounded-lg bg-gray-50 animate-in fade-in slide-in-from-top-1">
                            <Card className="p-3 bg-gray-900 text-gray-300 font-mono text-[10px] overflow-x-auto border-none shadow-inner">
                                <pre>{JSON.stringify(event.raw_payload, null, 2)}</pre>
                            </Card>
                            <p className="text-[9px] text-gray-400 mt-2 leading-normal uppercase tracking-wider">
                                Immutable Source Data · Traceability Safe
                            </p>
                        </div>
                    </details>
                </section>

                {/* Context Attachment (Step 2) */}
                <section className="space-y-6 pt-6 border-t border-gray-100">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
                            Event Context
                        </h3>
                        <span className="text-[10px] text-gray-400 font-medium bg-gray-100 px-2 py-0.5 rounded uppercase">
                            User Initiated
                        </span>
                    </div>

                    <div className="space-y-6">
                        {/* Display Existing Notes */}
                        {notes.length > 0 && (
                            <div className="space-y-3">
                                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Notes</h4>
                                {notes.map(note => (
                                    <div key={note.id} className="group relative bg-amber-50/30 border border-amber-100/50 rounded-lg p-3 text-sm text-gray-800">
                                        {note.content}
                                        <button
                                            onClick={() => handleDeleteContext(note.id)}
                                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity"
                                        >
                                            ✕
                                        </button>
                                        <div className="text-[9px] text-gray-400 mt-2">
                                            {new Date(note.created_at).toLocaleString()}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Display Linked Conversations */}
                        {convLinks.length > 0 && (
                            <div className="space-y-3">
                                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Linked Conversations</h4>
                                {convLinks.map(link => (
                                    <div key={link.id} className="group flex items-center justify-between bg-blue-50/30 border border-blue-100/50 rounded-lg p-3">
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg">💬</span>
                                            <span className="text-xs font-medium text-gray-700">Conversation ID: {link.content.slice(0, 8)}...</span>
                                        </div>
                                        <button
                                            onClick={() => handleDeleteContext(link.id)}
                                            className="text-gray-400 hover:text-red-500 text-xs"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Actions */}
                        {!isAddingNote && !isLinkingConv ? (
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="flex-1 h-9 text-xs"
                                    onClick={() => setIsAddingNote(true)}
                                >
                                    + Add Note
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="flex-1 h-9 text-xs"
                                    onClick={() => {
                                        setIsLinkingConv(true);
                                        fetchConversations();
                                    }}
                                >
                                    + Link Conversation
                                </Button>
                            </div>
                        ) : isAddingNote ? (
                            <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                                <Textarea
                                    placeholder="Add any context or thoughts..."
                                    value={newNote}
                                    onChange={(e) => setNewNote(e.target.value)}
                                    className="text-sm min-h-[100px]"
                                    autoFocus
                                />
                                <div className="flex gap-2">
                                    <Button size="sm" onClick={handleAddNote} disabled={loading || !newNote.trim()}>
                                        Save Note
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => setIsAddingNote(false)}>
                                        Cancel
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                                <h4 className="text-xs font-bold text-gray-700">Select Conversation to Link</h4>
                                <div className="max-h-40 overflow-y-auto border rounded-md divide-y bg-gray-50">
                                    {availableConvs.length === 0 ? (
                                        <div className="p-4 text-xs text-gray-500 text-center">
                                            No conversations found to link.
                                        </div>
                                    ) : (
                                        availableConvs.map(conv => (
                                            <button
                                                key={conv.id}
                                                onClick={() => handleLinkConversation(conv.id)}
                                                className="w-full text-left p-2 hover:bg-white text-xs transition-colors"
                                            >
                                                <div className="font-semibold text-gray-900">{conv.title || conv.source_filename || 'Untitled'}</div>
                                                <div className="text-gray-500 text-[10px] mt-0.5">
                                                    {conv.platform} • {new Date(conv.created_at).toLocaleDateString()}
                                                </div>
                                            </button>
                                        ))
                                    )}
                                </div>
                                <Button variant="ghost" size="sm" onClick={() => setIsLinkingConv(false)}>
                                    Cancel
                                </Button>
                            </div>
                        )}
                    </div>
                </section>

                {/* Signal Extraction (Step 3) */}
                {(contexts.length > 0) && (
                    <section className="space-y-6 pt-6 border-t border-gray-100">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
                                Emerging Signals
                            </h3>
                            <span className="text-[10px] text-indigo-500 font-bold bg-indigo-50 px-2 py-0.5 rounded uppercase tracking-widest">
                                AI Hypotheses
                            </span>
                        </div>

                        <div className="space-y-4">
                            {draftCandidates.length === 0 ? (
                                <div className="p-4 rounded-lg bg-indigo-50/30 border border-indigo-100/50 text-center">
                                    <p className="text-xs text-indigo-900/60 mb-3">
                                        Analyze attached context to surface possible observations.
                                    </p>
                                    <Button
                                        size="sm"
                                        className="bg-indigo-600 hover:bg-indigo-700 h-8 text-xs"
                                        onClick={handleExtractSignals}
                                        disabled={extracting}
                                    >
                                        {extracting ? 'Proposing...' : 'Propose Signal Candidates'}
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {draftCandidates.map((c, i) => (
                                        <Card key={i} className="p-4 bg-white border-indigo-100 shadow-sm space-y-3">
                                            <div className="text-sm font-medium text-gray-900">
                                                {c.candidate_text}
                                            </div>
                                            <div className="space-y-2">
                                                <div className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Why surfaced</div>
                                                <div className="text-xs text-gray-600 italic leading-relaxed">
                                                    "{c.why_surfaced}"
                                                </div>
                                            </div>
                                            <div className="p-2.5 rounded bg-gray-50 border border-gray-100">
                                                <div className="text-[10px] text-gray-400 uppercase tracking-widest font-bold mb-1">Ambiguity Note</div>
                                                <div className="text-[11px] text-gray-500 leading-relaxed">
                                                    {c.ambiguity_note}
                                                </div>
                                            </div>
                                        </Card>
                                    ))}
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="w-full text-[10px] uppercase tracking-widest text-indigo-600 hover:text-indigo-700"
                                        onClick={handleExtractSignals}
                                        disabled={extracting}
                                    >
                                        {extracting ? 'Refreshing...' : 'Re-run Hypothesis Engine'}
                                    </Button>
                                </div>
                            )}
                        </div>
                    </section>
                )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t bg-gray-50 text-[10px] text-gray-400 text-center uppercase tracking-widest">
                Structure Precedes Meaning · AFERR Phase 3.1
            </div>
        </div>
    );
}
