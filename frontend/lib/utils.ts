import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { keccak256, encodeAbiParameters, encodePacked } from "viem"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Compute PoolId from PoolKey (matches Solidity PoolIdLibrary.toId)
export function computePoolId(key: {
  currency0: `0x${string}`
  currency1: `0x${string}`
  fee: number
  tickSpacing: number
  hooks: `0x${string}`
}): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [
        {
          type: "tuple",
          components: [
            { type: "address", name: "currency0" },
            { type: "address", name: "currency1" },
            { type: "uint24", name: "fee" },
            { type: "int24", name: "tickSpacing" },
            { type: "address", name: "hooks" },
          ],
        },
      ],
      [
        {
          currency0: key.currency0,
          currency1: key.currency1,
          fee: key.fee,
          tickSpacing: key.tickSpacing,
          hooks: key.hooks,
        },
      ]
    )
  )
}

// Compute position key (matches Solidity _positionKey)
export function computePositionKey(
  lp: `0x${string}`,
  poolId: `0x${string}`
): `0x${string}` {
  return keccak256(encodePacked(["address", "bytes32"], [lp, poolId]))
}

// Format basis points to percentage string
export function formatBps(bps: bigint | number): string {
  const val = typeof bps === "bigint" ? Number(bps) : bps
  return (val / 100).toFixed(2) + "%"
}

// Format wei to human-readable ETH
export function formatEth(wei: bigint, decimals = 4): string {
  const eth = Number(wei) / 1e18
  return eth.toFixed(decimals)
}
