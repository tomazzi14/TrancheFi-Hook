import { useWriteContract, useWaitForTransactionReceipt } from "wagmi"
import {
  routerContract,
  POOL_KEY,
  DEFAULT_TICK_LOWER,
  DEFAULT_TICK_UPPER,
} from "@/lib/config/contracts"

export function useRemoveLiquidity() {
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } =
    useWaitForTransactionReceipt({ hash })

  const removeLiquidity = (liquidityDelta: bigint) => {
    writeContract({
      ...routerContract,
      functionName: "removeLiquidity",
      args: [
        POOL_KEY,
        {
          tickLower: DEFAULT_TICK_LOWER,
          tickUpper: DEFAULT_TICK_UPPER,
          liquidityDelta: -liquidityDelta,
          salt: "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
        },
      ],
    })
  }

  return { removeLiquidity, hash, isPending, isConfirming, isSuccess, error }
}
