import { useReadContract, useAccount } from "wagmi"
import { hookContract, POOL_KEY } from "@/lib/config/contracts"
import { computePoolId, computePositionKey } from "@/lib/utils"

const poolId = computePoolId(POOL_KEY)

export function useUserPosition() {
  const { address } = useAccount()

  const posKey = address ? computePositionKey(address, poolId) : undefined

  return useReadContract({
    ...hookContract,
    functionName: "positions",
    args: posKey ? [posKey] : undefined,
    query: { enabled: !!posKey, refetchInterval: 10_000 },
  })
}
