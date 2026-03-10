"use client"

import { usePoolStats } from "@/hooks/usePoolStats"
import { usePoolPrice } from "@/hooks/usePoolPrice"
import { formatEth, formatBps } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { TrendingUp, Layers, PieChart, Shield, DollarSign } from "lucide-react"

export function PoolStats() {
  const { data, isLoading, error } = usePoolStats()
  const { price: poolPrice } = usePoolPrice()

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
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
    },
    {
      title: "Total Liquidity",
      value: isLoading ? null : formatEth(totalLiquidity),
      subtitle: "Senior + Junior",
      icon: Layers,
    },
    {
      title: "Senior APY",
      value: isLoading ? null : formatBps(seniorAPY as bigint),
      subtitle: "Target yield",
      icon: TrendingUp,
    },
    {
      title: "Fees Distributed",
      value: isLoading
        ? null
        : formatEth((seniorFees as bigint) + (juniorFees as bigint)),
      subtitle: `S: ${formatEth(seniorFees as bigint)} / J: ${formatEth(juniorFees as bigint)}`,
      icon: PieChart,
    },
    {
      title: "Senior Ratio",
      value: isLoading ? null : formatBps(seniorRatio as bigint),
      subtitle: "of total liquidity",
      icon: Shield,
    },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {stats.map((stat) => (
        <Card key={stat.title}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {stat.title}
            </CardTitle>
            <stat.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {stat.value === null ? (
              <Skeleton className="h-7 w-24" />
            ) : (
              <>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.subtitle}</p>
              </>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
