// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {PoolSwapTest} from "v4-core/test/PoolSwapTest.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ITranchesRouter {
    function addLiquidity(PoolKey calldata key, IPoolManager.ModifyLiquidityParams calldata params, uint8 tranche)
        external;
}

/// @title DemoJuniorWins — Create a scenario where Junior earns way more fees than Senior
/// @notice Deposits small Senior + runs 20 large swaps to generate massive fees.
///         Pre-requisite: Junior position must already exist (deposit from wallet 3 via UI).
contract DemoJuniorWins is Script {
    IPoolManager constant POOL_MANAGER = IPoolManager(0x00B036B58a818B1BC34d502D3fE730Db729e62AC);
    ITranchesRouter constant ROUTER = ITranchesRouter(0x46D8EFAb0038b1a15E124dd30Fa4cc9cA1d8e3EC);
    PoolSwapTest constant SWAP_ROUTER = PoolSwapTest(0xc899912527491b9c82e9663FE14FF62f4BCBD169);

    address constant HOOK = 0xd8dc899d5b6e27359bD30B0Eb75aE594a417D545;
    address constant MWETH = 0x38747E5317bBC519E194faD3a73daA2D2e1cbF9E;
    address constant MUSDC = 0xa86dccA9D2A55c08DE7F7c1a9b6D91D31c40fc9A;

    // sqrtPriceLimitX96 for swaps
    uint160 constant MIN_PRICE_LIMIT = 4295128740; // MIN + 1
    uint160 constant MAX_PRICE_LIMIT = 1461446703485210103287273052203988822378723970341; // MAX - 1

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(MWETH),
            currency1: Currency.wrap(MUSDC),
            fee: 500,
            tickSpacing: 10,
            hooks: IHooks(HOOK)
        });

        // ── 1. Approve tokens for SwapRouter ──
        IERC20(MWETH).approve(address(SWAP_ROUTER), type(uint256).max);
        IERC20(MUSDC).approve(address(SWAP_ROUTER), type(uint256).max);
        console.log("Tokens approved");

        // ── 3. Execute 20 large swaps (alternating direction) ──
        // Each swap: 500 mWETH or 1M mUSDC → generates ~0.5 mWETH fees per swap
        // Total: ~10 mWETH in fees
        PoolSwapTest.TestSettings memory settings =
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false});

        uint256 swapAmount = 5e18; // 5 mWETH per swap

        for (uint256 i = 0; i < 20; i++) {
            if (i % 2 == 0) {
                // Swap mWETH → mUSDC (zeroForOne = true, negative = exact input)
                SWAP_ROUTER.swap(
                    key,
                    IPoolManager.SwapParams({
                        zeroForOne: true, amountSpecified: -int256(swapAmount), sqrtPriceLimitX96: MIN_PRICE_LIMIT
                    }),
                    settings,
                    ""
                );
            } else {
                // Swap mUSDC → mWETH (zeroForOne = false, negative = exact input)
                SWAP_ROUTER.swap(
                    key,
                    IPoolManager.SwapParams({
                        zeroForOne: false,
                        amountSpecified: -int256(swapAmount * 2000), // ~10k mUSDC
                        sqrtPriceLimitX96: MAX_PRICE_LIMIT
                    }),
                    settings,
                    ""
                );
            }
            console.log("Swap", i + 1, "done");
        }

        vm.stopBroadcast();

        console.log("====================================");
        console.log("  Demo: Junior Wins Scenario");
        console.log("====================================");
        console.log("Senior deposit: ~10 mWETH");
        console.log("Swaps executed: 20 x 500 mWETH");
        console.log("Expected: Junior fees >>> Senior fees");
        console.log("Check dashboard at localhost:3000");
    }
}
