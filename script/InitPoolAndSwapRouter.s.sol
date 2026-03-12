// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {PoolSwapTest} from "v4-core/test/PoolSwapTest.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title InitPoolAndSwapRouter — Initialize pool on new hook + deploy PoolSwapTest
contract InitPoolAndSwapRouter is Script {
    IPoolManager constant POOL_MANAGER = IPoolManager(0x00B036B58a818B1BC34d502D3fE730Db729e62AC);

    // New hook address (redeployed with correct flag bits)
    address constant HOOK = 0xDB66A15eC7e60c4d5EaA423E54B1802Bc3e19545;

    // Existing mock tokens (already deployed)
    address constant MWETH = 0x38747E5317bBC519E194faD3a73daA2D2e1cbF9E; // currency0 (lower)
    address constant MUSDC = 0xa86dccA9D2A55c08DE7F7c1a9b6D91D31c40fc9A; // currency1 (higher)

    // 1:1 sqrtPriceX96 (for simplicity — real price set by market)
    uint160 constant SQRT_PRICE_1_1 = 79228162514264337593543950336;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        // ── 1. Initialize pool on new hook ──
        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(MWETH),
            currency1: Currency.wrap(MUSDC),
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(HOOK)
        });

        POOL_MANAGER.initialize(key, SQRT_PRICE_1_1);
        console.log("Pool initialized on new hook");

        // ── 2. Deploy PoolSwapTest (swap router) ──
        PoolSwapTest swapRouter = new PoolSwapTest(POOL_MANAGER);
        console.log("PoolSwapTest deployed:", address(swapRouter));

        // ── 3. Approve tokens for the new TranchesRouter ──
        address router = 0x7DaBae9b6EE93a39EC894Ba220f1BEf85Afc3Ef4;
        IERC20(MWETH).approve(router, type(uint256).max);
        IERC20(MUSDC).approve(router, type(uint256).max);
        console.log("Tokens approved for TranchesRouter");

        // ── 4. Approve tokens for PoolSwapTest ──
        IERC20(MWETH).approve(address(swapRouter), type(uint256).max);
        IERC20(MUSDC).approve(address(swapRouter), type(uint256).max);
        console.log("Tokens approved for PoolSwapTest");

        vm.stopBroadcast();

        console.log("====================================");
        console.log("  Pool Init + Swap Router Complete");
        console.log("====================================");
        console.log("Hook:        ", HOOK);
        console.log("SwapRouter:  ", address(swapRouter));
        console.log("Router:      ", router);
    }
}
