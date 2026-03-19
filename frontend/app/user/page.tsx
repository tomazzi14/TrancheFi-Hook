"use client"

import { useState } from "react"
import { useAccount } from "wagmi"
import { ConnectButton } from "@rainbow-me/rainbowkit"
import { TrancheSelector } from "@/components/deposit/tranche-selector"
import { DepositForm } from "@/components/deposit/deposit-form"
import { PositionCard } from "@/components/positions/position-card"
import { ActionsCard } from "@/components/positions/actions-card"
import { ArrowDownToLine, Wallet } from "lucide-react"

type Tab = "deposit" | "positions"

export default function UserPage() {
  const { isConnected } = useAccount()
  const [tab, setTab] = useState<Tab>("deposit")
  const [tranche, setTranche] = useState<0 | 1>(0)

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-20 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-500/10 ring-1 ring-violet-500/20">
          <Wallet className="h-7 w-7 text-violet-400" />
        </div>
        <p className="text-lg text-zinc-400">
          Connect your wallet to deposit and manage positions
        </p>
        <ConnectButton />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl flex flex-col gap-8">
      {/* Header */}
      <div className="animate-fade-up">
        <h1 className="text-3xl font-extrabold tracking-tight">
          <span className="text-gradient-primary">My Account</span>
        </h1>
        <p className="text-zinc-500 mt-1">
          Deposit liquidity and manage your tranche positions
        </p>
      </div>

      {/* Tab switcher */}
      <div className="animate-fade-up-d1 glass rounded-2xl p-1.5 flex gap-1">
        <button
          onClick={() => setTab("deposit")}
          className={`flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-all ${
            tab === "deposit"
              ? "bg-violet-500/15 text-violet-300 shadow-lg shadow-violet-500/5 ring-1 ring-violet-500/20"
              : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
          }`}
        >
          <ArrowDownToLine className="h-4 w-4" />
          Deposit
        </button>
        <button
          onClick={() => setTab("positions")}
          className={`flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-all ${
            tab === "positions"
              ? "bg-violet-500/15 text-violet-300 shadow-lg shadow-violet-500/5 ring-1 ring-violet-500/20"
              : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
          }`}
        >
          <Wallet className="h-4 w-4" />
          Positions
        </button>
      </div>

      {/* Tab content */}
      {tab === "deposit" ? (
        <div className="animate-fade-up-d2 flex flex-col gap-8">
          <TrancheSelector selected={tranche} onSelect={setTranche} />
          <div className="glass relative overflow-hidden rounded-2xl p-6">
            <div className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r ${
              tranche === 0
                ? "from-transparent via-blue-500/40 to-transparent"
                : "from-transparent via-orange-500/40 to-transparent"
            }`} />
            <h3 className="text-base font-semibold text-white mb-5">
              {tranche === 0 ? "Senior" : "Junior"} Deposit
            </h3>
            <DepositForm tranche={tranche} />
          </div>

          {/* Aqua0 Integration */}
          <div className="glass relative overflow-hidden rounded-2xl p-6 ring-1 ring-emerald-500/20">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-emerald-400">
                  Aqua0 Shared Liquidity
                </h3>
                <p className="text-sm text-zinc-500 mt-1">
                  Deposit once, amplify across TrancheFi + multiple pools simultaneously
                </p>
              </div>
              <a
                href="http://localhost:8080/dashboard"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 transition-colors shrink-0"
              >
                Provide via Aqua0 →
              </a>
            </div>
          </div>
        </div>
      ) : (
        <div className="animate-fade-up-d2 flex flex-col gap-8">
          <PositionCard />
          <ActionsCard />
        </div>
      )}
    </div>
  )
}
