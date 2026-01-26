/**
 * Strategic Gap Report (Work Order 6.0.5)
 * 
 * Surfaces multi-intent collisions and prompts user for disambiguation.
 */

'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BrainCircuit, Split, Check, HelpCircle } from 'lucide-react';

interface Hub {
    id: string;
    title: string;
    metadata: {
        needs_disambiguation?: boolean;
        collision_entity?: string;
        collision_location?: string;
    };
}

interface StrategicGapReportProps {
    hubs: Hub[];
    onResolve: (hubId: string, choice: 'merge' | 'split') => void;
}

export function StrategicGapReport({ hubs, onResolve }: StrategicGapReportProps) {
    const flaggedHubs = hubs.filter(h => h.metadata?.needs_disambiguation);

    if (flaggedHubs.length === 0) return null;

    return (
        <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="flex items-center gap-2 px-1">
                <BrainCircuit className="h-4 w-4 text-blue-500" />
                <h2 className="text-sm font-bold uppercase tracking-widest text-gray-900">Strategic Gap Report</h2>
                <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {flaggedHubs.length} Attention Required
                </span>
            </div>

            {flaggedHubs.map((hub) => (
                <Card key={hub.id} className="p-4 border-2 border-blue-100 bg-blue-50/30 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-3 opacity-5">
                        <HelpCircle className="h-12 w-12 text-blue-900" />
                    </div>

                    <div className="flex flex-col gap-4 relative z-10">
                        <div className="space-y-1">
                            <p className="text-xs text-blue-600 font-bold uppercase tracking-wider">Collision Detected</p>
                            <h3 className="text-lg font-bold text-gray-900 leading-tight">
                                {hub.title}
                            </h3>
                        </div>

                        <div className="bg-white/80 p-3 rounded-lg border border-blue-100 text-sm text-gray-700 leading-relaxed shadow-sm">
                            "You were at <strong className="text-blue-700">{hub.metadata.collision_location}</strong>, but we detected a <strong className="text-blue-700">{hub.metadata.collision_entity}</strong> engagement. Was this a {hub.metadata.collision_entity} session held at {hub.metadata.collision_location}, or a separate call while you were there?"
                        </div>

                        <div className="flex gap-2">
                            <Button
                                variant="default"
                                className="flex-1 bg-blue-600 hover:bg-blue-700 h-10 gap-2"
                                onClick={() => onResolve(hub.id, 'merge')}
                            >
                                <Check className="h-4 w-4" />
                                Session at {hub.metadata.collision_location}
                            </Button>
                            <Button
                                variant="outline"
                                className="flex-1 border-blue-200 text-blue-700 hover:bg-blue-50 h-10 gap-2"
                                onClick={() => onResolve(hub.id, 'split')}
                            >
                                <Split className="h-4 w-4" />
                                Separate Call
                            </Button>
                        </div>
                    </div>
                </Card>
            ))}
        </div>
    );
}
