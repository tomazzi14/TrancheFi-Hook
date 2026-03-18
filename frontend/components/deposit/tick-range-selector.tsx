"use client"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"

// Presets aligned to tickSpacing=60
const PRESETS = [
  { label: "Full Range", tickLower: -887220, tickUpper: 887220 },
  { label: "Wide", tickLower: -60000, tickUpper: 60000 },
  { label: "Medium", tickLower: -6000, tickUpper: 6000 },
  { label: "Narrow", tickLower: -600, tickUpper: 600 },
] as const

interface TickRangeSelectorProps {
  tickLower: number
  tickUpper: number
  onTickLowerChange: (v: number) => void
  onTickUpperChange: (v: number) => void
}

export function TickRangeSelector({
  tickLower,
  tickUpper,
  onTickLowerChange,
  onTickUpperChange,
}: TickRangeSelectorProps) {
  const activePreset = PRESETS.find(
    (p) => p.tickLower === tickLower && p.tickUpper === tickUpper
  )

  return (
    <div className="flex flex-col gap-3">
      <label className="text-sm font-medium">Tick Range</label>
      <div className="grid grid-cols-4 gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            onClick={() => {
              onTickLowerChange(preset.tickLower)
              onTickUpperChange(preset.tickUpper)
            }}
            className={cn(
              "rounded-lg border px-3 py-2 text-xs font-medium transition-all",
              activePreset?.label === preset.label
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/50"
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            Lower Tick
          </label>
          <Input
            type="number"
            value={tickLower}
            onChange={(e) => onTickLowerChange(Number(e.target.value))}
            step={60}
            className="text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            Upper Tick
          </label>
          <Input
            type="number"
            value={tickUpper}
            onChange={(e) => onTickUpperChange(Number(e.target.value))}
            step={60}
            className="text-sm"
          />
        </div>
      </div>
    </div>
  )
}
