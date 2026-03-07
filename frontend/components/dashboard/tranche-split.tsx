"use client"

import { usePoolStats } from "@/hooks/usePoolStats"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts"
import { formatEth } from "@/lib/utils"

const SENIOR_COLOR = "oklch(0.65 0.18 250)"
const JUNIOR_COLOR = "oklch(0.72 0.18 55)"

export function TrancheSplit() {
  const { data, isLoading } = usePoolStats()

  const [totalSenior, totalJunior] = data ?? [0n, 0n]

  const seniorNum = Number(totalSenior) / 1e18
  const juniorNum = Number(totalJunior) / 1e18
  const total = seniorNum + juniorNum

  const chartData =
    total > 0
      ? [
          { name: "Senior", value: seniorNum },
          { name: "Junior", value: juniorNum },
        ]
      : [
          { name: "Senior", value: 50 },
          { name: "Junior", value: 50 },
        ]

  const COLORS = [SENIOR_COLOR, JUNIOR_COLOR]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tranche Split</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Skeleton className="h-48 w-48 rounded-full" />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 md:flex-row md:justify-around">
            <div className="h-64 w-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={4}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {chartData.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "oklch(0.18 0.01 260)",
                      border: "1px solid oklch(1 0 0 / 10%)",
                      borderRadius: "8px",
                      color: "white",
                    }}
                    formatter={(value) => Number(value).toFixed(4)}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: SENIOR_COLOR }}
                />
                <div>
                  <p className="text-sm text-muted-foreground">
                    Senior Liquidity
                  </p>
                  <p className="text-lg font-semibold">
                    {formatEth(totalSenior as bigint)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: JUNIOR_COLOR }}
                />
                <div>
                  <p className="text-sm text-muted-foreground">
                    Junior Liquidity
                  </p>
                  <p className="text-lg font-semibold">
                    {formatEth(totalJunior as bigint)}
                  </p>
                </div>
              </div>
              {total === 0 && (
                <p className="text-xs text-muted-foreground italic">
                  No liquidity yet — showing placeholder
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
