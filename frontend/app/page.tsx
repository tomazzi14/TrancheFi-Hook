"use client"

import { useState } from "react"
import { useAccount } from "wagmi"
import Link from "next/link"
import { PoolStats } from "@/components/dashboard/pool-stats"
import { TrancheSplit } from "@/components/dashboard/tranche-split"
import { ReactiveOracleModal } from "@/components/dashboard/reactive-oracle-modal"
import { ConnectButton } from "@rainbow-me/rainbowkit"
import {
  Shield,
  TrendingUp,
  Zap,
  ArrowRight,
  Layers,
  AlertTriangle,
  CheckCircle,
  ArrowDown,
  Percent,
  Lock,
  Flame,
  BarChart3,
  Plus,
  Radio,
} from "lucide-react"

function LandingPage() {
  return (
    <div className="flex flex-col gap-0 -mt-8 -mx-4">
      {/* ═══ HERO ═══ */}
      <section className="relative overflow-hidden px-4 pt-16 pb-24">
        {/* Ambient glow orbs */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-[-20%] left-[10%] h-[500px] w-[500px] rounded-full bg-violet-600/10 blur-[120px] animate-pulse-glow" />
          <div className="absolute top-[10%] right-[5%] h-[400px] w-[400px] rounded-full bg-blue-500/8 blur-[100px] animate-pulse-glow" style={{ animationDelay: "2s" }} />
          <div className="absolute bottom-[-10%] left-[40%] h-[350px] w-[350px] rounded-full bg-orange-500/8 blur-[100px] animate-pulse-glow" style={{ animationDelay: "4s" }} />
        </div>

        {/* Grid lines bg */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }} />

        <div className="relative mx-auto max-w-5xl flex flex-col items-center text-center gap-8">
          <div className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-5 py-2 text-sm font-medium text-violet-300 backdrop-blur-sm">
            <Zap className="h-3.5 w-3.5" />
            Uniswap V4 Hook &middot; Aqua0 Protocol
          </div>

          <h1 className="animate-fade-up-d1 text-5xl sm:text-7xl font-extrabold tracking-tight leading-[1.1]">
            <span className="text-white">Structured Yields</span>
            <br />
            <span className="text-gradient-primary">for DeFi Liquidity</span>
          </h1>

          <p className="animate-fade-up-d2 max-w-2xl text-lg sm:text-xl text-zinc-400 leading-relaxed">
            Split LP fee revenue into <span className="text-blue-400 font-semibold">Senior</span> and{" "}
            <span className="text-orange-400 font-semibold">Junior</span> tranches.
            Choose your risk — predictable yields or amplified returns.
          </p>

          <div className="animate-fade-up-d3 flex items-center gap-4 mt-2">
            <ConnectButton />
          </div>

          {/* Floating stat pills */}
          <div className="animate-fade-up-d4 flex flex-wrap justify-center gap-3 mt-4">
            {[
              { label: "Senior Target APY", value: "5.00%", color: "blue" },
              { label: "IL Protected", value: "Senior", color: "blue" },
              { label: "Fee Boost", value: "Up to 20x", color: "orange" },
            ].map((s) => (
              <div
                key={s.label}
                className={`glass glass-hover rounded-full px-5 py-2.5 flex items-center gap-2.5 ${
                  s.color === "blue" ? "border-blue-500/10" : "border-orange-500/10"
                }`}
              >
                <span className={`text-xs uppercase tracking-wider ${
                  s.color === "blue" ? "text-blue-400/70" : "text-orange-400/70"
                }`}>
                  {s.label}
                </span>
                <span className={`text-sm font-bold ${
                  s.color === "blue" ? "text-blue-300" : "text-orange-300"
                }`}>
                  {s.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ PROBLEM ═══ */}
      <section className="relative px-4 py-24">
        <div className="mx-auto max-w-5xl">
          <div className="animate-fade-up flex flex-col items-center text-center gap-4 mb-12">
            <span className="inline-flex items-center gap-2 rounded-lg bg-zinc-500/10 border border-zinc-500/20 px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-zinc-400">
              <AlertTriangle className="h-3 w-3" />
              The Problem
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              LP yields weren&apos;t designed for you
            </h2>
            <p className="max-w-xl text-zinc-500">
              Every liquidity provider gets the same deal — same risk, same reward. No matter who you are.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                icon: <BarChart3 className="h-5 w-5" />,
                title: "Uniform exposure",
                desc: "Conservative and aggressive LPs share the exact same fee stream and risk profile.",
              },
              {
                icon: <AlertTriangle className="h-5 w-5" />,
                title: "Unhedged IL",
                desc: "No way to reduce impermanent loss exposure without removing your entire position.",
              },
              {
                icon: <Layers className="h-5 w-5" />,
                title: "No structuring",
                desc: "DeFi lacks the tranched products TradFi uses to serve different risk appetites.",
              },
            ].map((item, i) => (
              <div
                key={item.title}
                className={`animate-fade-up-d${i + 1} glass glass-hover rounded-2xl p-6 group`}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-500/10 text-zinc-400 mb-4 group-hover:bg-zinc-500/20 transition-colors">
                  {item.icon}
                </div>
                <p className="font-semibold text-white text-lg">{item.title}</p>
                <p className="mt-2 text-sm text-zinc-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ SOLUTION ═══ */}
      <section className="relative px-4 py-24">
        {/* Subtle gradient divider */}
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-violet-500/20 to-transparent" />

        <div className="mx-auto max-w-5xl">
          <div className="animate-fade-up flex flex-col items-center text-center gap-4 mb-16">
            <span className="inline-flex items-center gap-2 rounded-lg bg-violet-500/10 border border-violet-500/20 px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-violet-400">
              <CheckCircle className="h-3 w-3" />
              The Solution
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              One pool, two risk profiles
            </h2>
            <p className="max-w-2xl text-zinc-500">
              TrancheFi is a Uniswap V4 Hook that structures LP fees into Senior and Junior tranches — like bonds and equity on the same underlying asset.
            </p>
          </div>

          {/* Flow diagram */}
          <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-0">
            {[
              {
                icon: <Layers className="h-7 w-7" />,
                title: "Deposit",
                desc: "LPs provide liquidity",
                color: "violet",
              },
              {
                icon: <Zap className="h-7 w-7" />,
                title: "Hook intercepts",
                desc: "Fee revenue is captured",
                color: "violet",
              },
              {
                icon: <Shield className="h-7 w-7" />,
                title: "Senior paid first",
                desc: "Up to target APY",
                color: "blue",
              },
              {
                icon: <Flame className="h-7 w-7" />,
                title: "Junior gets rest",
                desc: "Amplified surplus",
                color: "orange",
              },
            ].map((step, i) => (
              <div key={step.title} className="flex items-center sm:flex-1">
                <div className={`animate-fade-up-d${i + 1} glass glass-hover rounded-2xl p-5 text-center flex-1`}>
                  <div className={`mx-auto h-14 w-14 rounded-2xl flex items-center justify-center mb-3 ${
                    step.color === "blue"
                      ? "bg-blue-500/10 text-blue-400"
                      : step.color === "orange"
                        ? "bg-orange-500/10 text-orange-400"
                        : "bg-violet-500/10 text-violet-400"
                  }`}>
                    {step.icon}
                  </div>
                  <p className="font-semibold text-white">{step.title}</p>
                  <p className="text-xs text-zinc-500 mt-1">{step.desc}</p>
                </div>
                {i < 3 && (
                  <ArrowRight className="h-4 w-4 text-zinc-600 mx-2 hidden sm:block shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ TRANCHES DEEP DIVE ═══ */}
      <section className="relative px-4 py-24">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-blue-500/20 to-transparent" />

        <div className="mx-auto max-w-5xl">
          <div className="animate-fade-up flex flex-col items-center text-center gap-4 mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              Choose your tranche
            </h2>
            <p className="max-w-xl text-zinc-500">
              Same underlying pool. Different risk-reward profiles.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            {/* Senior Card */}
            <div className="animate-fade-up-d1 relative rounded-3xl overflow-hidden group">
              {/* Glow bg */}
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-blue-500/5 group-hover:from-blue-500/10 group-hover:to-blue-500/10 transition-all duration-500" />
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-blue-400 to-transparent opacity-60" />

              <div className="relative glass rounded-3xl p-8 glow-senior flex flex-col gap-5 h-full">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/15 ring-1 ring-blue-500/20">
                    <Shield className="h-7 w-7 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-white">Senior</h3>
                    <p className="text-sm text-blue-400/80">Stable &middot; Protected &middot; Priority</p>
                  </div>
                </div>

                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-4xl font-extrabold text-gradient-senior">5.00%</span>
                  <span className="text-sm text-zinc-500">target APY</span>
                </div>

                <div className="flex flex-col gap-3 mt-2">
                  {[
                    { icon: <Percent className="h-4 w-4" />, text: "Priority on all fee revenue — paid before Junior" },
                    { icon: <Shield className="h-4 w-4" />, text: "Impermanent loss absorbed by Junior first" },
                    { icon: <Lock className="h-4 w-4" />, text: "Bond-like predictable returns" },
                    { icon: <CheckCircle className="h-4 w-4" />, text: "First claim on assets in liquidation" },
                  ].map((f, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="text-blue-400/70 mt-0.5 shrink-0">{f.icon}</div>
                      <p className="text-sm text-zinc-400 leading-relaxed">{f.text}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-auto pt-5 border-t border-white/5">
                  <p className="text-xs text-zinc-600">
                    Ideal for stablecoin holders, risk-averse LPs, and protocols seeking predictable yield
                  </p>
                </div>
              </div>
            </div>

            {/* Junior Card */}
            <div className="animate-fade-up-d2 relative rounded-3xl overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 via-transparent to-orange-500/5 group-hover:from-orange-500/10 group-hover:to-orange-500/10 transition-all duration-500" />
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-orange-400 to-transparent opacity-60" />

              <div className="relative glass rounded-3xl p-8 glow-junior flex flex-col gap-5 h-full">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500/15 ring-1 ring-orange-500/20">
                    <TrendingUp className="h-7 w-7 text-orange-400" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-white">Junior</h3>
                    <p className="text-sm text-orange-400/80">Variable &middot; Leveraged &middot; High upside</p>
                  </div>
                </div>

                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-4xl font-extrabold text-gradient-junior">20x+</span>
                  <span className="text-sm text-zinc-500">potential fee boost</span>
                </div>

                <div className="flex flex-col gap-3 mt-2">
                  {[
                    { icon: <Flame className="h-4 w-4" />, text: "All surplus fees after Senior is paid" },
                    { icon: <TrendingUp className="h-4 w-4" />, text: "Amplified returns in high-volume periods" },
                    { icon: <BarChart3 className="h-4 w-4" />, text: "Leveraged fee exposure without borrowing" },
                    { icon: <Zap className="h-4 w-4" />, text: "Outsized APY when pool activity spikes" },
                  ].map((f, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="text-orange-400/70 mt-0.5 shrink-0">{f.icon}</div>
                      <p className="text-sm text-zinc-400 leading-relaxed">{f.text}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-auto pt-5 border-t border-white/5">
                  <p className="text-xs text-zinc-600">
                    Ideal for yield farmers, risk-tolerant LPs, and strategists seeking leveraged fee alpha
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ HOW IT WORKS ═══ */}
      <section className="relative px-4 py-24">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-orange-500/20 to-transparent" />

        <div className="mx-auto max-w-3xl">
          <div className="animate-fade-up flex flex-col items-center text-center gap-4 mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              How it works
            </h2>
            <p className="text-zinc-500">On every swap, the hook redistributes fees automatically</p>
          </div>

          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-6 top-0 bottom-0 w-px bg-gradient-to-b from-violet-500/30 via-blue-500/30 to-orange-500/30" />

            <div className="flex flex-col gap-6">
              {[
                { step: "1", text: "A swap occurs in the Uniswap V4 pool, generating LP fees", color: "violet" },
                { step: "2", text: "The TrancheFi hook intercepts fee distribution via afterSwap", color: "violet" },
                { step: "3", text: "Senior tranche receives fees up to its 5% target APY", color: "blue" },
                { step: "4", text: "All surplus fees flow to Junior — 0% in quiet periods, 20%+ when volume spikes", color: "orange" },
                { step: "5", text: "LPs claim earned fees or withdraw liquidity at any time", color: "violet" },
              ].map((item, i) => (
                <div key={i} className={`animate-fade-up-d${Math.min(i + 1, 5)} flex items-start gap-5 pl-1`}>
                  <div className={`relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-bold text-sm ${
                    item.color === "blue"
                      ? "bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/20"
                      : item.color === "orange"
                        ? "bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/20"
                        : "bg-violet-500/15 text-violet-400 ring-1 ring-violet-500/20"
                  }`}>
                    {item.step}
                  </div>
                  <div className="glass rounded-xl px-5 py-4 flex-1">
                    <p className="text-sm text-zinc-300 leading-relaxed">{item.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section className="relative px-4 py-24">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-violet-500/20 to-transparent" />

        {/* Glow */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[300px] w-[500px] rounded-full bg-violet-600/10 blur-[100px]" />
        </div>

        <div className="relative mx-auto max-w-2xl flex flex-col items-center text-center gap-6">
          <h2 className="text-3xl sm:text-4xl font-bold text-white">
            Start earning structured yields
          </h2>
          <p className="text-zinc-500 text-lg">
            Connect your wallet to deposit into Senior or Junior tranches
          </p>
          <div className="mt-2">
            <ConnectButton />
          </div>
          <div className="flex items-center gap-6 mt-4 text-xs text-zinc-600">
            <span className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
              Live on Unichain Sepolia
            </span>
            <span className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-violet-500" />
              Powered by Aqua0
            </span>
          </div>
        </div>
      </section>
    </div>
  )
}

export default function Home() {
  const { isConnected } = useAccount()
  const [oracleOpen, setOracleOpen] = useState(false)

  if (!isConnected) {
    return <LandingPage />
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="animate-fade-up">
        <h1 className="text-3xl font-extrabold tracking-tight">
          <span className="text-gradient-primary">Dashboard</span>
        </h1>
        <p className="text-zinc-500 mt-1">
          Pool overview and tranche distribution
        </p>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/user"
          className="group relative overflow-hidden rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 via-transparent to-violet-500/5 p-5 transition-all hover:border-violet-500/40 hover:shadow-lg hover:shadow-violet-500/5"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-500/15 ring-1 ring-violet-500/20 group-hover:bg-violet-500/25 transition-colors">
              <Plus className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <p className="font-semibold text-white text-lg">Provide Liquidity</p>
              <p className="text-sm text-zinc-500">Deposit into Senior or Junior tranches</p>
            </div>
          </div>
          <ArrowRight className="absolute right-5 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-600 group-hover:text-violet-400 group-hover:translate-x-1 transition-all" />
        </Link>

        <button
          onClick={() => setOracleOpen(true)}
          className="group relative overflow-hidden rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-500/10 via-transparent to-orange-500/5 p-5 text-left transition-all hover:border-blue-500/40 hover:shadow-lg hover:shadow-blue-500/5"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/15 ring-1 ring-blue-500/20 group-hover:bg-blue-500/25 transition-colors">
              <Radio className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <p className="font-semibold text-white text-lg">Reactive Oracle</p>
              <p className="text-sm text-zinc-500">ETH price on Unichain · Ethereum · Base</p>
            </div>
          </div>
          <div className="absolute right-5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-zinc-600 group-hover:text-zinc-400 transition-colors">Live</span>
          </div>
        </button>
      </div>

      <PoolStats />
      <TrancheSplit />

      <ReactiveOracleModal open={oracleOpen} onOpenChange={setOracleOpen} />
    </div>
  )
}
