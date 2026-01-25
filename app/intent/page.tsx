'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ArrowRight, Bookmark, X, Calendar } from 'lucide-react';

interface IntentCard {
    id: string;
    type: 'forecast' | 'reflection';
    title: string;
    payload_json: {
        version: string;
        window: {
            start: string;
            end: string;
        };
    };
}

export default function IntentPage() {
    const router = useRouter();
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [resultCards, setResultCards] = useState<IntentCard[]>([]);
    const [intentId, setIntentId] = useState<string | null>(null);
    const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
    const [error, setError] = useState<string | null>(null);

    const handleRunIntent = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim()) return;

        setLoading(true);
        setError(null);
        setResultCards([]);
        setIntentId(null);

        try {
            const res = await fetch('/api/intent/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, horizon_days: 21 }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to run intent');
            }

            setIntentId(data.intent_id);
            setResultCards(data.cards || []);
        } catch (error: any) {
            console.error(error);
            setError(error.message || 'Something went wrong');
        } finally {
            setLoading(false);
        }
    };

    const handleFeedback = async (cardId: string, action: 'save' | 'dismiss') => {
        // UI Optimistic update
        if (action === 'dismiss') {
            setDismissedIds(prev => new Set(prev).add(cardId));
        }

        try {
            await fetch('/api/intent/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ intent_card_id: cardId, action }),
            });
        } catch (error) {
            console.error('Feedback failed', error);
        }
    };

    const handleNavigate = (card: IntentCard) => {
        // Contract A: Start must be MONDAY (local timezone)
        const startISO = card.payload_json.window.start;
        const endISO = card.payload_json.window.end;
        const startDate = startISO.split('T')[0]; // simple YYYY-MM-DD
        const endDate = endISO.split('T')[0];

        // Navigate with full context metadata for orientation panel
        const intentQuery = intentId ? `&intent_id=${intentId}` : '';
        const contextParams = `&intent_card_type=${card.type}&intent_query=${encodeURIComponent(query)}&week_end=${endDate}&event_count=0`;
        router.push(`/dashboard?mode=list${intentQuery}&start=${startDate}${contextParams}`);
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-lg space-y-8">

                {/* Header / Input Section */}
                <div className="text-center space-y-6">
                    <h1 className="text-2xl font-light text-gray-800 tracking-tight">
                        What's top of mind right now?
                    </h1>

                    <form onSubmit={handleRunIntent} className="relative">
                        <Input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="e.g. Preparing for Dubai trip..."
                            className="h-14 text-lg px-6 rounded-full shadow-sm border-gray-200 focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                            disabled={loading}
                            autoFocus
                        />
                        <Button
                            type="submit"
                            disabled={loading || !query.trim()}
                            className="absolute right-2 top-2 rounded-full h-10 w-10 p-0"
                            size="icon"
                        >
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                        </Button>
                    </form>
                    {error && (
                        <div className="text-red-500 text-sm bg-red-50 p-3 rounded-md animate-in fade-in">
                            {error}
                        </div>
                    )}
                </div>

                {/* Results Grid */}
                {resultCards.length > 0 && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="text-xs font-medium text-gray-400 uppercase tracking-widest text-center mb-2">
                            Possible Portals
                        </div>

                        {resultCards.map(card => {
                            if (dismissedIds.has(card.id)) return null;

                            return (
                                <Card key={card.id} className="group hover:shadow-md transition-all border-gray-100 bg-white">
                                    <div
                                        className="cursor-pointer"
                                        onClick={() => handleNavigate(card)}
                                    >
                                        <CardHeader className="pb-2 pt-4">
                                            <div className="flex items-center justify-between">
                                                <div className="text-[10px] font-bold uppercase tracking-widest text-blue-600 bg-blue-50 px-2 py-1 rounded-sm w-fit">
                                                    {card.type}
                                                </div>
                                                <div className="text-gray-300 group-hover:text-blue-500 transition-colors">
                                                    <ArrowRight className="h-4 w-4" />
                                                </div>
                                            </div>
                                            <CardTitle className="text-base font-medium text-gray-900 leading-snug">
                                                {card.title}
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent className="pb-3 text-sm text-gray-500">
                                            <div className="flex items-center gap-2">
                                                <Calendar className="h-3 w-3" />
                                                <span className="font-mono text-xs">
                                                    {new Date(card.payload_json.window.start).toLocaleDateString()} — {new Date(card.payload_json.window.end).toLocaleDateString()}
                                                </span>
                                            </div>
                                        </CardContent>
                                    </div>
                                    <CardFooter className="pt-0 pb-3 px-4 flex justify-end gap-2 border-t border-gray-50 mt-2">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={(e) => { e.stopPropagation(); handleFeedback(card.id, 'dismiss'); }}
                                            className="h-7 text-xs text-gray-400 hover:text-red-500 hover:bg-red-50"
                                        >
                                            Dismiss
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={(e) => { e.stopPropagation(); handleFeedback(card.id, 'save'); }}
                                            className="h-7 text-xs text-gray-400 hover:text-green-600 hover:bg-green-50 gap-1"
                                        >
                                            <Bookmark className="h-3 w-3" />
                                            Save to Focus
                                        </Button>
                                    </CardFooter>
                                </Card>
                            );
                        })}
                    </div>
                )}

                {/* Fallback Link */}
                <div className="text-center pt-8">
                    <Button
                        variant="ghost"
                        className="text-gray-400 hover:text-gray-600 text-xs font-normal hover:bg-transparent"
                        onClick={() => router.push('/dashboard')}
                    >
                        Skip to Life Spine
                    </Button>
                </div>

            </div>
        </div>
    );
}
