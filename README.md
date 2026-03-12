# TrancheFi

**Structured LP Tranches for Uniswap V4**

> UHI8 Hookathon | Asset-Class Specific Liquidity

TrancheFi brings traditional finance tranche mechanics to AMM liquidity. LPs choose their risk profile at deposit time: **Senior** (stable yield, IL protection) or **Junior** (variable yield, absorbs IL first, unlimited upside). One hook, infinite configurations per asset class.

---

## The Problem

50% of Uniswap LPs lose money. Not because the AMM model is broken, but because a pension fund and a degen share the exact same risk. That doesn't make sense.

## The Solution

TrancheFi lets each LP choose their risk profile:

| Tranche | Yield | IL Exposure | Best For |
|---------|-------|-------------|----------|
| **Senior** | Stable (target APY) | Protected (Junior absorbs first) | DAOs, treasuries, conservative capital |
| **Junior** | Variable (excess fees) | First loss | Yield farmers, risk-seeking capital |

This is the same logic that powers $130 trillion in fixed-income tranches, applied to AMM liquidity.

---

## Architecture

```
                    Uniswap V4 Pool
                         │
                   ┌─────┴─────┐
                   │ TranchesHook │  ← Single contract, all logic
                   └─────┬─────┘
                         │
          ┌──────────────┼──────────────┐
          │              │              │
    afterSwap      afterAddLiq    afterRemoveLiq
    (fee waterfall)  (register LP)  (IL adjustment)
          │
    ┌─────┴─────┐
    │  Senior   │  ← Gets paid first (target APY)
    │  Junior   │  ← Gets the rest (unlimited upside)
    └───────────┘

    Reactive Network (cross-chain)
          │
    ┌─────┴──────────┐
    │ VolatilityRSC  │  ← Monitors swaps on ETH/Unichain/Base/Arb
    └─────┬──────────┘
          │ callback
    ┌─────┴───────────────┐
    │ CallbackReceiver    │  ← Adjusts seniorTargetAPY on Unichain
    └─────────────────────┘
```

### Contracts

| Contract | LOC | Purpose |
|----------|-----|---------|
| `TranchesHook.sol` | 793 | Core hook: tranche accounting, fee waterfall, IL adjustment, claimFees() |
| `TranchesRouter.sol` | 79 | Atomic deposit/removal (anti front-run) |
| `TrancheFiCallbackReceiver.sol` | 83 | Receives Reactive Network callbacks on Unichain |
| `TrancheFiVolatilityRSC.sol` | 204 | Cross-chain volatility monitor on Reactive Network |

### Hook Callbacks

| Hook | Function |
|------|----------|
| `afterInitialize` | Configure pool: seniorTargetAPY, maxSeniorRatio |
| `afterAddLiquidity` | Register LP position (Senior/Junior) via hookData |
| `afterSwap` + `ReturnDelta` | Collect tranche fee, distribute via waterfall |
| `afterRemoveLiquidity` + `ReturnDelta` | IL adjustment: Junior absorbs, Senior protected |
| `claimFees()` (external) | Pull-pattern fee claiming, independent of withdrawal |

---

## Fee Waterfall

Each swap, the hook takes a 0.1% tranche fee from swap output:

```
Swap fees come in
       │
       ▼
┌─── Senior owed? ───┐
│  proportional share │
│  × priority boost   │  (e.g., 1.05x for 5% APY)
│  capped at total    │
└────────┬────────────┘
         │
         ▼
   Remainder → Junior
```

**Example** (ETH/USDC pool, $1M TVL, 60/40 Senior/Junior):
- Tranche fee from swap: $100
- Senior gets: ~$63 (proportional share × 1.05 boost)
- Junior gets: ~$37 (the rest — but with unlimited upside on volume)

---

## IL Protection

When an LP removes liquidity, the hook adjusts their payout:

- **Junior removes**: Penalty applied (funds the IL reserve)
- **Senior removes**: Compensation from IL reserve (protected from loss)

```
Price moved since deposit?
       │
  ┌────┴────┐
  No        Yes
  │         │
  Normal    Calculate excess = actual - hold value
  payout    │
            ├── Junior: hookDelta reduces payout (penalty)
            └── Senior: hookDelta increases payout (compensation)
```

Anti-manipulation: IL adjustments capped at 20% (`MAX_IL_BIPS = 2000`) per removal.

---

## Reactive Network Integration

A Reactive Smart Contract monitors Uniswap V4 swap events cross-chain and automatically adjusts risk parameters:

| Volatility Regime | Condition | Senior APY |
|-------------------|-----------|------------|
| Low | vol < 20% annualized | 300 bps (3%) |
| Medium | 20-60% | 500 bps (5%) |
| High | vol > 60% annualized | 1000 bps (10%) |

When the RSC detects a regime change, it emits a callback that reaches the hook via `CallbackReceiver.onVolatilityUpdate()` → `TranchesHook.adjustRiskParameter()`.

---

## Asset-Class Configurations

| Config | Pair | Senior/Junior Ratio | Profile |
|--------|------|---------------------|---------|
| Stablecoin | USDC/USDT | 90/10 | Near-bond. Senior ~2% fixed. |
| Crypto Volatile | ETH/USDC | 50/50 | Balanced risk/return. |
| RWA | RWA/USDC | 95/5 | Maximum protection. Junior as insurance. |

---

## Security

The codebase has undergone **6 rounds of automated security audits** with iterative fixes:

- **AUDIT6 Fix #1**: Use tracked `pos.amount` for IL calculation (not raw `params.liquidityDelta`)
- **AUDIT6 Fix #2**: Fix waterfall dimensional mismatch (L-units vs token wei)
- **AUDIT6 Fix #3**: Add `MAX_IL_BIPS` cap to limit spot-price manipulation profit
- Pre-registration pattern to prevent hookData spoofing
- `MIN_BLOCKS_LOCK = 100` anti-flash-loan protection
- `maxSeniorRatio` cap (80%) prevents extreme leverage
- Same-block proportional split (no priority) prevents flash-loan fee extraction
- Dual-currency reward tracking prevents cross-token accounting errors

---

## Live Deployment (Unichain Sepolia)

All contracts are deployed on **Unichain Sepolia** (Chain ID: `1301`).

### Core Contracts

| Contract | Address |
|----------|---------|
| **TranchesHook** | [`0xd8dc899d5b6e27359bD30B0Eb75aE594a417D545`](https://sepolia.uniscan.xyz/address/0xd8dc899d5b6e27359bD30B0Eb75aE594a417D545) |
| **TranchesRouter** | [`0x46D8EFAb0038b1a15E124dd30Fa4cc9cA1d8e3EC`](https://sepolia.uniscan.xyz/address/0x46D8EFAb0038b1a15E124dd30Fa4cc9cA1d8e3EC) |
| **CallbackReceiver** | [`0x4DE878ECAf2881fBC3f2EC7281a54Fa2D6ee9f55`](https://sepolia.uniscan.xyz/address/0x4DE878ECAf2881fBC3f2EC7281a54Fa2D6ee9f55) |
| **PoolSwapTest** | [`0xc899912527491b9c82e9663FE14FF62f4BCBD169`](https://sepolia.uniscan.xyz/address/0xc899912527491b9c82e9663FE14FF62f4BCBD169) |

### Infrastructure (Uniswap V4)

| Contract | Address |
|----------|---------|
| **PoolManager** | `0x00B036B58a818B1BC34d502D3fE730Db729e62AC` |

### Mock Tokens

| Token | Address | Decimals |
|-------|---------|----------|
| **mWETH** | [`0x38747E5317bBC519E194faD3a73daA2D2e1cbF9E`](https://sepolia.uniscan.xyz/address/0x38747E5317bBC519E194faD3a73daA2D2e1cbF9E) | 18 |
| **mUSDC** | [`0xa86dccA9D2A55c08DE7F7c1a9b6D91D31c40fc9A`](https://sepolia.uniscan.xyz/address/0xa86dccA9D2A55c08DE7F7c1a9b6D91D31c40fc9A) | 18 |

### Pool Configuration

| Parameter | Value |
|-----------|-------|
| **Pair** | mWETH / mUSDC |
| **Fee** | 500 (0.05%) |
| **Tick Spacing** | 10 |
| **Initial Price** | 1 mWETH = 2,000 mUSDC |
| **sqrtPriceX96** | `3543191142285914378072636784640` |
| **LP Range** | Full range (ticks -887270 to +887270) |

---

## Getting Started

### Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- Solidity 0.8.26+

### Build

```bash
git clone --recurse-submodules https://github.com/TrancheFi/tranchesfi.git
cd tranchesfi
forge build
```

### Test

```bash
forge test -vv
```

**79 tests** across 4 test suites:

| Suite | Tests | Coverage |
|-------|-------|----------|
| `TranchesHook.t.sol` | 47 | Core hook: deposits, swaps, waterfall, IL, edge cases |
| `TranchesRouter.t.sol` | 8 | Atomic operations, front-run prevention |
| `TrancheFiCallbackReceiver.t.sol` | 11 | Callback auth, pool key mgmt, APY updates |
| `TrancheFiVolatilityRSC.t.sol` | 13 | Volatility EMA, regime changes, overflow safety |

### Deploy to Unichain Sepolia

```bash
# Set environment
export PRIVATE_KEY=<your-key>
export RPC_URL=https://unichain-sepolia.g.alchemy.com/v2/<api-key>

# Deploy hook, router, and receiver
forge script script/DeployTrancheFi.s.sol --rpc-url $RPC_URL --broadcast

# Initialize pool at 1 ETH = 2000 USDC
forge script script/InitPool2000.s.sol --rpc-url $RPC_URL --broadcast

# Mint test tokens to a wallet
forge script script/MintTo.s.sol --rpc-url $RPC_URL --broadcast
```

### Format

```bash
forge fmt
```

---

## How It Works (For Judges)

1. **LP deposits** as Senior or Junior via `hookData = abi.encode(lpAddress, Tranche.SENIOR)`
2. **Every swap** triggers the waterfall: Senior gets priority fees, Junior gets the rest
3. **LP removes liquidity**: hook adjusts payout via `afterRemoveLiquidityReturnDelta` — Junior absorbs IL, Senior is protected
4. **Fees are claimable** anytime via `claimFees()` (pull pattern, independent of withdrawal)
5. **Reactive Network RSC** monitors volatility cross-chain and auto-adjusts Senior APY

The entire system runs in **a single hook contract** with no external dependencies, no custom tokens, and no oracle requirements.

---

## Tech Stack

- **Uniswap V4** — Hook system with `afterSwapReturnDelta` and `afterRemoveLiquidityReturnDelta`
- **Reactive Network** — Cross-chain event monitoring and automated callbacks
- **Foundry** — Build, test, and deploy toolchain
- **Solidity 0.8.26** — Cancun EVM with `via_ir` compilation

---

## Repository Structure

```
src/
├── TranchesHook.sol              # Core hook (793 LOC)
├── TranchesRouter.sol            # Atomic operations router (79 LOC)
├── TrancheFiCallbackReceiver.sol # Reactive callback bridge (83 LOC)
└── TrancheFiVolatilityRSC.sol    # Cross-chain volatility RSC (204 LOC)

script/
├── DeployTrancheFi.s.sol         # Full deploy: Hook (CREATE2) + Router + Receiver
├── InitPool2000.s.sol            # Initialize mWETH/mUSDC pool at price 2000
├── MintTo.s.sol                  # Mint test tokens to a wallet
├── HookDeployer.sol              # Factory for CREATE2 with DEPLOYER privilege
└── HookMiner.sol                 # CREATE2 salt miner for hook flag bits

test/
├── TranchesHook.t.sol            # 47 tests
├── TranchesRouter.t.sol          # 8 tests
├── TrancheFiCallbackReceiver.t.sol # 11 tests
└── TrancheFiVolatilityRSC.t.sol  # 13 tests
```

---

## License

MIT

---

*Built for UHI8 Hookathon — Asset-Class Specific Liquidity track*
