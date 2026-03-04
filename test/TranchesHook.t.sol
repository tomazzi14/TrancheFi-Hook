// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Deployers} from "v4-core-test/utils/Deployers.sol";
import {TranchesHook} from "../src/TranchesHook.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/types/PoolId.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {StateLibrary} from "v4-core/libraries/StateLibrary.sol";

contract TranchesHookTest is Test, Deployers {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    TranchesHook hook;
    PoolKey poolKey;
    PoolId poolId;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        // Deploy manager + routers + test tokens
        deployFreshManagerAndRouters();
        deployMintAndApprove2Currencies();

        // Compute the hook address with correct flags
        uint160 flags = uint160(
            Hooks.AFTER_INITIALIZE_FLAG | Hooks.AFTER_ADD_LIQUIDITY_FLAG | Hooks.AFTER_SWAP_FLAG
                | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG | Hooks.AFTER_REMOVE_LIQUIDITY_FLAG
                | Hooks.AFTER_REMOVE_LIQUIDITY_RETURNS_DELTA_FLAG
        );

        address hookAddr = address(flags);

        // Deploy implementation and etch to correct address
        TranchesHook impl = new TranchesHook(manager);
        vm.etch(hookAddr, address(impl).code);
        hook = TranchesHook(hookAddr);

        // Initialize pool with hook
        (poolKey,) = initPool(currency0, currency1, IHooks(hookAddr), 3000, SQRT_PRICE_1_1);
        poolId = poolKey.toId();
    }

    // ============ Deployment Tests ============

    function test_hookDeployed() public view {
        // Verify hook has correct permissions
        Hooks.Permissions memory perms = hook.getHookPermissions();

        assertTrue(perms.afterInitialize, "afterInitialize should be true");
        assertTrue(perms.afterAddLiquidity, "afterAddLiquidity should be true");
        assertTrue(perms.afterSwap, "afterSwap should be true");
        assertTrue(perms.afterSwapReturnDelta, "afterSwapReturnDelta should be true");
        assertTrue(perms.afterRemoveLiquidity, "afterRemoveLiquidity should be true");
        assertTrue(perms.afterRemoveLiquidityReturnDelta, "afterRemoveLiquidityReturnDelta should be true");

        // These should be false
        assertFalse(perms.beforeInitialize);
        assertFalse(perms.beforeSwap);
        assertFalse(perms.beforeAddLiquidity);
        assertFalse(perms.beforeRemoveLiquidity);
        assertFalse(perms.beforeDonate);
        assertFalse(perms.afterDonate);
        assertFalse(perms.beforeSwapReturnDelta);
        assertFalse(perms.afterAddLiquidityReturnDelta);
    }

    function test_poolInitialized() public view {
        // Verify pool config was set in afterInitialize
        (
            uint256 totalSenior,
            uint256 totalJunior,
            uint256 seniorFees,
            uint256 juniorFees,
            uint256 seniorAPY,
            uint256 seniorRatio
        ) = hook.getPoolStats(poolKey);

        assertEq(totalSenior, 0, "No senior liquidity yet");
        assertEq(totalJunior, 0, "No junior liquidity yet");
        assertEq(seniorFees, 0, "No fees yet");
        assertEq(juniorFees, 0, "No fees yet");
        assertEq(seniorAPY, 500, "Default 5% APY");
        assertEq(seniorRatio, 0, "No ratio with zero liquidity");
    }

    // ============ Deposit Tests ============

    function test_depositJunior() public {
        // Add liquidity as Junior (no ratio cap for junior)
        bytes memory hookData = abi.encode(bob, TranchesHook.Tranche.JUNIOR);

        modifyLiquidityRouter.modifyLiquidity(poolKey, LIQUIDITY_PARAMS, hookData);

        // Verify position registered
        (uint256 totalSenior, uint256 totalJunior,,,,) = hook.getPoolStats(poolKey);

        assertEq(totalSenior, 0, "Senior liquidity should be 0");
        assertGt(totalJunior, 0, "Junior liquidity should be > 0");
    }

    function test_depositBothTranches() public {
        // Junior first (no ratio restrictions)
        bytes memory juniorData = abi.encode(bob, TranchesHook.Tranche.JUNIOR);
        modifyLiquidityRouter.modifyLiquidity(poolKey, LIQUIDITY_PARAMS, juniorData);

        // Senior second (within 80% ratio cap)
        bytes memory seniorData = abi.encode(alice, TranchesHook.Tranche.SENIOR);
        modifyLiquidityRouter.modifyLiquidity(poolKey, LIQUIDITY_PARAMS, seniorData);

        (uint256 totalSenior, uint256 totalJunior,,,,) = hook.getPoolStats(poolKey);

        assertGt(totalSenior, 0, "Senior > 0");
        assertGt(totalJunior, 0, "Junior > 0");
        assertEq(totalSenior, totalJunior, "Same amount deposited");
    }

    function test_depositWithoutHookData() public {
        // Add liquidity without hookData — should work but not register tranche
        modifyLiquidityRouter.modifyLiquidity(poolKey, LIQUIDITY_PARAMS, ZERO_BYTES);

        (uint256 totalSenior, uint256 totalJunior,,,,) = hook.getPoolStats(poolKey);

        assertEq(totalSenior, 0, "No tranche registered");
        assertEq(totalJunior, 0, "No tranche registered");
    }

    // ============ FIX #4: Senior Ratio Cap Tests ============

    function test_seniorRatioCapEnforced() public {
        // Deposit junior first
        bytes memory juniorData = abi.encode(bob, TranchesHook.Tranche.JUNIOR);
        modifyLiquidityRouter.modifyLiquidity(poolKey, LIQUIDITY_PARAMS, juniorData);

        // First senior deposit should work (50/50 = 50% < 80%)
        bytes memory seniorData = abi.encode(alice, TranchesHook.Tranche.SENIOR);
        modifyLiquidityRouter.modifyLiquidity(poolKey, LIQUIDITY_PARAMS, seniorData);

        (uint256 totalSenior, uint256 totalJunior,,,,) = hook.getPoolStats(poolKey);
        assertEq(totalSenior, totalJunior, "50/50 split");
    }

    function test_seniorRatioCapRevertsWhenExceeded() public {
        // FIX #4: Senior-only deposit should revert (100% > 80% cap)
        bytes memory seniorData = abi.encode(alice, TranchesHook.Tranche.SENIOR);
        vm.expectRevert();
        modifyLiquidityRouter.modifyLiquidity(poolKey, LIQUIDITY_PARAMS, seniorData);
    }

    // ============ FIX #2: Position Accumulation Tests ============

    function test_depositAccumulatesInsteadOfOverwriting() public {
        // Junior deposit first
        bytes memory juniorData = abi.encode(bob, TranchesHook.Tranche.JUNIOR);
        modifyLiquidityRouter.modifyLiquidity(poolKey, LIQUIDITY_PARAMS, juniorData);

        // Senior first deposit
        bytes memory seniorData = abi.encode(alice, TranchesHook.Tranche.SENIOR);
        modifyLiquidityRouter.modifyLiquidity(poolKey, LIQUIDITY_PARAMS, seniorData);

        (uint256 seniorBefore,,,,,) = hook.getPoolStats(poolKey);

        // Senior second deposit — should accumulate, not overwrite
        // Need more junior to keep ratio under cap
        modifyLiquidityRouter.modifyLiquidity(poolKey, LIQUIDITY_PARAMS, juniorData);
        modifyLiquidityRouter.modifyLiquidity(poolKey, LIQUIDITY_PARAMS, seniorData);

        (uint256 seniorAfter,,,,,) = hook.getPoolStats(poolKey);

        assertGt(seniorAfter, seniorBefore, "Senior should have accumulated");
    }

    // ============ FIX #3: Access Control Tests ============

    function test_adjustRiskParameterUnauthorizedReverts() public {
        // FIX #3: Should revert because no authorizedRSC is set
        vm.expectRevert(TranchesHook.Unauthorized.selector);
        hook.adjustRiskParameter(poolKey, 1000);
    }

    function test_setAuthorizedRSC() public {
        // First call should work (authorizedRSC is address(0))
        hook.setAuthorizedRSC(alice);
        assertEq(hook.authorizedRSC(), alice, "RSC should be alice");
    }

    function test_adjustRiskParameterAuthorized() public {
        // Set RSC, then adjust
        hook.setAuthorizedRSC(alice);

        vm.prank(alice);
        hook.adjustRiskParameter(poolKey, 1000);

        (,,,, uint256 seniorAPY,) = hook.getPoolStats(poolKey);
        assertEq(seniorAPY, 1000, "APY should be 1000 (10%)");
    }

    // ============ FIX #9: Constructor Zero Address Tests ============

    function test_constructorRevertsOnZeroAddress() public {
        vm.expectRevert(TranchesHook.ZeroAddress.selector);
        new TranchesHook(IPoolManager(address(0)));
    }

    // ============ FIX #8: Delta Validation Tests ============

    // Note: UnexpectedPositiveDelta is hard to trigger via the normal modifyLiquidity flow
    // because PoolManager always produces negative deltas for addLiquidity. This is
    // a defense-in-depth check for edge cases.
}
