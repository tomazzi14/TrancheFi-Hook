// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {PoolSwapTest} from "v4-core/test/PoolSwapTest.sol";

/// @title DeploySwapRouter — Deploy PoolSwapTest for testing swaps
/// @notice Run: forge script script/DeploySwapRouter.s.sol --rpc-url $RPC_URL --broadcast
contract DeploySwapRouter is Script {
    IPoolManager constant POOL_MANAGER = IPoolManager(0x00B036B58a818B1BC34d502D3fE730Db729e62AC);

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);

        PoolSwapTest swapRouter = new PoolSwapTest(POOL_MANAGER);
        console.log("PoolSwapTest deployed at:", address(swapRouter));

        vm.stopBroadcast();
    }
}
