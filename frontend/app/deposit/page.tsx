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
    </div>
  )
}
