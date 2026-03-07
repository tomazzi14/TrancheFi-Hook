export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-20 text-center">
      <h1 className="text-4xl font-bold tracking-tight">
        Tranche<span className="text-primary">Fi</span>
      </h1>
      <p className="max-w-md text-lg text-muted-foreground">
        Structured DeFi yields on Uniswap V4. Split LP fees into Senior and
        Junior tranches with risk-adjusted returns.
      </p>
      <div className="mt-4 flex gap-4">
        <div className="rounded-lg border bg-card p-4 text-card-foreground">
          <p className="text-sm text-muted-foreground">Senior Tranche</p>
          <p className="text-2xl font-bold text-senior">Stable</p>
        </div>
        <div className="rounded-lg border bg-card p-4 text-card-foreground">
          <p className="text-sm text-muted-foreground">Junior Tranche</p>
          <p className="text-2xl font-bold text-junior">Leveraged</p>
        </div>
      </div>
    </div>
  )
}
