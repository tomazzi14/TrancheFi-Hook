"use client"

import { useUserPosition } from "@/hooks/useUserPosition"
import { usePendingFees } from "@/hooks/usePendingFees"
import { usePoolStats } from "@/hooks/usePoolStats"
import { usePoolPrice } from "@/hooks/usePoolPrice"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { formatEth } from "@/lib/utils"
import { Shield, Zap } from "lucide-react"

export function PositionCard() {
  const { data: position, isLoading: posLoading } = useUserPosition()
  const { data: fees, isLoading: feesLoading } = usePendingFees()
  const { data: poolStats } = usePoolStats()
  const { price: poolPrice } = usePoolPrice()

  const isLoading = posLoading || feesLoading

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Your Position</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-6 w-40" />
        </CardContent>
      </Card>
    )
  }

  // position: [tranche, amount, depositBlock, rewardDebt0, rewardDebt1]
  const [tranche, amount, depositBlock] = position ?? [0, 0n, 0n, 0n, 0n]
  const [pending0, pending1] = fees ?? [0n, 0n]

  const hasPosition = (amount as bigint) > 0n
  const isSenior = Number(tranche) === 0
  const liquidityAmount = amount as bigint

  // Pool stats: [totalSenior, totalJunior, seniorRatio, targetAPY, volatility]
  const totalSenior = poolStats ? (poolStats as bigint[])[0] : 0n
  const totalJunior = poolStats ? (poolStats as bigint[])[1] : 0n
  const totalLiquidity = totalSenior + totalJunior

  // Estimate token values using current pool price
  // For full-range liquidity, each unit provides proportional tokens at current price
  const liquidityEth = Number(liquidityAmount) / 1e18
  const estimatedMwethNum = liquidityEth
  const estimatedMusdcNum = liquidityEth * (poolPrice > 0 ? poolPrice : 1)

  if (!hasPosition) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Your Position</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            No active position. Go to{" "}
            <a href="/deposit" className="text-primary underline">
              Deposit
            </a>{" "}
            to get started.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Your Position</CardTitle>
        <Badge
          variant="outline"
          className={
            isSenior
              ? "border-senior text-senior"
              : "border-junior text-junior"
          }
        >
          {isSenior ? (
            <Shield className="mr-1 h-3 w-3" />
          ) : (
            <Zap className="mr-1 h-3 w-3" />
          )}
          {isSenior ? "Senior" : "Junior"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm text-muted-foreground mb-2">Deposited Value</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">mWETH</p>
              <p className="text-lg font-semibold">{estimatedMwethNum.toFixed(4)}</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">mUSDC</p>
              <p className="text-lg font-semibold">{estimatedMusdcNum.toFixed(2)}</p>
            </div>
          </div>
        </div>

        <Separator />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm text-muted-foreground">Liquidity Units</p>
            <p className="text-xl font-semibold">
              {formatEth(liquidityAmount)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Deposit Block</p>
            <p className="text-xl font-semibold">
              #{(depositBlock as bigint).toString()}
            </p>
          </div>
        </div>

        <Separator />

        <div>
          <p className="text-sm text-muted-foreground mb-2">Pending Fees</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">mWETH</p>
              <p className="text-lg font-semibold">{formatEth(pending0 as bigint)}</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">mUSDC</p>
              <p className="text-lg font-semibold">{formatEth(pending1 as bigint)}</p>
            </div>
          </div>
        </div>

        {totalLiquidity > 0n && (
          <>
            <Separator />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Your share of pool</span>
              <span className="font-medium">
                {((Number(liquidityAmount) / Number(totalLiquidity)) * 100).toFixed(2)}%
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
