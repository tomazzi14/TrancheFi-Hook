// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {TranchesHook} from "../src/TranchesHook.sol";
import {TranchesRouter} from "../src/TranchesRouter.sol";
import {TrancheFiCallbackReceiver} from "../src/TrancheFiCallbackReceiver.sol";
import {HookMiner} from "./HookMiner.sol";

/// @title DeployTrancheFi — Unichain Sepolia deployment script
/// @notice Deploys TranchesHook (via CREATE2), TranchesRouter, and TrancheFiCallbackReceiver.
///         Then wires them together (setTrustedRouter, setAuthorizedRSC).
contract DeployTrancheFi is Script {
    // ─── Unichain Sepolia constants ───
    IPoolManager constant POOL_MANAGER = IPoolManager(0x00B036B58a818B1BC34d502D3fE730Db729e62AC);

    // Reactive Network callback proxy on Unichain (placeholder — update when available)
    address constant CALLBACK_PROXY = address(0xDEAD);

    // Deterministic CREATE2 deployer (Arachnid's factory, same on all EVM chains)
    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

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

        // ── 1. Mine CREATE2 salt for hook address ──
        // Use the deterministic CREATE2 factory as deployer for address computation
        bytes memory creationCode = abi.encodePacked(type(TranchesHook).creationCode, abi.encode(POOL_MANAGER));

        (uint256 salt, address expectedHook) = HookMiner.find(CREATE2_DEPLOYER, HOOK_FLAGS, creationCode, 10_000);

        console.log("CREATE2 salt found:", salt);
        console.log("Expected hook addr:", expectedHook);

        // ── 2. Deploy TranchesHook via CREATE2 factory ──
        // Arachnid's factory takes: salt (32 bytes) ++ initCode as calldata
        bytes memory payload = abi.encodePacked(bytes32(salt), creationCode);
        (bool success,) = CREATE2_DEPLOYER.call(payload);
        require(success, "CREATE2 deploy failed");

        TranchesHook hook = TranchesHook(expectedHook);
        // Verify the hook has code (deployment succeeded)
        require(address(hook).code.length > 0, "Hook not deployed");
        console.log("TranchesHook deployed:", address(hook));

        // ── 3. Deploy TranchesRouter ──
        TranchesRouter router = new TranchesRouter(POOL_MANAGER, hook);
        console.log("TranchesRouter deployed:", address(router));

        // ── 4. Deploy TrancheFiCallbackReceiver ──
        TrancheFiCallbackReceiver receiver = new TrancheFiCallbackReceiver(CALLBACK_PROXY, address(hook));
        console.log("TrancheFiCallbackReceiver deployed:", address(receiver));

        // ── 5. Wire contracts together ──
        hook.setTrustedRouter(address(router));
        console.log("TrustedRouter set on hook");

        hook.setAuthorizedRSC(address(receiver));
        console.log("AuthorizedRSC set on hook");

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
