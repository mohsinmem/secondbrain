'use client';

import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';

interface SignalEdge {
    id: string;
    source_event_id: string;
    signal_id: string;
    target_event_id: string;
    edge_type: string;
}

interface CalendarEvent {
    id: string;
    title: string;
    start_at: string;
    end_at: string;
    location?: string;
    attendees?: string[];
    signals?: { id: string }[];
}

interface TimelineViewProps {
    events: CalendarEvent[];
    edges?: SignalEdge[];
    onSelectEvent: (event: CalendarEvent) => void;
}

type ZoomLevel = 'month' | 'week';

export function TimelineView({ events, edges = [], onSelectEvent }: TimelineViewProps) {
    const [zoom, setZoom] = useState<ZoomLevel>('month');
    const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);
    const [mounted, setMounted] = React.useState(false);

    React.useEffect(() => {
        setMounted(true);
    }, []);

    // --- Time range calculation ---
    const { startRange, endRange } = useMemo(() => {
        if (events.length === 0) return { startRange: new Date(), endRange: new Date() };

        let min = new Date(events[0].start_at).getTime();
        let max = new Date(events[0].end_at).getTime();

        events.forEach(ev => {
            min = Math.min(min, new Date(ev.start_at).getTime());
            max = Math.max(max, new Date(ev.end_at).getTime());
        });

        const start = new Date(min);
        start.setHours(0, 0, 0, 0);

        const end = new Date(max);
        end.setHours(23, 59, 59, 999);

        return { startRange: start, endRange: end };
    }, [events]);

    const totalDuration = Math.max(endRange.getTime() - startRange.getTime(), 3600000);

    // --- Lane Allocation ---
    const { lanes, eventPositions } = useMemo(() => {
        const sorted = [...events].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
        const lanes: CalendarEvent[][] = [];
        const positions = new Map<string, { lane: number; left: number; width: number }>();

        sorted.forEach(ev => {
            const start = new Date(ev.start_at).getTime();
            const end = new Date(ev.end_at).getTime();
            const left = ((start - startRange.getTime()) / totalDuration) * 100;
            const width = Math.max(((end - start) / totalDuration) * 100, 0.1);

            let assignedLane = -1;
            for (let i = 0; i < lanes.length; i++) {
                const lastInLane = lanes[i][lanes[i].length - 1];
                const lastEnd = new Date(lastInLane.end_at).getTime();
                if (start >= lastEnd + 300000) {
                    assignedLane = i;
                    break;
                }
            }

            if (assignedLane === -1) {
                assignedLane = lanes.length;
                lanes.push([ev]);
            } else {
                lanes[assignedLane].push(ev);
            }

            positions.set(ev.id, { lane: assignedLane, left, width });
        });

        return { lanes, eventPositions: positions };
    }, [events, startRange, endRange, totalDuration]);

    // --- Time Markers ---
    const markers = useMemo(() => {
        const list = [];
        const current = new Date(startRange);
        current.setHours(0, 0, 0, 0);

        while (current <= endRange) {
            const percent = ((current.getTime() - startRange.getTime()) / totalDuration) * 100;
            list.push({
                label: current.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                percent
            });
            current.setDate(current.getDate() + (zoom === 'month' ? 7 : 1));
        }
        return list;
    }, [startRange, endRange, totalDuration, zoom]);

    // --- SVG rendering setup ---
    const pixelsPerPercent = zoom === 'month' ? 30 : 150;
    const timelineWidthPx = pixelsPerPercent * 100;

    if (!mounted) return <div className="min-h-[500px] flex items-center justify-center text-gray-400 animate-pulse font-medium uppercase tracking-widest text-xs">Projecting...</div>;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-md w-fit border shadow-sm">
                    <Button
                        variant={zoom === 'month' ? 'secondary' : 'ghost'}
                        size="sm"
                        className="h-7 text-[10px] uppercase font-bold tracking-widest px-3"
                        onClick={() => setZoom('month')}
                    >
                        Sparse (Month)
                    </Button>
                    <Button
                        variant={zoom === 'week' ? 'secondary' : 'ghost'}
                        size="sm"
                        className="h-7 text-[10px] uppercase font-bold tracking-widest px-3"
                        onClick={() => setZoom('week')}
                    >
                        Dense (Week)
                    </Button>
                </div>
                <div className="text-[10px] text-gray-400 uppercase tracking-widest font-bold pr-2">
                    Causal Orientation v0
                </div>
            </div>

            <div className="relative overflow-x-auto border rounded-xl bg-white shadow-inner min-h-[500px] border-gray-200 custom-scrollbar">
                <div
                    className="relative pb-8"
                    style={{
                        width: `${timelineWidthPx}px`,
                        height: `${Math.max(lanes.length * 44 + 80, 480)}px`
                    }}
                >
                    {/* Time Axis Markers */}
                    {markers.map((m, i) => (
                        <div
                            key={i}
                            className="absolute top-0 bottom-0 border-l border-gray-100/50 flex flex-col pt-2 pointer-events-none"
                            style={{ left: `${m.percent}%` }}
                        >
                            <span className="text-[9px] text-gray-400 font-bold uppercase tracking-tighter pl-1.5 bg-white/80 backdrop-blur-sm self-start rounded">
                                {m.label}
                            </span>
                        </div>
                    ))}

                    {/* SVG Layer for Consequence Threads */}
                    <svg
                        className="absolute inset-0 pointer-events-none z-10"
                        style={{ width: '100%', height: '100%' }}
                    >
                        <defs>
                            <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                                <polygon points="0 0, 6 2, 0 4" fill="#94a3b8" />
                            </marker>
                        </defs>
                        {edges.map(edge => {
                            const sourcePos = eventPositions.get(edge.source_event_id);
                            const targetPos = eventPositions.get(edge.target_event_id);
                            if (!sourcePos || !targetPos) return null;

                            // Calculate start/end points (mid-right of source to mid-left of target)
                            const x1 = (sourcePos.left + sourcePos.width) * 0.01 * timelineWidthPx;
                            const y1 = sourcePos.lane * 44 + 40 + 18;
                            const x2 = targetPos.left * 0.01 * timelineWidthPx;
                            const y2 = targetPos.lane * 44 + 40 + 18;

                            const isHighlighted = hoveredEventId === edge.source_event_id || hoveredEventId === edge.target_event_id;

                            // Control points for Bezier curve
                            const cp1x = x1 + (x2 - x1) * 0.5;
                            const cp2x = x1 + (x2 - x1) * 0.5;

                            return (
                                <path
                                    key={edge.id}
                                    d={`M ${x1} ${y1} C ${cp1x} ${y1}, ${cp2x} ${y2}, ${x2} ${y2}`}
                                    stroke={isHighlighted ? "#475569" : "#e2e8f0"}
                                    strokeWidth={isHighlighted ? "1.5" : "1"}
                                    fill="none"
                                    strokeDasharray={isHighlighted ? "none" : "4 2"}
                                    markerEnd="url(#arrowhead)"
                                    className="transition-all duration-300"
                                    opacity={isHighlighted ? 0.8 : 0.3}
                                />
                            );
                        })}
                    </svg>

                    {/* Events */}
                    {events.map((ev) => {
                        const pos = eventPositions.get(ev.id);
                        if (!pos) return null;

                        return (
                            <button
                                key={ev.id}
                                onClick={() => onSelectEvent(ev)}
                                onMouseEnter={() => setHoveredEventId(ev.id)}
                                onMouseLeave={() => setHoveredEventId(null)}
                                className="absolute h-9 rounded border border-gray-200 bg-white shadow-sm hover:border-gray-900 hover:shadow-md transition-all text-left overflow-hidden group z-20"
                                style={{
                                    left: `${pos.left}%`,
                                    width: `${pos.width}%`,
                                    top: `${pos.lane * 44 + 40}px`,
                                    minWidth: '32px'
                                }}
                            >
                                <div className="px-2 py-1 flex items-center justify-between h-full gap-2">
                                    <span className="text-[11px] font-medium text-gray-800 truncate flex-1 leading-tight group-hover:text-black">
                                        {ev.title}
                                    </span>
                                    {ev.signals && ev.signals.length > 0 && (
                                        <div className="shrink-0 flex items-center gap-1 opacity-60">
                                            <span className="text-[9px] text-gray-400 font-bold bg-gray-50 px-1 rounded border border-gray-100">
                                                S:{ev.signals.length}
                                            </span>
                                        </div>
                                    )}
                                </div>
                                <div className="absolute inset-0 bg-gray-900/0 group-hover:bg-gray-900/[0.02] transition-colors" />
                            </button>
                        );
                    })}
                </div>

                {events.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm italic">
                        No events to project
                    </div>
                )}
            </div>

            <div className="text-[10px] text-gray-400 uppercase tracking-widest text-center px-4 leading-relaxed font-medium">
                Horizontal projection · Causal Threads enabled · Hover to focus
            </div>
        </div>
    );
}
