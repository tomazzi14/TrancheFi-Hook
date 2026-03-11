// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/types/PoolId.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {PoolSwapTest} from "v4-core/test/PoolSwapTest.sol";
import {StateLibrary} from "v4-core/libraries/StateLibrary.sol";
import {TranchesHook} from "../src/TranchesHook.sol";

/// @title DemoE2E — Full Pipeline Demo (Swaps → Volatility Detection → Regime Change → APY Adjustment)
/// @notice Run on Anvil fork of Unichain Sepolia:
///         anvil --fork-url $UNICHAIN_RPC
///         forge script script/DemoE2E.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
///
/// @dev Simulates the cross-chain Reactive Network flow locally:
///      1. Reads real pool state from deployed contracts on Unichain Sepolia
///      2. Executes volatile swaps against the real pool
///      3. Reproduces the RSC's weighted-price volatility math off-chain
///      4. Triggers adjustRiskParameter when regime changes
///      5. Shows before/after APY
contract DemoE2E is Script {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    // ─── Deployed Contracts (Unichain Sepolia) ───
    IPoolManager constant POOL_MANAGER = IPoolManager(0x00B036B58a818B1BC34d502D3fE730Db729e62AC);
    TranchesHook constant HOOK = TranchesHook(0xd8dc899d5b6e27359bD30B0Eb75aE594a417D545);
    PoolSwapTest constant SWAP_ROUTER = PoolSwapTest(0xc899912527491b9c82e9663FE14FF62f4BCBD169);

    address constant MWETH = 0x38747E5317bBC519E194faD3a73daA2D2e1cbF9E;
    address constant MUSDC = 0xa86dccA9D2A55c08DE7F7c1a9b6D91D31c40fc9A;

    // ─── RSC Constants (reproduced from TrancheFiVolatilityRSC) ───
    uint256 constant EMA_ALPHA = 100;
    uint256 constant EMA_SCALE = 1000;
    uint256 constant LOW_THRESHOLD = 4e14;
    uint256 constant HIGH_THRESHOLD = 36e14;
    uint256 constant LOW_VOL_APY = 300;
    uint256 constant MED_VOL_APY = 500;
    uint256 constant HIGH_VOL_APY = 1000;

    // ─── RSC Simulated State ───
    uint256 priceEthSepolia;
    uint256 priceBaseSepolia;
    uint256 priceUnichainSepolia;
    uint256 lastWeightedPrice;
    uint256 volatilityEMA;
    uint256 observationCount;
    uint8 currentRegime = 1; // MEDIUM

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");

        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(MWETH),
            currency1: Currency.wrap(MUSDC),
            fee: 500,
            tickSpacing: 10,
            hooks: IHooks(address(HOOK))
        });

        // ══════════════════════════════════════════════════════════
        console.log("");
        console.log("================================================================");
        console.log("  TrancheFi E2E Demo: Cross-Chain Volatility -> APY Adjustment");
        console.log("================================================================");
        console.log("");

        // ── 1. Show initial state ──
        (uint256 totalSenior, uint256 totalJunior,,,uint256 seniorAPY,) = HOOK.getPoolStats(key);
        (uint160 sqrtPrice,,,) = POOL_MANAGER.getSlot0(key.toId());

        console.log("[INITIAL STATE]");
        console.log("  Senior APY:         %s bps", seniorAPY);
        console.log("  Regime:             MEDIUM");
        console.log("  Senior Liquidity:   %s", totalSenior);
        console.log("  Junior Liquidity:   %s", totalJunior);
        console.log("  sqrtPriceX96:       %s", uint256(sqrtPrice));
        console.log("");

        // Initialize simulated chain prices at current pool price
        priceEthSepolia = uint256(sqrtPrice);
        priceBaseSepolia = uint256(sqrtPrice);
        priceUnichainSepolia = uint256(sqrtPrice);

        console.log("[MULTI-CHAIN PRICES - Before Swaps]");
        console.log("  Ethereum Sepolia:   %s", priceEthSepolia);
        console.log("  Base Sepolia:       %s", priceBaseSepolia);
        console.log("  Unichain Sepolia:   %s", priceUnichainSepolia);
        console.log("  Weighted Average:   %s", (priceEthSepolia + priceBaseSepolia + priceUnichainSepolia) / 3);
        console.log("");

        // ── 2. Execute volatile swaps ──
        console.log("[EXECUTING VOLATILE SWAPS ON UNICHAIN SEPOLIA]");
        console.log("  (Ethereum & Base remain stable - only Unichain moves)");
        console.log("");

        vm.startBroadcast(pk);

        IPoolManager.SwapParams memory paramsZeroForOne = IPoolManager.SwapParams({
            zeroForOne: true,
            amountSpecified: -20 ether, // sell 20 mWETH
            sqrtPriceLimitX96: 4295128740 // MIN + 1
        });
        IPoolManager.SwapParams memory paramsOneForZero = IPoolManager.SwapParams({
            zeroForOne: false,
            amountSpecified: -40_000 ether, // sell 40000 mUSDC
            sqrtPriceLimitX96: 1461446703485210103287273052203988822378723970341 // MAX - 1
        });
        PoolSwapTest.TestSettings memory settings = PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false});

        for (uint256 i = 0; i < 8; i++) {
            // Sell mWETH → price drops
            SWAP_ROUTER.swap(key, paramsZeroForOne, settings, "");
            (uint160 priceAfterSell,,,) = POOL_MANAGER.getSlot0(key.toId());
            priceUnichainSepolia = uint256(priceAfterSell);
            _processSwapObservation(i * 2 + 1);

            // Buy mWETH back → price recovers
            SWAP_ROUTER.swap(key, paramsOneForZero, settings, "");
            (uint160 priceAfterBuy,,,) = POOL_MANAGER.getSlot0(key.toId());
            priceUnichainSepolia = uint256(priceAfterBuy);
            _processSwapObservation(i * 2 + 2);
        }

        console.log("");
        console.log("[RSC VOLATILITY ANALYSIS]");
        console.log("  Observations:       %s", observationCount);
        console.log("  Volatility EMA:     %s", volatilityEMA);
        console.log("  LOW threshold:      %s", LOW_THRESHOLD);
        console.log("  HIGH threshold:     %s", HIGH_THRESHOLD);

        string memory regimeName;
        uint256 newAPY;
        if (currentRegime == 0) { regimeName = "LOW"; newAPY = LOW_VOL_APY; }
        else if (currentRegime == 1) { regimeName = "MEDIUM"; newAPY = MED_VOL_APY; }
        else { regimeName = "HIGH"; newAPY = HIGH_VOL_APY; }

        console.log("  Detected Regime:    %s", regimeName);
        console.log("");

        // ── 3. Simulate callback if regime changed ──
        if (newAPY != seniorAPY) {
            console.log("[REACTIVE NETWORK CALLBACK]");
            console.log("  Regime changed: MEDIUM -> %s", regimeName);
            console.log("  Sending callback to adjust APY: %s -> %s bps", seniorAPY, newAPY);

            // Simulate the callback: prank as the authorizedRSC (CallbackReceiver)
            address authorizedRSC = HOOK.authorizedRSC();
            vm.stopBroadcast();
            vm.prank(authorizedRSC);
            HOOK.adjustRiskParameter(key, newAPY);
            vm.startBroadcast(pk);

            console.log("  adjustRiskParameter() called successfully!");
        } else {
            console.log("[NO REGIME CHANGE - APY stays at %s bps]", seniorAPY);
        }

        vm.stopBroadcast();

        // ── 4. Show final state ──
        (,,,, uint256 finalAPY,) = HOOK.getPoolStats(key);
        (uint160 finalPrice,,,) = POOL_MANAGER.getSlot0(key.toId());

        console.log("");
        console.log("[FINAL STATE]");
        console.log("  Senior APY:         %s bps", finalAPY);
        console.log("  sqrtPriceX96:       %s", uint256(finalPrice));
        console.log("");
        console.log("================================================================");
        console.log("  Demo Complete!");
        console.log("  Senior APY adjusted from %s to %s bps", seniorAPY, finalAPY);
        console.log("  Reactive Network protects Seniors BEFORE volatility propagates");
        console.log("================================================================");
    }

    // ─── RSC Logic Reproduction ───

    function _processSwapObservation(uint256 swapNum) internal {
        // Compute weighted average (Eth + Base stable, Unichain volatile)
        uint256 weightedPrice = (priceEthSepolia + priceBaseSepolia + priceUnichainSepolia) / 3;

        if (lastWeightedPrice > 0) {
            uint256 squaredReturn = _computeSquaredReturn(lastWeightedPrice, weightedPrice);
            volatilityEMA = (EMA_ALPHA * squaredReturn + (EMA_SCALE - EMA_ALPHA) * volatilityEMA) / EMA_SCALE;
            observationCount++;

            if (observationCount >= 5) {
                _checkRegimeChange();
            }

            // Log every 4th swap to keep output manageable
            if (swapNum % 4 == 0) {
                console.log("  Swap #%s | Weighted: %s | EMA: %s", swapNum, weightedPrice, volatilityEMA);
            }
        }

        lastWeightedPrice = weightedPrice;
    }

    function _computeSquaredReturn(uint256 oldPrice, uint256 newPrice) internal pure returns (uint256) {
        uint256 diff = newPrice >= oldPrice ? newPrice - oldPrice : oldPrice - newPrice;
        uint256 change;
        if (diff > type(uint128).max) {
            change = (diff / oldPrice) * 2 * 1e18;
        } else {
            change = (diff * 2 * 1e18) / oldPrice;
        }
        uint256 MAX_CHANGE = 1e30;
        if (change > MAX_CHANGE) change = MAX_CHANGE;
        return (change * change) / 1e18;
    }

    function _checkRegimeChange() internal {
        uint8 newRegime;
        if (volatilityEMA < LOW_THRESHOLD) {
            newRegime = 0; // LOW
        } else if (volatilityEMA > HIGH_THRESHOLD) {
            newRegime = 2; // HIGH
        } else {
            newRegime = 1; // MEDIUM
        }
        currentRegime = newRegime;
    }
}
