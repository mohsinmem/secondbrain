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
    showOverlays?: boolean;
    onSelectEvent: (event: CalendarEvent) => void;
}

type ZoomLevel = 'month' | 'week';

export function TimelineView({ events, edges = [], showOverlays = true, onSelectEvent }: TimelineViewProps) {
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

    // --- Time Markers & Sectioning (Discrete blocks) ---
    const sections = useMemo(() => {
        const list = [];
        const current = new Date(startRange);

        if (zoom === 'month') {
            current.setDate(1);
            current.setHours(0, 0, 0, 0);
            while (current <= endRange) {
                const next = new Date(current);
                next.setMonth(next.getMonth() + 1);
                list.push({
                    start: new Date(current),
                    end: next,
                    label: current.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
                });
                current.setMonth(current.getMonth() + 1);
            }
        } else {
            // align to Monday
            const day = current.getDay();
            const diff = (day === 0 ? -6 : 1) - day;
            current.setDate(current.getDate() + diff);
            current.setHours(0, 0, 0, 0);
            while (current <= endRange) {
                const next = new Date(current);
                next.setDate(next.getDate() + 7);
                list.push({
                    start: new Date(current),
                    end: next,
                    label: `Week of ${current.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
                });
                current.setDate(current.getDate() + 7);
            }
        }
        return list;
    }, [startRange, endRange, totalDuration, zoom]);

    // --- Lane Allocation & Global Mapping ---
    const { lanes, eventPositions } = useMemo(() => {
        const sorted = [...events].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
        const lanes: CalendarEvent[][] = [];
        const positions = new Map<string, { lane: number; left: number; width: number }>();

        sorted.forEach(ev => {
            const start = new Date(ev.start_at).getTime();
            const end = new Date(ev.end_at).getTime();

            // Map to global percentage of "sections"
            const totalSectionsWidth = sections.length * 100;
            const globalLeft = ((start - startRange.getTime()) / totalDuration) * totalSectionsWidth;
            const globalWidth = Math.max(((end - start) / totalDuration) * totalSectionsWidth, zoom === 'month' ? 0.3 : 0.1);

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

            positions.set(ev.id, { lane: assignedLane, left: globalLeft, width: globalWidth });
        });

        return { lanes, eventPositions: positions };
    }, [events, startRange, endRange, totalDuration, sections, zoom]);

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
                        Dense (Month)
                    </Button>
                    <Button
                        variant={zoom === 'week' ? 'secondary' : 'ghost'}
                        size="sm"
                        className="h-7 text-[10px] uppercase font-bold tracking-widest px-3"
                        onClick={() => setZoom('week')}
                    >
                        Sparse (Week)
                    </Button>
                </div>
                <div className="text-[10px] text-gray-400 uppercase tracking-widest font-bold pr-2 opacity-50">
                    Spine Projection v2
                </div>
            </div>

            <div className="relative border-none rounded-xl bg-white min-h-[520px]">
                {/* Horizontal Scroll Container (Discrete Snap) */}
                <div
                    className="overflow-x-auto custom-scrollbar snap-x snap-mandatory scroll-smooth"
                    style={{ WebkitOverflowScrolling: 'touch', scrollBehavior: 'auto' }}
                >
                    <div
                        className="relative flex"
                        style={{
                            width: `${sections.length * 100}%`,
                            height: `${Math.max(lanes.length * 44 + 120, 500)}px`,
                        }}
                    >
                        {/* THE SPINE (Global Layer) */}
                        <div
                            className="absolute left-0 right-0 h-[1.5px] bg-gray-200/40 z-0"
                            style={{ top: '88px' }}
                        />

                        {/* DISCRETE SECTIONS (Snap Targets) */}
                        {sections.map((s, i) => (
                            <div
                                key={i}
                                className="flex-none w-full relative snap-start border-l border-gray-100/30"
                            >
                                {/* High-Contrast Anchor */}
                                <div className="absolute top-4 left-4 z-30">
                                    <span className="text-[11px] text-black font-extrabold uppercase tracking-widest bg-white/90 py-1.5 px-3 rounded-md shadow-sm border border-gray-100">
                                        {s.label}
                                    </span>
                                </div>

                                {/* Vertical Grid Lines (Optional Overlays) */}
                                {showOverlays && zoom === 'week' && (
                                    <div className="absolute inset-x-0 top-0 bottom-0 pointer-events-none flex">
                                        {Array.from({ length: 7 }).map((_, d) => (
                                            <div key={d} className="flex-1 border-r border-gray-50/50" />
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}

                        {/* GLOBAL SVG (Edges) */}
                        <svg
                            className="absolute inset-0 pointer-events-none z-10"
                            style={{ width: '100%', height: '100%' }}
                        >
                            {edges.map(edge => {
                                const sourcePos = eventPositions.get(edge.source_event_id);
                                const targetPos = eventPositions.get(edge.target_event_id);
                                if (!sourcePos || !targetPos) return null;

                                const y1 = sourcePos.lane * 44 + 70 + (zoom === 'month' ? 18 : 18);
                                const y2 = targetPos.lane * 44 + 70 + (zoom === 'month' ? 18 : 18);

                                const isHighlighted = hoveredEventId === edge.source_event_id || hoveredEventId === edge.target_event_id;

                                const cp1x = sourcePos.left + (targetPos.left - sourcePos.left) * 0.5;
                                const cp2x = sourcePos.left + (targetPos.left - sourcePos.left) * 0.5;

                                return (
                                    <path
                                        key={edge.id}
                                        d={`M ${sourcePos.left + (zoom === 'month' ? 0.3 : sourcePos.width)}% ${y1} C ${cp1x}% ${y1}, ${cp2x}% ${y2}, ${targetPos.left}% ${y2}`}
                                        stroke="#94a3b8"
                                        strokeWidth="1"
                                        fill="none"
                                        className="transition-opacity duration-500"
                                        opacity={isHighlighted ? 0.5 : 0}
                                    />
                                );
                            })}
                        </svg>

                        {/* GLOBAL PROJECTS (Events) */}
                        {events.map((ev) => {
                            const pos = eventPositions.get(ev.id);
                            if (!pos) return null;

                            if (zoom === 'month') {
                                return (
                                    <button
                                        key={ev.id}
                                        onClick={() => onSelectEvent(ev)}
                                        onMouseEnter={() => setHoveredEventId(ev.id)}
                                        onMouseLeave={() => setHoveredEventId(null)}
                                        className="absolute h-2.5 w-2.5 rounded-full bg-gray-400/80 hover:bg-gray-900 transition-all z-20 group"
                                        style={{
                                            left: `${pos.left}%`,
                                            top: `${pos.lane * 44 + 83}px`,
                                            transform: 'translateX(-50%)'
                                        }}
                                        aria-label={ev.title}
                                    >
                                        <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-gray-900 text-white text-[9px] px-2 py-1 rounded whitespace-nowrap z-50">
                                            {ev.title}
                                        </div>
                                    </button>
                                );
                            }

                            return (
                                <button
                                    key={ev.id}
                                    onClick={() => onSelectEvent(ev)}
                                    onMouseEnter={() => setHoveredEventId(ev.id)}
                                    onMouseLeave={() => setHoveredEventId(null)}
                                    className="absolute h-9 rounded-[2px] border border-gray-100 bg-white/60 hover:bg-white hover:border-gray-400 transition-all text-left overflow-hidden group z-20 shadow-none"
                                    style={{
                                        left: `${pos.left}%`,
                                        width: `${pos.width}%`,
                                        top: `${pos.lane * 44 + 70}px`,
                                        minWidth: '28px'
                                    }}
                                >
                                    <div className="px-2 py-1 flex items-center justify-between h-full gap-2 opacity-70 group-hover:opacity-100">
                                        <span className="text-[10px] font-medium text-gray-500 truncate flex-1 leading-tight group-hover:text-gray-900">
                                            {ev.title}
                                        </span>
                                        {ev.signals && ev.signals.length > 0 && showOverlays && (
                                            <div className="shrink-0 flex items-center gap-1 opacity-50">
                                                <span className="text-[8px] text-gray-400 font-bold bg-gray-50 px-1 rounded border border-gray-200">
                                                    {ev.signals.length}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {events.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center text-gray-300 text-[10px] items-center gap-1 uppercase tracking-widest font-bold">
                        No events to project
                    </div>
                )}
            </div>

            <div className="text-[9px] text-gray-300 uppercase tracking-[0.2em] text-center px-4 leading-relaxed font-medium opacity-60">
                Spine Orientation · Discovery Mode · AFERR Phase 3.1
            </div>
        </div>
    );
}
