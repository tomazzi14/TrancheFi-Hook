"use client"

import { useUserPosition } from "@/hooks/useUserPosition"
import { usePendingFees } from "@/hooks/usePendingFees"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { formatEth } from "@/lib/utils"
import { Shield, Zap } from "lucide-react"

export function PositionCard() {
  const { data: position, isLoading: posLoading } = useUserPosition()
  const { data: fees, isLoading: feesLoading } = usePendingFees()

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
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-sm text-muted-foreground">Liquidity</p>
            <p className="text-xl font-semibold">
              {formatEth(amount as bigint)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Deposit Block</p>
            <p className="text-xl font-semibold">
              #{(depositBlock as bigint).toString()}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Pending Fees</p>
            <p className="text-lg font-semibold">
              <span className="text-muted-foreground text-sm">T0:</span>{" "}
              {formatEth(pending0 as bigint)}{" "}
              <span className="text-muted-foreground text-sm">T1:</span>{" "}
              {formatEth(pending1 as bigint)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
