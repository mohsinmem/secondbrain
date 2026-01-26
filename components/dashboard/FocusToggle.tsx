'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Filter, Eye, EyeOff } from 'lucide-react';

interface FocusToggleProps {
    showFiltered: boolean;
    setShowFiltered: (val: boolean) => void;
    filteredCount: number;
    totalCount: number;
    intentQuery: string;
}

export function FocusToggle({
    showFiltered,
    setShowFiltered,
    filteredCount,
    totalCount,
    intentQuery
}: FocusToggleProps) {
    if (!intentQuery) return null;

    const hiddenCount = totalCount - filteredCount;

    return (
        <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-3 mb-4 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-blue-500" />
                    <span className="text-sm text-gray-700 font-medium">
                        {showFiltered
                            ? `Showing ${filteredCount} relevant events`
                            : `Showing all ${totalCount} events`
                        }
                    </span>
                    {showFiltered && hiddenCount > 0 && (
                        <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider bg-white px-2 py-0.5 rounded-full border border-gray-100">
                            {hiddenCount} hidden
                        </span>
                    )}
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowFiltered(!showFiltered)}
                    className="text-xs h-8 px-3 text-blue-600 hover:text-blue-700 hover:bg-blue-100/50 font-bold uppercase tracking-wider"
                >
                    {showFiltered ? (
                        <><Eye className="h-3 w-3 mr-2" /> Expand to show all</>
                    ) : (
                        <><EyeOff className="h-3 w-3 mr-2" /> Focus on relevant</>
                    )}
                </Button>
            </div>
        </div>
    );
}
