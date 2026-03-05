// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Deployers} from "v4-core-test/utils/Deployers.sol";
import {TranchesHook} from "../src/TranchesHook.sol";
import {TrancheFiCallbackReceiver, ITranchesHook} from "../src/TrancheFiCallbackReceiver.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/types/PoolId.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {Currency} from "v4-core/types/Currency.sol";

contract TrancheFiCallbackReceiverTest is Test, Deployers {
    using PoolIdLibrary for PoolKey;

    TranchesHook hook;
    TrancheFiCallbackReceiver receiver;
    PoolKey poolKey;
    PoolId poolId;

    address callbackProxy = makeAddr("callbackProxy");
    address deployer;
    address attacker = makeAddr("attacker");

    function setUp() public {
        deployer = address(this);

        // Deploy manager + routers + test tokens
        deployFreshManagerAndRouters();
        deployMintAndApprove2Currencies();

        // Deploy hook at correct address with flags
        uint160 flags = uint160(
            Hooks.AFTER_INITIALIZE_FLAG | Hooks.AFTER_ADD_LIQUIDITY_FLAG | Hooks.AFTER_SWAP_FLAG
                | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG | Hooks.AFTER_REMOVE_LIQUIDITY_FLAG
                | Hooks.AFTER_REMOVE_LIQUIDITY_RETURNS_DELTA_FLAG
        );
        address hookAddr = address(flags);
        TranchesHook impl = new TranchesHook(manager);
        vm.etch(hookAddr, address(impl).code);
        hook = TranchesHook(hookAddr);

        // Initialize pool
        (poolKey,) = initPool(currency0, currency1, IHooks(hookAddr), 3000, SQRT_PRICE_1_1);
        poolId = poolKey.toId();

        // Deploy callback receiver
        receiver = new TrancheFiCallbackReceiver(callbackProxy, address(hook));

        // Set callback receiver as the authorized RSC in the hook
        hook.setAuthorizedRSC(address(receiver));

        // Set pool key
        receiver.setPoolKey(poolKey);
    }

    // ============ Deployment Tests ============

    function test_receiverDeployed() public view {
        assertEq(address(receiver.hook()), address(hook), "Hook address set");
        assertEq(receiver.deployer(), deployer, "Deployer set");
        assertTrue(receiver.poolKeySet(), "Pool key is set");
    }

    function test_hookRecognizesReceiver() public view {
        // The hook's authorizedRSC should be the receiver
        assertEq(hook.authorizedRSC(), address(receiver), "Receiver is authorized RSC");
    }

    // ============ setPoolKey Tests ============

    function test_setPoolKey_onlyDeployer() public {
        // Deploy a new receiver to test setPoolKey access control
        TrancheFiCallbackReceiver newReceiver = new TrancheFiCallbackReceiver(callbackProxy, address(hook));

        // Attacker cannot set pool key
        vm.prank(attacker);
        vm.expectRevert(TrancheFiCallbackReceiver.OnlyDeployer.selector);
        newReceiver.setPoolKey(poolKey);
    }

    function test_setPoolKey_success() public {
        TrancheFiCallbackReceiver newReceiver = new TrancheFiCallbackReceiver(callbackProxy, address(hook));
        assertFalse(newReceiver.poolKeySet(), "Pool key not set initially");

        newReceiver.setPoolKey(poolKey);
        assertTrue(newReceiver.poolKeySet(), "Pool key set after call");
    }

    // ============ Callback Tests ============

    function test_onVolatilityUpdate_success() public {
        // Simulate callback from the proxy (which is the authorized sender)
        // The rvm_id is set to address(this) since that's what deployed the receiver (msg.sender in constructor)
        address rvmId = address(this); // deployer = msg.sender at construction time = rvm_id

        uint256 newAPY = 800; // 8%

        vm.prank(callbackProxy);
        receiver.onVolatilityUpdate(rvmId, newAPY);

        // Verify the hook's seniorTargetAPY was updated
        (,,,, uint256 seniorAPY,) = hook.getPoolStats(poolKey);
        assertEq(seniorAPY, 800, "Senior APY updated to 800 bps");
    }

    function test_onVolatilityUpdate_multipleUpdates() public {
        address rvmId = address(this);

        // First update: increase to 1000 bps (10%)
        vm.prank(callbackProxy);
        receiver.onVolatilityUpdate(rvmId, 1000);
        (,,,, uint256 seniorAPY,) = hook.getPoolStats(poolKey);
        assertEq(seniorAPY, 1000, "APY updated to 1000");

        // Second update: decrease to 200 bps (2%)
        vm.prank(callbackProxy);
        receiver.onVolatilityUpdate(rvmId, 200);
        (,,,, uint256 seniorAPY2,) = hook.getPoolStats(poolKey);
        assertEq(seniorAPY2, 200, "APY updated to 200");
    }

    function test_onVolatilityUpdate_emitsEvent() public {
        address rvmId = address(this);
        uint256 newAPY = 750;

        vm.prank(callbackProxy);
        vm.expectEmit(true, false, false, true);
        emit TrancheFiCallbackReceiver.VolatilityCallbackReceived(rvmId, newAPY);
        receiver.onVolatilityUpdate(rvmId, newAPY);
    }

    // ============ Access Control Tests ============

    function test_onVolatilityUpdate_revertUnauthorizedSender() public {
        address rvmId = address(this);

        // Attacker (not the callback proxy) tries to call
        vm.prank(attacker);
        vm.expectRevert("Authorized sender only");
        receiver.onVolatilityUpdate(rvmId, 999);
    }

    function test_onVolatilityUpdate_revertWrongRvmId() public {
        // Call from authorized proxy but with wrong RVM ID
        address wrongRvmId = makeAddr("wrongRvm");

        vm.prank(callbackProxy);
        vm.expectRevert("Authorized RVM ID only");
        receiver.onVolatilityUpdate(wrongRvmId, 999);
    }

    function test_onVolatilityUpdate_revertPoolKeyNotSet() public {
        // Deploy a new receiver WITHOUT setting pool key
        TrancheFiCallbackReceiver newReceiver = new TrancheFiCallbackReceiver(callbackProxy, address(hook));
        hook.setAuthorizedRSC(address(newReceiver));

        address rvmId = address(this);

        vm.prank(callbackProxy);
        vm.expectRevert(TrancheFiCallbackReceiver.PoolKeyNotSet.selector);
        newReceiver.onVolatilityUpdate(rvmId, 500);
    }

    // ============ Integration Test ============

    function test_endToEnd_volatilityAdjustment() public {
        // 1. Initial state: 500 bps (5%)
        (,,,, uint256 initialAPY,) = hook.getPoolStats(poolKey);
        assertEq(initialAPY, 500, "Initial APY is 500");

        // 2. Simulate high volatility → increase APY
        address rvmId = address(this);
        vm.prank(callbackProxy);
        receiver.onVolatilityUpdate(rvmId, 1500); // 15%

        (,,,, uint256 highVolAPY,) = hook.getPoolStats(poolKey);
        assertEq(highVolAPY, 1500, "APY raised to 1500 during high volatility");

        // 3. Simulate volatility calming → decrease APY
        vm.prank(callbackProxy);
        receiver.onVolatilityUpdate(rvmId, 300); // 3%

        (,,,, uint256 lowVolAPY,) = hook.getPoolStats(poolKey);
        assertEq(lowVolAPY, 300, "APY lowered to 300 during low volatility");
    }
}
