"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TrancheSelector } from "@/components/deposit/tranche-selector"
import { DepositForm } from "@/components/deposit/deposit-form"

export default function DepositPage() {
  const [tranche, setTranche] = useState<0 | 1>(0)

  return (
    <div className="mx-auto max-w-2xl flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Deposit</h1>
        <p className="text-muted-foreground">
          Choose a tranche and add liquidity (full range)
        </p>
      </div>

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

      {/* Aqua0 Integration */}
      <Card className="border-emerald-500/30 bg-emerald-950/10">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-emerald-400">
                Aqua0 Shared Liquidity
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Deposit once, amplify across TrancheFi + multiple pools simultaneously
              </p>
            </div>
            <a
              href="http://localhost:8080/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 transition-colors"
            >
              Provide Liquidity via Aqua0 →
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
