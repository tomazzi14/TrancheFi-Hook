// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {TrancheFiCallbackReceiver} from "../src/TrancheFiCallbackReceiver.sol";
import {TranchesHook} from "../src/TranchesHook.sol";

interface IHookDeployer {
    function configure(TranchesHook hook, address router, address rsc) external;
}

/// @title DeployReactive — Redeploy CallbackReceiver + Reconfigure Hook for Reactive Network
/// @notice Step 1 of Reactive integration:
///         1. Deploy new TrancheFiCallbackReceiver with correct Reactive callback proxy
///         2. Reconfigure Hook via HookDeployer factory to point authorizedRSC to new receiver
///         3. Set the PoolKey on the new receiver
/// @dev Run on Unichain Sepolia (chain 1301)
contract DeployReactive is Script {
    // ─── Existing deployed contracts (Unichain Sepolia) ───
    TranchesHook constant HOOK = TranchesHook(0xd8dc899d5b6e27359bD30B0Eb75aE594a417D545);
    address constant ROUTER = 0x46D8EFAb0038b1a15E124dd30Fa4cc9cA1d8e3EC;
    IHookDeployer constant HOOK_DEPLOYER = IHookDeployer(0xc98Be5f60b51eb2f308701BdB8bf122ee600c6E9);

    // ─── Reactive Network callback proxy on Unichain Sepolia ───
    address constant CALLBACK_PROXY = 0x9299472A6399Fd1027ebF067571Eb3e3D7837FC4;

    // ─── Pool tokens ───
    address constant MWETH = 0x38747E5317bBC519E194faD3a73daA2D2e1cbF9E;
    address constant MUSDC = 0xa86dccA9D2A55c08DE7F7c1a9b6D91D31c40fc9A;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        // ── 1. Deploy new CallbackReceiver with correct proxy ──
        TrancheFiCallbackReceiver receiver = new TrancheFiCallbackReceiver(CALLBACK_PROXY, address(HOOK));
        console.log("New CallbackReceiver deployed:", address(receiver));

        // ── 2. Reconfigure Hook via factory ──
        // configure() sets both trustedRouter and authorizedRSC
        // We pass the existing router so it doesn't change
        HOOK_DEPLOYER.configure(HOOK, ROUTER, address(receiver));
        console.log("Hook reconfigured: authorizedRSC =", address(receiver));

        // ── 3. Set PoolKey on the receiver ──
        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(MWETH),
            currency1: Currency.wrap(MUSDC),
            fee: 500,
            tickSpacing: 10,
            hooks: IHooks(address(HOOK))
        });
        receiver.setPoolKey(key);
        console.log("PoolKey set on receiver");

        vm.stopBroadcast();

        // ── Summary ──
        console.log("====================================");
        console.log("  Reactive Integration (Step 1/2)");
        console.log("====================================");
        console.log("CallbackReceiver:", address(receiver));
        console.log("Callback Proxy:  ", CALLBACK_PROXY);
        console.log("Hook:            ", address(HOOK));
        console.log("Router:          ", ROUTER);
        console.log("");
        console.log("Next: Deploy RSC on Reactive Lasna testnet");
        console.log("  forge create src/TrancheFiVolatilityRSC.sol:TrancheFiVolatilityRSC \\");
        console.log("    --rpc-url https://lasna-rpc.rnk.dev/ \\");
        console.log("    --private-key $REACTIVE_PRIVATE_KEY \\");
        console.log("    --value 0.1ether \\");
        console.log("    --constructor-args 1301", address(receiver));
    }
}
