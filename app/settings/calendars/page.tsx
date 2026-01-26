'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, CheckCircle2, AlertCircle, RefreshCw, Trash2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

interface CalendarSource {
    id: string;
    provider: 'google' | 'upload';
    sync_mode: 'upload' | 'oauth';
    last_synced_at: string | null;
    status: 'active' | 'paused' | 'error';
    provider_info?: string;
}

function CalendarSettingsContent() {
    const [sources, setSources] = useState<CalendarSource[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState<string | null>(null);
    const searchParams = useSearchParams();
    const status = searchParams.get('status');
    const message = searchParams.get('message');

    useEffect(() => {
        fetchSources();
    }, []);

    async function fetchSources() {
        setLoading(true);
        try {
            const supabase = createClient();
            const { data, error } = await supabase
                .from('calendar_sources')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setSources(data || []);
        } catch (error) {
            console.error('Error fetching sources:', error);
        } finally {
            setLoading(false);
        }
    }

    async function handleDisconnect(id: string) {
        if (!confirm('Are you sure you want to disconnect this calendar?')) return;

        try {
            const supabase = createClient();
            const { error } = await supabase
                .from('calendar_sources')
                .delete()
                .eq('id', id);

            if (error) throw error;
            setSources(sources.filter(s => s.id !== id));
        } catch (error: any) {
            alert(`Error: ${error.message}`);
        }
    }

    async function handleSync(id: string) {
        setSyncing(id);
        try {
            const response = await fetch(`/api/calendar/sync?source_id=${id}`, { method: 'POST' });
            const result = await response.json();

            if (response.ok) {
                alert(`Sync complete! ${result.count} events updated.`);
                fetchSources();
            } else {
                alert(`Sync failed: ${result.error}`);
            }
        } catch (error: any) {
            alert(`Sync error: ${error.message}`);
        } finally {
            setSyncing(null);
        }
    }

    const googleSource = sources.find(s => s.provider === 'google');

    if (loading) return <div className="max-w-4xl mx-auto p-8 text-center italic text-muted-foreground">Loading settings...</div>;

    return (
        <div className="max-w-4xl mx-auto p-4 py-8 space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Calendar Settings</h1>
                <p className="text-muted-foreground mt-2">
                    Manage your calendar sources and automated sync preferences.
                </p>
            </div>

            {status === 'success' && (
                <div className="bg-green-50 border border-green-100 p-4 rounded-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <p className="text-sm font-medium text-green-800">Successfully connected to Google Calendar!</p>
                </div>
            )}

            {status === 'error' && (
                <div className="bg-red-50 border border-red-100 p-4 rounded-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
                    <AlertCircle className="h-5 w-5 text-red-600" />
                    <p className="text-sm font-medium text-red-800">Connection failed: {message || 'Internal error'}</p>
                </div>
            )}

            <div className="grid gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Calendar className="h-5 w-5 text-blue-500" />
                            Google Calendar
                        </CardTitle>
                        <CardDescription>
                            Automatically sync events from your primary Google Calendar (90-day lookback).
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {googleSource ? (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border">
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium">Secondary Brain Connection</p>
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                            <span className="flex items-center gap-1">
                                                <div className="h-2 w-2 rounded-full bg-green-500" /> Active
                                            </span>
                                            <span>·</span>
                                            <span>Last synced: {googleSource.last_synced_at ? new Date(googleSource.last_synced_at).toLocaleString() : 'Never'}</span>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleSync(googleSource.id)}
                                            disabled={!!syncing}
                                        >
                                            {syncing === googleSource.id ? (
                                                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                                            ) : (
                                                <RefreshCw className="h-4 w-4 mr-2" />
                                            )}
                                            Sync Now
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="text-red-600 border-red-100 hover:bg-red-50 hover:text-red-700"
                                            onClick={() => handleDisconnect(googleSource.id)}
                                        >
                                            <Trash2 className="h-4 w-4 mr-2" />
                                            Disconnect
                                        </Button>
                                    </div>
                                </div>
                                <div className="bg-blue-50/50 p-3 rounded text-[11px] text-blue-600 border border-blue-100">
                                    <strong>Privacy Guard Active:</strong> All meeting links (Zoom/Meet) and passwords are redacted automatically before storage.
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-6 space-y-4">
                                <p className="text-sm text-muted-foreground">
                                    No Google account connected.
                                </p>
                                <Button onClick={() => window.location.href = '/api/calendar/connect'}>
                                    Connect Google Calendar
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm">Other Sources</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {sources.filter(s => s.provider === 'upload').map(source => (
                                <div key={source.id} className="flex items-center justify-between text-sm py-2 border-b last:border-0 text-muted-foreground">
                                    <span className="flex items-center gap-2">
                                        <Calendar className="h-4 w-4" />
                                        Manual Import
                                    </span>
                                    <span>{source.last_synced_at ? new Date(source.last_synced_at).toLocaleDateString() : 'Unknown date'}</span>
                                </div>
                            ))}
                            {sources.filter(s => s.provider === 'upload').length === 0 && (
                                <p className="text-sm text-center text-muted-foreground italic py-4">
                                    No manual imports found.
                                </p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

export default function CalendarSettingsPage() {
    return (
        <React.Suspense fallback={<div className="max-w-4xl mx-auto p-8 text-center italic text-muted-foreground">Loading settings...</div>}>
            <CalendarSettingsContent />
        </React.Suspense>
    );
}
