import { useWriteContract, useWaitForTransactionReceipt } from "wagmi"
import {
  swapRouterContract,
  POOL_KEY,
  MIN_SQRT_PRICE_LIMIT,
  MAX_SQRT_PRICE_LIMIT,
} from "@/lib/config/contracts"

export function useSwap() {
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } =
    useWaitForTransactionReceipt({ hash })

  /**
   * @param zeroForOne - true = sell token0 (mWETH) for token1 (mUSDC), false = opposite
   * @param amountIn - exact input amount (positive bigint, will be negated for exact-input)
   */
  const swap = (zeroForOne: boolean, amountIn: bigint) => {
    writeContract({
      ...swapRouterContract,
      functionName: "swap",
      args: [
        POOL_KEY,
        {
          zeroForOne,
          amountSpecified: -amountIn, // negative = exact input
          sqrtPriceLimitX96: zeroForOne
            ? MIN_SQRT_PRICE_LIMIT
            : MAX_SQRT_PRICE_LIMIT,
        },
        {
          takeClaims: false,
          settleUsingBurn: false,
        },
        "0x" as `0x${string}`,
      ],
    })
  }

  return { swap, hash, isPending, isConfirming, isSuccess, error }
}
