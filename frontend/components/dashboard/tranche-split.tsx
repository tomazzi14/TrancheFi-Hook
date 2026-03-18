"use client"

import { usePoolStats } from "@/hooks/usePoolStats"
import { Skeleton } from "@/components/ui/skeleton"
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts"
import { formatEth } from "@/lib/utils"
import { Shield, Zap } from "lucide-react"

const SENIOR_COLOR = "oklch(0.65 0.18 250)"
const JUNIOR_COLOR = "oklch(0.72 0.18 55)"

export function TrancheSplit() {
  const { data, isLoading } = usePoolStats()

  const [totalSenior, totalJunior] = data ?? [0n, 0n]

  const seniorNum = Number(totalSenior) / 1e18
  const juniorNum = Number(totalJunior) / 1e18
  const total = seniorNum + juniorNum

  const chartData =
    total > 0
      ? [
          { name: "Senior", value: seniorNum },
          { name: "Junior", value: juniorNum },
        ]
      : [
          { name: "Senior", value: 50 },
          { name: "Junior", value: 50 },
        ]

  const COLORS = [SENIOR_COLOR, JUNIOR_COLOR]

  const seniorPct = total > 0 ? ((seniorNum / total) * 100).toFixed(1) : "50.0"
  const juniorPct = total > 0 ? ((juniorNum / total) * 100).toFixed(1) : "50.0"

  return (
    <div className="animate-fade-up-d3 glass relative overflow-hidden rounded-2xl p-6">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-blue-500/30 via-violet-500/20 to-orange-500/30" />

      <h3 className="text-sm font-semibold text-white mb-5">Tranche Split</h3>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Skeleton className="h-48 w-48 rounded-full" />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-6 md:flex-row md:justify-around">
          <div className="h-64 w-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={4}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {chartData.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "oklch(0.15 0.01 260)",
                    border: "1px solid oklch(1 0 0 / 8%)",
                    borderRadius: "12px",
                    color: "white",
                    fontSize: "12px",
                  }}
                  formatter={(value) => Number(value).toFixed(4)}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="flex flex-col gap-4">
            {/* Senior */}
            <div className="glass rounded-xl p-4 flex items-center gap-4 min-w-[220px]">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 ring-1 ring-blue-500/20">
                <Shield className="h-4 w-4 text-blue-400" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-zinc-500">Senior Liquidity</p>
                <p className="text-lg font-bold text-white">
                  {formatEth(totalSenior as bigint)}
                </p>
              </div>
              <span className="text-sm font-semibold text-gradient-senior">
                {seniorPct}%
              </span>
            </div>

            {/* Junior */}
            <div className="glass rounded-xl p-4 flex items-center gap-4 min-w-[220px]">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10 ring-1 ring-orange-500/20">
                <Zap className="h-4 w-4 text-orange-400" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-zinc-500">Junior Liquidity</p>
                <p className="text-lg font-bold text-white">
                  {formatEth(totalJunior as bigint)}
                </p>
              </div>
              <span className="text-sm font-semibold text-gradient-junior">
                {juniorPct}%
              </span>
            </div>

            {total === 0 && (
              <p className="text-xs text-zinc-600 italic text-center">
                No liquidity yet — showing placeholder
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
