'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ConversationMapData {
    participants: string[];
    themes: string[];
    phases: {
        name: string;
        summary: string;
        line_start?: number;
        line_end?: number;
    }[];
    signal_zones: {
        phase_idx: number; // reference to phase array index
        reason: string;
    }[];
    guardrails: string[];
    readiness: {
        quality: 'low' | 'medium' | 'high';
        reason: string;
    };
}

export default function ConversationPage() {
    const params = useParams();
    const router = useRouter();
    const conversationId = params.id as string;
    const [loading, setLoading] = useState(true);
    const [conversation, setConversation] = useState<any>(null);
    const [mapData, setMapData] = useState<ConversationMapData | null>(null);
    const [mapping, setMapping] = useState(false);
    const [extracting, setExtracting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function load() {
            if (!conversationId) return;
            const supabase = createClient();

            // 1. Fetch Convo
            const { data, error } = await supabase
                .from('raw_conversations')
                .select('*')
                .eq('id', conversationId)
                .single();

            if (error) {
                setError(error.message);
                setLoading(false);
                return;
            }
            setConversation(data);

            // 2. Fetch Map (if exists)
            const { data: mapRecord } = await supabase
                .from('conversation_maps')
                .select('map_data')
                .eq('conversation_id', conversationId)
                .single();

            if (mapRecord) {
                setMapData(mapRecord.map_data as ConversationMapData);
            }

            setLoading(false);
        }
        load();
    }, [conversationId]);

    const handleMap = async () => {
        setMapping(true);
        setError(null);
        try {
            const res = await fetch(`/api/reflection/conversations/${conversationId}/map`, {
                method: 'POST'
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Mapping failed');

            setMapData(json.data.map);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setMapping(false);
        }
    };

    const handleExtract = async () => {
        setExtracting(true);
        setError(null);
        // Note: v0 extract endpoint is per-segment. 
        // For this smoke test, we assume auto-chunking happened or we act on segment 1.
        // We need to fetch segment 1 id first.
        try {
            const supabase = createClient();
            // Auto chunk call (RPC) or fetch existing
            // Since the migration added auto_chunk_conversation stub, we can try to find valid segment or just fetch any.

            let { data: segment } = await supabase
                .from('conversation_segments')
                .select('id')
                .eq('conversation_id', conversationId)
                .eq('segment_number', 1)
                .single();

            if (!segment) {
                // Trigger chunking (Stub: we don't have an endpoint for chunking yet, but the user plan mentioned "auto after segmentation exists")
                // We'll rely on the existing "auto-chunk" if we can, or just alert the user.
                // For now, let's assume the user uses the RPC or we call a utility endpoint.
                // Wait, the plan said "step 2 — Segment ... User may not see this in v0".
                // I'll try to call an endpoint or RPC?
                // Since I cannot call RPC from client easily without setup, I'll error.
                // Or I check if 'auto_chunk_conversation' exists.

                // Let's manually trigger the extract endpoint logic which might handle it?
                // No, extract needs segment ID.

                // For this specific QA path, I will auto-create a segment if missing via RPC if possible.
                const { data: chunks, error: rpcError } = await supabase.rpc('auto_chunk_conversation', { p_conversation_id: conversationId });
                if (rpcError) throw new Error(rpcError.message);
                if (chunks && chunks.length > 0) {
                    segment = { id: chunks[0].segment_id };
                } else {
                    throw new Error('Could not create segment');
                }
            }

            const res = await fetch(`/api/reflection/segments/${segment.id}/extract?force=true`, {
                method: 'POST',
                body: JSON.stringify({ model: 'heuristic-v0' })
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Extract failed');

            // Succeeded.
            alert(`Extracted ${json.data?.candidates_generated || 0} candidates.`);
            router.push(`/reflect?conversation_id=${conversationId}`);

        } catch (e: any) {
            setError(e.message);
        } finally {
            setExtracting(false);
        }
    };

    if (loading) return <div className="p-8">Loading...</div>;
    if (!conversation) return <div className="p-8">Conversation not found</div>;

    return (
        <div className="max-w-4xl mx-auto p-4 space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold">{conversation.title || 'Untitled Conversation'}</h1>
                <Button variant="outline" onClick={() => router.push('/inbox')}>Back to Inbox</Button>
            </div>

            {error && <div className="bg-red-50 text-red-600 p-4 rounded">{error}</div>}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Main Content */}
                <div className="md:col-span-2 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Conversation Map</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {!mapData ? (
                                <div className="text-center py-8">
                                    <p className="text-gray-500 mb-4">No map generated yet.</p>
                                    <Button onClick={handleMap} disabled={mapping}>
                                        {mapping ? 'Mapping...' : 'Map Conversation'}
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {/* Readiness */}
                                    <div className={`p-3 rounded border ${mapData.readiness.quality === 'high' ? 'bg-green-50 border-green-200 text-green-800' :
                                            mapData.readiness.quality === 'medium' ? 'bg-yellow-50 border-yellow-200 text-yellow-800' :
                                                'bg-red-50 border-red-200 text-red-800'
                                        }`}>
                                        <strong>Readiness: {mapData.readiness.quality}</strong>
                                        <p className="text-sm">{mapData.readiness.reason}</p>
                                    </div>

                                    {/* Guardrails */}
                                    {mapData.guardrails.length > 0 && (
                                        <div className="p-3 bg-gray-50 rounded border text-sm">
                                            <strong>Guardrails:</strong>
                                            <ul className="list-disc list-inside">
                                                {mapData.guardrails.map((g, i) => <li key={i}>{g}</li>)}
                                            </ul>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <h3 className="font-semibold mb-1">Participants</h3>
                                            <ul className="text-sm list-disc list-inside">
                                                {mapData.participants.map((p, i) => <li key={i}>{p}</li>)}
                                            </ul>
                                        </div>
                                        <div>
                                            <h3 className="font-semibold mb-1">Themes</h3>
                                            <div className="flex flex-wrap gap-1">
                                                {mapData.themes.map((t, i) => (
                                                    <span key={i} className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full">{t}</span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <h3 className="font-semibold mb-1">Phases</h3>
                                        <div className="space-y-2">
                                            {mapData.phases.map((p, i) => (
                                                <div key={i} className="text-sm p-2 border rounded">
                                                    <div className="font-medium">{p.name}</div>
                                                    <div className="text-gray-600">{p.summary}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="pt-4 border-t">
                                        <div className="flex gap-4">
                                            <Button onClick={handleExtract} disabled={extracting}>
                                                {extracting ? 'Extracting...' : 'Extract Signals'}
                                            </Button>
                                            <Button variant="outline" onClick={() => router.push(`/reflect?conversation_id=${conversationId}`)}>
                                                Go to Review
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Sidebar / Metadata */}
                <div>
                    <Card>
                        <CardHeader><CardTitle>Metadata</CardTitle></CardHeader>
                        <CardContent className="text-sm space-y-2">
                            <div>Source: {conversation.source_type}</div>
                            <div>Created: {new Date(conversation.created_at).toLocaleDateString()}</div>
                            <div>ID: <span className="font-mono text-xs">{conversation.id.slice(0, 8)}...</span></div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
