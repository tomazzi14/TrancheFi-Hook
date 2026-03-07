"use client"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const SENIOR_COLOR = "oklch(0.65 0.18 250)"
const JUNIOR_COLOR = "oklch(0.72 0.18 55)"

interface WaterfallChartProps {
  data: { name: string; senior: number; junior: number }[]
}

export function WaterfallChart({ data }: WaterfallChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Fee Distribution Waterfall</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 10%)" />
              <XAxis
                dataKey="name"
                stroke="oklch(0.65 0 0)"
                tick={{ fill: "oklch(0.65 0 0)", fontSize: 12 }}
              />
              <YAxis
                stroke="oklch(0.65 0 0)"
                tick={{ fill: "oklch(0.65 0 0)", fontSize: 12 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "oklch(0.18 0.01 260)",
                  border: "1px solid oklch(1 0 0 / 10%)",
                  borderRadius: "8px",
                  color: "white",
                }}
                formatter={(value) => Number(value).toFixed(2)}
              />
              <Legend />
              <Bar dataKey="senior" name="Senior" fill={SENIOR_COLOR} radius={[4, 4, 0, 0]} />
              <Bar dataKey="junior" name="Junior" fill={JUNIOR_COLOR} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
