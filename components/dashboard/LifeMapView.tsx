'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EventDetailPanel } from '@/components/events/EventDetailPanel';
import { TimelineView } from './TimelineView';

interface SignalEdge {
    id: string;
    source_event_id: string;
    signal_id: string;
    target_event_id: string;
    edge_type: string;
}

interface CalendarEvent {
    id: string;
    title: string;
    start_at: string;
    end_at: string;
    location?: string;
    attendees?: string[];
    signals?: { id: string }[]; // For count
}

interface CalendarSource {
    id: string;
    provider: string;
    date_range_start: string | null;
    date_range_end: string | null;
    status: string;
}

export function LifeMapView() {
    const [sources, setSources] = useState<CalendarSource[]>([]);
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [selectedSource, setSelectedSource] = useState<string | null>(null);
    const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
    const [loading, setLoading] = useState(true);
    const [showOverlays, setShowOverlays] = useState(true);
    const [activeWeekKey, setActiveWeekKey] = useState<string | null>(null);
    const [uploadingFile, setUploadingFile] = useState(false);
    const [projection, setProjection] = useState<'list' | 'timeline'>('list');
    const [edges, setEdges] = useState<SignalEdge[]>([]);
    const [linkingContext, setLinkingContext] = useState<{ sourceEventId: string; signalId: string } | null>(null);

    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const weekRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
    const scrollContainerRef = React.useRef<HTMLDivElement | null>(null);

    // --- Helpers for Grouping ---
    function pad2(n: number) {
        return n.toString().padStart(2, '0');
    }

    // Monday-start week
    function startOfWeek(d: Date) {
        const date = new Date(d);
        const day = date.getDay(); // 0=Sun,1=Mon...
        const diff = (day === 0 ? -6 : 1) - day; // shift to Monday
        date.setDate(date.getDate() + diff);
        date.setHours(0, 0, 0, 0);
        return date;
    }

    function formatRangeLabel(weekStart: Date) {
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);

        const start = `${weekStart.getFullYear()}-${pad2(weekStart.getMonth() + 1)}-${pad2(weekStart.getDate())}`;
        const end = `${weekEnd.getFullYear()}-${pad2(weekEnd.getMonth() + 1)}-${pad2(weekEnd.getDate())}`;

        return `${start} → ${end}`;
    }

    function formatWeekCompact(weekStart: Date) {
        // e.g., "Nov 04"
        return weekStart.toLocaleDateString([], { month: 'short', day: '2-digit' });
    }

    const eventsByWeek = useMemo(() => {
        const groups = new Map<string, { weekStart: Date; items: CalendarEvent[] }>();

        for (const ev of events) {
            const start = new Date(ev.start_at);
            const wk = startOfWeek(start);
            const key = wk.toISOString().slice(0, 10); // YYYY-MM-DD (week start)

            if (!groups.has(key)) {
                groups.set(key, { weekStart: wk, items: [] });
            }
            groups.get(key)!.items.push(ev);
        }

        const sorted = Array.from(groups.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([key, g]) => {
                g.items.sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
                return { key, ...g };
            });

        return sorted;
    }, [events]);

    useEffect(() => {
        if (!scrollContainerRef.current) return;
        if (eventsByWeek.length === 0) return;

        const container = scrollContainerRef.current;

        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((e) => e.isIntersecting)
                    .sort((a, b) => (a.boundingClientRect.top - b.boundingClientRect.top));

                const first = visible[0];
                if (first?.target) {
                    const key = (first.target as HTMLElement).dataset.weekKey;
                    if (key) setActiveWeekKey(key);
                }
            },
            {
                root: container,
                rootMargin: '-10% 0px -80% 0px',
                threshold: 0.01,
            }
        );

        eventsByWeek.forEach((g) => {
            const el = document.querySelector(`[data-week-header="true"][data-week-key="${g.key}"]`);
            if (el) observer.observe(el);
        });

        return () => observer.disconnect();
    }, [eventsByWeek]);

    useEffect(() => {
        fetchCalendarSources();
    }, []);

    useEffect(() => {
        if (selectedSource) {
            fetchEvents(selectedSource);
            fetchEdges();
        }
    }, [selectedSource]);

    async function fetchEdges() {
        try {
            const supabase = createClient();
            const { data, error } = await supabase
                .from('signal_edges')
                .select('*');
            if (error) throw error;
            setEdges(data || []);
        } catch (error) {
            console.error('Error fetching edges:', error);
        }
    }

    async function fetchCalendarSources() {
        try {
            const supabase = createClient();
            const { data, error } = await supabase
                .from('calendar_sources')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setSources(data || []);

            if (data && data.length > 0 && !selectedSource) {
                setSelectedSource(data[0].id);
            }
        } catch (error: any) {
            console.error('Error fetching calendar sources:', error);
            // Give a more helpful message if it's likely a missing table
            const msg = error.message || '';
            if (msg.includes('relation') || msg.includes('does not exist')) {
                alert('Database tables not found. Please run the Phase 3 migration (supabase/migrations/20260117143000_phase3_calendar_schema.sql) in your Supabase SQL Editor.');
            } else {
                alert(`Error fetching calendar sources: ${msg}`);
            }
        } finally {
            setLoading(false);
        }
    }

    async function fetchEvents(sourceId: string) {
        try {
            const supabase = createClient();
            const { data, error } = await supabase
                .from('calendar_events')
                .select('*, signals(id)')
                .eq('source_id', sourceId)
                .order('start_at', { ascending: true });

            if (error) throw error;
            setEvents(data || []);
        } catch (error: any) {
            console.error('Error fetching events:', error);
        }
    }

    async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingFile(true);
        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('/api/calendar/upload', {
                method: 'POST',
                body: formData,
            });

            // Handle non-JSON responses (like HTML error pages)
            const contentType = response.headers.get('content-type');
            let result;

            if (contentType && contentType.includes('application/json')) {
                result = await response.json();
            } else {
                const text = await response.text();
                console.error('Non-JSON response:', text);
                alert(`Upload failed: Server returned an error. Check browser console for details.`);
                return;
            }

            if (response.ok) {
                alert(`Successfully imported ${result.events_imported} events!${result.events_duplicate > 0 ? ` (${result.events_duplicate} duplicates skipped)` : ''}`);
                await fetchCalendarSources();
                if (result.source_id) {
                    setSelectedSource(result.source_id);
                }
            } else {
                alert(`Upload failed: ${result.error || 'Unknown error'}`);
            }
        } catch (error: any) {
            console.error('Upload error:', error);
            alert(`Upload error: ${error.message}`);
        } finally {
            setUploadingFile(false);
            // Reset the file input so the same file can be uploaded again
            if (e.target) {
                e.target.value = '';
            }
        }
    }

    if (loading) {
        return <div className="p-8 text-center">Loading...</div>;
    }

    if (sources.length === 0) {
        return (
            <div className="space-y-6">
                <Card className="p-8 text-center">
                    <h2 className="text-2xl font-bold mb-4">Welcome to Your Life Map</h2>
                    <p className="text-gray-600 mb-6">
                        Import your calendar to see the structure of your life.
                    </p>
                    <div className="space-y-4">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".ics"
                            onChange={handleFileUpload}
                            disabled={uploadingFile}
                            className="hidden"
                        />
                        <Button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploadingFile}
                        >
                            {uploadingFile ? 'Uploading...' : 'Import Calendar (.ics)'}
                        </Button>
                        <p className="text-sm text-gray-500">
                            Export your calendar as .ics from Google Calendar, Outlook, or Apple Calendar
                        </p>
                    </div>
                </Card>
            </div>
        );
    }

    async function handleCompleteLink(targetEventId: string) {
        if (!linkingContext) return;
        try {
            const response = await fetch('/api/signals/edges', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    source_event_id: linkingContext.sourceEventId,
                    signal_id: linkingContext.signalId,
                    target_event_id: targetEventId
                })
            });
            const result = await response.json();
            if (response.ok) {
                alert('Consequence thread created');
                fetchEdges();
            } else {
                alert(`Link failed: ${result.error || 'Check chronological guardrail'}`);
            }
        } catch (error: any) {
            alert(`Link error: ${error.message}`);
        } finally {
            setLinkingContext(null);
        }
    }

    return (
        <div className="space-y-6">
            {/* Header Controls */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Life Map</h1>
                    <p className="text-sm text-gray-600">
                        {events.length} events • {showOverlays ? 'Showing' : 'Hiding'} orientation overlays
                    </p>
                </div>
                <div className="flex gap-2">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".ics"
                        onChange={handleFileUpload}
                        disabled={uploadingFile}
                        className="hidden"
                    />
                    <Button
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingFile}
                    >
                        {uploadingFile ? 'Uploading...' : 'Import More'}
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => setShowOverlays(!showOverlays)}
                    >
                        {showOverlays ? 'Hide' : 'Show'} Overlays
                    </Button>
                    <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200 gap-1">
                        <Button
                            variant={projection === 'list' ? 'default' : 'ghost'}
                            size="sm"
                            className="h-8 text-[11px] font-bold uppercase tracking-widest px-4"
                            onClick={() => setProjection('list')}
                        >
                            List
                        </Button>
                        <Button
                            variant={projection === 'timeline' ? 'default' : 'ghost'}
                            size="sm"
                            className="h-8 text-[11px] font-bold uppercase tracking-widest px-4"
                            onClick={() => setProjection('timeline')}
                        >
                            Timeline
                        </Button>
                    </div>
                </div>
            </div>

            {projection === 'timeline' ? (
                <TimelineView
                    events={events}
                    edges={edges}
                    onSelectEvent={(ev) => {
                        if (linkingContext) {
                            handleCompleteLink(ev.id);
                        } else {
                            setSelectedEvent(ev);
                        }
                    }}
                />
            ) : (
                <>
                    {/* Overview Strip (Orientation Navigation Only) */}
                    <div className="flex items-center justify-between gap-3 bg-gray-50 p-3 rounded border">
                        <div className="text-sm font-medium text-gray-600 shrink-0">
                            Jump to week
                        </div>

                        <div className="flex-1 overflow-x-auto no-scrollbar">
                            <div className="flex gap-2 py-1">
                                {eventsByWeek.map((g) => {
                                    const isActive = g.key === activeWeekKey;
                                    return (
                                        <button
                                            key={g.key}
                                            type="button"
                                            onClick={() => {
                                                const target = weekRefs.current[g.key];
                                                if (target && scrollContainerRef.current) {
                                                    scrollContainerRef.current.scrollTo({
                                                        top: target.offsetTop - 8,
                                                        behavior: 'smooth',
                                                    });
                                                }
                                            }}
                                            className={[
                                                "shrink-0 rounded border px-3 py-1 text-xs font-medium transition-colors",
                                                isActive
                                                    ? "border-gray-900 bg-gray-900 text-white"
                                                    : "border-gray-300 bg-white text-gray-600 hover:border-gray-400 hover:bg-gray-50"
                                            ].join(" ")}
                                            aria-label={`Jump to week starting ${formatWeekCompact(g.weekStart)}`}
                                        >
                                            {formatWeekCompact(g.weekStart)}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Simple Timeline View (Canonical List) */}
                    <Card className="p-0 overflow-hidden">
                        <div className="">
                            {events.length === 0 ? (
                                <p className="text-gray-500 text-center py-8">No events found</p>
                            ) : (
                                <div ref={scrollContainerRef} className="max-h-[700px] overflow-y-auto custom-scrollbar">
                                    {eventsByWeek.map((group) => {
                                        const count = group.items.length;

                                        // Neutral density bar: fixed max width, no gradients, no "heat"
                                        const maxBars = 12;
                                        const bars = Math.min(maxBars, Math.round(count / 3));

                                        return (
                                            <div
                                                key={group.key}
                                                ref={(el) => { weekRefs.current[group.key] = el; }}
                                                className="border-b last:border-b-0"
                                            >
                                                {/* Sticky week header */}
                                                <div
                                                    data-week-header="true"
                                                    data-week-key={group.key}
                                                    className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b px-4 py-2 flex items-center justify-between"
                                                >
                                                    <div className="text-sm font-medium text-gray-900">
                                                        Week: {formatRangeLabel(group.weekStart)}
                                                    </div>

                                                    {/* Descriptive only: count + small bar */}
                                                    {showOverlays && (
                                                        <div className="flex items-center gap-3">
                                                            <div className="text-xs text-gray-600">{count} events</div>
                                                            <div className="flex gap-1" aria-label={`Week density: ${count} events`}>
                                                                {Array.from({ length: bars }).map((_, i) => (
                                                                    <div key={i} className="h-2 w-2 rounded-sm bg-gray-300" />
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Week events */}
                                                <div className="p-2 space-y-2">
                                                    {group.items.map((event) => {
                                                        const startDate = new Date(event.start_at);
                                                        const endDate = new Date(event.end_at);
                                                        const duration = (endDate.getTime() - startDate.getTime()) / (1000 * 60); // minutes

                                                        return (
                                                            <div
                                                                key={event.id}
                                                                onClick={() => setSelectedEvent(event)}
                                                                className="border rounded p-3 hover:shadow-md transition-shadow cursor-pointer bg-white"
                                                            >
                                                                <div className="font-medium">{event.title}</div>
                                                                <div className="text-sm text-gray-600 mt-1">
                                                                    {startDate.toLocaleDateString()} at{' '}
                                                                    {startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                    {duration > 0 && ` · ${Math.round(duration)}min`}
                                                                </div>

                                                                {event.location && (
                                                                    <div className="text-sm text-gray-500 mt-1">📍 {event.location}</div>
                                                                )}

                                                                <div className="text-sm text-gray-500 mt-1 inline-flex items-center gap-3">
                                                                    {event.attendees && event.attendees.length > 0 && showOverlays && (
                                                                        <span>Attendees: {event.attendees.length}</span>
                                                                    )}
                                                                    {event.signals && event.signals.length > 0 && (
                                                                        <span className={`flex items-center gap-1 text-gray-400 ${event.attendees && event.attendees.length > 0 && showOverlays ? 'border-l border-gray-200 pl-3' : ''}`}>
                                                                            Signals: {event.signals.length}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </Card>
                </>
            )}

            {/* Event Detail Panel Overlay */}
            {
                selectedEvent && (
                    <>
                        <div
                            className="fixed inset-0 bg-black/40 z-40 animate-in fade-in"
                            onClick={() => {
                                setSelectedEvent(null);
                                setLinkingContext(null);
                            }}
                        />
                        <EventDetailPanel
                            event={selectedEvent}
                            onClose={() => {
                                setSelectedEvent(null);
                                setLinkingContext(null);
                            }}
                            onStartLinking={(signalId) => {
                                setLinkingContext({ sourceEventId: selectedEvent.id, signalId });
                                setSelectedEvent(null); // Close panel to allow map selection
                            }}
                        />
                    </>
                )
            }
            {linkingContext && (
                <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-4 animate-in slide-in-from-bottom-4">
                    <span className="text-sm font-bold uppercase tracking-widest text-gray-300">
                        Linking Mode
                    </span>
                    <span className="text-xs text-gray-400 border-l border-gray-700 pl-4">
                        Select a future event on the map to anchor this consequence
                    </span>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-white hover:text-red-400 h-8 text-xs font-bold uppercase tracking-widest"
                        onClick={() => setLinkingContext(null)}
                    >
                        Cancel
                    </Button>
                </div>
            )}
        </div>
    );
}
