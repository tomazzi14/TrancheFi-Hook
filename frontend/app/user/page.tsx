"use client"

import { useState } from "react"
import { useAccount } from "wagmi"
import { ConnectButton } from "@rainbow-me/rainbowkit"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <p className="text-lg text-muted-foreground">
          Connect your wallet to deposit and manage positions
        </p>
        <ConnectButton />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl flex flex-col gap-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Account</h1>
        <p className="text-muted-foreground">
          Deposit liquidity and manage your tranche positions
        </p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 rounded-xl bg-zinc-900 p-1">
        <button
          onClick={() => setTab("deposit")}
          className={`flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
            tab === "deposit"
              ? "bg-violet-500/15 text-violet-300 shadow-sm"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <ArrowDownToLine className="h-4 w-4" />
          Deposit
        </button>
        <button
          onClick={() => setTab("positions")}
          className={`flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
            tab === "positions"
              ? "bg-violet-500/15 text-violet-300 shadow-sm"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <Wallet className="h-4 w-4" />
          Positions
        </button>
      </div>

      {/* Tab content */}
      {tab === "deposit" ? (
        <div className="flex flex-col gap-8">
          <TrancheSelector selected={tranche} onSelect={setTranche} />
          <Card>
            <CardHeader>
              <CardTitle>
                {tranche === 0 ? "Senior" : "Junior"} Deposit
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DepositForm tranche={tranche} />
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          <PositionCard />
          <ActionsCard />
        </div>
      )}
    </div>
  )
}
