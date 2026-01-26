'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ActiveIntentBanner() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const intentId = searchParams.get('intent_id');
    const [intentQuery, setIntentQuery] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleClear = () => {
        const params = new URLSearchParams(searchParams.toString());
        params.delete('intent_id');
        params.delete('intent_query');
        params.delete('intent_card_type');
        params.delete('start');
        params.delete('week_end');
        params.delete('event_count');
        router.push(`?${params.toString()}`);
    };

    useEffect(() => {
        if (!intentId) {
            setIntentQuery(null);
            return;
        }

        async function fetchIntent() {
            setLoading(true);
            try {
                const supabase = createClient();
                const { data, error } = await supabase
                    .from('intents')
                    .select('query')
                    .eq('id', intentId)
                    .single();

                if (error) throw error;
                if (data) setIntentQuery(data.query);
            } catch (error) {
                console.error('Failed to fetch active intent:', error);
            } finally {
                setLoading(false);
            }
        }

        fetchIntent();
    }, [intentId]);

    if (!intentId || !intentQuery) return null;

    return (
        <div className="bg-blue-50/50 border-b border-blue-100 px-4 py-3 flex items-center justify-between mb-4 -mx-4 sm:-mx-6 lg:-mx-8 sticky top-0 z-30 backdrop-blur-sm">
            <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400 bg-white px-2 py-0.5 rounded border border-blue-100">
                    Active Intent
                </span>
                <span className="text-sm font-medium text-gray-700">
                    {loading ? (
                        <span className="flex items-center gap-2 text-gray-400">
                            <Loader2 className="h-3 w-3 animate-spin" /> Restoring context...
                        </span>
                    ) : (
                        `"${intentQuery}"`
                    )}
                </span>
            </div>

            <Button
                variant="ghost"
                size="sm"
                onClick={handleClear}
                className="text-xs h-7 px-2 text-gray-400 hover:text-red-500 transition-colors uppercase tracking-widest font-bold"
            >
                <X className="h-4 w-4 mr-1" /> Clear
            </Button>
        </div>
    );
}
