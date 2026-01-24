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

        // 3. Generate Reflection Card (Search or Density)
        // A. Try Keyword Match
        // We'll search titles and locations. 
        // Note: Simple 'ilike' query.
        const { data: matchEvents } = await supabase
            .from('calendar_events')
            .select('start_at')
            .eq('user_id', user.id)
            .or(`title.ilike.%${query}%,location.ilike.%${query}%`)
            .order('start_at', { ascending: false })
            .limit(50); // Scan recent matches

        let reflectionCard = null;

        if (matchEvents && matchEvents.length > 0) {
            // Find the most relevant week (simplest: week of the most recent match)
            // Or grouping? Let's take the most recent match for v0.
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
                title: `Past period: Related to "${query}"`,
                payload_json: {
                    version: 'v1',
                    window: {
                        start: rMonday.toISOString(),
                        end: rEnd.toISOString()
                    }
                }
            };
        } else {
            // B. Fallback: Recent Density (Last 90 days)
            // We need to find a dense week. 
            // For now, let's fetch events from last 90 days and aggregate in memory (simplest for v0).
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
