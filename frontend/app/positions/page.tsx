"use client"

import { useAccount } from "wagmi"
import { ConnectButton } from "@rainbow-me/rainbowkit"
import { PositionCard } from "@/components/positions/position-card"
import { ActionsCard } from "@/components/positions/actions-card"

export default function PositionsPage() {
  const { isConnected } = useAccount()

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <p className="text-lg text-muted-foreground">
          Connect your wallet to view positions
        </p>
        <ConnectButton />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Positions</h1>
        <p className="text-muted-foreground">
          View your tranche position, claim fees, and manage liquidity
        </p>
      </div>
      <PositionCard />
      <ActionsCard />
    </div>
  )
}
