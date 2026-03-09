import { useWriteContract, useWaitForTransactionReceipt } from "wagmi"
import {
  routerContract,
  POOL_KEY,
  DEFAULT_TICK_LOWER,
  DEFAULT_TICK_UPPER,
} from "@/lib/config/contracts"

export function useAddLiquidity() {
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } =
    useWaitForTransactionReceipt({ hash })

  const addLiquidity = (
    liquidityDelta: bigint,
    tranche: 0 | 1,
    tickLower: number = DEFAULT_TICK_LOWER,
    tickUpper: number = DEFAULT_TICK_UPPER
  ) => {
    writeContract({
      ...routerContract,
      functionName: "addLiquidity",
      args: [
        POOL_KEY,
        {
          tickLower,
          tickUpper,
          liquidityDelta,
          salt: "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
        },
        tranche,
      ],
    })
  }

  return { addLiquidity, hash, isPending, isConfirming, isSuccess, error }
}
