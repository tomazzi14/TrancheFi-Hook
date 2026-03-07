import { useReadContract } from "wagmi"
import { hookContract, POOL_KEY } from "@/lib/config/contracts"

export function usePoolStats() {
  return useReadContract({
    ...hookContract,
    functionName: "getPoolStats",
    args: [POOL_KEY],
    query: { refetchInterval: 10_000 },
  })
}
