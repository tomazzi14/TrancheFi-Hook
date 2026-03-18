"use client"

import { useState, useEffect } from "react"
import { useUserPosition } from "@/hooks/useUserPosition"
import { useClaimFees, useWithdrawFees } from "@/hooks/useClaimFees"
import { useRemoveLiquidity } from "@/hooks/useRemoveLiquidity"
import { usePoolPrice } from "@/hooks/usePoolPrice"
import { POOL_KEY } from "@/lib/config/contracts"
import { liquidityToAmounts, amount0ToLiquidity } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { Loader2, Coins, LogOut } from "lucide-react"

export function ActionsCard() {
  const { data: position } = useUserPosition()
  const [wethAmount, setWethAmount] = useState("")
  const [usdcAmount, setUsdcAmount] = useState("")
  const { price, sqrtPriceX96 } = usePoolPrice()

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

  // Convert liquidity units → real token amounts using V4 math
  const { amount0: maxWethWei, amount1: maxUsdcWei } = liquidityToAmounts(
    liquidityAmount,
    sqrtPriceX96
  )
  const maxWeth = Number(maxWethWei) / 1e18
  const maxUsdc = Number(maxUsdcWei) / 1e18

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
    const wethVal = Number(wethAmount)
    if (!wethVal || wethVal <= 0) return
    const wethWei = BigInt(Math.floor(wethVal * 1e18))
    const liquidityToRemove = amount0ToLiquidity(wethWei, sqrtPriceX96)
    const capped = liquidityToRemove > liquidityAmount ? liquidityAmount : liquidityToRemove
    removeLiquidity(capped)
  }

  const handleMax = () => {
    setWethAmount(maxWeth.toFixed(6))
    setUsdcAmount(maxUsdc.toFixed(2))
  }

  const hasAmount = wethAmount && Number(wethAmount) > 0

  return (
    <div className="glass relative overflow-hidden rounded-2xl p-6">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-500/30 to-transparent" />

      <h3 className="text-sm font-semibold text-white mb-5">Actions</h3>

      <div className="flex flex-col gap-6">
        {/* Claim Fees Section */}
        <div>
          <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-widest mb-2">Claim Fees</p>
          <p className="mb-3 text-xs text-zinc-500 leading-relaxed">
            Step 1: Move pending fees to claimable balance. Step 2&3: Withdraw each token.
          </p>
          <div className="flex gap-2">
            <Button
              onClick={claimFees}
              disabled={isClaiming || isClaimConfirming}
              variant="outline"
              className="flex-1 border-blue-500/20 text-blue-300 hover:bg-blue-500/10 hover:border-blue-500/40"
            >
              {isClaiming || isClaimConfirming ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Coins className="mr-2 h-4 w-4" />
              )}
              1. Claim
            </Button>
            <Button
              onClick={() =>
                withdrawFees(POOL_KEY.currency0 as `0x${string}`)
              }
              disabled={isWithdrawing || isWithdrawConfirming}
              variant="outline"
              className="flex-1 border-zinc-800 text-zinc-300 hover:bg-zinc-800/50"
            >
              {isWithdrawing || isWithdrawConfirming ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              2. mWETH
            </Button>
            <Button
              onClick={() =>
                withdrawFees(POOL_KEY.currency1 as `0x${string}`)
              }
              disabled={isWithdrawing || isWithdrawConfirming}
              variant="outline"
              className="flex-1 border-zinc-800 text-zinc-300 hover:bg-zinc-800/50"
            >
              {isWithdrawing || isWithdrawConfirming ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              3. mUSDC
            </Button>
          </div>
        </div>

        <div className="h-px bg-gradient-to-r from-transparent via-zinc-800 to-transparent" />

        {/* Remove Liquidity Section */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[10px] font-semibold text-red-400 uppercase tracking-widest">Remove Liquidity</p>
            <button
              onClick={handleMax}
              className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
            >
              Max
            </button>
          </div>

          {/* mWETH input */}
          <div className="mb-3">
            <div className="mb-1 flex items-center justify-between">
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider">mWETH</label>
              <span className="text-[10px] text-zinc-600 font-mono">
                Max: {maxWeth.toFixed(4)}
              </span>
            </div>
            <Input
              type="number"
              placeholder="0.0"
              value={wethAmount}
              onChange={(e) => handleWethChange(e.target.value)}
              className="bg-zinc-900/50 border-zinc-800 focus:border-red-500/50 focus:ring-red-500/20"
              min="0"
              step="0.01"
            />
          </div>

          {/* mUSDC input */}
          <div className="mb-4">
            <div className="mb-1 flex items-center justify-between">
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider">mUSDC</label>
              <span className="text-[10px] text-zinc-600 font-mono">
                Max: {maxUsdc.toFixed(2)}
              </span>
            </div>
            <Input
              type="number"
              placeholder="0.0"
              value={usdcAmount}
              onChange={(e) => handleUsdcChange(e.target.value)}
              className="bg-zinc-900/50 border-zinc-800 focus:border-red-500/50 focus:ring-red-500/20"
              min="0"
              step="1"
            />
          </div>

          <div className="glass rounded-lg px-4 py-2 text-center mb-4">
            <p className="text-xs text-zinc-500">
              1 mWETH = <span className="text-zinc-400 font-mono">{currentPrice.toFixed(2)}</span> mUSDC
            </p>
          </div>

          <Button
            onClick={handleRemove}
            disabled={!hasAmount || isRemoving || isRemoveConfirming}
            className="w-full bg-red-600/80 hover:bg-red-500/80 text-white border-0 shadow-lg shadow-red-500/10"
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
      </div>
    </div>
  )
}
