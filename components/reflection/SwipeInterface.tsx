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

import { Input } from '@/components/ui/input';

interface Candidate {
    eventId: string;
    title: string;
    weight: number;
    reason: string;
}

interface SwipeInterfaceProps {
    hubId?: string;
    hubTitle?: string;
    candidates: Candidate[];
    onFinish: () => void;
    onPromote: (eventId: string, attributes: string[]) => Promise<void>;
}

export function SwipeInterface({ hubId, hubTitle, candidates, onFinish, onPromote }: SwipeInterfaceProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [history, setHistory] = useState<('promote' | 'dismiss')[]>([]);
    const [animating, setAnimating] = useState<'left' | 'right' | null>(null);

    // Wisdom Attributes (Work Order 6.1)
    const [attributes, setAttributes] = useState<string[]>([]);
    const [newAttribute, setNewAttribute] = useState('');
    const SUGGESTIONS = ['TaskUs', 'Mapletree', 'PSDC', 'Family', 'Sana', 'AFERR', 'Strategic'];

    // Rename Logic
    const [showRename, setShowRename] = useState(false);
    const [newTitle, setNewTitle] = useState(hubTitle || '');
    const [hubHasBeenRenamed, setHubHasBeenRenamed] = useState(false);
    const [renaming, setRenaming] = useState(false);

    const currentCandidate = candidates[currentIndex];

    // Reset attributes when candidate changes
    useEffect(() => {
        setAttributes([]);
        setNewAttribute('');
    }, [currentIndex]);

    const handleAction = async (action: 'promote' | 'dismiss') => {
        const isGeneric = hubTitle?.includes('Pulse') || hubTitle?.includes('Intensive') || hubTitle?.includes('activity');
        if (action === 'promote' && isGeneric && !hubHasBeenRenamed && hubId) {
            setShowRename(true);
            return;
        }

        executeAction(action);
    };

    const toggleAttribute = (attr: string) => {
        if (attributes.includes(attr)) {
            setAttributes(attributes.filter(a => a !== attr));
        } else {
            setAttributes([...attributes, attr]);
        }
    };

    const addCustomAttribute = () => {
        if (!newAttribute || attributes.includes(newAttribute)) return;
        setAttributes([...attributes, newAttribute]);
        setNewAttribute('');
    };

    const executeAction = async (action: 'promote' | 'dismiss') => {
        setAnimating(action === 'promote' ? 'right' : 'left');

        setTimeout(async () => {
            if (action === 'promote') {
                await onPromote(currentCandidate.eventId, attributes);
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

    const handleRename = async () => {
        if (!hubId || !newTitle) return;
        setRenaming(true);
        try {
            await fetch(`/api/hubs/${hubId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: newTitle })
            });
            setHubHasBeenRenamed(true);
            setShowRename(false);
            executeAction('promote');
        } catch (error) {
            console.error('Rename failed', error);
        } finally {
            setRenaming(false);
        }
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
        <div className="relative h-[650px] flex flex-col items-center justify-center p-4 overflow-hidden">
            {/* Rename Modal */}
            {showRename && (
                <div className="absolute inset-0 z-50 bg-white/90 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
                    <Card className="w-full max-w-sm p-6 shadow-2xl border-blue-100 flex flex-col gap-4">
                        <div className="space-y-1">
                            <h3 className="font-bold text-gray-900">Name this Hub</h3>
                            <p className="text-xs text-gray-500">Give this cluster a friendly, permanent name before promoting signals.</p>
                        </div>
                        <Input
                            value={newTitle}
                            onChange={(e) => setNewTitle(e.target.value)}
                            placeholder="e.g. Bali Trip Nov 2025"
                            className="bg-blue-50/30 border-blue-100"
                            autoFocus
                        />
                        <div className="flex gap-2 pt-2">
                            <Button variant="ghost" className="flex-1 text-gray-400" onClick={() => { setShowRename(false); executeAction('promote'); }}>
                                Skip
                            </Button>
                            <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={handleRename} disabled={renaming}>
                                {renaming ? 'Saving...' : 'Set Name'}
                            </Button>
                        </div>
                    </Card>
                </div>
            )}

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

                    <div className="w-full space-y-4">
                        <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">
                            Add Wisdom Attributes
                        </p>

                        {/* THE WISDOM GATE: Suggestion Chips */}
                        <div className="flex flex-wrap justify-center gap-2">
                            {SUGGESTIONS.map(tag => (
                                <button
                                    key={tag}
                                    onClick={() => toggleAttribute(tag)}
                                    className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all border ${attributes.includes(tag)
                                            ? 'bg-blue-500 text-white border-blue-500'
                                            : 'bg-white text-gray-400 border-gray-100 hover:border-blue-200'
                                        }`}
                                >
                                    {tag}
                                </button>
                            ))}
                        </div>

                        {/* Custom Attribute Input */}
                        <div className="flex gap-2">
                            <Input
                                value={newAttribute}
                                onChange={(e) => setNewAttribute(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && addCustomAttribute()}
                                placeholder="Add custom attribute..."
                                className="h-8 text-xs bg-gray-50/50 border-gray-100 focus:ring-0"
                            />
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 text-[10px] font-bold uppercase text-blue-500"
                                onClick={addCustomAttribute}
                            >
                                Add
                            </Button>
                        </div>
                    </div>
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

            <div className="absolute bottom-0 text-[10px] font-bold text-gray-300 uppercase tracking-widest pb-4">
                Swipe or Tap to Categorize
            </div>
        </div>
    );
}
