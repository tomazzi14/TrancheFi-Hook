import { useWriteContract, useWaitForTransactionReceipt } from "wagmi"
import { hookContract, POOL_KEY } from "@/lib/config/contracts"

export function useClaimFees() {
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } =
    useWaitForTransactionReceipt({ hash })

  const claimFees = () => {
    writeContract({
      ...hookContract,
      functionName: "claimFees",
      args: [POOL_KEY],
    })
  }

  return { claimFees, hash, isPending, isConfirming, isSuccess, error }
}

export function useWithdrawFees() {
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } =
    useWaitForTransactionReceipt({ hash })

  const withdrawFees = (currency: `0x${string}`) => {
    writeContract({
      ...hookContract,
      functionName: "withdrawFees",
      args: [currency],
    })
  }

  return { withdrawFees, hash, isPending, isConfirming, isSuccess, error }
}
