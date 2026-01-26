/**
 * Strategic Priority Cloud (Work Order 6.0)
 * 
 * Allows users to weight organizational keywords (0-100%).
 * Influences the "Sovereign Brain" clustering engine.
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { BrainCircuit, X, Save, TrendingUp } from 'lucide-react';

interface KeywordWeight {
    keyword: string;
    weight: number;
}

export function StrategicPriorityCloud({ onClose }: { onClose: () => void }) {
    const [weights, setWeights] = useState<KeywordWeight[]>([
        { keyword: 'TaskUs', weight: 50 },
        { keyword: 'Mapletree', weight: 50 },
        { keyword: 'PSDC', weight: 50 },
        { keyword: 'AFERR', weight: 50 },
        { keyword: 'Evivve', weight: 50 }
    ]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchWeights();
    }, []);

    async function fetchWeights() {
        const supabase = createClient();
        const { data } = await supabase.from('keyword_priorities').select('keyword, weight');
        if (data && data.length > 0) {
            // Merge with defaults
            const merged = weights.map(w => {
                const dbW = data.find(d => d.keyword === w.keyword);
                return dbW ? dbW : w;
            });
            setWeights(merged);
        }
    }

    const handleSliderChange = (keyword: string, val: number[]) => {
        setWeights(weights.map(w => w.keyword === keyword ? { ...w, weight: val[0] } : w));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const upserts = weights.map(w => ({
                user_id: user.id,
                keyword: w.keyword,
                weight: w.weight
            }));

            const { error } = await supabase.from('keyword_priorities').upsert(upserts, {
                onConflict: 'user_id, keyword'
            });

            if (error) throw error;
            onClose();
        } catch (error) {
            console.error('Failed to save priorities', error);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card className="fixed bottom-24 right-6 w-80 shadow-2xl border-2 border-blue-500/20 bg-white/95 backdrop-blur z-50 animate-in slide-in-from-bottom-4 duration-300">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-blue-50/50">
                <div className="flex items-center gap-2">
                    <BrainCircuit className="h-4 w-4 text-blue-600" />
                    <h3 className="text-xs font-bold uppercase tracking-widest text-blue-900">Priority Engine</h3>
                </div>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                    <X className="h-4 w-4" />
                </button>
            </div>

            <div className="p-4 space-y-6">
                <p className="text-[10px] text-gray-500 leading-relaxed italic">
                    Weight strategic keywords to force re-clustering. High-weight organizations become primary Hub drivers.
                </p>

                {weights.map((w) => (
                    <div key={w.keyword} className="space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-700">{w.keyword}</span>
                            <span className={`text-[10px] font-mono font-bold ${w.weight > 70 ? 'text-blue-600' : 'text-gray-400'}`}>
                                {w.weight}%
                            </span>
                        </div>
                        <Slider
                            defaultValue={[w.weight]}
                            max={100}
                            step={5}
                            onValueChange={(val) => handleSliderChange(w.keyword, val)}
                            className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4"
                        />
                    </div>
                ))}

                <div className="pt-2">
                    <Button
                        className="w-full bg-blue-600 hover:bg-blue-700 text-xs font-bold uppercase tracking-widest gap-2 h-10"
                        onClick={handleSave}
                        disabled={saving}
                    >
                        {saving ? 'Syncing Brain...' : (
                            <>
                                <Save className="h-3 w-3" />
                                Apply Strategic Weights
                            </>
                        )}
                    </Button>
                </div>

                <div className="flex items-center gap-2 text-[9px] text-gray-400 justify-center">
                    <TrendingUp className="h-3 w-3" />
                    <span>Weights re-calculate Hub boundaries on next sync.</span>
                </div>
            </div>
        </Card>
    );
}
