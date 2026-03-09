"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TrancheSelector } from "@/components/deposit/tranche-selector"
import { TickRangeSelector } from "@/components/deposit/tick-range-selector"
import { DepositForm } from "@/components/deposit/deposit-form"
import { DEFAULT_TICK_LOWER, DEFAULT_TICK_UPPER } from "@/lib/config/contracts"

export default function DepositPage() {
  const [tranche, setTranche] = useState<0 | 1>(0)
  const [tickLower, setTickLower] = useState(DEFAULT_TICK_LOWER)
  const [tickUpper, setTickUpper] = useState(DEFAULT_TICK_UPPER)

  return (
    <div className="mx-auto max-w-2xl flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Deposit</h1>
        <p className="text-muted-foreground">
          Choose a tranche, set your tick range, and add liquidity
        </p>
      </div>

      <TrancheSelector selected={tranche} onSelect={setTranche} />

      <Card>
        <CardHeader>
          <CardTitle>Price Range</CardTitle>
        </CardHeader>
        <CardContent>
          <TickRangeSelector
            tickLower={tickLower}
            tickUpper={tickUpper}
            onTickLowerChange={setTickLower}
            onTickUpperChange={setTickUpper}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {tranche === 0 ? "Senior" : "Junior"} Deposit
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DepositForm
            tranche={tranche}
            tickLower={tickLower}
            tickUpper={tickUpper}
          />
        </CardContent>
      </Card>
    </div>
  )
}
