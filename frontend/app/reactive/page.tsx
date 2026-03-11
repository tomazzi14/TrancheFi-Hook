"use client"

import { useState, useCallback } from "react"
import { useAccount, usePublicClient, useWalletClient } from "wagmi"
import { ConnectButton } from "@rainbow-me/rainbowkit"
import { parseEther, decodeEventLog } from "viem"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Progress } from "@/components/ui/progress"
import {
  POOL_KEY,
  TRANCHES_HOOK_ADDRESS,
  SWAP_ROUTER_ADDRESS,
  POOL_MANAGER_ADDRESS,
  MIN_SQRT_PRICE_LIMIT,
  MAX_SQRT_PRICE_LIMIT,
} from "@/lib/config/contracts"
import { TranchesHookABI } from "@/lib/abis/TranchesHook"
import { PoolSwapTestABI } from "@/lib/abis/PoolSwapTest"
import { Activity, ArrowRight, Shield, Zap } from "lucide-react"

// ─── RSC Constants (matches TrancheFiVolatilityRSC.sol) ───
const EMA_ALPHA = 100n
const EMA_SCALE = 1000n
const LOW_THRESHOLD = 400000000000000n // 4e14
const HIGH_THRESHOLD = 3600000000000000n // 36e14

const REGIME_CONFIG = [
  { name: "LOW", apy: 300n, color: "text-green-400", bg: "bg-green-400/10" },
  { name: "MEDIUM", apy: 500n, color: "text-yellow-400", bg: "bg-yellow-400/10" },
  { name: "HIGH", apy: 1000n, color: "text-red-400", bg: "bg-red-400/10" },
] as const

// Swap event from PoolManager
const SWAP_EVENT_TOPIC =
  "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f"

const PoolManagerSwapEvent = {
  type: "event" as const,
  name: "Swap" as const,
  inputs: [
    { name: "id", type: "bytes32", indexed: true, internalType: "PoolId" },
    { name: "sender", type: "address", indexed: true, internalType: "address" },
    { name: "amount0", type: "int128", indexed: false, internalType: "int128" },
    { name: "amount1", type: "int128", indexed: false, internalType: "int128" },
    { name: "sqrtPriceX96", type: "uint160", indexed: false, internalType: "uint160" },
    { name: "liquidity", type: "uint128", indexed: false, internalType: "uint128" },
    { name: "tick", type: "int24", indexed: false, internalType: "int24" },
    { name: "fee", type: "uint24", indexed: false, internalType: "uint24" },
  ],
}

type LogEntry = {
  step: number
  message: string
  type: "info" | "swap" | "volatility" | "regime" | "callback" | "success"
}

type ChainPrice = {
  name: string
  price: bigint
  stable: boolean
}

export default function ReactiveDemoPage() {
  const { isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  const [isRunning, setIsRunning] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [progress, setProgress] = useState(0)
  const [currentRegime, setCurrentRegime] = useState(1) // MEDIUM
  const [currentAPY, setCurrentAPY] = useState<bigint | null>(null)
  const [volatilityEMA, setVolatilityEMA] = useState(0n)
  const [chainPrices, setChainPrices] = useState<ChainPrice[]>([])
  const [swapCount, setSwapCount] = useState(0)

  const addLog = useCallback((message: string, type: LogEntry["type"]) => {
    setLogs((prev) => {
      const nextStep = prev.length > 0 ? prev[prev.length - 1].step + 1 : 1
      return [...prev, { step: nextStep, message, type }]
    })
  }, [])

  // ─── Volatility Math (port of RSC logic) ───
  const computeSquaredReturn = (oldPrice: bigint, newPrice: bigint): bigint => {
    const diff = newPrice >= oldPrice ? newPrice - oldPrice : oldPrice - newPrice
    const SCALE = 10n ** 18n
    let change: bigint
    if (diff > 2n ** 128n - 1n) {
      change = (diff / oldPrice) * 2n * SCALE
    } else {
      change = (diff * 2n * SCALE) / oldPrice
    }
    const MAX_CHANGE = 10n ** 30n
    if (change > MAX_CHANGE) change = MAX_CHANGE
    return (change * change) / SCALE
  }

  const runDemo = useCallback(async () => {
    if (!publicClient || !walletClient) return

    setIsRunning(true)
    setLogs([])
    setProgress(0)
    setSwapCount(0)

    try {
      // ── 1. Read initial state ──
      addLog("Reading pool state from Unichain Sepolia...", "info")
      const stats = await publicClient.readContract({
        address: TRANCHES_HOOK_ADDRESS,
        abi: TranchesHookABI,
        functionName: "getPoolStats",
        args: [POOL_KEY],
      }) as bigint[]

      const initialAPY = stats[4]
      setCurrentAPY(initialAPY)
      addLog(`Senior APY: ${initialAPY} bps | Regime: MEDIUM`, "info")
      setProgress(5)

      // Use a reference price (we'll get the real one from first swap)
      // For now, set initial chain prices as equal
      const refPrice = 2500000000000000000000000000000n // ~1000 USDC/ETH approx
      const prices: ChainPrice[] = [
        { name: "Ethereum Sepolia", price: refPrice, stable: true },
        { name: "Base Sepolia", price: refPrice, stable: true },
        { name: "Unichain Sepolia", price: refPrice, stable: false },
      ]
      setChainPrices(prices)
      addLog("Multi-chain price feeds initialized (3 chains)", "info")
      setProgress(10)

      // ── 2. Execute volatile swaps ──
      addLog("Starting volatile swap sequence on Unichain...", "swap")
      addLog("Ethereum & Base remain stable. Only Unichain moves.", "info")

      let lastWeightedPrice = 0n
      let ema = 0n
      let observations = 0n
      let regime = 1 // MEDIUM
      const TOTAL_ROUNDS = 6
      const SWAP_AMOUNT_ETH = parseEther("5") // 5 mWETH per swap
      const SWAP_AMOUNT_USDC = parseEther("10000") // 10000 mUSDC per swap

      for (let i = 0; i < TOTAL_ROUNDS; i++) {
        // ── Sell mWETH (price drops) ──
        addLog(`Round ${i + 1}/${TOTAL_ROUNDS}: Selling 5 mWETH...`, "swap")

        const sellHash = await walletClient.writeContract({
          address: SWAP_ROUTER_ADDRESS,
          abi: PoolSwapTestABI,
          functionName: "swap",
          args: [
            POOL_KEY,
            {
              zeroForOne: true,
              amountSpecified: -SWAP_AMOUNT_ETH,
              sqrtPriceLimitX96: MIN_SQRT_PRICE_LIMIT,
            },
            { takeClaims: false, settleUsingBurn: false },
            "0x" as `0x${string}`,
          ],
        })

        const sellReceipt = await publicClient.waitForTransactionReceipt({ hash: sellHash })
        const sellPrice = extractPriceFromLogs(sellReceipt.logs)
        if (sellPrice) {
          prices[2] = { ...prices[2], price: sellPrice }
          setChainPrices([...prices])
        }

        // Process observation
        const wp1 = (prices[0].price + prices[1].price + prices[2].price) / 3n
        if (lastWeightedPrice > 0n) {
          const sq = computeSquaredReturn(lastWeightedPrice, wp1)
          ema = (EMA_ALPHA * sq + (EMA_SCALE - EMA_ALPHA) * ema) / EMA_SCALE
          observations++
          setVolatilityEMA(ema)
        }
        lastWeightedPrice = wp1
        setSwapCount((i * 2) + 1)

        // ── Buy mWETH back (price recovers) ──
        addLog(`Round ${i + 1}/${TOTAL_ROUNDS}: Buying back with 10000 mUSDC...`, "swap")

        const buyHash = await walletClient.writeContract({
          address: SWAP_ROUTER_ADDRESS,
          abi: PoolSwapTestABI,
          functionName: "swap",
          args: [
            POOL_KEY,
            {
              zeroForOne: false,
              amountSpecified: -SWAP_AMOUNT_USDC,
              sqrtPriceLimitX96: MAX_SQRT_PRICE_LIMIT,
            },
            { takeClaims: false, settleUsingBurn: false },
            "0x" as `0x${string}`,
          ],
        })

        const buyReceipt = await publicClient.waitForTransactionReceipt({ hash: buyHash })
        const buyPrice = extractPriceFromLogs(buyReceipt.logs)
        if (buyPrice) {
          prices[2] = { ...prices[2], price: buyPrice }
          setChainPrices([...prices])

          // Update reference price from first real swap
          if (i === 0 && prices[0].price === refPrice) {
            prices[0] = { ...prices[0], price: buyPrice }
            prices[1] = { ...prices[1], price: buyPrice }
            setChainPrices([...prices])
          }
        }

        // Process observation
        const wp2 = (prices[0].price + prices[1].price + prices[2].price) / 3n
        if (lastWeightedPrice > 0n) {
          const sq = computeSquaredReturn(lastWeightedPrice, wp2)
          ema = (EMA_ALPHA * sq + (EMA_SCALE - EMA_ALPHA) * ema) / EMA_SCALE
          observations++
          setVolatilityEMA(ema)
        }
        lastWeightedPrice = wp2
        setSwapCount((i * 2) + 2)

        // Check regime after enough observations
        if (observations >= 3n) {
          let newRegime: number
          if (ema < LOW_THRESHOLD) newRegime = 0
          else if (ema > HIGH_THRESHOLD) newRegime = 2
          else newRegime = 1

          if (newRegime !== regime) {
            regime = newRegime
            setCurrentRegime(regime)
            addLog(
              `Regime change detected: ${REGIME_CONFIG[regime].name} (EMA: ${ema})`,
              "regime"
            )
          }
        }

        const pctDone = 10 + ((i + 1) / TOTAL_ROUNDS) * 70
        setProgress(pctDone)

        addLog(
          `EMA: ${ema} | Observations: ${observations} | Regime: ${REGIME_CONFIG[regime].name}`,
          "volatility"
        )
      }

      setProgress(85)

      // ── 3. Apply regime change via adjustRiskParameter ──
      const newAPY = REGIME_CONFIG[regime].apy
      if (newAPY !== initialAPY) {
        addLog(
          `Reactive Network callback: adjusting APY ${initialAPY} -> ${newAPY} bps`,
          "callback"
        )

        const adjustHash = await walletClient.writeContract({
          address: TRANCHES_HOOK_ADDRESS,
          abi: TranchesHookABI,
          functionName: "adjustRiskParameter",
          args: [POOL_KEY, newAPY],
        })

        await publicClient.waitForTransactionReceipt({ hash: adjustHash })
        setCurrentAPY(newAPY)
        setProgress(95)
        addLog(`adjustRiskParameter() confirmed on-chain!`, "success")
      } else {
        addLog(`No regime change. APY stays at ${initialAPY} bps.`, "info")
        setProgress(95)
      }

      // ── 4. Verify final state ──
      const finalStats = await publicClient.readContract({
        address: TRANCHES_HOOK_ADDRESS,
        abi: TranchesHookABI,
        functionName: "getPoolStats",
        args: [POOL_KEY],
      }) as bigint[]

      setCurrentAPY(finalStats[4])
      setProgress(100)
      addLog(
        `Demo complete! Senior APY: ${initialAPY} -> ${finalStats[4]} bps`,
        "success"
      )
    } catch (err) {
      addLog(`Error: ${(err as Error).message?.slice(0, 100)}`, "info")
    } finally {
      setIsRunning(false)
    }
  }, [publicClient, walletClient, addLog])

  // Reset demo: set APY back to 500 bps
  const resetDemo = useCallback(async () => {
    if (!publicClient || !walletClient) return
    setIsRunning(true)
    try {
      addLog("Resetting APY to 500 bps (MEDIUM)...", "info")
      const hash = await walletClient.writeContract({
        address: TRANCHES_HOOK_ADDRESS,
        abi: TranchesHookABI,
        functionName: "adjustRiskParameter",
        args: [POOL_KEY, 500n],
      })
      await publicClient.waitForTransactionReceipt({ hash })
      setCurrentAPY(500n)
      setCurrentRegime(1)
      setVolatilityEMA(0n)
      setSwapCount(0)
      setChainPrices([])
      setLogs([])
      setProgress(0)
      stepRef.current = 0
    } catch (err) {
      addLog(`Reset error: ${(err as Error).message?.slice(0, 100)}`, "info")
    } finally {
      setIsRunning(false)
    }
  }, [publicClient, walletClient, addLog])

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-20 text-center">
        <Activity className="h-12 w-12 text-primary" />
        <h1 className="text-3xl font-bold tracking-tight">
          Cross-Chain Reactive Demo
        </h1>
        <p className="max-w-lg text-muted-foreground">
          Watch the Reactive Network detect cross-chain volatility and adjust
          Senior APY in real-time. Connect your wallet to start.
        </p>
        <ConnectButton />
      </div>
    )
  }

  const regime = REGIME_CONFIG[currentRegime]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Cross-Chain Reactive Demo
          </h1>
          <p className="text-muted-foreground">
            Swaps on Unichain trigger volatility detection and APY adjustment
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={runDemo} disabled={isRunning} size="lg">
            {isRunning ? "Running..." : "Run Demo"}
          </Button>
          <Button
            onClick={resetDemo}
            disabled={isRunning}
            variant="outline"
            size="lg"
          >
            Reset
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      {progress > 0 && <Progress value={progress} className="h-2" />}

      {/* Top row: Chain Prices + Regime + APY */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Chain Prices */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Multi-Chain Prices (sqrtPriceX96)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {chainPrices.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Run demo to see prices
              </p>
            ) : (
              chainPrices.map((chain) => (
                <div
                  key={chain.name}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`h-2 w-2 rounded-full ${
                        chain.stable ? "bg-green-400" : "bg-orange-400 animate-pulse"
                      }`}
                    />
                    <span className="text-sm">{chain.name}</span>
                  </div>
                  <span className="text-xs font-mono text-muted-foreground">
                    {formatSqrtPrice(chain.price)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Volatility & Regime */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Volatility Regime
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">Regime</span>
              <Badge className={`${regime.bg} ${regime.color} border-0`}>
                {regime.name}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Volatility EMA</span>
              <span className="text-xs font-mono">
                {volatilityEMA.toString()}
              </span>
            </div>
            <Separator />
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>LOW &lt; {LOW_THRESHOLD.toString()}</span>
                <span>HIGH &gt; {HIGH_THRESHOLD.toString()}</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    currentRegime === 0
                      ? "bg-green-400"
                      : currentRegime === 1
                      ? "bg-yellow-400"
                      : "bg-red-400"
                  }`}
                  style={{
                    width: `${Math.min(
                      100,
                      Number(
                        (volatilityEMA * 100n) / (HIGH_THRESHOLD * 2n || 1n)
                      )
                    )}%`,
                  }}
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Swaps</span>
              <span className="font-mono">{swapCount}</span>
            </div>
          </CardContent>
        </Card>

        {/* APY Display */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Senior Tranche APY
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center gap-3 py-2">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-senior" />
                <span className="text-4xl font-bold text-senior">
                  {currentAPY !== null
                    ? `${(Number(currentAPY) / 100).toFixed(1)}%`
                    : "---"}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {currentAPY !== null ? `${currentAPY} basis points` : "Connect wallet"}
              </span>
              {currentAPY !== null && currentAPY !== 500n && (
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-muted-foreground">500 bps</span>
                  <ArrowRight className="h-3 w-3" />
                  <span className={regime.color}>
                    {currentAPY.toString()} bps
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Flow diagram */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Reactive Network Flow
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-2 text-xs">
            {[
              { label: "Swaps", icon: <Zap className="h-4 w-4" />, active: swapCount > 0 },
              { label: "Volatility", icon: <Activity className="h-4 w-4" />, active: volatilityEMA > 0n },
              { label: "Regime", icon: null, active: currentRegime !== 1 || volatilityEMA > 0n },
              { label: "APY Adjust", icon: <Shield className="h-4 w-4" />, active: currentAPY !== null && currentAPY !== 500n },
            ].map((step, i) => (
              <div key={step.label} className="flex items-center gap-2">
                <div
                  className={`flex flex-col items-center gap-1 rounded-lg border p-3 transition-colors ${
                    step.active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-muted text-muted-foreground"
                  }`}
                >
                  {step.icon}
                  <span>{step.label}</span>
                </div>
                {i < 3 && (
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Event Log */}
      {logs.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Event Log
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-64 overflow-y-auto space-y-1 font-mono text-xs">
              {logs.map((log) => (
                <div
                  key={log.step}
                  className={`flex gap-2 ${
                    log.type === "success"
                      ? "text-green-400"
                      : log.type === "regime"
                      ? "text-red-400"
                      : log.type === "callback"
                      ? "text-yellow-400"
                      : log.type === "swap"
                      ? "text-blue-400"
                      : log.type === "volatility"
                      ? "text-purple-400"
                      : "text-muted-foreground"
                  }`}
                >
                  <span className="text-muted-foreground/50 w-6 text-right shrink-0">
                    {log.step}
                  </span>
                  <span>{log.message}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ─── Helpers ───

function extractPriceFromLogs(
  logs: { topics: string[]; data: string; address: string }[]
): bigint | null {
  for (const log of logs) {
    if (log.topics[0] === SWAP_EVENT_TOPIC) {
      // Data layout: amount0(int128) | amount1(int128) | sqrtPriceX96(uint160) | liquidity(uint128) | tick(int24) | fee(uint24)
      // But the event packs int128s as int256 in ABI encoding
      const data = log.data.slice(2) // remove 0x
      // sqrtPriceX96 is the 3rd parameter (index 2), each is 32 bytes
      const sqrtPriceHex = data.slice(128, 192)
      return BigInt("0x" + sqrtPriceHex)
    }
  }
  return null
}

function formatSqrtPrice(sqrtPriceX96: bigint): string {
  // Convert sqrtPriceX96 to human price: (sqrtPrice / 2^96)^2
  const Q96 = 2n ** 96n
  // Use floating point for display
  const sqrtPrice = Number(sqrtPriceX96) / Number(Q96)
  const price = sqrtPrice * sqrtPrice
  return `$${price.toFixed(2)}`
}
