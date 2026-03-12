// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {TrancheFiVolatilityRSC} from "../src/TrancheFiVolatilityRSC.sol";

/// @title DeployRSC — Deploy Volatility RSC on Reactive Lasna Testnet
/// @notice Step 2 of Reactive integration:
///         Deploys TrancheFiVolatilityRSC on Reactive Lasna (chain 5318007)
///         subscribing to Swap events on 3 testnet chains:
///           - Ethereum Sepolia (11155111)
///           - Base Sepolia (84532)
///           - Unichain Sepolia (1301)
///         Callbacks target the CallbackReceiver on Unichain Sepolia.
/// @dev Run on Reactive Lasna testnet: forge script script/DeployRSC.s.sol --rpc-url https://lasna-rpc.rnk.dev/ --broadcast
contract DeployRSC is Script {
    // ─── Reactive Network system contract ───
    address constant SYSTEM_CONTRACT_ADDR = 0x0000000000000000000000000000000000fffFfF;

    // ─── Destination: Unichain Sepolia ───
    uint256 constant DESTINATION_CHAIN_ID = 1301;

    // ─── Callback receiver on Unichain Sepolia (set after running DeployReactive.s.sol) ───
    // UPDATE THIS after deploying the new CallbackReceiver!
    address constant CALLBACK_RECEIVER = 0x4A29aE1233877EdEC3dB20db8aBF85816F9D75Cf;

    // ─── Monitored chains + PoolManagers ───
    // Ethereum Sepolia PoolManager (Uniswap V4)
    uint256 constant ETH_SEPOLIA = 11155111;
    address constant PM_ETH_SEPOLIA = 0xE03A1074c86CFeDd5C142C4F04F1a1536e203543;

    // Base Sepolia PoolManager (Uniswap V4)
    uint256 constant BASE_SEPOLIA = 84532;
    address constant PM_BASE_SEPOLIA = 0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408;

    // Unichain Sepolia PoolManager (our deployment)
    uint256 constant UNICHAIN_SEPOLIA = 1301;
    address constant PM_UNICHAIN_SEPOLIA = 0x00B036B58a818B1BC34d502D3fE730Db729e62AC;

    function run() external {
        require(CALLBACK_RECEIVER != address(0), "Set CALLBACK_RECEIVER address first!");

        uint256 deployerKey = vm.envUint("REACTIVE_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        // Build arrays for multi-chain subscription
        uint256[] memory chainIds = new uint256[](3);
        chainIds[0] = ETH_SEPOLIA;
        chainIds[1] = BASE_SEPOLIA;
        chainIds[2] = UNICHAIN_SEPOLIA;

        address[] memory poolManagers = new address[](3);
        poolManagers[0] = PM_ETH_SEPOLIA;
        poolManagers[1] = PM_BASE_SEPOLIA;
        poolManagers[2] = PM_UNICHAIN_SEPOLIA;

        // Deploy RSC with value to fund subscriptions
        TrancheFiVolatilityRSC rsc = new TrancheFiVolatilityRSC{value: 0.1 ether}(
            SYSTEM_CONTRACT_ADDR, DESTINATION_CHAIN_ID, CALLBACK_RECEIVER, chainIds, poolManagers
        );

        console.log("====================================");
        console.log("  RSC Deployed on Reactive Lasna");
        console.log("====================================");
        console.log("RSC address:      ", address(rsc));
        console.log("Destination chain: 1301 (Unichain Sepolia)");
        console.log("Callback receiver:", CALLBACK_RECEIVER);
        console.log("Monitoring chains:");
        console.log("  - Ethereum Sepolia (11155111):", PM_ETH_SEPOLIA);
        console.log("  - Base Sepolia (84532):       ", PM_BASE_SEPOLIA);
        console.log("  - Unichain Sepolia (1301):    ", PM_UNICHAIN_SEPOLIA);

        vm.stopBroadcast();
    }
}
