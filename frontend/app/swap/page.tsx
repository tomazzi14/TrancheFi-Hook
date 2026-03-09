"use client"

import { useState, useEffect } from "react"
import { useAccount, useReadContract } from "wagmi"
import { parseEther } from "viem"
import { ConnectButton } from "@rainbow-me/rainbowkit"
import { useSwap } from "@/hooks/useSwap"
import { useTokenApproval } from "@/hooks/useTokenApproval"
import {
  MOCK_WETH_ADDRESS,
  MOCK_USDC_ADDRESS,
  SWAP_ROUTER_ADDRESS,
} from "@/lib/config/contracts"
import { ERC20ABI } from "@/lib/abis/ERC20"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { ArrowDownUp, Loader2 } from "lucide-react"

const WETH_USDC_RATE = 2000

export default function SwapPage() {
  const { address, isConnected } = useAccount()
  const [direction, setDirection] = useState<"wethToUsdc" | "usdcToWeth">(
    "wethToUsdc"
  )
  const [inputAmount, setInputAmount] = useState("")

  const isWethInput = direction === "wethToUsdc"
  const inputToken = isWethInput ? "mWETH" : "mUSDC"
  const outputToken = isWethInput ? "mUSDC" : "mWETH"
  const inputDecimals = 18 // Both MockERC20 tokens use 18 decimals

  // Estimated output (simple rate, real output depends on pool liquidity)
  const estimatedOutput = inputAmount
    ? isWethInput
      ? (Number(inputAmount) * WETH_USDC_RATE).toFixed(2)
      : (Number(inputAmount) / WETH_USDC_RATE).toFixed(6)
    : "0"

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

  // Approve input token for swap router
  const tokenToApprove = isWethInput ? MOCK_WETH_ADDRESS : MOCK_USDC_ADDRESS
  const {
    approve,
    needsApproval,
    isPending: isApproving,
    isConfirming: isApprovalConfirming,
    isSuccess: isApprovalSuccess,
  } = useTokenApproval(tokenToApprove as `0x${string}`, SWAP_ROUTER_ADDRESS as `0x${string}`)

  // Swap
  const {
    swap,
    isPending: isSwapping,
    isConfirming: isSwapConfirming,
    isSuccess: isSwapSuccess,
    error: swapError,
  } = useSwap()

  useEffect(() => {
    if (isApprovalSuccess) toast.success(`${inputToken} approved!`)
  }, [isApprovalSuccess, inputToken])

  useEffect(() => {
    if (isSwapSuccess) {
      toast.success(`Swapped ${inputToken} → ${outputToken}!`)
      setInputAmount("")
    }
  }, [isSwapSuccess, inputToken, outputToken])

  useEffect(() => {
    if (swapError) toast.error(swapError.message.slice(0, 120))
  }, [swapError])

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <p className="text-lg text-muted-foreground">
          Connect your wallet to swap
        </p>
        <ConnectButton />
      </div>
    )
  }

  const parsedInput =
    inputAmount && Number(inputAmount) > 0
      ? parseEther(inputAmount)
      : 0n

  // zeroForOne = true means selling currency0 (mWETH) for currency1 (mUSDC)
  const zeroForOne = isWethInput

  const showApprove = parsedInput > 0n && needsApproval(parsedInput)

  const handleSwap = () => {
    if (parsedInput <= 0n) return
    swap(zeroForOne, parsedInput)
  }

  const formatBalance = (bal: bigint | undefined) => {
    if (!bal) return "0"
    const divisor = 10n ** 18n
    const whole = bal / divisor
    const frac = bal % divisor
    const fracStr = frac.toString().padStart(18, "0").slice(0, 4)
    return `${whole.toLocaleString()}.${fracStr}`
  }

  const inputBalance = isWethInput ? wethBalance : usdcBalance

  return (
    <div className="mx-auto max-w-md flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Swap</h1>
        <p className="text-muted-foreground">
          Swap mWETH and mUSDC to generate fees for the hook
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>
              {inputToken} → {outputToken}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() =>
                setDirection((d) =>
                  d === "wethToUsdc" ? "usdcToWeth" : "wethToUsdc"
                )
              }
            >
              <ArrowDownUp className="h-4 w-4" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {/* Input */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium">You pay</label>
              <span className="text-xs text-muted-foreground">
                Balance:{" "}
                {formatBalance(inputBalance as bigint)}
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-lg border bg-secondary/50 p-3">
              <Input
                type="number"
                placeholder="0.0"
                value={inputAmount}
                onChange={(e) => setInputAmount(e.target.value)}
                className="border-0 bg-transparent text-xl shadow-none focus-visible:ring-0"
                min="0"
                step={isWethInput ? "0.01" : "1"}
              />
              <span className="shrink-0 text-sm font-semibold text-muted-foreground">
                {inputToken}
              </span>
            </div>
          </div>

          {/* Arrow */}
          <div className="flex justify-center">
            <div className="rounded-full border bg-card p-2">
              <ArrowDownUp className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>

          {/* Output (estimated) */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium">You receive (est.)</label>
            </div>
            <div className="flex items-center gap-2 rounded-lg border bg-secondary/50 p-3">
              <p className="flex-1 text-xl text-muted-foreground">
                {estimatedOutput}
              </p>
              <span className="shrink-0 text-sm font-semibold text-muted-foreground">
                {outputToken}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Rate: 1 mWETH ≈ {WETH_USDC_RATE.toLocaleString()} mUSDC
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            {showApprove && (
              <Button
                onClick={approve}
                disabled={isApproving || isApprovalConfirming}
                variant="outline"
                className="flex-1"
              >
                {isApproving || isApprovalConfirming ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Approve {inputToken}
              </Button>
            )}
            <Button
              onClick={handleSwap}
              disabled={
                parsedInput <= 0n ||
                showApprove ||
                isSwapping ||
                isSwapConfirming
              }
              className="flex-1"
              size="lg"
            >
              {isSwapping || isSwapConfirming ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Swapping...
                </>
              ) : (
                "Swap"
              )}
            </Button>
          </div>

        </CardContent>
      </Card>
    </div>
  )
}
