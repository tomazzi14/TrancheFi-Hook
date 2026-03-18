// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";

/// @title DeployMockTokens — Deploy mock USDC & WETH, mint, and initialize a pool
/// @notice Run: forge script script/DeployMockTokens.s.sol --rpc-url $RPC_URL --broadcast
contract DeployMockTokens is Script {
    IPoolManager constant POOL_MANAGER = IPoolManager(0x00B036B58a818B1BC34d502D3fE730Db729e62AC);
    address constant HOOK = 0x170dbC0d3c29487584475afC7D40c4F513051FC5;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);

        // Deploy mock tokens
        MockERC20 mockWETH = new MockERC20("Mock WETH", "mWETH", 18);
        MockERC20 mockUSDC = new MockERC20("Mock USDC", "mUSDC", 6);

        console.log("Mock WETH:", address(mockWETH));
        console.log("Mock USDC:", address(mockUSDC));

        // Mint to deployer (1000 of each)
        mockWETH.mint(deployer, 1000 ether);
        mockUSDC.mint(deployer, 1_000_000 * 1e6); // 1M USDC

        console.log("Minted 1000 mWETH and 1,000,000 mUSDC to", deployer);

        // Sort tokens — Uniswap V4 requires currency0 < currency1
        address token0;
        address token1;
        if (address(mockWETH) < address(mockUSDC)) {
            token0 = address(mockWETH);
            token1 = address(mockUSDC);
        } else {
            token0 = address(mockUSDC);
            token1 = address(mockWETH);
        }

        console.log("currency0 (sorted):", token0);
        console.log("currency1 (sorted):", token1);

        // Initialize pool on PoolManager
        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(token0),
            currency1: Currency.wrap(token1),
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(HOOK)
        });

        // sqrtPriceX96 for 1:1 price = 2^96 ≈ 79228162514264337593543950336
        // For mWETH/mUSDC with different decimals, adjust if needed
        // Using 1:1 for simplicity in testing
        uint160 sqrtPriceX96 = 79228162514264337593543950336;

        POOL_MANAGER.initialize(key, sqrtPriceX96);
        console.log("Pool initialized!");

        console.log("");
        console.log("=== UPDATE frontend/lib/config/contracts.ts with: ===");
        console.log("currency0:", token0);
        console.log("currency1:", token1);

        vm.stopBroadcast();
    }
}
