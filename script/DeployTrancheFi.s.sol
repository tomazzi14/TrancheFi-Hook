// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {TranchesHook} from "../src/TranchesHook.sol";
import {TranchesRouter} from "../src/TranchesRouter.sol";
import {TrancheFiCallbackReceiver} from "../src/TrancheFiCallbackReceiver.sol";
import {HookMiner} from "./HookMiner.sol";
import {HookDeployer} from "./HookDeployer.sol";

/// @title DeployTrancheFi — Unichain Sepolia deployment script
/// @notice Deploys TranchesHook (via CREATE2 through a custom factory that retains
///         DEPLOYER privilege), TranchesRouter, and TrancheFiCallbackReceiver.
///         Then wires them together via the factory's configure().
contract DeployTrancheFi is Script {
    // ─── Unichain Sepolia constants ───
    IPoolManager constant POOL_MANAGER = IPoolManager(0x00B036B58a818B1BC34d502D3fE730Db729e62AC);

    // Reactive Network callback proxy on Unichain (placeholder — update when available)
    address constant CALLBACK_PROXY = address(0xDEAD);

    // Hook flags: afterInitialize | afterAddLiquidity | afterRemoveLiquidity |
    //             afterSwap | afterSwapReturnsDelta | afterRemoveLiquidityReturnsDelta
    uint160 constant HOOK_FLAGS = uint160(
        Hooks.AFTER_INITIALIZE_FLAG | Hooks.AFTER_ADD_LIQUIDITY_FLAG | Hooks.AFTER_REMOVE_LIQUIDITY_FLAG
            | Hooks.AFTER_SWAP_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG
            | Hooks.AFTER_REMOVE_LIQUIDITY_RETURNS_DELTA_FLAG
    );

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerKey);

        // ── 1. Deploy HookDeployer factory ──
        // This factory becomes the hook's DEPLOYER and can call admin functions later.
        HookDeployer factory = new HookDeployer();
        console.log("HookDeployer factory:", address(factory));

        // ── 2. Mine CREATE2 salt for hook address ──
        bytes memory creationCode = abi.encodePacked(type(TranchesHook).creationCode, abi.encode(POOL_MANAGER));

        (uint256 salt, address expectedHook) = HookMiner.find(address(factory), HOOK_FLAGS, creationCode, 10_000);

        console.log("CREATE2 salt found:", salt);
        console.log("Expected hook addr:", expectedHook);

        // ── 3. Deploy TranchesHook via factory's CREATE2 ──
        address hookAddr = factory.deploy(creationCode, salt);
        require(hookAddr == expectedHook, "Address mismatch");
        TranchesHook hook = TranchesHook(hookAddr);
        console.log("TranchesHook deployed:", address(hook));

        // ── 4. Deploy TranchesRouter ──
        TranchesRouter router = new TranchesRouter(POOL_MANAGER, hook);
        console.log("TranchesRouter deployed:", address(router));

        // ── 5. Deploy TrancheFiCallbackReceiver ──
        TrancheFiCallbackReceiver receiver = new TrancheFiCallbackReceiver(CALLBACK_PROXY, address(hook));
        console.log("TrancheFiCallbackReceiver deployed:", address(receiver));

        // ── 6. Wire contracts together (factory is the hook's DEPLOYER) ──
        factory.configure(hook, address(router), address(receiver));
        console.log("Hook configured: trustedRouter + authorizedRSC set");

        vm.stopBroadcast();

        // ── Summary ──
        console.log("====================================");
        console.log("  TrancheFi Deployment Complete");
        console.log("====================================");
        console.log("Hook:     ", address(hook));
        console.log("Router:   ", address(router));
        console.log("Receiver: ", address(receiver));
        console.log("PoolManager:", address(POOL_MANAGER));
    }
}
