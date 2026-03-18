"use client"

import { Shield, Zap } from "lucide-react"

interface TrancheSelectorProps {
  selected: 0 | 1
  onSelect: (tranche: 0 | 1) => void
}

export function TrancheSelector({ selected, onSelect }: TrancheSelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Senior */}
      <button
        onClick={() => onSelect(0)}
        className={`relative overflow-hidden glass glass-hover rounded-2xl p-6 flex flex-col items-center gap-4 transition-all ${
          selected === 0
            ? "glow-senior ring-1 ring-blue-500/30"
            : "hover:ring-1 hover:ring-blue-500/20"
        }`}
      >
        <div className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-400 to-transparent transition-opacity ${
          selected === 0 ? "opacity-80" : "opacity-0"
        }`} />
        <div className={`flex h-14 w-14 items-center justify-center rounded-2xl transition-colors ${
          selected === 0
            ? "bg-blue-500/15 ring-1 ring-blue-500/20"
            : "bg-zinc-800/50"
        }`}>
          <Shield className={`h-7 w-7 transition-colors ${
            selected === 0 ? "text-blue-400" : "text-zinc-500"
          }`} />
        </div>
        <div className="text-center">
          <p className={`text-lg font-bold transition-colors ${
            selected === 0 ? "text-white" : "text-zinc-400"
          }`}>Senior</p>
          <p className="mt-1.5 text-xs text-zinc-500 leading-relaxed">
            Stable, priority yield. Gets paid first from swap fees up to target APY.
          </p>
        </div>
      </button>

      {/* Junior */}
      <button
        onClick={() => onSelect(1)}
        className={`relative overflow-hidden glass glass-hover rounded-2xl p-6 flex flex-col items-center gap-4 transition-all ${
          selected === 1
            ? "glow-junior ring-1 ring-orange-500/30"
            : "hover:ring-1 hover:ring-orange-500/20"
        }`}
      >
        <div className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-orange-400 to-transparent transition-opacity ${
          selected === 1 ? "opacity-80" : "opacity-0"
        }`} />
        <div className={`flex h-14 w-14 items-center justify-center rounded-2xl transition-colors ${
          selected === 1
            ? "bg-orange-500/15 ring-1 ring-orange-500/20"
            : "bg-zinc-800/50"
        }`}>
          <Zap className={`h-7 w-7 transition-colors ${
            selected === 1 ? "text-orange-400" : "text-zinc-500"
          }`} />
        </div>
        <div className="text-center">
          <p className={`text-lg font-bold transition-colors ${
            selected === 1 ? "text-white" : "text-zinc-400"
          }`}>Junior</p>
          <p className="mt-1.5 text-xs text-zinc-500 leading-relaxed">
            Variable returns. Gets surplus fees after Senior is satisfied — higher upside, more risk.
          </p>
        </div>
      </button>
    </div>
  )
}
