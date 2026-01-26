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

    if (loading || !mounted) return <div className="p-8 text-center text-gray-400 font-medium animate-pulse">Initializing Associative Context...</div>;

    return (
        <div className="space-y-6">
            <ActiveIntentBanner />

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
                <ContextHubFeed
                    hubs={hubs}
                    onSelectHub={handleEnterLoop}
                />
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

            {/* Reprocess Trigger (Temporary for WO 5 verification) */}
            <div className="pt-10 flex border-t border-gray-100 justify-center">
                <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-gray-400 font-bold uppercase tracking-[0.2em]"
                    onClick={async () => {
                        setLoading(true);
                        await fetch('/api/calendar/reprocess');
                        await fetchHubs();
                    }}
                >
                    Reprocess Associative Logic
                </Button>
            </div>
        </div>
    );
}
