"use client"

import { useState, useEffect } from "react"
import { useUserPosition } from "@/hooks/useUserPosition"
import { useClaimFees, useWithdrawFees } from "@/hooks/useClaimFees"
import { useRemoveLiquidity } from "@/hooks/useRemoveLiquidity"
import { usePoolPrice } from "@/hooks/usePoolPrice"
import { POOL_KEY } from "@/lib/config/contracts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import { Loader2, Coins, LogOut } from "lucide-react"

export function ActionsCard() {
  const { data: position } = useUserPosition()
  const [wethAmount, setWethAmount] = useState("")
  const [usdcAmount, setUsdcAmount] = useState("")
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
      setWethAmount("")
      setUsdcAmount("")
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

  const currentPrice = price > 0 ? price : 2000
  const maxWeth = Number(liquidityAmount) / 1e18
  const maxUsdc = maxWeth * currentPrice

  const handleWethChange = (val: string) => {
    setWethAmount(val)
    if (val && Number(val) > 0) {
      setUsdcAmount((Number(val) * currentPrice).toFixed(2))
    } else {
      setUsdcAmount("")
    }
  }

  const handleUsdcChange = (val: string) => {
    setUsdcAmount(val)
    if (val && Number(val) > 0) {
      setWethAmount((Number(val) / currentPrice).toFixed(6))
    } else {
      setWethAmount("")
    }
  }

  const handleRemove = () => {
    // Convert mWETH amount to liquidity units
    const wethVal = Number(wethAmount)
    if (!wethVal || wethVal <= 0) return
    const liquidityToRemove = BigInt(Math.floor(wethVal * 1e18))
    removeLiquidity(liquidityToRemove)
  }

  const handleMax = () => {
    setWethAmount(maxWeth.toString())
    setUsdcAmount(maxUsdc.toFixed(2))
  }

  const hasAmount = wethAmount && Number(wethAmount) > 0

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
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium">Remove Liquidity</h3>
            <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={handleMax}>
              Max
            </Button>
          </div>

          {/* mWETH input */}
          <div className="mb-3">
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs text-muted-foreground">mWETH</label>
              <span className="text-xs text-muted-foreground">
                Max: {maxWeth.toFixed(4)}
              </span>
            </div>
            <Input
              type="number"
              placeholder="0.0"
              value={wethAmount}
              onChange={(e) => handleWethChange(e.target.value)}
              min="0"
              step="0.01"
            />
          </div>

          {/* mUSDC input */}
          <div className="mb-4">
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs text-muted-foreground">mUSDC</label>
              <span className="text-xs text-muted-foreground">
                Max: {maxUsdc.toFixed(2)}
              </span>
            </div>
            <Input
              type="number"
              placeholder="0.0"
              value={usdcAmount}
              onChange={(e) => handleUsdcChange(e.target.value)}
              min="0"
              step="1"
            />
          </div>

          <p className="mb-3 text-center text-xs text-muted-foreground">
            1 mWETH = {currentPrice.toFixed(2)} mUSDC
          </p>

          <Button
            onClick={handleRemove}
            disabled={!hasAmount || isRemoving || isRemoveConfirming}
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
                Remove Liquidity
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
