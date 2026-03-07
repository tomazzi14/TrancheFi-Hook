"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"

interface ScenarioControlsProps {
  totalFees: number
  seniorPct: number
  targetAPY: number
  onTotalFeesChange: (v: number) => void
  onSeniorPctChange: (v: number) => void
  onTargetAPYChange: (v: number) => void
}

export function ScenarioControls({
  totalFees,
  seniorPct,
  targetAPY,
  onTotalFeesChange,
  onSeniorPctChange,
  onTargetAPYChange,
}: ScenarioControlsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Scenario Parameters</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div>
          <div className="mb-2 flex justify-between text-sm">
            <span>Total Swap Fees</span>
            <span className="font-mono font-medium">{totalFees} ETH</span>
          </div>
          <Slider
            value={[totalFees]}
            onValueChange={(v) => onTotalFeesChange(Array.isArray(v) ? v[0] : v)}
            min={0}
            max={100}
            step={1}
          />
        </div>

        <div>
          <div className="mb-2 flex justify-between text-sm">
            <span>Senior % of Pool</span>
            <span className="font-mono font-medium">{seniorPct}%</span>
          </div>
          <Slider
            value={[seniorPct]}
            onValueChange={(v) => onSeniorPctChange(Array.isArray(v) ? v[0] : v)}
            min={0}
            max={100}
            step={1}
          />
        </div>

        <div>
          <div className="mb-2 flex justify-between text-sm">
            <span>Senior Target APY</span>
            <span className="font-mono font-medium">
              {(targetAPY / 100).toFixed(1)}%
            </span>
          </div>
          <Slider
            value={[targetAPY]}
            onValueChange={(v) => onTargetAPYChange(Array.isArray(v) ? v[0] : v)}
            min={0}
            max={5000}
            step={50}
          />
        </div>
      </CardContent>
    </Card>
  )
}
