/**
 * LifeMapView (Work Order 5 Overhaul)
 * 
 * Primary dashboard view focused on Contextual Hubs and Reflection.
 * Pivots from raw Truth (List) to Orientation (Hubs).
 */

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EventDetailPanel } from '@/components/events/EventDetailPanel';
import { TimelineView } from './TimelineView';
import { ActiveIntentBanner } from './ActiveIntentBanner';
import { ContextHubFeed } from './ContextHubFeed';
import { SwipeInterface } from '@/components/reflection/SwipeInterface';
import { BrainCircuit, LayoutList, Calendar as CalendarIcon, Info } from 'lucide-react';

interface ContextHub {
    id: string;
    title: string;
    type: 'travel' | 'project' | 'anchor';
    start_at: string;
    end_at: string;
    items_count: number;
    description?: string;
}

export function LifeMapView() {
    const [hubs, setHubs] = useState<ContextHub[]>([]);
    const [events, setEvents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'hubs' | 'raw' | 'swipe'>('hubs');
    const [activeHubId, setActiveHubId] = useState<string | null>(null);
    const [candidates, setCandidates] = useState<any[]>([]);
    const [mounted, setMounted] = useState(false);

    const searchParams = useSearchParams();
    const router = useRouter();

    useEffect(() => {
        setMounted(true);
        fetchHubs();
    }, []);

    async function fetchHubs() {
        try {
            const supabase = createClient();
            const { data, error } = await supabase
                .from('context_hubs')
                .select('*, calendar_events(count)')
                .order('start_at', { ascending: false });

            if (error) throw error;

            setHubs(data.map((h: any) => ({
                id: h.id,
                title: h.title,
                type: h.type,
                start_at: h.start_at,
                end_at: h.end_at,
                items_count: h.calendar_events[0]?.count || 0,
                description: h.metadata?.description
            })));
        } catch (error) {
            console.error('Error fetching hubs:', error);
        } finally {
            setLoading(false);
        }
    }

    async function handleEnterLoop(hubId: string) {
        setLoading(true);
        setActiveHubId(hubId);
        try {
            // Fetch candidates from API
            const res = await fetch(`/api/reflection/candidates?hub_id=${hubId}`);
            const data = await res.json();
            if (data.candidates) {
                setCandidates(data.candidates);
                setViewMode('swipe');
            }
        } catch (error) {
            console.error('Failed to load candidates', error);
        } finally {
            setLoading(false);
        }
    }

    async function handlePromote(eventId: string) {
        try {
            await fetch('/api/reflection/promote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ event_id: eventId })
            });
        } catch (error) {
            console.error('Promote failed', error);
        }
    }

    const [reprocessed, setReprocessed] = useState(false);
    const [report, setReport] = useState<any>(null);

    async function handleReprocess(forceSync: boolean = false) {
        setLoading(true);
        try {
            const res = await fetch(`/api/calendar/reprocess${forceSync ? '?force=true' : ''}`);
            const data = await res.json();
            if (data.success) {
                setReport(data.report);
                setReprocessed(true);
                await fetchHubs();
            }
        } catch (error) {
            console.error('Reprocess failed', error);
        } finally {
            setLoading(false);
        }
    }

    if (loading || !mounted) return <div className="p-8 text-center text-gray-400 font-medium animate-pulse">Initializing Associative Context...</div>;

    return (
        <div className="space-y-6">
            <ActiveIntentBanner />

            {/* Integrity Report (Directive: Semantic Coverage & Integrity Report) */}
            {report && (
                <Card className="p-4 bg-gray-900 text-white border-0 shadow-2xl overflow-hidden relative">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                        <BrainCircuit className="h-20 w-20" />
                    </div>
                    <div className="relative z-10 space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-bold uppercase tracking-widest text-blue-400">
                                Semantic Coverage Report
                            </h2>
                            <span className="text-[10px] font-bold bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded border border-blue-500/30">
                                Phase 5.2
                            </span>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <div className="text-2xl font-bold">{Math.round(report.coverage?.anchored_pct || 0)}%</div>
                                <div className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Anchored Coverage</div>
                                <div className="w-full bg-white/10 h-1 rounded-full overflow-hidden mt-2">
                                    <div className="bg-blue-400 h-full" style={{ width: `${report.coverage?.anchored_pct}%` }} />
                                </div>
                            </div>
                            <div className="space-y-1 text-right">
                                <div className="text-2xl font-bold">{report.primary_anchors_found}</div>
                                <div className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Anchors Recovered</div>
                            </div>
                        </div>

                        <div className="pt-2 border-t border-white/10 text-[11px] text-gray-400 flex items-center gap-2">
                            <Info className="h-3 w-3 text-blue-400" />
                            <span>Gap Analysis: {report.gap_analysis}</span>
                        </div>
                    </div>
                </Card>
            )}

            {/* Header / Mode Toggles */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Pulse Feed</h1>
                    <p className="text-sm text-gray-600">
                        {viewMode === 'hubs' ? 'Grouping your truth into contextual hubs.' :
                            viewMode === 'swipe' ? 'Reviewing candidates for your Wisdom Layer.' :
                                'Raw event list (Truth Layer).'}
                    </p>
                </div>
                {viewMode !== 'swipe' && (
                    <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200 gap-1">
                        <Button
                            variant={viewMode === 'hubs' ? 'default' : 'ghost'}
                            size="sm"
                            className="h-8 text-[11px] font-bold uppercase tracking-widest px-4"
                            onClick={() => setViewMode('hubs')}
                        >
                            Hubs
                        </Button>
                        <Button
                            variant={viewMode === 'raw' ? 'default' : 'ghost'}
                            size="sm"
                            className="h-8 text-[11px] font-bold uppercase tracking-widest px-4"
                            onClick={() => setViewMode('raw')}
                        >
                            Raw
                        </Button>
                    </div>
                )}
            </div>

            {/* Main Content Area */}
            {viewMode === 'hubs' ? (
                <div className="space-y-4">
                    {!reprocessed && hubs.length === 0 && (
                        <div className="p-10 border-2 border-dashed border-gray-100 rounded-2xl text-center space-y-4 bg-gray-50/30">
                            <div className="bg-blue-50 h-12 w-12 rounded-full flex items-center justify-center mx-auto border border-blue-100">
                                <BrainCircuit className="h-6 w-6 text-blue-500" />
                            </div>
                            <div className="space-y-1">
                                <h3 className="font-bold text-gray-900">Initialize Associative Logic</h3>
                                <p className="text-xs text-gray-500 max-w-xs mx-auto">
                                    Click below to cluster your 250 events into contextual hubs and recover peripheral anchors.
                                </p>
                            </div>
                            <div className="flex flex-col gap-2 pt-2">
                                <Button onClick={() => handleReprocess(false)} className="w-full bg-blue-600 hover:bg-blue-700">
                                    Run Base Reprocessing
                                </Button>
                                <Button onClick={() => handleReprocess(true)} variant="outline" className="w-full text-xs">
                                    Force Re-Sync & Recover Anchors
                                </Button>
                            </div>
                        </div>
                    )}
                    <ContextHubFeed
                        hubs={hubs}
                        onSelectHub={handleEnterLoop}
                    />
                </div>
            ) : viewMode === 'swipe' ? (
                <div className="max-w-md mx-auto">
                    <SwipeInterface
                        candidates={candidates}
                        onPromote={handlePromote}
                        onFinish={() => {
                            setViewMode('hubs');
                            setActiveHubId(null);
                        }}
                    />
                </div>
            ) : (
                <Card className="p-8 text-center text-gray-400 border-dashed">
                    Raw list view is being optimized for the Truth-to-Orientation shift.
                    <Button variant="ghost" onClick={() => setViewMode('hubs')} className="block mx-auto mt-2 text-blue-500">
                        Back to Hubs
                    </Button>
                </Card>
            )}

            {/* Reprocess Trigger (Footer) */}
            {(reprocessed || hubs.length > 0) && (
                <div className="pt-10 flex border-t border-gray-100 justify-center">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-gray-400 font-bold uppercase tracking-[0.2em]"
                        onClick={() => handleReprocess(false)}
                    >
                        Refresh Hub Logic
                    </Button>
                </div>
            )}
        </div>
    );
}
