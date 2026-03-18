"use client"

import { useUserPosition } from "@/hooks/useUserPosition"
import { usePendingFees } from "@/hooks/usePendingFees"
import { usePoolStats } from "@/hooks/usePoolStats"
import { usePoolPrice } from "@/hooks/usePoolPrice"
import { Skeleton } from "@/components/ui/skeleton"
import { formatEth, liquidityToAmounts } from "@/lib/utils"
import { Shield, Zap } from "lucide-react"

export function PositionCard() {
  const { data: position, isLoading: posLoading } = useUserPosition()
  const { data: fees, isLoading: feesLoading } = usePendingFees()
  const { data: poolStats } = usePoolStats()
  const { price: poolPrice, sqrtPriceX96: posSqrtPrice } = usePoolPrice()

  const isLoading = posLoading || feesLoading

  if (isLoading) {
    return (
      <div className="glass rounded-2xl p-6 space-y-4">
        <p className="text-sm font-semibold text-white">Your Position</p>
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-6 w-40" />
      </div>
    )
  }

  // position: [tranche, amount, depositBlock, rewardDebt0, rewardDebt1]
  const [tranche, amount, depositBlock] = position ?? [0, 0n, 0n, 0n, 0n]
  const [pending0, pending1] = fees ?? [0n, 0n]

  const hasPosition = (amount as bigint) > 0n
  const isSenior = Number(tranche) === 0
  const liquidityAmount = amount as bigint

  // Pool stats: [totalSenior, totalJunior, seniorRatio, targetAPY, volatility]
  const totalSenior = poolStats ? (poolStats as unknown as bigint[])[0] : 0n
  const totalJunior = poolStats ? (poolStats as unknown as bigint[])[1] : 0n
  const totalLiquidity = totalSenior + totalJunior

  // Convert liquidity units to estimated token amounts using Uniswap V4 math
  const { amount0: estMwethWei, amount1: estMusdcWei } = liquidityToAmounts(
    liquidityAmount,
    posSqrtPrice
  )
  const estimatedMwethNum = Number(estMwethWei) / 1e18
  const estimatedMusdcNum = Number(estMusdcWei) / 1e18

  if (!hasPosition) {
    return (
      <div className="glass rounded-2xl p-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-500/10 ring-1 ring-violet-500/20 mx-auto mb-4">
          <Shield className="h-5 w-5 text-violet-400" />
        </div>
        <p className="text-sm font-semibold text-white mb-1">No Active Position</p>
        <p className="text-xs text-zinc-500">
          Switch to the Deposit tab to provide liquidity.
        </p>
      </div>
    )
  }

  const accentColor = isSenior ? "blue" : "orange"
  const accentGradient = isSenior
    ? "from-transparent via-blue-500/40 to-transparent"
    : "from-transparent via-orange-500/40 to-transparent"

  return (
    <div className="glass relative overflow-hidden rounded-2xl p-6">
      <div className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r ${accentGradient}`} />

      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-semibold text-white">Your Position</h3>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
          isSenior
            ? "bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20"
            : "bg-orange-500/10 text-orange-400 ring-1 ring-orange-500/20"
        }`}>
          {isSenior ? <Shield className="h-3 w-3" /> : <Zap className="h-3 w-3" />}
          {isSenior ? "Senior" : "Junior"}
        </span>
      </div>

      <div className="space-y-5">
        {/* Deposited Value */}
        <div>
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">Deposited Value</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="glass rounded-xl p-3">
              <p className="text-[10px] text-zinc-600 uppercase tracking-wider">mWETH</p>
              <p className="text-lg font-bold text-white mt-0.5">{estimatedMwethNum.toFixed(4)}</p>
            </div>
            <div className="glass rounded-xl p-3">
              <p className="text-[10px] text-zinc-600 uppercase tracking-wider">mUSDC</p>
              <p className="text-lg font-bold text-white mt-0.5">{estimatedMusdcNum.toFixed(2)}</p>
            </div>
          </div>
        </div>

        <div className="h-px bg-gradient-to-r from-transparent via-zinc-800 to-transparent" />

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Liquidity Units</p>
            <p className="text-xl font-bold text-white mt-0.5">
              {formatEth(liquidityAmount)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Deposit Block</p>
            <p className="text-xl font-bold text-white mt-0.5 font-mono">
              #{(depositBlock as bigint).toString()}
            </p>
          </div>
        </div>

        <div className="h-px bg-gradient-to-r from-transparent via-zinc-800 to-transparent" />

        {/* Pending Fees */}
        <div>
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">Pending Fees</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="glass rounded-xl p-3">
              <p className="text-[10px] text-zinc-600 uppercase tracking-wider">mWETH</p>
              <p className="text-lg font-bold text-green-400 mt-0.5">{formatEth(pending0 as bigint)}</p>
            </div>
            <div className="glass rounded-xl p-3">
              <p className="text-[10px] text-zinc-600 uppercase tracking-wider">mUSDC</p>
              <p className="text-lg font-bold text-green-400 mt-0.5">{formatEth(pending1 as bigint)}</p>
            </div>
          </div>
        </div>

        {totalLiquidity > 0n && (
          <>
            <div className="h-px bg-gradient-to-r from-transparent via-zinc-800 to-transparent" />
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">Your share of pool</span>
              <span className="text-sm font-bold text-white">
                {((Number(liquidityAmount) / Number(totalLiquidity)) * 100).toFixed(2)}%
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
