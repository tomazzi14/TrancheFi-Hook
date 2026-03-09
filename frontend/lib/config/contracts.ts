import { TranchesHookABI } from "../abis/TranchesHook"
import { TranchesRouterABI } from "../abis/TranchesRouter"

// ─── Deployed on Unichain Sepolia (Chain ID 1301) ───
export const TRANCHES_HOOK_ADDRESS =
  "0x170dbc0d3c29487584475afc7d40c4f513051fc5" as const
export const TRANCHES_ROUTER_ADDRESS =
  "0x632880356EeB55DbAd4255351450b5ac7e6CB38B" as const
export const CALLBACK_RECEIVER_ADDRESS =
  "0x9A92277f1B7dF2E51E3195B3eD5d0CFf3702E2DF" as const
export const POOL_MANAGER_ADDRESS =
  "0x00B036B58a818B1BC34d502D3fE730Db729e62AC" as const

// ─── Mock Tokens (Unichain Sepolia) ───
export const MOCK_WETH_ADDRESS =
  "0x38747E5317bBC519E194faD3a73daA2D2e1cbF9E" as const
export const MOCK_USDC_ADDRESS =
  "0xa86dccA9D2A55c08DE7F7c1a9b6D91D31c40fc9A" as const

// ─── Pool Key (mWETH/mUSDC pool, initialized on Unichain Sepolia) ───
export const POOL_KEY = {
  currency0:
    "0x38747E5317bBC519E194faD3a73daA2D2e1cbF9E" as `0x${string}`, // mWETH (sorted lower)
  currency1:
    "0xa86dccA9D2A55c08DE7F7c1a9b6D91D31c40fc9A" as `0x${string}`, // mUSDC (sorted higher)
  fee: 3000,
  tickSpacing: 60,
  hooks: TRANCHES_HOOK_ADDRESS as `0x${string}`,
} as const

// Full-range ticks (aligned to tickSpacing=60)
export const DEFAULT_TICK_LOWER = -887220
export const DEFAULT_TICK_UPPER = 887220

// Contract configs for wagmi hooks
export const hookContract = {
  address: TRANCHES_HOOK_ADDRESS,
  abi: TranchesHookABI,
} as const

export const routerContract = {
  address: TRANCHES_ROUTER_ADDRESS,
  abi: TranchesRouterABI,
} as const

export const BASIS_POINTS = 10_000n
