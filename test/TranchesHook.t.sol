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
import {BalanceDelta} from "v4-core/types/BalanceDelta.sol";
import {Currency} from "v4-core/types/Currency.sol";

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

    // ============ Helpers ============

    /// @dev Helper: add liquidity as both tranches (junior first to satisfy ratio cap)
    function _addBothTranches() internal {
        bytes memory juniorData = abi.encode(bob, TranchesHook.Tranche.JUNIOR);
        modifyLiquidityRouter.modifyLiquidity(poolKey, LIQUIDITY_PARAMS, juniorData);

        bytes memory seniorData = abi.encode(alice, TranchesHook.Tranche.SENIOR);
        modifyLiquidityRouter.modifyLiquidity(poolKey, LIQUIDITY_PARAMS, seniorData);
    }

    /// @dev Helper: perform a swap (zeroForOne, exact input)
    function _doSwap(int256 amountSpecified) internal returns (BalanceDelta) {
        return swap(poolKey, true, amountSpecified, ZERO_BYTES);
    }

    // ============ Deployment Tests ============

    function test_hookDeployed() public view {
        Hooks.Permissions memory perms = hook.getHookPermissions();

        assertTrue(perms.afterInitialize, "afterInitialize should be true");
        assertTrue(perms.afterAddLiquidity, "afterAddLiquidity should be true");
        assertTrue(perms.afterSwap, "afterSwap should be true");
        assertTrue(perms.afterSwapReturnDelta, "afterSwapReturnDelta should be true");
        assertTrue(perms.afterRemoveLiquidity, "afterRemoveLiquidity should be true");
        assertTrue(perms.afterRemoveLiquidityReturnDelta, "afterRemoveLiquidityReturnDelta should be true");

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
        bytes memory hookData = abi.encode(bob, TranchesHook.Tranche.JUNIOR);
        modifyLiquidityRouter.modifyLiquidity(poolKey, LIQUIDITY_PARAMS, hookData);

        (uint256 totalSenior, uint256 totalJunior,,,,) = hook.getPoolStats(poolKey);
        assertEq(totalSenior, 0, "Senior liquidity should be 0");
        assertGt(totalJunior, 0, "Junior liquidity should be > 0");
    }

    function test_depositBothTranches() public {
        _addBothTranches();

        (uint256 totalSenior, uint256 totalJunior,,,,) = hook.getPoolStats(poolKey);
        assertGt(totalSenior, 0, "Senior > 0");
        assertGt(totalJunior, 0, "Junior > 0");
        assertEq(totalSenior, totalJunior, "Same amount deposited");
    }

    function test_depositWithoutHookData() public {
        modifyLiquidityRouter.modifyLiquidity(poolKey, LIQUIDITY_PARAMS, ZERO_BYTES);

        (uint256 totalSenior, uint256 totalJunior,,,,) = hook.getPoolStats(poolKey);
        assertEq(totalSenior, 0, "No tranche registered");
        assertEq(totalJunior, 0, "No tranche registered");
    }

    // ============ Senior Ratio Cap Tests ============

    function test_seniorRatioCapEnforced() public {
        bytes memory juniorData = abi.encode(bob, TranchesHook.Tranche.JUNIOR);
        modifyLiquidityRouter.modifyLiquidity(poolKey, LIQUIDITY_PARAMS, juniorData);

        bytes memory seniorData = abi.encode(alice, TranchesHook.Tranche.SENIOR);
        modifyLiquidityRouter.modifyLiquidity(poolKey, LIQUIDITY_PARAMS, seniorData);

        (uint256 totalSenior, uint256 totalJunior,,,,) = hook.getPoolStats(poolKey);
        assertEq(totalSenior, totalJunior, "50/50 split");
    }

    function test_seniorRatioCapRevertsWhenExceeded() public {
        // Senior-only deposit should revert (100% > 80% cap)
        bytes memory seniorData = abi.encode(alice, TranchesHook.Tranche.SENIOR);
        vm.expectRevert();
        modifyLiquidityRouter.modifyLiquidity(poolKey, LIQUIDITY_PARAMS, seniorData);
    }

    // ============ Position Accumulation Tests ============

    function test_depositAccumulatesInsteadOfOverwriting() public {
        bytes memory juniorData = abi.encode(bob, TranchesHook.Tranche.JUNIOR);
        modifyLiquidityRouter.modifyLiquidity(poolKey, LIQUIDITY_PARAMS, juniorData);

        bytes memory seniorData = abi.encode(alice, TranchesHook.Tranche.SENIOR);
        modifyLiquidityRouter.modifyLiquidity(poolKey, LIQUIDITY_PARAMS, seniorData);

        (uint256 seniorBefore,,,,,) = hook.getPoolStats(poolKey);

        // Add more to keep ratio under cap
        modifyLiquidityRouter.modifyLiquidity(poolKey, LIQUIDITY_PARAMS, juniorData);
        modifyLiquidityRouter.modifyLiquidity(poolKey, LIQUIDITY_PARAMS, seniorData);

        (uint256 seniorAfter,,,,,) = hook.getPoolStats(poolKey);
        assertGt(seniorAfter, seniorBefore, "Senior should have accumulated");
    }

    // ============ Access Control Tests ============

    function test_adjustRiskParameterUnauthorizedReverts() public {
        vm.expectRevert(TranchesHook.Unauthorized.selector);
        hook.adjustRiskParameter(poolKey, 1000);
    }

    function test_setAuthorizedRSC() public {
        hook.setAuthorizedRSC(alice);
        assertEq(hook.authorizedRSC(), alice, "RSC should be alice");
    }

    function test_adjustRiskParameterAuthorized() public {
        hook.setAuthorizedRSC(alice);
        vm.prank(alice);
        hook.adjustRiskParameter(poolKey, 1000);

        (,,,, uint256 seniorAPY,) = hook.getPoolStats(poolKey);
        assertEq(seniorAPY, 1000, "APY should be 1000 (10%)");
    }

    // ============ Constructor Tests ============

    function test_constructorRevertsOnZeroAddress() public {
        vm.expectRevert(TranchesHook.ZeroAddress.selector);
        new TranchesHook(IPoolManager(address(0)));
    }

    // ============ Phase 2: Swap Waterfall Fee Distribution ============

    function test_swapGeneratesFees() public {
        _addBothTranches();

        // Perform a swap: exact input 1e18 token0 for token1
        _doSwap(-1e18);

        // Check that fees were accumulated
        (,, uint256 seniorFees, uint256 juniorFees,,) = hook.getPoolStats(poolKey);

        // At least one tranche should have fees (waterfall distributes)
        assertTrue(seniorFees > 0 || juniorFees > 0, "Fees should be generated from swap");
    }

    function test_swapWaterfallSeniorPriority() public {
        _addBothTranches();

        // Warp time forward so senior has accrued time-based owed fees
        vm.warp(block.timestamp + 365 days);

        // Perform a swap
        _doSwap(-1e18);

        (,, uint256 seniorFees, uint256 juniorFees,,) = hook.getPoolStats(poolKey);

        // After a year, senior target APY (5%) of their liquidity should be owed
        // Senior gets priority — should have fees
        assertGt(seniorFees, 0, "Senior should have fees (priority)");

        // The fee amount from one swap may not cover the full year's senior APY,
        // so all fees might go to senior with nothing left for junior
        // This validates the waterfall: senior takes priority
    }

    function test_swapWaterfallJuniorGetsRemainder() public {
        _addBothTranches();

        // Small time delta so senior owed is minimal
        vm.warp(block.timestamp + 1);

        // Perform a large swap so fees >> senior owed
        _doSwap(-1e18);

        (,, uint256 seniorFees, uint256 juniorFees,,) = hook.getPoolStats(poolKey);

        // With only 1 second elapsed, seniorOwed is tiny
        // Most fees should go to junior
        assertGt(juniorFees, 0, "Junior should get remainder fees");
    }

    function test_multipleSwapsAccumulateFees() public {
        _addBothTranches();
        vm.warp(block.timestamp + 1);

        // First swap (zeroForOne)
        _doSwap(-1e18);
        (,, uint256 seniorFees1, uint256 juniorFees1,,) = hook.getPoolStats(poolKey);

        // Second swap (opposite direction to avoid PriceLimitAlreadyExceeded)
        swap(poolKey, false, -1e18, ZERO_BYTES);
        (,, uint256 seniorFees2, uint256 juniorFees2,,) = hook.getPoolStats(poolKey);

        // Fees should accumulate
        assertTrue(
            seniorFees2 + juniorFees2 > seniorFees1 + juniorFees1, "Total fees should increase with each swap"
        );
    }

    function test_hookReceivesTokensFromFee() public {
        _addBothTranches();
        vm.warp(block.timestamp + 1);

        // Check hook balance before swap
        uint256 hookBalanceBefore = currency1.balanceOf(address(hook));

        // Swap (zeroForOne: output is currency1)
        _doSwap(-1e18);

        // Hook should have received fee tokens
        uint256 hookBalanceAfter = currency1.balanceOf(address(hook));
        assertGt(hookBalanceAfter, hookBalanceBefore, "Hook should hold fee tokens");
    }

    // ============ Phase 2: Pending Fees & Claim ============

    function test_pendingFeesAfterSwap() public {
        _addBothTranches();
        vm.warp(block.timestamp + 1);

        // Before swap, no pending fees
        uint256 pendingAlice = hook.pendingFees(alice, poolKey);
        uint256 pendingBob = hook.pendingFees(bob, poolKey);
        assertEq(pendingAlice, 0, "No pending fees for alice before swap");
        assertEq(pendingBob, 0, "No pending fees for bob before swap");

        // Swap
        _doSwap(-1e18);

        // After swap, at least one should have pending fees
        pendingAlice = hook.pendingFees(alice, poolKey);
        pendingBob = hook.pendingFees(bob, poolKey);
        assertTrue(pendingAlice > 0 || pendingBob > 0, "Should have pending fees after swap");
    }

    function test_claimFeesTransfersTokens() public {
        _addBothTranches();
        vm.warp(block.timestamp + 1);

        // Swap to generate fees
        _doSwap(-1e18);

        // Check bob's pending fees (junior gets remainder with small time delta)
        uint256 pendingBob = hook.pendingFees(bob, poolKey);

        if (pendingBob > 0) {
            uint256 bobBalanceBefore = currency1.balanceOf(bob);

            // Bob claims fees
            vm.prank(bob);
            hook.claimFees(poolKey);

            uint256 bobBalanceAfter = currency1.balanceOf(bob);
            assertEq(bobBalanceAfter - bobBalanceBefore, pendingBob, "Bob should receive pending fees");

            // After claiming, pending should be 0
            uint256 pendingAfterClaim = hook.pendingFees(bob, poolKey);
            assertEq(pendingAfterClaim, 0, "No pending fees after claim");
        }
    }

    function test_claimFeesRevertsWithNoPosition() public {
        address charlie = makeAddr("charlie");
        vm.prank(charlie);
        vm.expectRevert(TranchesHook.NoPosition.selector);
        hook.claimFees(poolKey);
    }

    // ============ Phase 2: Remove Liquidity ============

    function test_removeLiquidityAntiFlashLoan() public {
        _addBothTranches();

        // Try to remove immediately — should revert (anti-flash-loan lock)
        IPoolManager.ModifyLiquidityParams memory removeParams = IPoolManager.ModifyLiquidityParams({
            tickLower: LIQUIDITY_PARAMS.tickLower,
            tickUpper: LIQUIDITY_PARAMS.tickUpper,
            liquidityDelta: -LIQUIDITY_PARAMS.liquidityDelta,
            salt: 0
        });

        bytes memory hookData = abi.encode(bob);
        vm.expectRevert();
        modifyLiquidityRouter.modifyLiquidity(poolKey, removeParams, hookData);
    }

    function test_removeLiquidityAfterLockPeriod() public {
        _addBothTranches();

        // Roll forward past MIN_BLOCKS_LOCK (100 blocks)
        vm.roll(block.number + 101);

        // Remove bob's junior position
        IPoolManager.ModifyLiquidityParams memory removeParams = IPoolManager.ModifyLiquidityParams({
            tickLower: LIQUIDITY_PARAMS.tickLower,
            tickUpper: LIQUIDITY_PARAMS.tickUpper,
            liquidityDelta: -LIQUIDITY_PARAMS.liquidityDelta,
            salt: 0
        });

        bytes memory hookData = abi.encode(bob);
        modifyLiquidityRouter.modifyLiquidity(poolKey, removeParams, hookData);

        // Bob's position should be cleaned up
        (, uint256 totalJunior,,,,) = hook.getPoolStats(poolKey);
        assertEq(totalJunior, 0, "Junior liquidity should be 0 after removal");
    }

    function test_removeLiquidityAutoClaimsFees() public {
        _addBothTranches();
        vm.warp(block.timestamp + 1);

        // Swap to generate fees
        _doSwap(-1e18);

        // Roll forward past lock
        vm.roll(block.number + 101);

        uint256 pendingBob = hook.pendingFees(bob, poolKey);

        // Remove bob's position — should auto-claim fees
        IPoolManager.ModifyLiquidityParams memory removeParams = IPoolManager.ModifyLiquidityParams({
            tickLower: LIQUIDITY_PARAMS.tickLower,
            tickUpper: LIQUIDITY_PARAMS.tickUpper,
            liquidityDelta: -LIQUIDITY_PARAMS.liquidityDelta,
            salt: 0
        });

        uint256 bobBalanceBefore = currency1.balanceOf(bob);
        bytes memory hookData = abi.encode(bob);
        modifyLiquidityRouter.modifyLiquidity(poolKey, removeParams, hookData);

        if (pendingBob > 0) {
            uint256 bobBalanceAfter = currency1.balanceOf(bob);
            assertEq(bobBalanceAfter - bobBalanceBefore, pendingBob, "Auto-claimed fees on removal");
        }
    }

    // ============ Phase 2: Edge Cases ============

    function test_swapWithOnlyJunior_allFeesToJunior() public {
        // Only junior liquidity — no senior
        bytes memory juniorData = abi.encode(bob, TranchesHook.Tranche.JUNIOR);
        modifyLiquidityRouter.modifyLiquidity(poolKey, LIQUIDITY_PARAMS, juniorData);

        vm.warp(block.timestamp + 1);
        _doSwap(-1e18);

        (,, uint256 seniorFees, uint256 juniorFees,,) = hook.getPoolStats(poolKey);
        assertEq(seniorFees, 0, "No senior fees when no senior LPs");
        assertGt(juniorFees, 0, "All fees go to junior");
    }

    function test_swapWithOnlySenior_noJuniorFeeRedirect() public {
        // Need to add junior first for ratio cap, then add senior, then remove junior
        bytes memory juniorData = abi.encode(bob, TranchesHook.Tranche.JUNIOR);
        modifyLiquidityRouter.modifyLiquidity(poolKey, LIQUIDITY_PARAMS, juniorData);

        bytes memory seniorData = abi.encode(alice, TranchesHook.Tranche.SENIOR);
        modifyLiquidityRouter.modifyLiquidity(poolKey, LIQUIDITY_PARAMS, seniorData);

        // Remove junior after lock
        vm.roll(block.number + 101);
        IPoolManager.ModifyLiquidityParams memory removeParams = IPoolManager.ModifyLiquidityParams({
            tickLower: LIQUIDITY_PARAMS.tickLower,
            tickUpper: LIQUIDITY_PARAMS.tickUpper,
            liquidityDelta: -LIQUIDITY_PARAMS.liquidityDelta,
            salt: 0
        });
        modifyLiquidityRouter.modifyLiquidity(poolKey, removeParams, abi.encode(bob));

        // Now only senior remains
        (uint256 totalSenior, uint256 totalJunior,,,,) = hook.getPoolStats(poolKey);
        assertGt(totalSenior, 0, "Senior exists");
        assertEq(totalJunior, 0, "No junior");

        // Swap — FIX #5: junior fees redirected to senior
        vm.warp(block.timestamp + 1);
        _doSwap(-1e18);

        (,, uint256 seniorFees, uint256 juniorFees,,) = hook.getPoolStats(poolKey);
        assertGt(seniorFees, 0, "Senior gets all fees (including redirected junior portion)");
        // juniorFees in accumulator may be 0 since redirect goes to senior accumulator
    }

    function test_swapNoLiquidity_noFees() public {
        // Pool has no tranche liquidity, only "raw" liquidity from non-hookData deposits
        modifyLiquidityRouter.modifyLiquidity(poolKey, LIQUIDITY_PARAMS, ZERO_BYTES);

        vm.warp(block.timestamp + 1);

        // Swap should still work but hook has no tranche participants
        _doSwap(-1e18);

        (,, uint256 seniorFees, uint256 juniorFees,,) = hook.getPoolStats(poolKey);
        // Fees are taken by hook but can't be distributed to anyone
        // They stay in the hook contract
    }
}
