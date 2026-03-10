"use client"

import { useState, useEffect } from "react"
import { useUserPosition } from "@/hooks/useUserPosition"
import { useClaimFees, useWithdrawFees } from "@/hooks/useClaimFees"
import { useRemoveLiquidity } from "@/hooks/useRemoveLiquidity"
import { usePoolPrice } from "@/hooks/usePoolPrice"
import { POOL_KEY } from "@/lib/config/contracts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import { Loader2, Coins, LogOut } from "lucide-react"

const PERCENT_OPTIONS = [25, 50, 75, 100] as const

export function ActionsCard() {
  const { data: position } = useUserPosition()
  const [removePercent, setRemovePercent] = useState<number>(0)
  const { price } = usePoolPrice()

  const {
    claimFees,
    isPending: isClaiming,
    isConfirming: isClaimConfirming,
    isSuccess: claimSuccess,
    error: claimError,
  } = useClaimFees()

  const {
    withdrawFees,
    isPending: isWithdrawing,
    isConfirming: isWithdrawConfirming,
    isSuccess: withdrawSuccess,
  } = useWithdrawFees()

  const {
    removeLiquidity,
    isPending: isRemoving,
    isConfirming: isRemoveConfirming,
    isSuccess: removeSuccess,
    error: removeError,
  } = useRemoveLiquidity()

  useEffect(() => {
    if (claimSuccess) toast.success("Fees claimed to hook balance!")
  }, [claimSuccess])

  useEffect(() => {
    if (withdrawSuccess) toast.success("Fees withdrawn to wallet!")
  }, [withdrawSuccess])

  useEffect(() => {
    if (removeSuccess) {
      toast.success("Liquidity removed!")
      setRemovePercent(0)
    }
  }, [removeSuccess])

  useEffect(() => {
    if (claimError) toast.error(claimError.message.slice(0, 100))
  }, [claimError])

  useEffect(() => {
    if (removeError) toast.error(removeError.message.slice(0, 100))
  }, [removeError])

  const [, amount] = position ?? [0, 0n, 0n, 0n, 0n]
  const liquidityAmount = amount as bigint
  const hasPosition = liquidityAmount > 0n

  if (!hasPosition) return null

  // Calculate removal amounts
  const liquidityToRemove =
    removePercent > 0
      ? (liquidityAmount * BigInt(removePercent)) / 100n
      : 0n

  const liquidityNum = Number(liquidityToRemove) / 1e18
  const currentPrice = price > 0 ? price : 2000

  // Estimated tokens user receives (full-range proportional)
  const estMweth = liquidityNum
  const estMusdc = liquidityNum * currentPrice

  const handleRemove = () => {
    if (liquidityToRemove <= 0n) return
    removeLiquidity(liquidityToRemove)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Actions</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div>
          <h3 className="mb-2 text-sm font-medium">Claim Fees</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Step 1: Move pending fees to claimable balance. Step 2: Withdraw
            each token to your wallet.
          </p>
          <div className="flex gap-3">
            <Button
              onClick={claimFees}
              disabled={isClaiming || isClaimConfirming}
              variant="outline"
              className="flex-1"
            >
              {isClaiming || isClaimConfirming ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Coins className="mr-2 h-4 w-4" />
              )}
              1. Claim Fees
            </Button>
            <Button
              onClick={() =>
                withdrawFees(POOL_KEY.currency0 as `0x${string}`)
              }
              disabled={isWithdrawing || isWithdrawConfirming}
              variant="outline"
              className="flex-1"
            >
              {isWithdrawing || isWithdrawConfirming ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              2. Withdraw mWETH
            </Button>
            <Button
              onClick={() =>
                withdrawFees(POOL_KEY.currency1 as `0x${string}`)
              }
              disabled={isWithdrawing || isWithdrawConfirming}
              variant="outline"
              className="flex-1"
            >
              {isWithdrawing || isWithdrawConfirming ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              3. Withdraw mUSDC
            </Button>
          </div>
        </div>

        <Separator />

        <div>
          <h3 className="mb-3 text-sm font-medium">Remove Liquidity</h3>

          {/* Percentage selector */}
          <div className="flex gap-2 mb-4">
            {PERCENT_OPTIONS.map((pct) => (
              <Button
                key={pct}
                variant={removePercent === pct ? "default" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() =>
                  setRemovePercent(removePercent === pct ? 0 : pct)
                }
              >
                {pct === 100 ? "Max" : `${pct}%`}
              </Button>
            ))}
          </div>

          {/* Estimated output */}
          {removePercent > 0 && (
            <div className="mb-4 rounded-lg bg-muted/50 p-4">
              <p className="text-xs text-muted-foreground mb-3">
                Removing {removePercent}% of your position
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border bg-background p-3">
                  <p className="text-xs text-muted-foreground mb-1">
                    You receive
                  </p>
                  <p className="text-lg font-bold">{estMweth.toFixed(4)}</p>
                  <p className="text-xs text-muted-foreground">mWETH</p>
                </div>
                <div className="rounded-lg border bg-background p-3">
                  <p className="text-xs text-muted-foreground mb-1">
                    You receive
                  </p>
                  <p className="text-lg font-bold">
                    {estMusdc.toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground">mUSDC</p>
                </div>
              </div>
            </div>
          )}

          {/* Remove button */}
          <Button
            onClick={handleRemove}
            disabled={
              removePercent === 0 || isRemoving || isRemoveConfirming
            }
            variant="destructive"
            className="w-full"
            size="lg"
          >
            {isRemoving || isRemoveConfirming ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Removing...
              </>
            ) : (
              <>
                <LogOut className="mr-2 h-4 w-4" />
                {removePercent > 0
                  ? `Remove ${removePercent}%`
                  : "Select amount to remove"}
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
