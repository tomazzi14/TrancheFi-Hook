import { useReadContract } from "wagmi"
import { keccak256, encodePacked } from "viem"
import { POOL_KEY, POOL_MANAGER_ADDRESS } from "@/lib/config/contracts"
import { computePoolId } from "@/lib/utils"

// Uniswap V4 PoolManager storage: mapping(PoolId => Pool.State) at slot 6
const POOLS_SLOT =
  "0x0000000000000000000000000000000000000000000000000000000000000006" as `0x${string}`

// Compute the storage slot for pool's slot0 (first field of Pool.State)
const poolId = computePoolId(POOL_KEY)
const stateSlot = keccak256(
  encodePacked(["bytes32", "bytes32"], [poolId, POOLS_SLOT])
)

// Minimal ABI for PoolManager.extsload
const extsloadAbi = [
  {
    name: "extsload",
    type: "function",
    inputs: [{ type: "bytes32", name: "slot" }],
    outputs: [{ type: "bytes32", name: "value" }],
    stateMutability: "view",
  },
] as const

/**
 * Read the current pool price from PoolManager's slot0 via extsload.
 * Returns the price as "1 mWETH = X mUSDC".
 */
export function usePoolPrice() {
  const { data: slot0Data, ...rest } = useReadContract({
    address: POOL_MANAGER_ADDRESS as `0x${string}`,
    abi: extsloadAbi,
    functionName: "extsload",
    args: [stateSlot],
    query: { refetchInterval: 10_000 },
  })

  let sqrtPriceX96 = 0n
  let price = 0
  let tick = 0

  if (slot0Data) {
    const raw = BigInt(slot0Data)
    // slot0 packing: sqrtPriceX96 (uint160) | tick (int24) | protocolFee | lpFee
    sqrtPriceX96 = raw & ((1n << 160n) - 1n)

    // Extract tick (bits 160-183, signed int24)
    const rawTick = Number((raw >> 160n) & 0xffffffn)
    tick = rawTick >= 0x800000 ? rawTick - 0x1000000 : rawTick

    // price = (sqrtPriceX96 / 2^96)^2 = sqrtPriceX96^2 / 2^192
    // For better precision with large numbers, use intermediate calculation
    if (sqrtPriceX96 > 0n) {
      const sqrtPrice = Number(sqrtPriceX96) / 2 ** 96
      price = sqrtPrice * sqrtPrice
    }
  }

  return {
    sqrtPriceX96,
    price, // 1 token0 (mWETH) = price token1 (mUSDC)
    tick,
    ...rest,
  }
}
