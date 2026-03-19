import { TranchesHookABI } from "../abis/TranchesHook"
import { TranchesRouterABI } from "../abis/TranchesRouter"
import { PoolSwapTestABI } from "../abis/PoolSwapTest"

// ─── Deployed on Unichain Sepolia (Chain ID 1301) ───
// Redeployed with Aqua0 shared tokens for cross-protocol liquidity
export const TRANCHES_HOOK_ADDRESS =
  "0x14a3324f394B9972D35B739CDa511d90c15BD545" as const
export const TRANCHES_ROUTER_ADDRESS =
  "0xDafC18cdB29245383854F730a25A2f09cfEBEe6E" as const
export const CALLBACK_RECEIVER_ADDRESS =
  "0x2CEe87cA5c2F01D381FEcf05290f32890C8Af3f3" as const
export const POOL_MANAGER_ADDRESS =
  "0x00B036B58a818B1BC34d502D3fE730Db729e62AC" as const

// ─── Aqua0 Shared Tokens (Unichain Sepolia) ───
export const MOCK_WETH_ADDRESS =
  "0x7fF28651365c735c22960E27C2aFA97AbE4Cf2Ad" as const
export const MOCK_USDC_ADDRESS =
  "0x73c56ddD816e356387Caf740c804bb9D379BE47E" as const

// ─── Pool Key (mUSDC/mWETH pool, price = 1 ETH ≈ 2000 USDC) ───
// Note: mUSDC is currency0 (lower address), mWETH is currency1 (higher address)
export const POOL_KEY = {
  currency0:
    "0x73c56ddD816e356387Caf740c804bb9D379BE47E" as `0x${string}`, // mUSDC (sorted lower)
  currency1:
    "0x7fF28651365c735c22960E27C2aFA97AbE4Cf2Ad" as `0x${string}`, // mWETH (sorted higher)
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
  "0x1c80ffb9C87f8305d8FE24242c9A826ED8997FDc" as const

export const swapRouterContract = {
  address: SWAP_ROUTER_ADDRESS,
  abi: PoolSwapTestABI,
} as const

// sqrtPriceLimitX96 boundaries for swaps
export const MIN_SQRT_PRICE_LIMIT = 4295128740n // TickMath.MIN_SQRT_PRICE + 1
export const MAX_SQRT_PRICE_LIMIT =
  1461446703485210103287273052203988822378723970341n // TickMath.MAX_SQRT_PRICE - 1

export const BASIS_POINTS = 10_000n
