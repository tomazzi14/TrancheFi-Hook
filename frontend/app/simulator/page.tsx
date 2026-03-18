"use client"

import { useState, useMemo } from "react"
import { ScenarioControls } from "@/components/simulator/scenario-controls"
import { WaterfallChart } from "@/components/simulator/waterfall-chart"
import { Card, CardContent } from "@/components/ui/card"

const BASIS_POINTS = 10_000

/**
 * Port of _distributeWaterfall() from TranchesHook.sol
 * Computes how fees are split between Senior and Junior tranches.
 */
function distributeWaterfall(
  totalFees: number,
  seniorLiquidity: number,
  juniorLiquidity: number,
  seniorTargetAPY: number // in basis points (e.g. 500 = 5%)
) {
  const totalLiquidity = seniorLiquidity + juniorLiquidity
  if (totalLiquidity === 0) return { seniorFees: 0, juniorFees: 0 }

  let seniorOwed = 0

  if (seniorLiquidity > 0) {
    // Senior proportional share
    const seniorShare = (totalFees * seniorLiquidity) / totalLiquidity
    // Apply APY priority multiplier
    const priorityMultiplier = BASIS_POINTS + seniorTargetAPY
    seniorOwed = (seniorShare * priorityMultiplier) / BASIS_POINTS
    if (seniorOwed > totalFees) seniorOwed = totalFees
  }

  const seniorFees = seniorOwed >= totalFees ? totalFees : seniorOwed
  const juniorFees = totalFees - seniorFees

  return { seniorFees, juniorFees }
}

export default function SimulatorPage() {
  const [totalFees, setTotalFees] = useState(10)
  const [seniorPct, setSeniorPct] = useState(60)
  const [targetAPY, setTargetAPY] = useState(500)

  // Simulate different fee scenarios
  const chartData = useMemo(() => {
    const totalLiquidity = 100
    const seniorLiq = (totalLiquidity * seniorPct) / 100
    const juniorLiq = totalLiquidity - seniorLiq

    // Show distribution at different fee levels
    const feeScenarios = [
      { label: "Low", fees: totalFees * 0.25 },
      { label: "Medium", fees: totalFees * 0.5 },
      { label: "Target", fees: totalFees },
      { label: "High", fees: totalFees * 1.5 },
      { label: "Very High", fees: totalFees * 2 },
    ]

    return feeScenarios.map((scenario) => {
      const { seniorFees, juniorFees } = distributeWaterfall(
        scenario.fees,
        seniorLiq,
        juniorLiq,
        targetAPY
      )
      return {
        name: scenario.label,
        senior: Number(seniorFees.toFixed(2)),
        junior: Number(juniorFees.toFixed(2)),
      }
    })
  }, [totalFees, seniorPct, targetAPY])

  // Current scenario breakdown
  const current = useMemo(() => {
    const totalLiquidity = 100
    const seniorLiq = (totalLiquidity * seniorPct) / 100
    const juniorLiq = totalLiquidity - seniorLiq
    const { seniorFees, juniorFees } = distributeWaterfall(
      totalFees,
      seniorLiq,
      juniorLiq,
      targetAPY
    )

    const seniorAPYActual =
      seniorLiq > 0 ? ((seniorFees / seniorLiq) * 100).toFixed(2) : "0"
    const juniorAPYActual =
      juniorLiq > 0 ? ((juniorFees / juniorLiq) * 100).toFixed(2) : "0"

    return { seniorFees, juniorFees, seniorAPYActual, juniorAPYActual }
  }, [totalFees, seniorPct, targetAPY])

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Fee Waterfall Simulator
        </h1>
        <p className="text-muted-foreground">
          Visualize how swap fees are distributed between tranches. No wallet
          needed.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <ScenarioControls
            totalFees={totalFees}
            seniorPct={seniorPct}
            targetAPY={targetAPY}
            onTotalFeesChange={setTotalFees}
            onSeniorPctChange={setSeniorPct}
            onTargetAPYChange={setTargetAPY}
          />
        </div>

        <div className="lg:col-span-2 flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Senior Fees</p>
                <p className="text-xl font-bold text-senior">
                  {current.seniorFees.toFixed(2)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Junior Fees</p>
                <p className="text-xl font-bold text-junior">
                  {current.juniorFees.toFixed(2)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">
                  Senior Yield
                </p>
                <p className="text-xl font-bold text-senior">
                  {current.seniorAPYActual}%
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">
                  Junior Yield
                </p>
                <p className="text-xl font-bold text-junior">
                  {current.juniorAPYActual}%
                </p>
              </CardContent>
            </Card>
          </div>

          <WaterfallChart data={chartData} />
        </div>
      </div>
    </div>
  )
}
