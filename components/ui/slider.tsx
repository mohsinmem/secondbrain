/**
 * Slider UI Component (Work Order 6.0)
 * 
 * Simple wrapper around HTML range input for strategic weighting.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

export interface SliderProps {
    defaultValue?: number[];
    max?: number;
    min?: number;
    step?: number;
    onValueChange?: (value: number[]) => void;
    className?: string;
    disabled?: boolean;
}

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
    ({ className, defaultValue, max = 100, min = 0, step = 1, onValueChange, disabled, ...props }, ref) => {
        const [value, setValue] = React.useState(defaultValue?.[0] || 0);

        // SYNC: Update internal state when defaultValue changed from outside (e.g. after fetch)
        React.useEffect(() => {
            if (defaultValue && defaultValue[0] !== undefined) {
                setValue(defaultValue[0]);
            }
        }, [defaultValue]);

        const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            const newValue = parseInt(e.target.value, 10);
            setValue(newValue);
            if (onValueChange) {
                onValueChange([newValue]);
            }
        };

        return (
            <div className={cn("relative flex w-full touch-none select-none items-center", className)}>
                <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={handleChange}
                    disabled={disabled}
                    ref={ref}
                    className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600 focus:outline-none focus:ring-0 disabled:opacity-50 disabled:cursor-not-allowed"
                    {...props}
                />
            </div>
        );
    }
);
Slider.displayName = "Slider";

export { Slider };
