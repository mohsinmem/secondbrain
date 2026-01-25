'use client';

import React from 'react';
import { useSearchParams } from 'next/navigation';

interface IntentContextPanelProps {
    intentType: 'forecast' | 'reflection';
    intentQuery: string;
    weekStart: string; // YYYY-MM-DD
    weekEnd: string; // YYYY-MM-DD
    eventCount: number;
}

export function IntentContextPanel({
    intentType,
    intentQuery,
    weekStart,
    weekEnd,
    eventCount
}: IntentContextPanelProps) {
    const [dismissed, setDismissed] = React.useState(false);

    if (dismissed) return null;

    // Format week range for display
    const formatWeekRange = (start: string, end: string) => {
        const startDate = new Date(start);
        const endDate = new Date(end);
        const startMonth = startDate.toLocaleDateString(undefined, { month: 'short' });
        const endMonth = endDate.toLocaleDateString(undefined, { month: 'short' });
        const startDay = startDate.getDate();
        const endDay = endDate.getDate();

        if (startMonth === endMonth) {
            return `${startMonth} ${startDay}–${endDay}`;
        }
        return `${startMonth} ${startDay} – ${endMonth} ${endDay}`;
    };

    const isForecast = intentType === 'forecast';

    return (
        <div className="bg-blue-50/30 border border-blue-100/50 rounded-lg p-4 mb-4 -mx-4 sm:-mx-6 lg:-mx-8">
            <div className="max-w-3xl mx-auto">
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-widest text-blue-600">
                            {isForecast ? 'Forecast' : 'Reflection'}
                        </span>
                        <span className="text-xs text-gray-400">·</span>
                        <span className="text-sm font-medium text-gray-700">
                            {intentQuery}
                        </span>
                    </div>
                    <button
                        onClick={() => setDismissed(true)}
                        className="text-xs text-gray-400 hover:text-gray-600 uppercase tracking-wider font-medium"
                    >
                        Dismiss
                    </button>
                </div>

                {/* Body - Primary sentence */}
                <p className="text-sm text-gray-700 mb-2">
                    {isForecast
                        ? `You're looking ahead to upcoming calendar activity related to "${intentQuery}".`
                        : `You're revisiting a past period with calendar activity related to "${intentQuery}".`
                    }
                </p>

                <p className="text-sm text-gray-600 mb-3">
                    {isForecast
                        ? 'This view helps you notice what\'s coming up, how activity is clustered, and where preparation may be useful.'
                        : 'This view supports looking back at decisions, interactions, and patterns before they fade from memory.'}
                </p>

                {/* System selection line */}
                <p className="text-xs text-gray-500 mb-2">
                    {isForecast
                        ? 'The timeline is positioned at the next relevant week with scheduled activity.'
                        : 'The timeline is positioned at a previously active week.'}
                </p>

                {/* Context footer */}
                <div className="flex items-center gap-2 text-xs text-gray-400 font-medium">
                    <span>Week of {formatWeekRange(weekStart, weekEnd)}</span>
                    <span>·</span>
                    <span>{eventCount} scheduled {eventCount === 1 ? 'item' : 'items'}</span>
                </div>
            </div>
        </div>
    );
}
