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

// ─── Liquidity ↔ Token Amount Conversion (Uniswap V4 full-range) ───
// For full-range positions, the formulas simplify to:
//   amount0 ≈ L * Q96 / sqrtPriceX96          (token0 = mWETH)
//   amount1 ≈ L * sqrtPriceX96 / Q96          (token1 = mUSDC)

const Q96 = 1n << 96n // 2^96

/**
 * Convert liquidity units (L) to approximate token amounts for a full-range position.
 * Returns amounts in wei (18 decimals).
 */
export function liquidityToAmounts(
  liquidity: bigint,
  sqrtPriceX96: bigint
): { amount0: bigint; amount1: bigint } {
  if (sqrtPriceX96 === 0n) return { amount0: 0n, amount1: 0n }
  const amount0 = (liquidity * Q96) / sqrtPriceX96
  const amount1 = (liquidity * sqrtPriceX96) / Q96
  return { amount0, amount1 }
}

/**
 * Convert a token0 (mWETH) amount back to liquidity units for a full-range position.
 */
export function amount0ToLiquidity(
  amount0: bigint,
  sqrtPriceX96: bigint
): bigint {
  if (sqrtPriceX96 === 0n) return 0n
  return (amount0 * sqrtPriceX96) / Q96
}

/**
 * Convert a token1 (mUSDC) amount back to liquidity units for a full-range position.
 */
export function amount1ToLiquidity(
  amount1: bigint,
  sqrtPriceX96: bigint
): bigint {
  if (sqrtPriceX96 === 0n) return 0n
  return (amount1 * Q96) / sqrtPriceX96
}
