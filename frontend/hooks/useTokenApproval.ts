import {
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
} from "wagmi"
import { ERC20ABI } from "@/lib/abis/ERC20"
import { TRANCHES_ROUTER_ADDRESS } from "@/lib/config/contracts"

const MAX_UINT256 =
  115792089237316195423570985008687907853269984665640564039457584007913129639935n

export function useTokenApproval(tokenAddress: `0x${string}`) {
  const { address } = useAccount()

  const { data: allowance } = useReadContract({
    address: tokenAddress,
    abi: ERC20ABI,
    functionName: "allowance",
    args: address ? [address, TRANCHES_ROUTER_ADDRESS] : undefined,
    query: { enabled: !!address },
  })

  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } =
    useWaitForTransactionReceipt({ hash })

  const approve = () => {
    writeContract({
      address: tokenAddress,
      abi: ERC20ABI,
      functionName: "approve",
      args: [TRANCHES_ROUTER_ADDRESS, MAX_UINT256],
    })
  }

  const needsApproval = (amount: bigint) => {
    if (!allowance) return true
    return allowance < amount
  }

  return { allowance, approve, needsApproval, isPending, isConfirming, isSuccess }
}
