'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface CalendarEvent {
    id: string;
    title: string;
    start_at: string;
    end_at: string;
    location?: string;
    attendees?: string[];
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
    const [loading, setLoading] = useState(true);
    const [showOverlays, setShowOverlays] = useState(true);
    const [uploadingFile, setUploadingFile] = useState(false);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    useEffect(() => {
        fetchCalendarSources();
    }, []);

    useEffect(() => {
        if (selectedSource) {
            fetchEvents(selectedSource);
        }
    }, [selectedSource]);

    async function fetchCalendarSources() {
        try {
            const supabase = createClient();
            const { data, error } = await supabase
                .from('calendar_sources')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setSources(data || []);

            if (data && data.length > 0 && !selectedSource) {
                setSelectedSource(data[0].id);
            }
        } catch (error: any) {
            console.error('Error fetching calendar sources:', error);
        } finally {
            setLoading(false);
        }
    }

    async function fetchEvents(sourceId: string) {
        try {
            const supabase = createClient();
            const { data, error } = await supabase
                .from('calendar_events')
                .select('*')
                .eq('source_id', sourceId)
                .order('start_at', { ascending: true });

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

            const response = await fetch('/api/calendar/upload', {
                method: 'POST',
                body: formData,
            });

            // Handle non-JSON responses (like HTML error pages)
            const contentType = response.headers.get('content-type');
            let result;

            if (contentType && contentType.includes('application/json')) {
                result = await response.json();
            } else {
                const text = await response.text();
                console.error('Non-JSON response:', text);
                alert(`Upload failed: Server returned an error. Check browser console for details.`);
                return;
            }

            if (response.ok) {
                alert(`Successfully imported ${result.events_imported} events!${result.events_duplicate > 0 ? ` (${result.events_duplicate} duplicates skipped)` : ''}`);
                await fetchCalendarSources();
                if (result.source_id) {
                    setSelectedSource(result.source_id);
                }
            } else {
                alert(`Upload failed: ${result.error || 'Unknown error'}`);
            }
        } catch (error: any) {
            console.error('Upload error:', error);
            alert(`Upload error: ${error.message}`);
        } finally {
            setUploadingFile(false);
            // Reset the file input so the same file can be uploaded again
            if (e.target) {
                e.target.value = '';
            }
        }
    }

    if (loading) {
        return <div className="p-8 text-center">Loading...</div>;
    }

    if (sources.length === 0) {
        return (
            <div className="space-y-6">
                <Card className="p-8 text-center">
                    <h2 className="text-2xl font-bold mb-4">Welcome to Your Life Map</h2>
                    <p className="text-gray-600 mb-6">
                        Import your calendar to see the structure of your life.
                    </p>
                    <div className="space-y-4">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".ics"
                            onChange={handleFileUpload}
                            disabled={uploadingFile}
                            className="hidden"
                        />
                        <Button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploadingFile}
                        >
                            {uploadingFile ? 'Uploading...' : 'Import Calendar (.ics)'}
                        </Button>
                        <p className="text-sm text-gray-500">
                            Export your calendar as .ics from Google Calendar, Outlook, or Apple Calendar
                        </p>
                    </div>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header Controls */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Life Map</h1>
                    <p className="text-sm text-gray-600">
                        {events.length} events • {showOverlays ? 'Showing' : 'Hiding'} orientation overlays
                    </p>
                </div>
                <div className="flex gap-2">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".ics"
                        onChange={handleFileUpload}
                        disabled={uploadingFile}
                        className="hidden"
                    />
                    <Button
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingFile}
                    >
                        {uploadingFile ? 'Uploading...' : 'Import More'}
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => setShowOverlays(!showOverlays)}
                    >
                        {showOverlays ? 'Hide' : 'Show'} Overlays
                    </Button>
                </div>
            </div>

            {/* Simple Timeline View */}
            <Card className="p-6">
                <div className="space-y-4">
                    <h3 className="font-semibold text-lg">Event Timeline</h3>

                    {events.length === 0 ? (
                        <p className="text-gray-500 text-center py-8">No events found</p>
                    ) : (
                        <div className="space-y-2 max-h-[600px] overflow-y-auto">
                            {events.map((event) => {
                                const startDate = new Date(event.start_at);
                                const endDate = new Date(event.end_at);
                                const duration = (endDate.getTime() - startDate.getTime()) / (1000 * 60); // minutes

                                return (
                                    <div
                                        key={event.id}
                                        className="border rounded p-3 hover:shadow-md transition-shadow cursor-pointer"
                                    >
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <div className="font-medium">{event.title}</div>
                                                <div className="text-sm text-gray-600 mt-1">
                                                    {startDate.toLocaleDateString()} at {startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    {duration > 0 && ` · ${Math.round(duration)}min`}
                                                </div>
                                                {event.location && (
                                                    <div className="text-sm text-gray-500 mt-1">
                                                        📍 {event.location}
                                                    </div>
                                                )}
                                                {event.attendees && event.attendees.length > 0 && showOverlays && (
                                                    <div className="text-sm text-gray-500 mt-1">
                                                        Attendees: {event.attendees.length}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </Card>

            {/* Placeholder for future map visualization */}
            {showOverlays && events.length > 0 && (
                <Card className="p-6 bg-blue-50 border-blue-200">
                    <div className="text-sm text-blue-800">
                        <strong>Coming soon:</strong> Visual timeline with clustering, themes, and reflection zones.
                        For now, this list view shows your event structure chronologically.
                    </div>
                </Card>
            )}
        </div>
    );
}
