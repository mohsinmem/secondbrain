'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EventDetailPanel } from '@/components/events/EventDetailPanel';
import { TimelineView } from './TimelineView';
import { ActiveIntentBanner } from './ActiveIntentBanner';
import { IntentContextPanel } from './IntentContextPanel';
import { FocusToggle } from './FocusToggle';
import { LayoutList, Calendar as CalendarIcon, Info } from 'lucide-react';

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
    description?: string;
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
    const [mounted, setMounted] = useState(false);

    // Read URL params for deep-linking and filtering
    const searchParams = useSearchParams();
    const startParam = searchParams.get('start');
    const intentQuery = searchParams.get('intent_query');
    const [showFiltered, setShowFiltered] = useState(true); // Default to filtered view when intent is active

    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const weekRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
    const scrollContainerRef = React.useRef<HTMLDivElement | null>(null);

    // Monday-start week helper
    function startOfWeek(d: Date) {
        const date = new Date(d);
        const day = date.getDay();
        const diff = (day === 0 ? -6 : 1) - day;
        date.setDate(date.getDate() + diff);
        date.setHours(0, 0, 0, 0);
        return date;
    }

    function formatRangeLabel(weekStart: Date) {
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        return weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
            ' – ' +
            weekEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function formatWeekCompact(weekStart: Date) {
        return weekStart.toLocaleDateString([], { month: 'short', day: '2-digit' });
    }

    // Intent-based filtering logic (Tiered: Location > Title > Description > Attendees)
    const filteredEvents = useMemo(() => {
        if (!intentQuery || !showFiltered) return events;

        const lowerQuery = intentQuery.toLowerCase();

        return events.filter(ev => {
            if (ev.location?.toLowerCase().includes(lowerQuery)) return true;
            if (ev.title.toLowerCase().includes(lowerQuery)) return true;
            if (ev.description?.toLowerCase().includes(lowerQuery)) return true;
            if (ev.attendees?.some((a: string) => a.toLowerCase().includes(lowerQuery))) return true;
            return false;
        });
    }, [events, intentQuery, showFiltered]);

    const eventsByWeek = useMemo(() => {
        const groups = new Map<string, { weekStart: Date; items: CalendarEvent[] }>();
        const sourceEvents = intentQuery && showFiltered ? filteredEvents : events;

        for (const ev of sourceEvents) {
            const start = new Date(ev.start_at);
            const wk = startOfWeek(start);
            const key = wk.toISOString().slice(0, 10);
            if (!groups.has(key)) {
                groups.set(key, { weekStart: wk, items: [] });
            }
            groups.get(key)!.items.push(ev);
        }

        return Array.from(groups.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([key, g]) => {
                g.items.sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
                return { key, ...g };
            });
    }, [events, filteredEvents, intentQuery, showFiltered]);

    useEffect(() => {
        if (!scrollContainerRef.current || eventsByWeek.length === 0) return;
        const container = scrollContainerRef.current;
        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
                const first = visible[0];
                if (first?.target) {
                    const key = (first.target as HTMLElement).dataset.weekKey;
                    if (key) setActiveWeekKey(key);
                }
            },
            { root: container, rootMargin: '-10% 0px -80% 0px', threshold: 0.01 }
        );
        eventsByWeek.forEach((g) => {
            const el = document.querySelector(`[data-week-header="true"][data-week-key="${g.key}"]`);
            if (el) observer.observe(el);
        });
        return () => observer.disconnect();
    }, [eventsByWeek]);

    useEffect(() => {
        if (!startParam || eventsByWeek.length === 0 || projection !== 'list' || !scrollContainerRef.current) return;
        setTimeout(() => {
            const targetWeek = eventsByWeek.find(g => g.key === startParam);
            if (targetWeek && weekRefs.current[targetWeek.key]) {
                weekRefs.current[targetWeek.key]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 300);
    }, [startParam, eventsByWeek, projection]);

    useEffect(() => {
        setMounted(true);
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
            const { data, error } = await supabase.from('signal_edges').select('*');
            if (error) throw error;
            setEdges(data || []);
        } catch (error) {
            console.error('Error fetching edges:', error);
        }
    }

    async function fetchCalendarSources() {
        try {
            const supabase = createClient();
            const { data, error } = await supabase.from('calendar_sources').select('*').order('created_at', { ascending: false });
            if (error) throw error;
            setSources(data || []);
            if (data && data.length > 0 && !selectedSource) setSelectedSource(data[0].id);
        } catch (error: any) {
            console.error('Error fetching calendar sources:', error);
        } finally {
            setLoading(false);
        }
    }

    async function fetchEvents(sourceId: string) {
        try {
            const supabase = createClient();
            const { data, error } = await supabase.from('calendar_events').select('*, signals(id)').eq('source_id', sourceId).order('start_at', { ascending: true });
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
            const response = await fetch('/api/calendar/upload', { method: 'POST', body: formData });
            if (response.ok) {
                await fetchCalendarSources();
            }
        } catch (error: any) {
            console.error('Upload error:', error);
        } finally {
            setUploadingFile(false);
        }
    }

    async function handleCompleteLink(targetEventId: string) {
        if (!linkingContext) return;
        try {
            await fetch('/api/signals/edges', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source_event_id: linkingContext.sourceEventId, signal_id: linkingContext.signalId, target_event_id: targetEventId })
            });
            fetchEdges();
        } finally {
            setLinkingContext(null);
        }
    }

    if (loading || !mounted) return <div className="p-8 text-center text-gray-400 font-medium animate-pulse">Loading Orientation Layer...</div>;

    if (sources.length === 0) return (
        <Card className="p-8 text-center space-y-6">
            <h2 className="text-2xl font-bold">Welcome to Your Life Map</h2>
            <p className="text-gray-600">Import your calendar to see the structure of your life.</p>
            <input ref={fileInputRef} type="file" accept=".ics" onChange={handleFileUpload} className="hidden" />
            <Button onClick={() => fileInputRef.current?.click()} disabled={uploadingFile}>{uploadingFile ? 'Uploading...' : 'Import Calendar (.ics)'}</Button>
        </Card>
    );

    return (
        <div className="space-y-6">
            <ActiveIntentBanner />

            {searchParams.get('intent_card_type') && intentQuery && projection === 'list' && (
                <IntentContextPanel
                    intentType={searchParams.get('intent_card_type') as 'forecast' | 'reflection'}
                    intentQuery={intentQuery}
                    weekStart={startParam || ''}
                    weekEnd={searchParams.get('week_end') || ''}
                    eventCount={parseInt(searchParams.get('event_count') || '0')}
                />
            )}

            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Life Map</h1>
                    <p className="text-sm text-gray-600">{events.length} events • {showOverlays ? 'Showing' : 'Hiding'} orientation overlays</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setShowOverlays(!showOverlays)}>{showOverlays ? 'Hide' : 'Show'} Overlays</Button>
                    <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200 gap-1">
                        <Button variant={projection === 'list' ? 'default' : 'ghost'} size="sm" className="h-8 text-[11px] font-bold uppercase" onClick={() => setProjection('list')}>List</Button>
                        <Button variant={projection === 'timeline' ? 'default' : 'ghost'} size="sm" className="h-8 text-[11px] font-bold uppercase" onClick={() => setProjection('timeline')}>Timeline</Button>
                    </div>
                </div>
            </div>

            {projection === 'list' && (
                <FocusToggle
                    showFiltered={showFiltered}
                    setShowFiltered={setShowFiltered}
                    filteredCount={filteredEvents.length}
                    totalCount={events.length}
                    intentQuery={intentQuery || ''}
                />
            )}

            {projection === 'timeline' ? (
                <TimelineView events={events} edges={edges} showOverlays={showOverlays} onSelectEvent={(ev) => linkingContext ? handleCompleteLink(ev.id) : setSelectedEvent(ev)} />
            ) : (
                <>
                    <div className="flex items-center justify-between gap-3 bg-gray-50 p-3 rounded border overflow-x-auto no-scrollbar">
                        <div className="flex gap-2 py-1">
                            {eventsByWeek.map((g) => (
                                <button key={g.key} type="button" onClick={() => {
                                    const target = weekRefs.current[g.key];
                                    if (target && scrollContainerRef.current) {
                                        scrollContainerRef.current.scrollTo({ top: target.offsetTop - scrollContainerRef.current.offsetTop - 8, behavior: 'smooth' });
                                    }
                                }} className={`shrink-0 rounded border px-3 py-1 text-xs font-medium ${g.key === activeWeekKey ? "bg-gray-900 text-white" : "bg-white text-gray-600 border-gray-300"}`}>{formatWeekCompact(g.weekStart)}</button>
                            ))}
                        </div>
                    </div>

                    <Card className="p-0 overflow-hidden bg-white">
                        {eventsByWeek.length === 0 ? (
                            <div className="text-center py-16 px-4 space-y-6">
                                <div className="flex justify-center"><div className="bg-gray-50 p-4 rounded-full border border-gray-100">{intentQuery && showFiltered ? <Info className="h-8 w-8 text-blue-400" /> : <CalendarIcon className="h-8 w-8 text-gray-300" />}</div></div>
                                <div className="space-y-2 max-w-sm mx-auto">
                                    <h3 className="text-lg font-semibold">{intentQuery && showFiltered ? "0 events match your filters" : "No events found"}</h3>
                                    <p className="text-sm text-gray-500">{intentQuery && showFiltered ? `We found ${events.length} total events, but none match your focus on "${intentQuery}".` : "There are no events scheduled."}</p>
                                </div>
                                {intentQuery && showFiltered && <Button variant="outline" onClick={() => setShowFiltered(false)}>Show All {events.length} Events</Button>}
                            </div>
                        ) : (
                            <div ref={scrollContainerRef} className="max-h-[700px] overflow-y-auto custom-scrollbar">
                                {eventsByWeek.map((group) => (
                                    <div key={group.key} ref={(el) => { weekRefs.current[group.key] = el; }} className="border-b last:border-b-0 scroll-mt-24">
                                        <div data-week-header="true" data-week-key={group.key} className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b px-4 py-2 flex items-center justify-between">
                                            <div className="text-sm font-medium">Week: {formatRangeLabel(group.weekStart)}</div>
                                            {showOverlays && <div className="text-xs text-gray-600">{group.items.length} events</div>}
                                        </div>
                                        <div className="p-2 space-y-2">
                                            {group.items.map((event) => (
                                                <div key={event.id} onClick={() => setSelectedEvent(event)} className="border rounded p-3 hover:shadow-md cursor-pointer bg-white">
                                                    <div className="font-medium">{event.title}</div>
                                                    <div className="text-sm text-gray-600">{new Date(event.start_at).toLocaleDateString()} at {new Date(event.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                                    {event.location && <div className="text-sm text-gray-500 mt-1">📍 {event.location}</div>}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                </>
            )}

            {selectedEvent && (
                <>
                    <div className="fixed inset-0 bg-black/40 z-40 animate-in fade-in" onClick={() => setSelectedEvent(null)} />
                    <EventDetailPanel event={selectedEvent} onClose={() => setSelectedEvent(null)} onStartLinking={(signalId) => { setLinkingContext({ sourceEventId: selectedEvent.id, signalId }); setSelectedEvent(null); }} />
                </>
            )}
        </div>
    );
}
