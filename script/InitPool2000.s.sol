// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {PoolSwapTest} from "v4-core/test/PoolSwapTest.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title InitPool2000 — Initialize a new mWETH/mUSDC pool at price 1 ETH = 2000 USDC
/// @notice Uses fee=500, tickSpacing=10 to create a new pool key (different from the 1:1 pool).
///         sqrtPriceX96 = sqrt(2000) * 2^96 ≈ 3543191142285914378072636784640
contract InitPool2000 is Script {
    IPoolManager constant POOL_MANAGER = IPoolManager(0x00B036B58a818B1BC34d502D3fE730Db729e62AC);

    // Freshly deployed hook + router (with Aqua0 tokens)
    address constant HOOK = 0x14a3324f394B9972D35B739CDa511d90c15BD545;
    address constant ROUTER = 0xDafC18cdB29245383854F730a25A2f09cfEBEe6E;

    // Aqua0 shared tokens (Unichain Sepolia)
    address constant MUSDC = 0x73c56ddD816e356387Caf740c804bb9D379BE47E; // currency0 (lower address)
    address constant MWETH = 0x7fF28651365c735c22960E27C2aFA97AbE4Cf2Ad; // currency1 (higher address)

    // sqrtPriceX96 for price = 1/2000 (currency1/currency0 = mWETH/mUSDC = 0.0005)
    // With mUSDC as currency0: sqrt(1/2000) * 2^96 = 1771595571142957112070504448
    // Means 1 mWETH = 2000 mUSDC ✓
    uint160 constant SQRT_PRICE_2000 = 1771595571142957112070504448;

    // Wallets to approve
    address constant WALLET_1 = 0x5ba6C6F599C74476d335B7Ad34C97F9c842e8734;
    address constant WALLET_2 = 0x7AfFcabDE731e98096DC71f6Fc882fCCB20d8c53;
    address constant WALLET_3 = 0x15794065BCAB506399A6891FDD51B9Ee96270a31;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        // ── 1. Initialize NEW pool with fee=500, tickSpacing=10, price=2000 ──
        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(MUSDC),  // lower address = currency0
            currency1: Currency.wrap(MWETH),  // higher address = currency1
            fee: 500,
            tickSpacing: 10,
            hooks: IHooks(HOOK)
        });

        POOL_MANAGER.initialize(key, SQRT_PRICE_2000);
        console.log("Pool initialized at price 2000 (fee=500, tickSpacing=10)");

        // ── 2. Deploy new PoolSwapTest (swap router) ──
        PoolSwapTest swapRouter = new PoolSwapTest(POOL_MANAGER);
        console.log("PoolSwapTest deployed:", address(swapRouter));

        // ── 3. Approve tokens for TranchesRouter ──
        IERC20(MWETH).approve(ROUTER, type(uint256).max);
        IERC20(MUSDC).approve(ROUTER, type(uint256).max);
        console.log("Tokens approved for TranchesRouter");

        // ── 4. Approve tokens for new PoolSwapTest ──
        IERC20(MWETH).approve(address(swapRouter), type(uint256).max);
        IERC20(MUSDC).approve(address(swapRouter), type(uint256).max);
        console.log("Tokens approved for PoolSwapTest");

        vm.stopBroadcast();

        // ── Summary ──
        console.log("====================================");
        console.log("  Pool 2000 Init Complete");
        console.log("====================================");
        console.log("Hook:         ", HOOK);
        console.log("SwapRouter:   ", address(swapRouter));
        console.log("Router:       ", ROUTER);
        console.log("Fee:           500");
        console.log("TickSpacing:   10");
        console.log("Price:         1 mWETH = 2000 mUSDC");
    }
}
