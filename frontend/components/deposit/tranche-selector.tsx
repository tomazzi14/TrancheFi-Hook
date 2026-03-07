"use client"

import { cn } from "@/lib/utils"
import { Shield, Zap } from "lucide-react"

interface TrancheSelectorProps {
  selected: 0 | 1
  onSelect: (tranche: 0 | 1) => void
}

export function TrancheSelector({ selected, onSelect }: TrancheSelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <button
        onClick={() => onSelect(0)}
        className={cn(
          "flex flex-col items-center gap-3 rounded-xl border-2 p-6 transition-all",
          selected === 0
            ? "border-senior bg-senior/10"
            : "border-border hover:border-senior/50"
        )}
      >
        <Shield
          className={cn(
            "h-8 w-8",
            selected === 0 ? "text-senior" : "text-muted-foreground"
          )}
        />
        <div className="text-center">
          <p className="text-lg font-semibold">Senior</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Stable, priority yield. Gets paid first from swap fees up to target
            APY.
          </p>
        </div>
      </button>

      <button
        onClick={() => onSelect(1)}
        className={cn(
          "flex flex-col items-center gap-3 rounded-xl border-2 p-6 transition-all",
          selected === 1
            ? "border-junior bg-junior/10"
            : "border-border hover:border-junior/50"
        )}
      >
        <Zap
          className={cn(
            "h-8 w-8",
            selected === 1 ? "text-junior" : "text-muted-foreground"
          )}
        />
        <div className="text-center">
          <p className="text-lg font-semibold">Junior</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Variable returns. Gets surplus fees after Senior is satisfied —
            higher upside, more risk.
          </p>
        </div>
      </button>
    </div>
  )
}
