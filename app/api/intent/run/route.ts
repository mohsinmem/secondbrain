import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { query, horizon_days = 21 } = await req.json();

        if (!query) {
            return NextResponse.json({ error: 'Query required' }, { status: 400 });
        }

        // 1. Create Intent
        const { data: intent, error: intentError } = await supabase
            .from('intents')
            .insert({
                user_id: user.id,
                query,
                version: 'v1'
            })
            .select()
            .single();

        if (intentError) throw intentError;

        const cards = [];
        const now = new Date();

        // 2. Generate Forecast Card (Deterministic: Now -> Horizon)
        const forecastStart = new Date(now);
        forecastStart.setHours(0, 0, 0, 0);
        // Align to Monday? Spec for Deep-Link Contract says "start must be the Monday".
        // To be safe, we should probably align the *window* to Monday, or at least the deep link param.
        // Let's align the window start to the current week's Monday for cleanliness, or just pass 'now'.
        // Deep-link rule: "Deep-links must use the Monday... as start". 
        // So the window in the payload should probably reflect the *logical* window, and the deep link logic in UI uses that.
        // Let's calculate the current week's Monday.
        const currentDay = forecastStart.getDay();
        const diffToMon = (currentDay === 0 ? -6 : 1) - currentDay;
        const currentMonday = new Date(forecastStart);
        currentMonday.setDate(forecastStart.getDate() + diffToMon);

        const forecastEnd = new Date(forecastStart);
        forecastEnd.setDate(forecastStart.getDate() + horizon_days);

        cards.push({
            intent_id: intent.id,
            type: 'forecast',
            title: `Upcoming anchors (next ${horizon_days} days)`,
            payload_json: {
                version: 'v1',
                window: {
                    start: currentMonday.toISOString(), // Contract A: Monday start
                    end: forecastEnd.toISOString()
                }
            }
        });

        // 3. Generate Reflection Card (Tiered Search: Exact -> Fuzzy -> Density)
        let matchEvents: any[] = [];
        let searchMode: 'exact' | 'fuzzy' | 'density' = 'exact';

        // A. Tier 1: Exact Keyword Match
        const { data: exactMatch } = await supabase
            .from('calendar_events')
            .select('start_at')
            .eq('user_id', user.id)
            .or(`title.ilike.%${query}%,location.ilike.%${query}%`)
            .order('start_at', { ascending: false })
            .limit(20);

        if (exactMatch && exactMatch.length > 0) {
            matchEvents = exactMatch;
            searchMode = 'exact';
            console.log(`[Intent Search] Exact match found for: "${query}"`);
        } else {
            // B. Tier 2: Fuzzy Similarity Search (The "Vector Search" analogue)
            // Uses pg_trgm similarity threshold of 0.2 (Boosted recall for Phase 4.4.6)
            const { data: fuzzyMatch, error: fuzzyError } = await supabase
                .rpc('search_calendar_events_fuzzy', {
                    query_text: query,
                    threshold: 0.2
                });

            if (fuzzyMatch && fuzzyMatch.length > 0) {
                matchEvents = fuzzyMatch;
                searchMode = 'fuzzy';
                console.log(`[Intent Search] Fuzzy match found for: "${query}" (threshold: 0.2)`);
            } else {
                // Tier 2b: "Wide Net" Fallback (Threshold 0.1) for very resilient recall
                const { data: wideMatch } = await supabase
                    .rpc('search_calendar_events_fuzzy', {
                        query_text: query,
                        threshold: 0.1
                    });

                if (wideMatch && wideMatch.length > 0) {
                    matchEvents = wideMatch;
                    searchMode = 'fuzzy'; // Still fuzzy but lower threshold
                    console.log(`[Intent Search] Wide-net fuzzy match found for: "${query}" (threshold: 0.1)`);
                } else {
                    if (fuzzyError) console.error('[Intent Search] Fuzzy RPC error:', fuzzyError);
                    searchMode = 'density';
                    console.log(`[Intent Search] No matches found for: "${query}". Falling back to density.`);
                }
            }
        }

        let reflectionCard = null;

        if (matchEvents.length > 0) {
            // Find the most relevant week (week of the most recent match)
            const taxonomyDate = new Date(matchEvents[0].start_at);
            const rDay = taxonomyDate.getDay();
            const rDiff = (rDay === 0 ? -6 : 1) - rDay;
            const rMonday = new Date(taxonomyDate);
            rMonday.setDate(taxonomyDate.getDate() + rDiff);
            const rEnd = new Date(rMonday);
            rEnd.setDate(rMonday.getDate() + 6);

            reflectionCard = {
                intent_id: intent.id,
                type: 'reflection',
                title: searchMode === 'exact'
                    ? `Past period: Related to "${query}"`
                    : `Past period: Similar to "${query}" (Fuzzy Match)`,
                payload_json: {
                    version: 'v1',
                    search_mode: searchMode,
                    window: {
                        start: rMonday.toISOString(),
                        end: rEnd.toISOString()
                    }
                }
            };
        } else {
            // C. Tier 3: Fallback: Recent Density (Last 90 days)
            const ninetyDaysAgo = new Date();
            ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

            const { data: recentEvents } = await supabase
                .from('calendar_events')
                .select('start_at')
                .eq('user_id', user.id)
                .gte('start_at', ninetyDaysAgo.toISOString())
                .lte('start_at', now.toISOString()); // Past only

            if (recentEvents && recentEvents.length > 0) {
                const weeks: Record<string, number> = {};
                recentEvents.forEach(ev => {
                    const d = new Date(ev.start_at);
                    const day = d.getDay();
                    const diff = (day === 0 ? -6 : 1) - day;
                    const mon = new Date(d);
                    mon.setDate(d.getDate() + diff);
                    mon.setHours(0, 0, 0, 0);
                    const key = mon.toISOString();
                    weeks[key] = (weeks[key] || 0) + 1;
                });

                // Find max
                let maxKey = null;
                let maxCount = 0;
                for (const [k, v] of Object.entries(weeks)) {
                    if (v > maxCount) {
                        maxCount = v;
                        maxKey = k;
                    }
                }

                if (maxKey) {
                    const rMonday = new Date(maxKey);
                    const rEnd = new Date(rMonday);
                    rEnd.setDate(rMonday.getDate() + 6);

                    reflectionCard = {
                        intent_id: intent.id,
                        type: 'reflection',
                        title: `Recent active week (${maxCount} events)`, // Contract C: Neutral framing
                        payload_json: {
                            version: 'v1',
                            window: {
                                start: rMonday.toISOString(),
                                end: rEnd.toISOString()
                            }
                        }
                    };
                }
            }
        }

        if (reflectionCard) {
            cards.push(reflectionCard);
        }

        // 4. Insert Cards
        if (cards.length > 0) {
            const { error: cardsError } = await supabase
                .from('intent_cards')
                .insert(cards);

            if (cardsError) throw cardsError;
        }

        // Fetch inserted cards to return IDs
        const { data: resultCards } = await supabase
            .from('intent_cards')
            .select('*')
            .eq('intent_id', intent.id);

        return NextResponse.json({
            intent_id: intent.id,
            cards: resultCards
        });

    } catch (error: any) {
        console.error('[Intent Run] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
