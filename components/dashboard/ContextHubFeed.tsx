/**
 * Context Hub Feed Component (Work Order 5)
 * 
 * replaces the dense event list with a feed of expandable "Contextual Hubs".
 * Prioritizes orientation and scannability.
 */

'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, MapPin, Calendar, Plane, Home, Briefcase } from 'lucide-react';

interface Hub {
    id: string;
    title: string;
    type: 'travel' | 'project' | 'anchor';
    start_at: string;
    end_at: string;
    items_count: number;
    description?: string;
}

interface ContextHubFeedProps {
    hubs: Hub[];
    onSelectHub: (hubId: string) => void;
}

export function ContextHubFeed({ hubs, onSelectHub }: ContextHubFeedProps) {
    const [expandedHubId, setExpandedHubId] = useState<string | null>(null);

    const toggleHub = (id: string) => {
        setExpandedHubId(expandedHubId === id ? null : id);
    };

    if (hubs.length === 0) {
        return (
            <div className="text-center py-20 px-6">
                <div className="bg-gray-50 h-16 w-16 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-100">
                    <Briefcase className="h-8 w-8 text-gray-300" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">No Contextual Hubs detected</h3>
                <p className="text-sm text-gray-500 max-w-xs mx-auto mt-2">
                    Import more calendar data or run a re-sync to generate groupings.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4 pb-20">
            {hubs.map((hub) => {
                const isExpanded = expandedHubId === hub.id;
                const startDate = new Date(hub.start_at);
                const endDate = new Date(hub.end_at);

                return (
                    <Card
                        key={hub.id}
                        className={`overflow-hidden transition-all border-l-4 ${hub.type === 'travel' ? 'border-l-blue-500' : 'border-l-gray-300'
                            } ${isExpanded ? 'ring-2 ring-blue-500/10' : ''}`}
                    >
                        <div
                            className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                            onClick={() => toggleHub(hub.id)}
                        >
                            <div className="flex items-start justify-between">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        {hub.type === 'travel' ? (
                                            <Plane className="h-4 w-4 text-blue-500" />
                                        ) : hub.type === 'anchor' ? (
                                            <Home className="h-4 w-4 text-gray-400" />
                                        ) : (
                                            <Briefcase className="h-4 w-4 text-gray-400" />
                                        )}
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                                            {hub.type} context
                                        </span>
                                    </div>
                                    <h3 className="text-lg font-bold text-gray-900 leading-tight">
                                        {hub.title}
                                    </h3>
                                    <div className="flex items-center gap-2 text-xs text-gray-500">
                                        <Calendar className="h-3 w-3" />
                                        <span>
                                            {startDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                            {' — '}
                                            {endDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                    <div className="bg-gray-100 px-2 py-1 rounded text-[10px] font-bold text-gray-600">
                                        {hub.items_count} items
                                    </div>
                                    {isExpanded ? <ChevronDown className="h-5 w-5 text-gray-400" /> : <ChevronRight className="h-5 w-5 text-gray-400" />}
                                </div>
                            </div>
                        </div>

                        {isExpanded && (
                            <div className="px-4 pb-4 pt-2 border-t border-gray-50 bg-gray-50/30 animate-in slide-in-from-top-2 duration-200">
                                {hub.description && (
                                    <p className="text-sm text-gray-600 mb-4 italic">
                                        "{hub.description}"
                                    </p>
                                )}
                                <div className="flex flex-col gap-2">
                                    <Button
                                        variant="default"
                                        className="w-full justify-center gap-2"
                                        onClick={() => onSelectHub(hub.id)}
                                    >
                                        Enter Orientation Loop
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        className="w-full text-xs text-gray-400 uppercase tracking-widest font-bold h-8"
                                    >
                                        View In Timeline
                                    </Button>
                                </div>
                            </div>
                        )}
                    </Card>
                );
            })}
        </div>
    );
}
