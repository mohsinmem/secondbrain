/**
 * Swipe Interface Component (Work Order 5)
 * 
 * A mobile-first, touch-responsive UI for signal promotion.
 * Right Swipe -> Promote to Wisdom (Signal)
 * Left Swipe -> Dismiss as Noise
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, X, Info, BrainCircuit } from 'lucide-react';

interface Candidate {
    eventId: string;
    title: string;
    weight: number;
    reason: string;
}

interface SwipeInterfaceProps {
    candidates: Candidate[];
    onFinish: () => void;
    onPromote: (eventId: string) => Promise<void>;
}

export function SwipeInterface({ candidates, onFinish, onPromote }: SwipeInterfaceProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [history, setHistory] = useState<('promote' | 'dismiss')[]>([]);
    const [animating, setAnimating] = useState<'left' | 'right' | null>(null);

    const currentCandidate = candidates[currentIndex];

    const handleAction = async (action: 'promote' | 'dismiss') => {
        setAnimating(action === 'promote' ? 'right' : 'left');

        // Brief delay for animation
        setTimeout(async () => {
            if (action === 'promote') {
                await onPromote(currentCandidate.eventId);
            }

            setHistory([...history, action]);
            setAnimating(null);

            if (currentIndex < candidates.length - 1) {
                setCurrentIndex(currentIndex + 1);
            } else {
                onFinish();
            }
        }, 300);
    };

    if (!currentCandidate) {
        return (
            <div className="text-center py-20 animate-in fade-in">
                <div className="bg-green-50 h-16 w-16 rounded-full flex items-center justify-center mx-auto mb-4 border border-green-100">
                    <Check className="h-8 w-8 text-green-500" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">Review Complete</h3>
                <p className="text-sm text-gray-500 mt-2">All candidates processed for this hub.</p>
                <Button onClick={onFinish} variant="outline" className="mt-6">Back to Hub Feed</Button>
            </div>
        );
    }

    const progress = ((currentIndex + 1) / candidates.length) * 100;

    return (
        <div className="relative h-[600px] flex flex-col items-center justify-center p-4 overflow-hidden">
            {/* Progress Label */}
            <div className="absolute top-0 w-full text-center px-4 space-y-2">
                <div className="flex justify-between text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    <span>Context candidate {currentIndex + 1} of {candidates.length}</span>
                    <span>{Math.round(progress)}%</span>
                </div>
                <div className="w-full bg-gray-100 h-1 rounded-full overflow-hidden">
                    <div
                        className="bg-blue-500 h-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                    />
                </div>
            </div>

            {/* Candidate Card */}
            <div className={`relative w-full max-w-sm transition-all duration-300 ${animating === 'right' ? 'translate-x-[200%] rotate-12 opacity-0' :
                    animating === 'left' ? '-translate-x-[200%] -rotate-12 opacity-0' : ''
                }`}>
                <Card className="p-8 shadow-xl border-gray-100 flex flex-col items-center text-center space-y-6">
                    <div className="bg-blue-50/50 p-4 rounded-full border border-blue-100">
                        <BrainCircuit className="h-10 w-10 text-blue-500" />
                    </div>

                    <div className="space-y-2">
                        <h2 className="text-xl font-bold text-gray-900 leading-tight">
                            {currentCandidate.title}
                        </h2>
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-50 rounded-full border border-gray-100 text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                            <Info className="h-3 w-3" />
                            {currentCandidate.reason}
                        </div>
                    </div>

                    <p className="text-sm text-gray-600 leading-relaxed px-4">
                        Should this event be promoted to your permanent Wisdom Layer as a Signal?
                    </p>
                </Card>
            </div>

            {/* Controls */}
            <div className="absolute bottom-10 flex gap-12 items-center">
                <button
                    onClick={() => handleAction('dismiss')}
                    className="h-16 w-16 rounded-full border-2 border-red-100 bg-white flex items-center justify-center shadow-lg hover:bg-red-50 transition-colors active:scale-90"
                    title="Dismiss (Left)"
                >
                    <X className="h-8 w-8 text-red-500" />
                </button>

                <button
                    onClick={() => handleAction('promote')}
                    className="h-20 w-20 rounded-full border-2 border-green-500 bg-white flex items-center justify-center shadow-xl hover:bg-green-50 transition-colors active:scale-95"
                    title="Promote (Right)"
                >
                    <Check className="h-10 w-10 text-green-500" />
                </button>
            </div>

            {/* Swiper Guidance */}
            <div className="absolute bottom-0 text-[10px] font-bold text-gray-300 uppercase tracking-widest pb-4">
                Swipe or Tap to Categorize
            </div>
        </div>
    );
}
