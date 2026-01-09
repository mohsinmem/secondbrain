'use client';

import { useState, useEffect } from 'react';
//import { createClientSupabaseClient } from '@/lib/supabase/client';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
// import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';


export default function TestMappingPage() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [mapResults, setMapResults] = useState<Record<string, any>>({});
  const [mapLoading, setMapLoading] = useState<Record<string, boolean>>({});

//   const supabase = createClientSupabaseClient();
    const supabase = createClient();


  // Load conversations on mount
  useEffect(() => {
    loadConversations();
  }, []);

  async function loadConversations() {
    setLoading(true);
    const { data, error } = await supabase
      .from('raw_conversations')
      .select('id, platform, participants, created_at, status, source_metadata')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Load error:', error);
      alert('Failed to load conversations');
    } else {
      setConversations(data || []);
    }
    setLoading(false);
  }

  async function handleMap(conversationId: string) {
    setMapLoading(prev => ({ ...prev, [conversationId]: true }));

    try {
      const response = await fetch(`/api/reflection/conversations/${conversationId}/map`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (!response.ok) {
        alert(`Mapping failed: ${result.error}`);
        return;
      }

      setMapResults(prev => ({ ...prev, [conversationId]: result.data }));
      
      // Reload conversations to show updated source_metadata
      await loadConversations();

    } catch (error: any) {
      console.error('Map error:', error);
      alert(`Mapping error: ${error.message}`);
    } finally {
      setMapLoading(prev => ({ ...prev, [conversationId]: false }));
    }
  }

  if (loading) {
    return <div className="p-8">Loading conversations...</div>;
  }

  return (
    <div className="container mx-auto p-8 max-w-6xl">
      <h1 className="text-3xl font-bold mb-6">Test: Conversation Mapping</h1>
      
      <div className="space-y-4">
        {conversations.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground">
                No conversations found. Upload one first at <a href="/" className="underline">home page</a>.
              </p>
            </CardContent>
          </Card>
        ) : (
          conversations.map((conv) => {
            const hasMappingData = conv.source_metadata?.reflection_map;
            const mapData = mapResults[conv.id];
            const isMapping = mapLoading[conv.id];

            return (
              <Card key={conv.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">
                        {conv.platform} • {conv.participants?.join(', ') || 'Unknown'}
                      </CardTitle>
                    <p className="text-sm text-muted-foreground">
                        {new Date(conv.created_at).toLocaleDateString()} • Status: {conv.status}
                    </p>

                    </div>
                    <Button
                      onClick={() => handleMap(conv.id)}
                      disabled={isMapping}
                      variant={hasMappingData ? "outline" : "default"}
                    >
                      {isMapping ? 'Mapping...' : hasMappingData ? 'Re-map' : 'Map'}
                    </Button>
                  </div>
                </CardHeader>

                {(hasMappingData || mapData) && (
                  <CardContent>
                    <div className="bg-muted p-4 rounded-md">
                      <h4 className="font-semibold mb-2">
                        Mapping Result {mapData?.already_existed && '(Cached)'}
                      </h4>
                      
                      {(() => {
                        const map = mapData?.map || conv.source_metadata?.reflection_map?.map;
                        const version = mapData?.version || conv.source_metadata?.reflection_map?.version;
                        
                        if (!map) return <p className="text-sm text-muted-foreground">No map data</p>;

                        return (
                          <div className="space-y-2 text-sm">
                            <div>
                              <span className="font-medium">Version:</span> {version}
                            </div>
                            <div>
                              <span className="font-medium">Quality:</span> {map.conversation_quality}
                            </div>
                            <div>
                              <span className="font-medium">Extraction Readiness:</span> {map.extraction_readiness}
                            </div>
                            <div>
                              <span className="font-medium">Participants:</span>{' '}
                              {map.participants?.map((p: any) => p.name).join(', ')}
                            </div>
                            <div>
                              <span className="font-medium">Themes:</span>{' '}
                              {map.themes?.join(', ')}
                            </div>
                            <details className="mt-2">
                              <summary className="cursor-pointer font-medium">View Full Map</summary>
                              <pre className="mt-2 text-xs bg-background p-2 rounded overflow-auto max-h-64">
                                {JSON.stringify(map, null, 2)}
                              </pre>
                            </details>
                          </div>
                        );
                      })()}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })
        )}
      </div>

      <div className="mt-8 p-4 bg-muted rounded-md">
        <h3 className="font-semibold mb-2">Testing Instructions:</h3>
        <ol className="list-decimal list-inside space-y-1 text-sm">
          <li>Click "Map" button on any conversation</li>
          <li>Wait for mapping to complete (~1-2 seconds)</li>
          <li>Verify "Mapping Result" section appears</li>
          <li>Check version shows "v0"</li>
          <li>Click "Map" again - should show "(Cached)" and same timestamp</li>
          <li>Verify in Supabase: source_metadata column should have reflection_map</li>
        </ol>
      </div>
    </div>
  );
}