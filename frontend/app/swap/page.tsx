"use client"

import { useState, useEffect } from "react"
import { useAccount, useReadContract } from "wagmi"
import { parseEther } from "viem"
import { ConnectButton } from "@rainbow-me/rainbowkit"
import { useSwap } from "@/hooks/useSwap"
import { useTokenApproval } from "@/hooks/useTokenApproval"
import { usePoolPrice } from "@/hooks/usePoolPrice"
import {
  MOCK_WETH_ADDRESS,
  MOCK_USDC_ADDRESS,
  SWAP_ROUTER_ADDRESS,
} from "@/lib/config/contracts"
import { ERC20ABI } from "@/lib/abis/ERC20"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { ArrowDownUp, Loader2, Zap } from "lucide-react"

export default function SwapPage() {
  const { address, isConnected } = useAccount()
  const [direction, setDirection] = useState<"wethToUsdc" | "usdcToWeth">(
    "wethToUsdc"
  )
  const [inputAmount, setInputAmount] = useState("")
  const { price: poolPrice } = usePoolPrice()

  const currentRate = poolPrice > 0 ? poolPrice : 2000
  const isWethInput = direction === "wethToUsdc"
  const inputToken = isWethInput ? "mWETH" : "mUSDC"
  const outputToken = isWethInput ? "mUSDC" : "mWETH"

  // Estimated output based on current pool price
  const estimatedOutput = inputAmount
    ? isWethInput
      ? (Number(inputAmount) * currentRate).toFixed(2)
      : (Number(inputAmount) / currentRate).toFixed(6)
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
      <div className="flex flex-col items-center justify-center gap-6 py-20 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-500/10 ring-1 ring-violet-500/20">
          <ArrowDownUp className="h-7 w-7 text-violet-400" />
        </div>
        <p className="text-lg text-zinc-400">
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
      <div className="animate-fade-up">
        <h1 className="text-3xl font-extrabold tracking-tight">
          <span className="text-gradient-primary">Swap</span>
        </h1>
        <p className="text-zinc-500 mt-1">
          Swap mWETH and mUSDC to generate fees for the hook
        </p>
      </div>

      <div className="animate-fade-up-d1 glass relative overflow-hidden rounded-2xl glow-primary">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-500/40 to-transparent" />

        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-violet-400" />
              <span className="text-sm font-semibold text-white">
                {inputToken} → {outputToken}
              </span>
            </div>
            <button
              onClick={() =>
                setDirection((d) =>
                  d === "wethToUsdc" ? "usdcToWeth" : "wethToUsdc"
                )
              }
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800/50 hover:bg-zinc-700/50 transition-colors"
            >
              <ArrowDownUp className="h-3.5 w-3.5 text-zinc-400" />
            </button>
          </div>

          <div className="flex flex-col gap-3">
            {/* Input */}
            <div className="glass rounded-xl p-4">
              <div className="mb-2 flex items-center justify-between">
                <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">You pay</label>
                <span className="text-[10px] text-zinc-600">
                  Balance: {formatBalance(inputBalance as bigint)}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  placeholder="0.0"
                  value={inputAmount}
                  onChange={(e) => setInputAmount(e.target.value)}
                  className="border-0 bg-transparent text-2xl font-bold shadow-none focus-visible:ring-0 p-0 h-auto text-white"
                  min="0"
                  step={isWethInput ? "0.01" : "1"}
                />
                <span className="shrink-0 rounded-lg bg-zinc-800/80 px-3 py-1.5 text-xs font-bold text-zinc-300">
                  {inputToken}
                </span>
              </div>
            </div>

            {/* Arrow divider */}
            <div className="flex justify-center -my-1 relative z-10">
              <div className="glass flex h-9 w-9 items-center justify-center rounded-xl ring-1 ring-zinc-800">
                <ArrowDownUp className="h-3.5 w-3.5 text-violet-400" />
              </div>
            </div>

            {/* Output (estimated) */}
            <div className="glass rounded-xl p-4">
              <div className="mb-2 flex items-center justify-between">
                <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">You receive (est.)</label>
              </div>
              <div className="flex items-center gap-3">
                <p className="flex-1 text-2xl font-bold text-zinc-500">
                  {estimatedOutput}
                </p>
                <span className="shrink-0 rounded-lg bg-zinc-800/80 px-3 py-1.5 text-xs font-bold text-zinc-300">
                  {outputToken}
                </span>
              </div>
            </div>

            {/* Rate pill */}
            <div className="glass rounded-lg px-4 py-2 text-center">
              <p className="text-xs text-zinc-500">
                1 mWETH ≈ <span className="text-zinc-400 font-mono">{currentRate.toFixed(2)}</span> mUSDC
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-1">
              {showApprove && (
                <Button
                  onClick={approve}
                  disabled={isApproving || isApprovalConfirming}
                  variant="outline"
                  className="flex-1 border-violet-500/30 text-violet-300 hover:bg-violet-500/10"
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
                className="flex-1 bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-500/20 hover:shadow-violet-500/30 transition-all"
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
          </div>
        </div>
      </div>
    </div>
  )
}
