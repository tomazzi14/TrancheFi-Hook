"use client"

import { useState, useEffect } from "react"
import { useAccount, useReadContract } from "wagmi"
import { parseEther } from "viem"
import { useAddLiquidity } from "@/hooks/useAddLiquidity"
import { useTokenApproval } from "@/hooks/useTokenApproval"
import { usePoolPrice } from "@/hooks/usePoolPrice"
import {
  MOCK_WETH_ADDRESS,
  MOCK_USDC_ADDRESS,
  DEFAULT_TICK_LOWER,
  DEFAULT_TICK_UPPER,
} from "@/lib/config/contracts"
import { amount0ToLiquidity } from "@/lib/utils"
import { ERC20ABI } from "@/lib/abis/ERC20"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { Loader2, CheckCircle2 } from "lucide-react"

interface DepositFormProps {
  tranche: 0 | 1
}

export function DepositForm({ tranche }: DepositFormProps) {
  const [wethAmount, setWethAmount] = useState("")
  const [usdcAmount, setUsdcAmount] = useState("")
  const { address, isConnected } = useAccount()
  const { price: poolPrice, sqrtPriceX96 } = usePoolPrice()

  // Use live pool price, fallback to 2000
  const currentRate = poolPrice > 0 ? poolPrice : 2000

  const handleWethChange = (val: string) => {
    setWethAmount(val)
    if (val && Number(val) > 0) {
      setUsdcAmount((Number(val) * currentRate).toFixed(2))
    } else {
      setUsdcAmount("")
    }
  }

  const handleUsdcChange = (val: string) => {
    setUsdcAmount(val)
    if (val && Number(val) > 0) {
      setWethAmount((Number(val) / currentRate).toFixed(6))
    } else {
      setWethAmount("")
    }
  }

  // Balances
  const { data: wethBalance } = useReadContract({
    address: MOCK_WETH_ADDRESS as `0x${string}`,
    abi: ERC20ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  const { data: usdcBalance } = useReadContract({
    address: MOCK_USDC_ADDRESS as `0x${string}`,
    abi: ERC20ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  // Approvals
  const {
    approve: approveWETH,
    needsApproval: needsApprovalWETH,
    isPending: isApprovingWETH,
    isConfirming: isConfirmingWETH,
    isSuccess: isSuccessWETH,
  } = useTokenApproval(MOCK_WETH_ADDRESS as `0x${string}`)

  const {
    approve: approveUSDC,
    needsApproval: needsApprovalUSDC,
    isPending: isApprovingUSDC,
    isConfirming: isConfirmingUSDC,
    isSuccess: isSuccessUSDC,
  } = useTokenApproval(MOCK_USDC_ADDRESS as `0x${string}`)

  // Deposit
  const {
    addLiquidity,
    isPending: isDepositing,
    isConfirming: isDepositConfirming,
    isSuccess: isDepositSuccess,
    error: depositError,
  } = useAddLiquidity()

  useEffect(() => {
    if (isSuccessWETH) toast.success("mWETH approved!")
  }, [isSuccessWETH])

  useEffect(() => {
    if (isSuccessUSDC) toast.success("mUSDC approved!")
  }, [isSuccessUSDC])

  useEffect(() => {
    if (isDepositSuccess) {
      toast.success(
        `Deposited into ${tranche === 0 ? "Senior" : "Junior"} tranche!`
      )
      setWethAmount("")
      setUsdcAmount("")
    }
  }, [isDepositSuccess, tranche])

  useEffect(() => {
    if (depositError) toast.error(depositError.message.slice(0, 100))
  }, [depositError])

  if (!isConnected) {
    return (
      <p className="text-center text-muted-foreground">
        Connect your wallet to deposit
      </p>
    )
  }

  const parsedWETH = wethAmount ? parseEther(wethAmount) : 0n
  const parsedUSDC = usdcAmount ? parseEther(usdcAmount) : 0n // MockERC20 uses 18 decimals
  const hasAmounts = parsedWETH > 0n || parsedUSDC > 0n

  const showApproveWETH = parsedWETH > 0n && needsApprovalWETH(parsedWETH)
  const showApproveUSDC = parsedUSDC > 0n && needsApprovalUSDC(parsedUSDC)
  const needsAnyApproval = showApproveWETH || showApproveUSDC

  const trancheLabel = tranche === 0 ? "Senior" : "Junior"

  // Convert mWETH amount → V4 liquidity units using: L = amount0 * sqrtPrice / Q96
  const liquidityDelta = parsedWETH > 0n && sqrtPriceX96 > 0n
    ? amount0ToLiquidity(parsedWETH, sqrtPriceX96)
    : 0n

  const handleDeposit = () => {
    if (liquidityDelta <= 0n) return
    addLiquidity(liquidityDelta, tranche, DEFAULT_TICK_LOWER, DEFAULT_TICK_UPPER)
  }

  const formatBalance = (bal: bigint | undefined, decimals: number) => {
    if (!bal) return "0"
    const divisor = 10n ** BigInt(decimals)
    const whole = bal / divisor
    const frac = bal % divisor
    const fracStr = frac.toString().padStart(decimals, "0").slice(0, 4)
    return `${whole.toLocaleString()}.${fracStr}`
  }

  return (
    <div className="flex flex-col gap-5">
      {/* mWETH Input */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">mWETH</label>
          <span className="text-xs text-zinc-600">
            Balance: {formatBalance(wethBalance as bigint, 18)}
          </span>
        </div>
        <div className="flex gap-2">
          <Input
            type="number"
            placeholder="0.0"
            value={wethAmount}
            onChange={(e) => handleWethChange(e.target.value)}
            className="text-lg bg-zinc-900/50 border-zinc-800 focus:border-violet-500/50 focus:ring-violet-500/20"
            min="0"
            step="0.01"
          />
          {showApproveWETH && (
            <Button
              onClick={approveWETH}
              disabled={isApprovingWETH || isConfirmingWETH}
              variant="outline"
              size="sm"
              className="shrink-0 border-violet-500/30 text-violet-300 hover:bg-violet-500/10"
            >
              {isApprovingWETH || isConfirmingWETH ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isSuccessWETH ? (
                <CheckCircle2 className="h-4 w-4 text-green-400" />
              ) : (
                "Approve"
              )}
            </Button>
          )}
        </div>
      </div>

      <div className="glass rounded-lg px-4 py-2 text-center">
        <p className="text-xs text-zinc-500">
          1 mWETH ≈ <span className="text-zinc-400 font-mono">{currentRate.toFixed(2)}</span> mUSDC
        </p>
      </div>

      {/* mUSDC Input */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">mUSDC</label>
          <span className="text-xs text-zinc-600">
            Balance: {formatBalance(usdcBalance as bigint, 18)}
          </span>
        </div>
        <div className="flex gap-2">
          <Input
            type="number"
            placeholder="0.0"
            value={usdcAmount}
            onChange={(e) => handleUsdcChange(e.target.value)}
            className="text-lg bg-zinc-900/50 border-zinc-800 focus:border-violet-500/50 focus:ring-violet-500/20"
            min="0"
            step="1"
          />
          {showApproveUSDC && (
            <Button
              onClick={approveUSDC}
              disabled={isApprovingUSDC || isConfirmingUSDC}
              variant="outline"
              size="sm"
              className="shrink-0 border-violet-500/30 text-violet-300 hover:bg-violet-500/10"
            >
              {isApprovingUSDC || isConfirmingUSDC ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isSuccessUSDC ? (
                <CheckCircle2 className="h-4 w-4 text-green-400" />
              ) : (
                "Approve"
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Deposit Button */}
      <Button
        onClick={handleDeposit}
        disabled={
          !hasAmounts ||
          needsAnyApproval ||
          isDepositing ||
          isDepositConfirming
        }
        className="w-full bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-500/20 hover:shadow-violet-500/30 transition-all"
        size="lg"
      >
        {isDepositing || isDepositConfirming ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Depositing...
          </>
        ) : (
          `Deposit into ${trancheLabel}`
        )}
      </Button>
    </div>
  )
}
