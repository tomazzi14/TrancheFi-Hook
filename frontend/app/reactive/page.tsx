"use client"

import { useState, useCallback, useMemo } from "react"
import { useAccount, usePublicClient } from "wagmi"
import { ConnectButton } from "@rainbow-me/rainbowkit"
import { parseEther, createWalletClient, http } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { unichainSepolia } from "@/lib/config/chains"
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
import { Activity, ArrowRight, Shield, Zap, Sun, CloudLightning, TrendingDown } from "lucide-react"

// ─── Demo Wallet (testnet only — bypasses MetaMask for instant signing) ───
const DEMO_PRIVATE_KEY =
  "0xeb0429ec7291f7acd9c138744b8ac79359dec2e7c93621923cd11375fc4ef50f" as const
const demoAccount = privateKeyToAccount(DEMO_PRIVATE_KEY)

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

// ─── Scenario Presets ───
const SCENARIOS = [
  {
    id: "calm" as const,
    name: "Calm Market",
    description: "Small swaps, low volatility. Junior tranche earns more fees.",
    icon: Sun,
    color: "border-green-500/50 hover:border-green-500",
    activeColor: "border-green-500 bg-green-500/10",
    badgeColor: "bg-green-400/10 text-green-400",
    sellAmount: parseEther("0.3"),
    buyAmount: parseEther("600"),
    sellLabel: "0.3 mWETH",
    buyLabel: "600 mUSDC",
    rounds: 4,
    expectedRegime: "LOW",
    expectedAPY: "3%",
  },
  {
    id: "volatile" as const,
    name: "Volatile Market",
    description: "Large swaps, high volatility. Senior tranche gets IL protection.",
    icon: CloudLightning,
    color: "border-red-500/50 hover:border-red-500",
    activeColor: "border-red-500 bg-red-500/10",
    badgeColor: "bg-red-400/10 text-red-400",
    sellAmount: parseEther("5"),
    buyAmount: parseEther("10000"),
    sellLabel: "5 mWETH",
    buyLabel: "10000 mUSDC",
    rounds: 5,
    expectedRegime: "HIGH",
    expectedAPY: "10%",
  },
  {
    id: "recovery" as const,
    name: "Recovery",
    description: "Starts volatile, then calms down. Shows full regime cycle.",
    icon: TrendingDown,
    color: "border-yellow-500/50 hover:border-yellow-500",
    activeColor: "border-yellow-500 bg-yellow-500/10",
    badgeColor: "bg-yellow-400/10 text-yellow-400",
    // Recovery uses two phases — handled in runDemo
    sellAmount: parseEther("5"),
    buyAmount: parseEther("10000"),
    sellLabel: "5 -> 0.2 mWETH",
    buyLabel: "10000 -> 400 mUSDC",
    rounds: 6,
    expectedRegime: "LOW -> HIGH -> MEDIUM",
    expectedAPY: "3-10%",
  },
] as const

type ScenarioId = (typeof SCENARIOS)[number]["id"]

// Swap event from PoolManager
const SWAP_EVENT_TOPIC =
  "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f"

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

  const demoWallet = useMemo(
    () =>
      createWalletClient({
        account: demoAccount,
        chain: unichainSepolia,
        transport: http(),
      }),
    []
  )

  const [selectedScenario, setSelectedScenario] = useState<ScenarioId | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [progress, setProgress] = useState(0)
  const [currentRegime, setCurrentRegime] = useState(1)
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

  // Execute a single swap round (sell + buy)
  const executeSwapRound = useCallback(
    async (
      sellAmount: bigint,
      buyAmount: bigint,
      sellLabel: string,
      buyLabel: string,
      roundNum: number,
      totalRounds: number,
      prices: ChainPrice[],
      refPrice: bigint,
      state: { lastWeightedPrice: bigint; ema: bigint; observations: bigint; regime: number }
    ) => {
      // ── Sell ──
      addLog(`Round ${roundNum}/${totalRounds}: Selling ${sellLabel}...`, "swap")
      const sellHash = await demoWallet.writeContract({
        address: SWAP_ROUTER_ADDRESS,
        abi: PoolSwapTestABI,
        functionName: "swap",
        args: [
          POOL_KEY,
          {
            zeroForOne: true,
            amountSpecified: -sellAmount,
            sqrtPriceLimitX96: MIN_SQRT_PRICE_LIMIT,
          },
          { takeClaims: false, settleUsingBurn: false },
          "0x" as `0x${string}`,
        ],
        gas: 500_000n,
      })

      const sellReceipt = await publicClient!.waitForTransactionReceipt({ hash: sellHash })
      const sellPrice = extractPriceFromLogs(sellReceipt.logs)
      if (sellPrice) {
        prices[2] = { ...prices[2], price: sellPrice }
        setChainPrices([...prices])
      }

      const wp1 = (prices[0].price + prices[1].price + prices[2].price) / 3n
      if (state.lastWeightedPrice > 0n) {
        const sq = computeSquaredReturn(state.lastWeightedPrice, wp1)
        state.ema = (EMA_ALPHA * sq + (EMA_SCALE - EMA_ALPHA) * state.ema) / EMA_SCALE
        state.observations++
        setVolatilityEMA(state.ema)
      }
      state.lastWeightedPrice = wp1

      // ── Buy ──
      addLog(`Round ${roundNum}/${totalRounds}: Buying back with ${buyLabel}...`, "swap")
      const buyHash = await demoWallet.writeContract({
        address: SWAP_ROUTER_ADDRESS,
        abi: PoolSwapTestABI,
        functionName: "swap",
        args: [
          POOL_KEY,
          {
            zeroForOne: false,
            amountSpecified: -buyAmount,
            sqrtPriceLimitX96: MAX_SQRT_PRICE_LIMIT,
          },
          { takeClaims: false, settleUsingBurn: false },
          "0x" as `0x${string}`,
        ],
        gas: 500_000n,
      })

      const buyReceipt = await publicClient!.waitForTransactionReceipt({ hash: buyHash })
      const buyPrice = extractPriceFromLogs(buyReceipt.logs)
      if (buyPrice) {
        prices[2] = { ...prices[2], price: buyPrice }
        // Set reference prices from first real swap
        if (roundNum === 1 && prices[0].price === refPrice) {
          prices[0] = { ...prices[0], price: buyPrice }
          prices[1] = { ...prices[1], price: buyPrice }
        }
        setChainPrices([...prices])
      }

      const wp2 = (prices[0].price + prices[1].price + prices[2].price) / 3n
      if (state.lastWeightedPrice > 0n) {
        const sq = computeSquaredReturn(state.lastWeightedPrice, wp2)
        state.ema = (EMA_ALPHA * sq + (EMA_SCALE - EMA_ALPHA) * state.ema) / EMA_SCALE
        state.observations++
        setVolatilityEMA(state.ema)
      }
      state.lastWeightedPrice = wp2
      setSwapCount((prev) => prev + 2)

      // Check regime
      if (state.observations >= 3n) {
        let newRegime: number
        if (state.ema < LOW_THRESHOLD) newRegime = 0
        else if (state.ema > HIGH_THRESHOLD) newRegime = 2
        else newRegime = 1

        if (newRegime !== state.regime) {
          state.regime = newRegime
          setCurrentRegime(newRegime)
          addLog(
            `Regime change: ${REGIME_CONFIG[newRegime].name} (EMA: ${state.ema})`,
            "regime"
          )
        }
      }

      addLog(
        `EMA: ${state.ema} | Obs: ${state.observations} | Regime: ${REGIME_CONFIG[state.regime].name}`,
        "volatility"
      )

      return state
    },
    [demoWallet, publicClient, addLog]
  )

  const runDemo = useCallback(async () => {
    if (!publicClient || !selectedScenario) return
    const scenario = SCENARIOS.find((s) => s.id === selectedScenario)!

    setIsRunning(true)
    setLogs([])
    setProgress(0)
    setSwapCount(0)

    try {
      // ── 1. Read initial state ──
      addLog(`Scenario: ${scenario.name}`, "info")
      addLog("Reading pool state from Unichain Sepolia...", "info")
      const stats = (await publicClient.readContract({
        address: TRANCHES_HOOK_ADDRESS,
        abi: TranchesHookABI,
        functionName: "getPoolStats",
        args: [POOL_KEY],
      })) as unknown as bigint[]

      const initialAPY = stats[4]
      setCurrentAPY(initialAPY)
      addLog(`Current Senior APY: ${initialAPY} bps`, "info")
      setProgress(5)

      const refPrice = 2500000000000000000000000000000n
      const prices: ChainPrice[] = [
        { name: "Ethereum", price: refPrice, stable: true },
        { name: "Base", price: refPrice, stable: true },
        { name: "Unichain", price: refPrice, stable: false },
      ]
      setChainPrices(prices)
      addLog("Multi-chain price feeds initialized (3 chains)", "info")
      setProgress(10)

      const state = { lastWeightedPrice: 0n, ema: 0n, observations: 0n, regime: 1 }

      if (scenario.id === "recovery") {
        // ── Recovery: Phase 1 = volatile (3 rounds), Phase 2 = calm (3 rounds) ──
        addLog("Phase 1: Volatile market conditions...", "swap")
        const volRounds = 3
        const calmRounds = 3
        const totalRounds = volRounds + calmRounds

        for (let i = 0; i < volRounds; i++) {
          await executeSwapRound(
            parseEther("5"), parseEther("10000"),
            "5 mWETH", "10000 mUSDC",
            i + 1, totalRounds, prices, refPrice, state
          )
          setProgress(10 + ((i + 1) / totalRounds) * 70)
        }

        addLog("Phase 2: Market stabilizing...", "swap")
        for (let i = 0; i < calmRounds; i++) {
          await executeSwapRound(
            parseEther("0.2"), parseEther("400"),
            "0.2 mWETH", "400 mUSDC",
            volRounds + i + 1, totalRounds, prices, refPrice, state
          )
          setProgress(10 + ((volRounds + i + 1) / totalRounds) * 70)
        }
      } else {
        // ── Calm / Volatile: uniform swap sizes ──
        addLog(`Executing ${scenario.rounds} swap rounds...`, "swap")
        for (let i = 0; i < scenario.rounds; i++) {
          await executeSwapRound(
            scenario.sellAmount, scenario.buyAmount,
            scenario.sellLabel, scenario.buyLabel,
            i + 1, scenario.rounds, prices, refPrice, state
          )
          setProgress(10 + ((i + 1) / scenario.rounds) * 70)
        }
      }

      setProgress(85)

      // ── Apply regime change ──
      const newAPY = REGIME_CONFIG[state.regime].apy
      if (newAPY !== initialAPY) {
        addLog(
          `Reactive callback: adjustRiskParameter(${initialAPY} -> ${newAPY} bps)`,
          "callback"
        )
        const adjustHash = await demoWallet.writeContract({
          address: TRANCHES_HOOK_ADDRESS,
          abi: TranchesHookABI,
          functionName: "adjustRiskParameter",
          args: [POOL_KEY, newAPY],
          gas: 100_000n,
        })
        await publicClient.waitForTransactionReceipt({ hash: adjustHash })
        setCurrentAPY(newAPY)
        setProgress(95)
        addLog("adjustRiskParameter() confirmed on-chain!", "success")
      } else {
        addLog(`No regime change needed. APY stays at ${initialAPY} bps.`, "info")
        setProgress(95)
      }

      // ── Verify final state ──
      const finalStats = (await publicClient.readContract({
        address: TRANCHES_HOOK_ADDRESS,
        abi: TranchesHookABI,
        functionName: "getPoolStats",
        args: [POOL_KEY],
      })) as unknown as bigint[]

      setCurrentAPY(finalStats[4])
      setProgress(100)
      addLog(
        `Done! Senior APY: ${initialAPY} -> ${finalStats[4]} bps`,
        "success"
      )
    } catch (err) {
      addLog(`Error: ${(err as Error).message?.slice(0, 100)}`, "info")
    } finally {
      setIsRunning(false)
    }
  }, [publicClient, demoWallet, selectedScenario, addLog, executeSwapRound])

  const resetDemo = useCallback(async () => {
    if (!publicClient) return
    setIsRunning(true)
    try {
      addLog("Resetting APY to 500 bps (MEDIUM)...", "info")
      const hash = await demoWallet.writeContract({
        address: TRANCHES_HOOK_ADDRESS,
        abi: TranchesHookABI,
        functionName: "adjustRiskParameter",
        args: [POOL_KEY, 500n],
        gas: 100_000n,
      })
      await publicClient.waitForTransactionReceipt({ hash })
      setCurrentAPY(500n)
      setCurrentRegime(1)
      setVolatilityEMA(0n)
      setSwapCount(0)
      setChainPrices([])
      setLogs([])
      setProgress(0)
      setSelectedScenario(null)
    } catch (err) {
      addLog(`Reset error: ${(err as Error).message?.slice(0, 100)}`, "info")
    } finally {
      setIsRunning(false)
    }
  }, [publicClient, demoWallet, addLog])

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
            Select a market scenario, then watch the Reactive Network respond
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={runDemo}
            disabled={isRunning || !selectedScenario}
            size="lg"
          >
            {isRunning ? "Running..." : "Run Scenario"}
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

      {/* Scenario Selector */}
      <div className="grid gap-3 md:grid-cols-3">
        {SCENARIOS.map((s) => {
          const Icon = s.icon
          const isSelected = selectedScenario === s.id
          return (
            <button
              key={s.id}
              onClick={() => !isRunning && setSelectedScenario(s.id)}
              disabled={isRunning}
              className={`rounded-lg border p-4 text-left transition-all ${
                isSelected ? s.activeColor : s.color
              } ${isRunning ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon className="h-5 w-5" />
                <span className="font-semibold">{s.name}</span>
                <Badge className={`${s.badgeColor} border-0 ml-auto text-xs`}>
                  {s.expectedAPY}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{s.description}</p>
              <div className="mt-2 flex gap-2 text-xs text-muted-foreground">
                <span>{s.rounds} rounds</span>
                <span>|</span>
                <span>{s.sellLabel} / {s.buyLabel}</span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Progress bar */}
      {progress > 0 && <Progress value={progress} className="h-2" />}

      {/* Top row: Chain Prices + Regime + APY */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Chain Prices */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Multi-Chain Prices
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {chainPrices.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Select a scenario and run
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
                <span>LOW &lt; 4e14</span>
                <span>HIGH &gt; 36e14</span>
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
              <span className="text-sm">Swaps executed</span>
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
      const data = log.data.slice(2)
      const sqrtPriceHex = data.slice(128, 192)
      return BigInt("0x" + sqrtPriceHex)
    }
  }
  return null
}

function formatSqrtPrice(sqrtPriceX96: bigint): string {
  const Q96 = 2n ** 96n
  const sqrtPrice = Number(sqrtPriceX96) / Number(Q96)
  const price = sqrtPrice * sqrtPrice
  return `$${price.toFixed(2)}`
}
