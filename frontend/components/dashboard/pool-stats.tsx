"use client"

import { usePoolStats } from "@/hooks/usePoolStats"
import { usePoolPrice } from "@/hooks/usePoolPrice"
import { formatEth, formatBps } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import { TrendingUp, Layers, PieChart, Shield, DollarSign } from "lucide-react"

const COLOR_MAP = {
  violet: {
    iconBg: "bg-violet-500/10",
    iconText: "text-violet-400",
    accent: "from-violet-500/40 via-violet-500/10 to-transparent",
  },
  blue: {
    iconBg: "bg-blue-500/10",
    iconText: "text-blue-400",
    accent: "from-blue-500/40 via-blue-500/10 to-transparent",
  },
  orange: {
    iconBg: "bg-orange-500/10",
    iconText: "text-orange-400",
    accent: "from-orange-500/40 via-orange-500/10 to-transparent",
  },
} as const

export function PoolStats() {
  const { data, isLoading, error } = usePoolStats()
  const { price: poolPrice } = usePoolPrice()

  if (error) {
    return (
      <div className="glass rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400">
        Failed to load pool stats. Make sure you are connected to Unichain
        Sepolia.
      </div>
    )
  }

  const [totalSenior, totalJunior, seniorFees, juniorFees, seniorAPY, seniorRatio] =
    data ?? [0n, 0n, 0n, 0n, 0n, 0n]

  const totalLiquidity = (totalSenior as bigint) + (totalJunior as bigint)

  const stats = [
    {
      title: "ETH/USDC Price",
      value: isLoading ? null : `${poolPrice > 0 ? poolPrice.toFixed(2) : "—"}`,
      subtitle: "Current pool price",
      icon: DollarSign,
      color: "violet" as const,
    },
    {
      title: "Total Liquidity",
      value: isLoading ? null : formatEth(totalLiquidity),
      subtitle: "Senior + Junior",
      icon: Layers,
      color: "violet" as const,
    },
    {
      title: "Senior APY",
      value: isLoading ? null : formatBps(seniorAPY as bigint),
      subtitle: "Target yield",
      icon: TrendingUp,
      color: "blue" as const,
    },
    {
      title: "Fees Distributed",
      value: isLoading
        ? null
        : formatEth((seniorFees as bigint) + (juniorFees as bigint)),
      subtitle: `S: ${formatEth(seniorFees as bigint)} / J: ${formatEth(juniorFees as bigint)}`,
      icon: PieChart,
      color: "orange" as const,
    },
    {
      title: "Senior Ratio",
      value: isLoading ? null : formatBps(seniorRatio as bigint),
      subtitle: "of total liquidity",
      icon: Shield,
      color: "blue" as const,
    },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {stats.map((stat, i) => {
        const colors = COLOR_MAP[stat.color]
        return (
          <div
            key={stat.title}
            className={`animate-fade-up-d${Math.min(i + 1, 5)} glass glass-hover relative overflow-hidden rounded-2xl p-4`}
          >
            <div className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r ${colors.accent}`} />
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">
                {stat.title}
              </p>
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${colors.iconBg}`}>
                <stat.icon className={`h-3.5 w-3.5 ${colors.iconText}`} />
              </div>
            </div>
            {stat.value === null ? (
              <Skeleton className="h-7 w-24" />
            ) : (
              <>
                <p className="text-2xl font-bold text-white">{stat.value}</p>
                <p className="text-xs text-zinc-600 mt-1">{stat.subtitle}</p>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
