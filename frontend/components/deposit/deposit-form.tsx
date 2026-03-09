"use client"

import { useState, useEffect } from "react"
import { useAccount, useReadContract } from "wagmi"
import { parseEther, parseUnits } from "viem"
import { useAddLiquidity } from "@/hooks/useAddLiquidity"
import { useTokenApproval } from "@/hooks/useTokenApproval"
import {
  MOCK_WETH_ADDRESS,
  MOCK_USDC_ADDRESS,
  DEFAULT_TICK_LOWER,
  DEFAULT_TICK_UPPER,
} from "@/lib/config/contracts"
import { ERC20ABI } from "@/lib/abis/ERC20"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { Loader2, CheckCircle2 } from "lucide-react"

interface DepositFormProps {
  tranche: 0 | 1
}

const WETH_USDC_RATE = 2000 // 1 mWETH = 2000 mUSDC

export function DepositForm({ tranche }: DepositFormProps) {
  const [wethAmount, setWethAmount] = useState("")
  const [usdcAmount, setUsdcAmount] = useState("")
  const { address, isConnected } = useAccount()

  const handleWethChange = (val: string) => {
    setWethAmount(val)
    if (val && Number(val) > 0) {
      setUsdcAmount((Number(val) * WETH_USDC_RATE).toString())
    } else {
      setUsdcAmount("")
    }
  }

  const handleUsdcChange = (val: string) => {
    setUsdcAmount(val)
    if (val && Number(val) > 0) {
      setWethAmount((Number(val) / WETH_USDC_RATE).toString())
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
  const parsedUSDC = usdcAmount ? parseUnits(usdcAmount, 6) : 0n
  const hasAmounts = parsedWETH > 0n || parsedUSDC > 0n

  const showApproveWETH = parsedWETH > 0n && needsApprovalWETH(parsedWETH)
  const showApproveUSDC = parsedUSDC > 0n && needsApprovalUSDC(parsedUSDC)
  const needsAnyApproval = showApproveWETH || showApproveUSDC

  const trancheLabel = tranche === 0 ? "Senior" : "Junior"

  // Use the larger parsed value as liquidity delta (simplified for demo)
  const liquidityDelta = parsedWETH > parsedUSDC ? parsedWETH : parsedUSDC

  const handleDeposit = () => {
    if (liquidityDelta <= 0n) return
    addLiquidity(liquidityDelta, tranche, DEFAULT_TICK_LOWER, DEFAULT_TICK_UPPER)
  }

  const formatBalance = (bal: bigint | undefined, decimals: number) => {
    if (!bal) return "0"
    return (Number(bal) / 10 ** decimals).toFixed(decimals === 6 ? 2 : 4)
  }

  return (
    <div className="flex flex-col gap-5">
      {/* mWETH Input */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-medium">mWETH</label>
          <span className="text-xs text-muted-foreground">
            Balance: {formatBalance(wethBalance as bigint, 18)}
          </span>
        </div>
        <div className="flex gap-2">
          <Input
            type="number"
            placeholder="0.0"
            value={wethAmount}
            onChange={(e) => handleWethChange(e.target.value)}
            className="text-lg"
            min="0"
            step="0.01"
          />
          {showApproveWETH && (
            <Button
              onClick={approveWETH}
              disabled={isApprovingWETH || isConfirmingWETH}
              variant="outline"
              size="sm"
              className="shrink-0"
            >
              {isApprovingWETH || isConfirmingWETH ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isSuccessWETH ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                "Approve"
              )}
            </Button>
          )}
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        1 mWETH = {WETH_USDC_RATE.toLocaleString()} mUSDC
      </p>

      {/* mUSDC Input */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-medium">mUSDC</label>
          <span className="text-xs text-muted-foreground">
            Balance: {formatBalance(usdcBalance as bigint, 6)}
          </span>
        </div>
        <div className="flex gap-2">
          <Input
            type="number"
            placeholder="0.0"
            value={usdcAmount}
            onChange={(e) => handleUsdcChange(e.target.value)}
            className="text-lg"
            min="0"
            step="1"
          />
          {showApproveUSDC && (
            <Button
              onClick={approveUSDC}
              disabled={isApprovingUSDC || isConfirmingUSDC}
              variant="outline"
              size="sm"
              className="shrink-0"
            >
              {isApprovingUSDC || isConfirmingUSDC ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isSuccessUSDC ? (
                <CheckCircle2 className="h-4 w-4" />
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
        className="w-full"
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
