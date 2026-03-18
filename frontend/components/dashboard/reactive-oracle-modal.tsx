"use client"

import { useState, useCallback, useMemo } from "react"
import { usePublicClient } from "wagmi"
import { parseEther, createWalletClient, http } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { unichainSepolia } from "@/lib/config/chains"
import {
  POOL_KEY,
  TRANCHES_HOOK_ADDRESS,
  SWAP_ROUTER_ADDRESS,
  MIN_SQRT_PRICE_LIMIT,
  MAX_SQRT_PRICE_LIMIT,
} from "@/lib/config/contracts"
import { TranchesHookABI } from "@/lib/abis/TranchesHook"
import { PoolSwapTestABI } from "@/lib/abis/PoolSwapTest"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Activity,
  ArrowRight,
  Shield,
  Zap,
  Sun,
  CloudLightning,
  TrendingDown,
  Globe,
  Radio,
} from "lucide-react"

// ─── Demo wallet (testnet only) ───
const DEMO_PRIVATE_KEY =
  "0xeb0429ec7291f7acd9c138744b8ac79359dec2e7c93621923cd11375fc4ef50f" as const
const demoAccount = privateKeyToAccount(DEMO_PRIVATE_KEY)

// ─── RSC Constants ───
const EMA_ALPHA = 100n
const EMA_SCALE = 1000n
const LOW_THRESHOLD = 400000000000000n
const HIGH_THRESHOLD = 3600000000000000n

const REGIME_CONFIG = [
  { name: "LOW", apy: 300n, label: "3%", color: "text-green-400", bg: "bg-green-400/10", border: "border-green-500/30" },
  { name: "MEDIUM", apy: 500n, label: "5%", color: "text-yellow-400", bg: "bg-yellow-400/10", border: "border-yellow-500/30" },
  { name: "HIGH", apy: 1000n, label: "10%", color: "text-red-400", bg: "bg-red-400/10", border: "border-red-500/30" },
] as const

const SCENARIOS = [
  {
    id: "calm" as const,
    name: "Calm Market",
    description: "Small swaps, low volatility — Junior gets more fees",
    icon: Sun,
    gradient: "from-green-500/20 to-emerald-500/20",
    border: "border-green-500/30 hover:border-green-500/60",
    activeBorder: "border-green-500 bg-green-500/10",
    badge: "bg-green-400/10 text-green-400",
    iconColor: "text-green-400",
    sellAmount: parseEther("0.3"),
    buyAmount: parseEther("600"),
    sellLabel: "0.3 mWETH",
    buyLabel: "600 mUSDC",
    rounds: 4,
    expectedRegime: "LOW",
    expectedAPY: "3%",
    outcome: "Senior APY drops to 3%. Junior tranche captures higher surplus from stable fee flow.",
  },
  {
    id: "volatile" as const,
    name: "Volatile Market",
    description: "Large swaps, high volatility — Senior gets IL protection",
    icon: CloudLightning,
    gradient: "from-red-500/20 to-orange-500/20",
    border: "border-red-500/30 hover:border-red-500/60",
    activeBorder: "border-red-500 bg-red-500/10",
    badge: "bg-red-400/10 text-red-400",
    iconColor: "text-red-400",
    sellAmount: parseEther("5"),
    buyAmount: parseEther("10000"),
    sellLabel: "5 mWETH",
    buyLabel: "10,000 mUSDC",
    rounds: 5,
    expectedRegime: "HIGH",
    expectedAPY: "10%",
    outcome: "Senior APY rises to 10% to compensate for IL risk. Junior absorbs losses first.",
  },
  {
    id: "recovery" as const,
    name: "Recovery",
    description: "Starts volatile, stabilizes — full regime cycle",
    icon: TrendingDown,
    gradient: "from-yellow-500/20 to-amber-500/20",
    border: "border-yellow-500/30 hover:border-yellow-500/60",
    activeBorder: "border-yellow-500 bg-yellow-500/10",
    badge: "bg-yellow-400/10 text-yellow-400",
    iconColor: "text-yellow-400",
    sellAmount: parseEther("5"),
    buyAmount: parseEther("10000"),
    sellLabel: "5→0.2 mWETH",
    buyLabel: "10k→400 mUSDC",
    rounds: 6,
    expectedRegime: "LOW → HIGH → MED",
    expectedAPY: "3-10%",
    outcome: "Shows full cycle: APY rises during volatility, then falls as market stabilizes.",
  },
] as const

type ScenarioId = (typeof SCENARIOS)[number]["id"]

const SWAP_EVENT_TOPIC =
  "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f"

type ChainPrice = { name: string; price: bigint; stable: boolean }

interface ReactiveOracleModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ReactiveOracleModal({ open, onOpenChange }: ReactiveOracleModalProps) {
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
  const [progress, setProgress] = useState(0)
  const [currentRegime, setCurrentRegime] = useState(1)
  const [currentAPY, setCurrentAPY] = useState<bigint | null>(null)
  const [volatilityEMA, setVolatilityEMA] = useState(0n)
  const [chainPrices, setChainPrices] = useState<ChainPrice[]>([])
  const [swapCount, setSwapCount] = useState(0)
  const [phase, setPhase] = useState<"select" | "running" | "done">("select")
  const [statusMessage, setStatusMessage] = useState("")

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

  const executeSwapRound = useCallback(
    async (
      sellAmount: bigint,
      buyAmount: bigint,
      roundNum: number,
      totalRounds: number,
      prices: ChainPrice[],
      refPrice: bigint,
      state: { lastWeightedPrice: bigint; ema: bigint; observations: bigint; regime: number }
    ) => {
      setStatusMessage(`Round ${roundNum}/${totalRounds} — executing swaps...`)

      // Sell
      const sellHash = await demoWallet.writeContract({
        address: SWAP_ROUTER_ADDRESS,
        abi: PoolSwapTestABI,
        functionName: "swap",
        args: [
          POOL_KEY,
          { zeroForOne: true, amountSpecified: -sellAmount, sqrtPriceLimitX96: MIN_SQRT_PRICE_LIMIT },
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

      // Buy
      const buyHash = await demoWallet.writeContract({
        address: SWAP_ROUTER_ADDRESS,
        abi: PoolSwapTestABI,
        functionName: "swap",
        args: [
          POOL_KEY,
          { zeroForOne: false, amountSpecified: -buyAmount, sqrtPriceLimitX96: MAX_SQRT_PRICE_LIMIT },
          { takeClaims: false, settleUsingBurn: false },
          "0x" as `0x${string}`,
        ],
        gas: 500_000n,
      })
      const buyReceipt = await publicClient!.waitForTransactionReceipt({ hash: buyHash })
      const buyPrice = extractPriceFromLogs(buyReceipt.logs)
      if (buyPrice) {
        prices[2] = { ...prices[2], price: buyPrice }
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

      if (state.observations >= 3n) {
        let newRegime: number
        if (state.ema < LOW_THRESHOLD) newRegime = 0
        else if (state.ema > HIGH_THRESHOLD) newRegime = 2
        else newRegime = 1

        if (newRegime !== state.regime) {
          state.regime = newRegime
          setCurrentRegime(newRegime)
        }
      }

      return state
    },
    [demoWallet, publicClient]
  )

  const runScenario = useCallback(async () => {
    if (!publicClient || !selectedScenario) return
    const scenario = SCENARIOS.find((s) => s.id === selectedScenario)!

    setIsRunning(true)
    setPhase("running")
    setProgress(0)
    setSwapCount(0)
    setStatusMessage("Reading pool state...")

    try {
      const stats = (await publicClient.readContract({
        address: TRANCHES_HOOK_ADDRESS,
        abi: TranchesHookABI,
        functionName: "getPoolStats",
        args: [POOL_KEY],
      })) as unknown as bigint[]

      const initialAPY = stats[4]
      setCurrentAPY(initialAPY)
      setProgress(5)

      const refPrice = 2500000000000000000000000000000n
      const prices: ChainPrice[] = [
        { name: "Ethereum", price: refPrice, stable: true },
        { name: "Base", price: refPrice, stable: true },
        { name: "Unichain", price: refPrice, stable: false },
      ]
      setChainPrices(prices)
      setProgress(10)

      const state = { lastWeightedPrice: 0n, ema: 0n, observations: 0n, regime: 1 }

      if (scenario.id === "recovery") {
        setStatusMessage("Phase 1: Volatile conditions...")
        for (let i = 0; i < 3; i++) {
          await executeSwapRound(parseEther("5"), parseEther("10000"), i + 1, 6, prices, refPrice, state)
          setProgress(10 + ((i + 1) / 6) * 70)
        }
        setStatusMessage("Phase 2: Market stabilizing...")
        for (let i = 0; i < 3; i++) {
          await executeSwapRound(parseEther("0.2"), parseEther("400"), 4 + i, 6, prices, refPrice, state)
          setProgress(10 + ((4 + i) / 6) * 70)
        }
      } else {
        for (let i = 0; i < scenario.rounds; i++) {
          await executeSwapRound(
            scenario.sellAmount, scenario.buyAmount,
            i + 1, scenario.rounds, prices, refPrice, state
          )
          setProgress(10 + ((i + 1) / scenario.rounds) * 70)
        }
      }

      setProgress(85)
      const newAPY = REGIME_CONFIG[state.regime].apy
      if (newAPY !== initialAPY) {
        setStatusMessage("Applying regime change on-chain...")
        const adjustHash = await demoWallet.writeContract({
          address: TRANCHES_HOOK_ADDRESS,
          abi: TranchesHookABI,
          functionName: "adjustRiskParameter",
          args: [POOL_KEY, newAPY],
          gas: 100_000n,
        })
        await publicClient.waitForTransactionReceipt({ hash: adjustHash })
        setCurrentAPY(newAPY)
      }

      const finalStats = (await publicClient.readContract({
        address: TRANCHES_HOOK_ADDRESS,
        abi: TranchesHookABI,
        functionName: "getPoolStats",
        args: [POOL_KEY],
      })) as unknown as bigint[]
      setCurrentAPY(finalStats[4])
      setProgress(100)
      setPhase("done")
      setStatusMessage("Scenario complete!")
    } catch (err) {
      setStatusMessage(`Error: ${(err as Error).message?.slice(0, 80)}`)
      setPhase("done")
    } finally {
      setIsRunning(false)
    }
  }, [publicClient, demoWallet, selectedScenario, executeSwapRound])

  const resetModal = () => {
    setSelectedScenario(null)
    setPhase("select")
    setProgress(0)
    setSwapCount(0)
    setChainPrices([])
    setCurrentAPY(null)
    setVolatilityEMA(0n)
    setCurrentRegime(1)
    setStatusMessage("")
  }

  const regime = REGIME_CONFIG[currentRegime]
  const selectedConfig = SCENARIOS.find((s) => s.id === selectedScenario)

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!isRunning) { onOpenChange(v); resetModal() } }}>
      <DialogContent onClose={!isRunning ? () => { onOpenChange(false); resetModal() } : undefined}>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15 ring-1 ring-violet-500/20">
              <Radio className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <DialogTitle>Reactive Network Oracle</DialogTitle>
              <DialogDescription>
                Cross-chain ETH price feeds powering dynamic risk adjustment
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Chain price feeds (always visible) */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {(chainPrices.length > 0 ? chainPrices : [
            { name: "Ethereum", price: 0n, stable: true },
            { name: "Base", price: 0n, stable: true },
            { name: "Unichain", price: 0n, stable: false },
          ]).map((chain) => (
            <div
              key={chain.name}
              className="glass rounded-xl p-3 flex flex-col items-center gap-1.5"
            >
              <div className="flex items-center gap-1.5">
                <div className={`h-1.5 w-1.5 rounded-full ${
                  chain.stable ? "bg-green-400" : "bg-orange-400 animate-pulse"
                }`} />
                <span className="text-xs text-zinc-500">{chain.name}</span>
              </div>
              <span className="text-sm font-bold font-mono text-white">
                {chain.price > 0n ? formatSqrtPrice(chain.price) : "—"}
              </span>
            </div>
          ))}
        </div>

        {/* Scenario selector */}
        {phase === "select" && (
          <div className="flex flex-col gap-4">
            <p className="text-xs uppercase tracking-widest text-zinc-500 font-semibold">
              Select a market scenario
            </p>
            <div className="grid gap-3">
              {SCENARIOS.map((s) => {
                const Icon = s.icon
                const isSelected = selectedScenario === s.id
                return (
                  <button
                    key={s.id}
                    onClick={() => setSelectedScenario(s.id)}
                    className={`rounded-xl border p-4 text-left transition-all ${
                      isSelected ? s.activeBorder : s.border
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ${s.gradient}`}>
                        <Icon className={`h-4 w-4 ${s.iconColor}`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white text-sm">{s.name}</span>
                          <Badge className={`${s.badge} border-0 text-[10px]`}>
                            APY → {s.expectedAPY}
                          </Badge>
                        </div>
                        <p className="text-xs text-zinc-500 mt-0.5">{s.description}</p>
                      </div>
                    </div>
                    {isSelected && (
                      <div className="mt-3 pt-3 border-t border-zinc-800/50">
                        <p className="text-xs text-zinc-400 leading-relaxed">
                          <span className="text-zinc-500 font-medium">What happens: </span>
                          {s.outcome}
                        </p>
                        <div className="flex gap-4 mt-2 text-[10px] text-zinc-600">
                          <span>{s.rounds} swap rounds</span>
                          <span>Sell: {s.sellLabel}</span>
                          <span>Buy: {s.buyLabel}</span>
                        </div>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>

            <Button
              onClick={runScenario}
              disabled={!selectedScenario}
              className="w-full mt-2 bg-violet-600 hover:bg-violet-500 text-white"
            >
              <Zap className="h-4 w-4 mr-2" />
              Run Scenario
            </Button>
          </div>
        )}

        {/* Running / Done state */}
        {(phase === "running" || phase === "done") && (
          <div className="flex flex-col gap-5">
            {/* Progress */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">{statusMessage}</span>
                <span className="text-zinc-500 font-mono">{progress}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 to-blue-500 transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-3">
              <div className="glass rounded-xl p-3 text-center">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Regime</p>
                <Badge className={`${regime.bg} ${regime.color} border-0 text-xs`}>
                  {regime.name}
                </Badge>
              </div>
              <div className="glass rounded-xl p-3 text-center">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Senior APY</p>
                <p className="text-lg font-bold text-blue-400">
                  {currentAPY !== null ? `${(Number(currentAPY) / 100).toFixed(1)}%` : "—"}
                </p>
              </div>
              <div className="glass rounded-xl p-3 text-center">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Swaps</p>
                <p className="text-lg font-bold text-white font-mono">{swapCount}</p>
              </div>
            </div>

            {/* Reactive flow */}
            <div className="flex items-center justify-between gap-1">
              {[
                { label: "Swaps", icon: <Zap className="h-3.5 w-3.5" />, active: swapCount > 0 },
                { label: "EMA", icon: <Activity className="h-3.5 w-3.5" />, active: volatilityEMA > 0n },
                { label: "Regime", icon: <Globe className="h-3.5 w-3.5" />, active: currentRegime !== 1 || volatilityEMA > 0n },
                { label: "APY", icon: <Shield className="h-3.5 w-3.5" />, active: currentAPY !== null && currentAPY !== 500n },
              ].map((step, i) => (
                <div key={step.label} className="flex items-center gap-1">
                  <div className={`flex flex-col items-center gap-0.5 rounded-lg border px-3 py-2 transition-all text-[10px] ${
                    step.active
                      ? "border-violet-500/40 bg-violet-500/10 text-violet-300"
                      : "border-zinc-800 text-zinc-600"
                  }`}>
                    {step.icon}
                    <span>{step.label}</span>
                  </div>
                  {i < 3 && <ArrowRight className="h-3 w-3 text-zinc-700 shrink-0" />}
                </div>
              ))}
            </div>

            {/* Done actions */}
            {phase === "done" && (
              <div className="flex gap-3 pt-2">
                <Button
                  onClick={resetModal}
                  variant="outline"
                  className="flex-1 border-zinc-800 text-zinc-400 hover:text-white"
                >
                  Run Another
                </Button>
                <Button
                  onClick={() => { onOpenChange(false); resetModal() }}
                  className="flex-1 bg-violet-600 hover:bg-violet-500 text-white"
                >
                  Done
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
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
