"use client"

import { useState, useEffect } from "react"
import { useUserPosition } from "@/hooks/useUserPosition"
import { useClaimFees, useWithdrawFees } from "@/hooks/useClaimFees"
import { useRemoveLiquidity } from "@/hooks/useRemoveLiquidity"
import { POOL_KEY } from "@/lib/config/contracts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import { Loader2, Coins, LogOut } from "lucide-react"

export function ActionsCard() {
  const { data: position } = useUserPosition()
  const [removeAmount, setRemoveAmount] = useState("")

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
      setRemoveAmount("")
    }
  }, [removeSuccess])

  useEffect(() => {
    if (claimError) toast.error(claimError.message.slice(0, 100))
  }, [claimError])

  useEffect(() => {
    if (removeError) toast.error(removeError.message.slice(0, 100))
  }, [removeError])

  const [, amount] = position ?? [0, 0n, 0n, 0n, 0n]
  const hasPosition = (amount as bigint) > 0n

  if (!hasPosition) return null

  const handleRemove = () => {
    const val = BigInt(Math.floor(Number(removeAmount) * 1e18))
    if (val <= 0n) return
    removeLiquidity(val)
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
              2. Withdraw T0
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
              3. Withdraw T1
            </Button>
          </div>
        </div>

        <Separator />

        <div>
          <h3 className="mb-2 text-sm font-medium">Remove Liquidity</h3>
          <div className="flex gap-3">
            <Input
              type="number"
              placeholder="Amount to remove"
              value={removeAmount}
              onChange={(e) => setRemoveAmount(e.target.value)}
              min="0"
              step="0.01"
            />
            <Button
              onClick={handleRemove}
              disabled={
                !removeAmount ||
                Number(removeAmount) <= 0 ||
                isRemoving ||
                isRemoveConfirming
              }
              variant="destructive"
            >
              {isRemoving || isRemoveConfirming ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="mr-2 h-4 w-4" />
              )}
              Remove
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
