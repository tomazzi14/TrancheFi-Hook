import { TranchesHookABI } from "../abis/TranchesHook"
import { TranchesRouterABI } from "../abis/TranchesRouter"
import { PoolSwapTestABI } from "../abis/PoolSwapTest"

// ─── Deployed on Unichain Sepolia (Chain ID 1301) ───
export const TRANCHES_HOOK_ADDRESS =
  "0xd8dc899d5b6e27359bD30B0Eb75aE594a417D545" as const
export const TRANCHES_ROUTER_ADDRESS =
  "0x46D8EFAb0038b1a15E124dd30Fa4cc9cA1d8e3EC" as const
export const CALLBACK_RECEIVER_ADDRESS =
  "0x4DE878ECAf2881fBC3f2EC7281a54Fa2D6ee9f55" as const
export const POOL_MANAGER_ADDRESS =
  "0x00B036B58a818B1BC34d502D3fE730Db729e62AC" as const

// ─── Mock Tokens (Unichain Sepolia) ───
export const MOCK_WETH_ADDRESS =
  "0x38747E5317bBC519E194faD3a73daA2D2e1cbF9E" as const
export const MOCK_USDC_ADDRESS =
  "0xa86dccA9D2A55c08DE7F7c1a9b6D91D31c40fc9A" as const

// ─── Pool Key (mWETH/mUSDC pool, price = 1 ETH ≈ 2000 USDC) ───
export const POOL_KEY = {
  currency0:
    "0x38747E5317bBC519E194faD3a73daA2D2e1cbF9E" as `0x${string}`, // mWETH (sorted lower)
  currency1:
    "0xa86dccA9D2A55c08DE7F7c1a9b6D91D31c40fc9A" as `0x${string}`, // mUSDC (sorted higher)
  fee: 500,
  tickSpacing: 10,
  hooks: TRANCHES_HOOK_ADDRESS as `0x${string}`,
} as const

// Full-range ticks (aligned to tickSpacing=10)
export const DEFAULT_TICK_LOWER = -887270
export const DEFAULT_TICK_UPPER = 887270

// Contract configs for wagmi hooks
export const hookContract = {
  address: TRANCHES_HOOK_ADDRESS,
  abi: TranchesHookABI,
} as const

export const routerContract = {
  address: TRANCHES_ROUTER_ADDRESS,
  abi: TranchesRouterABI,
} as const

// ─── Swap Router (PoolSwapTest) — pool at 1 ETH = 2000 USDC ───
export const SWAP_ROUTER_ADDRESS =
  "0xc899912527491b9c82e9663FE14FF62f4BCBD169" as const

export const swapRouterContract = {
  address: SWAP_ROUTER_ADDRESS,
  abi: PoolSwapTestABI,
} as const

// sqrtPriceLimitX96 boundaries for swaps
export const MIN_SQRT_PRICE_LIMIT = 4295128740n // TickMath.MIN_SQRT_PRICE + 1
export const MAX_SQRT_PRICE_LIMIT =
  1461446703485210103287273052203988822378723970341n // TickMath.MAX_SQRT_PRICE - 1

export const BASIS_POINTS = 10_000n
