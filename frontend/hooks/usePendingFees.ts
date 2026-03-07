import { useReadContract, useAccount } from "wagmi"
import { hookContract, POOL_KEY } from "@/lib/config/contracts"

export function usePendingFees() {
  const { address } = useAccount()

  return useReadContract({
    ...hookContract,
    functionName: "pendingFees",
    args: address ? [address, POOL_KEY] : undefined,
    query: { enabled: !!address, refetchInterval: 10_000 },
  })
}
