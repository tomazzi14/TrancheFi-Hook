"use client"

import { useState, useEffect } from "react"
import { useAccount } from "wagmi"
import { parseEther } from "viem"
import { useAddLiquidity } from "@/hooks/useAddLiquidity"
import { useTokenApproval } from "@/hooks/useTokenApproval"
import { TRANCHES_ROUTER_ADDRESS } from "@/lib/config/contracts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { Loader2, CheckCircle2 } from "lucide-react"

interface DepositFormProps {
  tranche: 0 | 1
}

export function DepositForm({ tranche }: DepositFormProps) {
  const [amount, setAmount] = useState("")
  const { isConnected } = useAccount()

  const {
    approve,
    needsApproval,
    isPending: isApproving,
    isConfirming: isApprovalConfirming,
    isSuccess: isApprovalSuccess,
  } = useTokenApproval(TRANCHES_ROUTER_ADDRESS)

  const {
    addLiquidity,
    isPending: isDepositing,
    isConfirming: isDepositConfirming,
    isSuccess: isDepositSuccess,
    error: depositError,
  } = useAddLiquidity()

  useEffect(() => {
    if (isApprovalSuccess) {
      toast.success("Token approved!")
    }
  }, [isApprovalSuccess])

  useEffect(() => {
    if (isDepositSuccess) {
      toast.success(
        `Deposited into ${tranche === 0 ? "Senior" : "Junior"} tranche!`
      )
      setAmount("")
    }
  }, [isDepositSuccess, tranche])

  useEffect(() => {
    if (depositError) {
      toast.error(depositError.message.slice(0, 100))
    }
  }, [depositError])

  if (!isConnected) {
    return (
      <p className="text-center text-muted-foreground">
        Connect your wallet to deposit
      </p>
    )
  }

  const parsedAmount = amount ? parseEther(amount) : 0n
  const showApprove = parsedAmount > 0n && needsApproval(parsedAmount)
  const trancheLabel = tranche === 0 ? "Senior" : "Junior"

  const handleDeposit = () => {
    if (parsedAmount <= 0n) return
    addLiquidity(parsedAmount, tranche)
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="mb-2 block text-sm font-medium">
          Liquidity Amount
        </label>
        <Input
          type="number"
          placeholder="0.0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="text-lg"
          min="0"
          step="0.01"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Raw liquidity units (full-range position)
        </p>
      </div>

      <div className="flex gap-3">
        {showApprove && (
          <Button
            onClick={approve}
            disabled={isApproving || isApprovalConfirming}
            variant="outline"
            className="flex-1"
          >
            {isApproving || isApprovalConfirming ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Approving...
              </>
            ) : isApprovalSuccess ? (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Approved
              </>
            ) : (
              "1. Approve"
            )}
          </Button>
        )}
        <Button
          onClick={handleDeposit}
          disabled={
            parsedAmount <= 0n ||
            showApprove ||
            isDepositing ||
            isDepositConfirming
          }
          className="flex-1"
        >
          {isDepositing || isDepositConfirming ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Depositing...
            </>
          ) : (
            `${showApprove ? "2. " : ""}Deposit into ${trancheLabel}`
          )}
        </Button>
      </div>
    </div>
  )
}
