'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface CalendarEvent {
    id: string;
    title: string;
    start_at: string;
    end_at: string;
    location?: string;
    attendees?: string[];
    raw_payload?: any;
}

interface EventDetailPanelProps {
    event: CalendarEvent | null;
    onClose: () => void;
}

export function EventDetailPanel({ event, onClose }: EventDetailPanelProps) {
    if (!event) return null;

    const startDate = new Date(event.start_at);
    const endDate = new Date(event.end_at);
    const duration = (endDate.getTime() - startDate.getTime()) / (1000 * 60);

    return (
        <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl z-50 flex flex-col border-l border-gray-200 animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="p-4 border-b flex items-center justify-between bg-gray-50">
                <h2 className="text-lg font-bold truncate pr-4">Event Inspection</h2>
                <Button variant="outline" size="sm" onClick={onClose}>
                    Close
                </Button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8">
                {/* Core Metadata */}
                <section className="space-y-3">
                    <h1 className="text-2xl font-bold text-gray-900 leading-tight">
                        {event.title}
                    </h1>

                    <div className="grid grid-cols-[100px_1fr] gap-x-4 gap-y-2 text-sm text-gray-600">
                        <span className="font-medium text-gray-400">Time</span>
                        <span>
                            {startDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}<br />
                            {startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – {endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            {duration > 0 && <span className="text-gray-400 ml-2">({Math.round(duration)} min)</span>}
                        </span>

                        {event.location && (
                            <>
                                <span className="font-medium text-gray-400">Location</span>
                                <span>{event.location}</span>
                            </>
                        )}
                    </div>
                </section>

                {/* Attendees */}
                {event.attendees && event.attendees.length > 0 && (
                    <section className="space-y-3">
                        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">
                            Attendees ({event.attendees.length})
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {event.attendees.map((attendee, i) => (
                                <span
                                    key={i}
                                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200"
                                >
                                    {attendee}
                                </span>
                            ))}
                        </div>
                    </section>
                )}

                {/* Raw Payload (Truth Layer) */}
                <section className="space-y-3">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">
                        Raw Truth Atom (Payload)
                    </h3>
                    <Card className="p-4 bg-gray-900 text-gray-300 font-mono text-xs overflow-x-auto">
                        <pre>{JSON.stringify(event.raw_payload, null, 2)}</pre>
                    </Card>
                    <p className="text-[10px] text-gray-400 leading-normal">
                        This is the immutable raw data ingested from the source.
                        No AI interpretation has been applied to this view.
                    </p>
                </section>

                {/* Context (Step 2 Preview) */}
                <div className="pt-8 border-t border-dashed border-gray-200 grayscale opacity-40 select-none cursor-not-allowed">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">
                        Reflection Context (Phase 3.1 Step 2)
                    </h3>
                    <div className="text-xs text-gray-400 italic">
                        Context attachment (notes, conversations) will be enabled in the next step.
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t bg-gray-50 text-[10px] text-gray-400 text-center uppercase tracking-widest">
                Structure Precedes Meaning · AFERR Phase 3.1
            </div>
        </div>
    );
}
