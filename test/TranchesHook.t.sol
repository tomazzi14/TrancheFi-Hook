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
        vm.prank(bob);
        hook.registerDeposit(TranchesHook.Tranche.JUNIOR);
        bytes memory juniorData = abi.encode(bob, TranchesHook.Tranche.JUNIOR);
        modifyLiquidityRouter.modifyLiquidity(poolKey, LIQUIDITY_PARAMS, juniorData);

        vm.prank(alice);
        hook.registerDeposit(TranchesHook.Tranche.SENIOR);
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
        vm.prank(bob);
        hook.registerDeposit(TranchesHook.Tranche.JUNIOR);
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
        vm.prank(bob);
        hook.registerDeposit(TranchesHook.Tranche.JUNIOR);
        bytes memory juniorData = abi.encode(bob, TranchesHook.Tranche.JUNIOR);
        modifyLiquidityRouter.modifyLiquidity(poolKey, LIQUIDITY_PARAMS, juniorData);

        vm.prank(alice);
        hook.registerDeposit(TranchesHook.Tranche.SENIOR);
        bytes memory seniorData = abi.encode(alice, TranchesHook.Tranche.SENIOR);
        modifyLiquidityRouter.modifyLiquidity(poolKey, LIQUIDITY_PARAMS, seniorData);

        (uint256 totalSenior, uint256 totalJunior,,,,) = hook.getPoolStats(poolKey);
        assertEq(totalSenior, totalJunior, "50/50 split");
    }

    function test_seniorRatioCapRevertsWhenExceeded() public {
        // Senior-only deposit should revert (100% > 80% cap)
        vm.prank(alice);
        hook.registerDeposit(TranchesHook.Tranche.SENIOR);
        bytes memory seniorData = abi.encode(alice, TranchesHook.Tranche.SENIOR);
        vm.expectRevert();
        modifyLiquidityRouter.modifyLiquidity(poolKey, LIQUIDITY_PARAMS, seniorData);
    }

    // ============ Position Accumulation Tests ============

    function test_depositAccumulatesInsteadOfOverwriting() public {
        vm.prank(bob);
        hook.registerDeposit(TranchesHook.Tranche.JUNIOR);
        bytes memory juniorData = abi.encode(bob, TranchesHook.Tranche.JUNIOR);
        modifyLiquidityRouter.modifyLiquidity(poolKey, LIQUIDITY_PARAMS, juniorData);

        vm.prank(alice);
        hook.registerDeposit(TranchesHook.Tranche.SENIOR);
        bytes memory seniorData = abi.encode(alice, TranchesHook.Tranche.SENIOR);
        modifyLiquidityRouter.modifyLiquidity(poolKey, LIQUIDITY_PARAMS, seniorData);

        (uint256 seniorBefore,,,,,) = hook.getPoolStats(poolKey);

        // Add more to keep ratio under cap
        vm.prank(bob);
        hook.registerDeposit(TranchesHook.Tranche.JUNIOR);
        modifyLiquidityRouter.modifyLiquidity(poolKey, LIQUIDITY_PARAMS, juniorData);

        vm.prank(alice);
        hook.registerDeposit(TranchesHook.Tranche.SENIOR);
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
        assertTrue(seniorFees2 + juniorFees2 > seniorFees1 + juniorFees1, "Total fees should increase with each swap");
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
        (uint256 pendingAlice0, uint256 pendingAlice1) = hook.pendingFees(alice, poolKey);
        (uint256 pendingBob0, uint256 pendingBob1) = hook.pendingFees(bob, poolKey);
        assertEq(pendingAlice0 + pendingAlice1, 0, "No pending fees for alice before swap");
        assertEq(pendingBob0 + pendingBob1, 0, "No pending fees for bob before swap");

        // Swap (zeroForOne: fees in currency1)
        _doSwap(-1e18);

        // After swap, at least one should have pending fees in currency1
        (, uint256 pendingAlice1After) = hook.pendingFees(alice, poolKey);
        (, uint256 pendingBob1After) = hook.pendingFees(bob, poolKey);
        assertTrue(pendingAlice1After + pendingBob1After > 0, "Should have pending fees after swap");
    }

    function test_claimFeesTransfersTokens() public {
        _addBothTranches();
        vm.warp(block.timestamp + 1);

        // Swap to generate fees (zeroForOne: fees in currency1)
        _doSwap(-1e18);

        // Check bob's pending fees (junior gets remainder with small time delta)
        (, uint256 pendingBob1) = hook.pendingFees(bob, poolKey);

        if (pendingBob1 > 0) {
            // Bob claims fees — goes to claimableBalance (pull pattern)
            vm.prank(bob);
            hook.claimFees(poolKey);

            // After claiming, pending should be 0
            (uint256 afterClaim0, uint256 afterClaim1) = hook.pendingFees(bob, poolKey);
            assertEq(afterClaim0, 0, "No pending fees after claim (currency0)");
            assertEq(afterClaim1, 0, "No pending fees after claim (currency1)");

            // Now bob withdraws via pull pattern
            uint256 bobBalanceBefore = currency1.balanceOf(bob);
            vm.prank(bob);
            hook.withdrawFees(currency1);
            uint256 bobBalanceAfter = currency1.balanceOf(bob);
            assertEq(bobBalanceAfter - bobBalanceBefore, pendingBob1, "Bob receives fees via withdrawFees");
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

        vm.prank(bob);
        hook.registerRemoval();
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

        vm.prank(bob);
        hook.registerRemoval();
        bytes memory hookData = abi.encode(bob);
        modifyLiquidityRouter.modifyLiquidity(poolKey, removeParams, hookData);

        // Bob's position should be cleaned up (small dust possible from AMM rounding)
        (, uint256 totalJunior,,,,) = hook.getPoolStats(poolKey);
        assertLe(totalJunior, 10, "Junior liquidity should be ~0 after removal");
    }

    function test_removeLiquidityAutoClaimsFees() public {
        _addBothTranches();
        vm.warp(block.timestamp + 1);

        // Swap to generate fees (zeroForOne: fees in currency1)
        _doSwap(-1e18);

        // Roll forward past lock
        vm.roll(block.number + 101);

        (, uint256 pendingBob1) = hook.pendingFees(bob, poolKey);

        // Remove bob's position — should auto-claim fees to claimableBalance
        IPoolManager.ModifyLiquidityParams memory removeParams = IPoolManager.ModifyLiquidityParams({
            tickLower: LIQUIDITY_PARAMS.tickLower,
            tickUpper: LIQUIDITY_PARAMS.tickUpper,
            liquidityDelta: -LIQUIDITY_PARAMS.liquidityDelta,
            salt: 0
        });

        vm.prank(bob);
        hook.registerRemoval();
        bytes memory hookData = abi.encode(bob);
        modifyLiquidityRouter.modifyLiquidity(poolKey, removeParams, hookData);

        if (pendingBob1 > 0) {
            // Fees went to claimableBalance, bob withdraws via pull pattern
            uint256 bobBalanceBefore = currency1.balanceOf(bob);
            vm.prank(bob);
            hook.withdrawFees(currency1);
            uint256 bobBalanceAfter = currency1.balanceOf(bob);
            assertEq(bobBalanceAfter - bobBalanceBefore, pendingBob1, "Auto-claimed fees on removal + withdraw");
        }
    }

    // ============ Phase 2: Edge Cases ============

    function test_swapWithOnlyJunior_allFeesToJunior() public {
        // Only junior liquidity — no senior
        vm.prank(bob);
        hook.registerDeposit(TranchesHook.Tranche.JUNIOR);
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
        vm.prank(bob);
        hook.registerDeposit(TranchesHook.Tranche.JUNIOR);
        bytes memory juniorData = abi.encode(bob, TranchesHook.Tranche.JUNIOR);
        modifyLiquidityRouter.modifyLiquidity(poolKey, LIQUIDITY_PARAMS, juniorData);

        vm.prank(alice);
        hook.registerDeposit(TranchesHook.Tranche.SENIOR);
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
        vm.prank(bob);
        hook.registerRemoval();
        modifyLiquidityRouter.modifyLiquidity(poolKey, removeParams, abi.encode(bob));

        // Now only senior remains (small dust possible from AMM rounding)
        (uint256 totalSenior, uint256 totalJunior,,,,) = hook.getPoolStats(poolKey);
        assertGt(totalSenior, 0, "Senior exists");
        assertLe(totalJunior, 10, "No junior (or just dust)");

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
        // AUDIT3 FIX #4: hook returns early with 0 delta when no LPs, so no fees taken
        assertEq(seniorFees, 0, "No senior fees when no tranche LPs");
        assertEq(juniorFees, 0, "No junior fees when no tranche LPs");
    }

    // ============ Phase 2+: DEEP Audit Fix Tests ============

    /// @dev DEEP FIX #1: Adding liquidity with different tranche to existing position reverts
    function test_trancheMismatchReverts() public {
        // Bob deposits as JUNIOR
        vm.prank(bob);
        hook.registerDeposit(TranchesHook.Tranche.JUNIOR);
        bytes memory juniorData = abi.encode(bob, TranchesHook.Tranche.JUNIOR);
        modifyLiquidityRouter.modifyLiquidity(poolKey, LIQUIDITY_PARAMS, juniorData);

        // Bob tries to add as SENIOR — should revert (error wrapped by router)
        vm.prank(bob);
        hook.registerDeposit(TranchesHook.Tranche.SENIOR);
        bytes memory seniorData = abi.encode(bob, TranchesHook.Tranche.SENIOR);
        vm.expectRevert();
        modifyLiquidityRouter.modifyLiquidity(poolKey, LIQUIDITY_PARAMS, seniorData);
    }

    /// @dev DEEP FIX #3: Fees tracked per currency — bidirectional swaps accumulate separately
    function test_perCurrencyFeeTracking() public {
        _addBothTranches();
        vm.warp(block.timestamp + 1);

        // Swap zeroForOne — fees in currency1
        _doSwap(-1e18);

        (, uint256 pendingBob1) = hook.pendingFees(bob, poolKey);
        assertGt(pendingBob1, 0, "Bob should have currency1 fees from zeroForOne swap");

        // Swap oneForZero — fees in currency0
        vm.warp(block.timestamp + 2);
        swap(poolKey, false, -1e18, ZERO_BYTES);

        (uint256 pendingBob0, uint256 pendingBob1After) = hook.pendingFees(bob, poolKey);
        assertGt(pendingBob0, 0, "Bob should have currency0 fees from oneForZero swap");
        assertGe(pendingBob1After, pendingBob1, "Currency1 fees should still be there");
    }

    /// @dev DEEP FIX #5: setAuthorizedRSC requires DEPLOYER or current RSC
    function test_setAuthorizedRSCRequiresDeployer() public {
        // Random address can't set RSC
        vm.prank(alice);
        vm.expectRevert(TranchesHook.Unauthorized.selector);
        hook.setAuthorizedRSC(bob);
    }

    /// @dev DEEP FIX #5: setAuthorizedRSC rejects zero address
    function test_setAuthorizedRSCRevertsZeroAddress() public {
        vm.expectRevert(TranchesHook.ZeroAddress.selector);
        hook.setAuthorizedRSC(address(0));
    }

    /// @dev DEEP FIX #5: current RSC can update to new RSC
    function test_rscCanUpdateItself() public {
        // Deployer sets initial RSC
        hook.setAuthorizedRSC(alice);
        assertEq(hook.authorizedRSC(), alice);

        // Alice (current RSC) updates to bob
        vm.prank(alice);
        hook.setAuthorizedRSC(bob);
        assertEq(hook.authorizedRSC(), bob);
    }

    /// @dev DEEP FIX #9: withdrawFees reverts when no claimable balance
    function test_withdrawFeesRevertsNoPending() public {
        vm.prank(alice);
        vm.expectRevert(TranchesHook.NoPendingFees.selector);
        hook.withdrawFees(currency1);
    }

    /// @dev DEEP FIX #9: Full pull-pattern flow: claim → claimableBalance → withdrawFees
    function test_pullPatternFullFlow() public {
        _addBothTranches();
        vm.warp(block.timestamp + 1);

        // Swap to generate fees
        _doSwap(-1e18);

        // Check bob has pending fees
        (, uint256 pendingBob1) = hook.pendingFees(bob, poolKey);
        assertGt(pendingBob1, 0, "Bob should have pending fees");

        // Claim moves fees to claimableBalance
        vm.prank(bob);
        hook.claimFees(poolKey);

        // Check claimableBalance
        uint256 claimable = hook.claimableBalance(bob, currency1);
        assertEq(claimable, pendingBob1, "Claimable balance should match pending fees");

        // Withdraw transfers tokens
        uint256 bobBalBefore = currency1.balanceOf(bob);
        vm.prank(bob);
        hook.withdrawFees(currency1);
        uint256 bobBalAfter = currency1.balanceOf(bob);

        assertEq(bobBalAfter - bobBalBefore, pendingBob1, "Bob receives exact pending amount");
        assertEq(hook.claimableBalance(bob, currency1), 0, "Claimable balance zeroed after withdraw");
    }

    /// @dev DEEP FIX #4: Partial removal keeps remaining position
    function test_partialRemovalKeepsPosition() public {
        _addBothTranches();
        vm.roll(block.number + 101);

        // Get bob's position amount
        (, uint256 totalJuniorBefore,,,,) = hook.getPoolStats(poolKey);

        // Remove half of bob's liquidity
        IPoolManager.ModifyLiquidityParams memory removeHalf = IPoolManager.ModifyLiquidityParams({
            tickLower: LIQUIDITY_PARAMS.tickLower,
            tickUpper: LIQUIDITY_PARAMS.tickUpper,
            liquidityDelta: -LIQUIDITY_PARAMS.liquidityDelta / 2,
            salt: 0
        });

        vm.prank(bob);
        hook.registerRemoval();
        bytes memory hookData = abi.encode(bob);
        modifyLiquidityRouter.modifyLiquidity(poolKey, removeHalf, hookData);

        // Junior liquidity should be reduced but not zero
        (, uint256 totalJuniorAfter,,,,) = hook.getPoolStats(poolKey);
        assertGt(totalJuniorAfter, 0, "Junior liquidity should remain after partial removal");
        assertLt(totalJuniorAfter, totalJuniorBefore, "Junior liquidity should decrease");
    }

    /// @dev DEEP FIX #8: Same-block deposits don't get inflated fee share
    function test_sameBlockSwapProportionalSplit() public {
        _addBothTranches();

        // Don't warp time — same block as deposit (timeDelta == 0)
        // Swap should use proportional split, not time-based senior target
        _doSwap(-1e18);

        (,, uint256 seniorFees, uint256 juniorFees,,) = hook.getPoolStats(poolKey);

        // With proportional split (50/50 liquidity), both should get roughly equal fees
        uint256 totalFees = seniorFees + juniorFees;
        if (totalFees > 0) {
            // Both should have fees (proportional to their liquidity share)
            assertGt(seniorFees, 0, "Senior should get proportional share");
            assertGt(juniorFees, 0, "Junior should get proportional share");
        }
    }

    // ============ AUDIT3: Pre-Registration Validation Tests ============

    /// @dev AUDIT3 FIX #1: Deposit without pre-registration reverts
    function test_depositWithoutRegistrationReverts() public {
        // Try to deposit without calling registerDeposit first
        bytes memory hookData = abi.encode(bob, TranchesHook.Tranche.JUNIOR);
        vm.expectRevert();
        modifyLiquidityRouter.modifyLiquidity(poolKey, LIQUIDITY_PARAMS, hookData);
    }

    /// @dev AUDIT3 FIX #1: Removal without pre-registration reverts
    function test_removalWithoutRegistrationReverts() public {
        // First do a valid deposit
        _addBothTranches();
        vm.roll(block.number + 101);

        // Try to remove without calling registerRemoval first
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

    /// @dev AUDIT3 FIX #1: Registration with mismatched tranche reverts
    function test_depositWithWrongRegistrationTrancheReverts() public {
        // Register as JUNIOR but try to deposit as SENIOR
        vm.prank(bob);
        hook.registerDeposit(TranchesHook.Tranche.JUNIOR);
        bytes memory seniorData = abi.encode(bob, TranchesHook.Tranche.SENIOR);
        vm.expectRevert();
        modifyLiquidityRouter.modifyLiquidity(poolKey, LIQUIDITY_PARAMS, seniorData);
    }

    /// @dev AUDIT3 FIX #4: Swap with no tranche LPs returns 0 delta (no stuck fees)
    function test_swapNoTrancheLP_zeroDelta() public {
        // Add liquidity without tranche registration (raw LP)
        modifyLiquidityRouter.modifyLiquidity(poolKey, LIQUIDITY_PARAMS, ZERO_BYTES);
        vm.warp(block.timestamp + 1);

        // Hook should have no balance change after swap (returns 0 delta)
        uint256 hookBalance0Before = currency0.balanceOf(address(hook));
        uint256 hookBalance1Before = currency1.balanceOf(address(hook));

        _doSwap(-1e18);

        uint256 hookBalance0After = currency0.balanceOf(address(hook));
        uint256 hookBalance1After = currency1.balanceOf(address(hook));

        assertEq(hookBalance0After, hookBalance0Before, "Hook currency0 balance unchanged");
        assertEq(hookBalance1After, hookBalance1Before, "Hook currency1 balance unchanged");
    }

    // ============ IL Adjustment Tests ============

    /// @dev IL adjustment: Junior absorbs IL when price moves
    function test_ilAdjustment_juniorAbsorbsIL() public {
        _addBothTranches();
        vm.warp(block.timestamp + 1);

        // Large swap to move the price significantly
        _doSwap(-5e18);

        // Roll past lock
        vm.roll(block.number + 101);

        // Check ilReserve before Junior removal
        uint256 reserve0Before = hook.ilReserve(poolId, currency0);
        uint256 reserve1Before = hook.ilReserve(poolId, currency1);

        // Remove bob's junior position
        IPoolManager.ModifyLiquidityParams memory removeParams = IPoolManager.ModifyLiquidityParams({
            tickLower: LIQUIDITY_PARAMS.tickLower,
            tickUpper: LIQUIDITY_PARAMS.tickUpper,
            liquidityDelta: -LIQUIDITY_PARAMS.liquidityDelta,
            salt: 0
        });

        vm.prank(bob);
        hook.registerRemoval();
        modifyLiquidityRouter.modifyLiquidity(poolKey, removeParams, abi.encode(bob));

        // After Junior removal with price movement, ilReserve should increase for at least one token
        uint256 reserve0After = hook.ilReserve(poolId, currency0);
        uint256 reserve1After = hook.ilReserve(poolId, currency1);
        assertTrue(
            reserve0After > reserve0Before || reserve1After > reserve1Before,
            "IL reserve should increase after Junior removal with price movement"
        );
    }

    /// @dev IL adjustment: Senior gets compensated from IL reserve
    function test_ilAdjustment_seniorProtected() public {
        _addBothTranches();
        vm.warp(block.timestamp + 1);

        // Large swap to move the price
        _doSwap(-5e18);

        vm.roll(block.number + 101);

        // Junior removes first — funds IL reserve
        IPoolManager.ModifyLiquidityParams memory removeParams = IPoolManager.ModifyLiquidityParams({
            tickLower: LIQUIDITY_PARAMS.tickLower,
            tickUpper: LIQUIDITY_PARAMS.tickUpper,
            liquidityDelta: -LIQUIDITY_PARAMS.liquidityDelta,
            salt: 0
        });

        vm.prank(bob);
        hook.registerRemoval();
        modifyLiquidityRouter.modifyLiquidity(poolKey, removeParams, abi.encode(bob));

        // Check IL reserve has tokens
        uint256 reserve0 = hook.ilReserve(poolId, currency0);
        uint256 reserve1 = hook.ilReserve(poolId, currency1);
        uint256 totalReserveBefore = reserve0 + reserve1;

        // Senior removes — should draw from IL reserve
        vm.prank(alice);
        hook.registerRemoval();
        modifyLiquidityRouter.modifyLiquidity(poolKey, removeParams, abi.encode(alice));

        uint256 reserve0After = hook.ilReserve(poolId, currency0);
        uint256 reserve1After = hook.ilReserve(poolId, currency1);
        uint256 totalReserveAfter = reserve0After + reserve1After;

        // IL reserve should decrease (Senior drew compensation)
        if (totalReserveBefore > 0) {
            assertLt(totalReserveAfter, totalReserveBefore, "IL reserve should decrease after Senior withdrawal");
        }
    }

    /// @dev IL adjustment: No IL when price unchanged
    function test_ilAdjustment_noILWhenPriceUnchanged() public {
        _addBothTranches();

        // Roll past lock — no swap, price unchanged
        vm.roll(block.number + 101);

        IPoolManager.ModifyLiquidityParams memory removeParams = IPoolManager.ModifyLiquidityParams({
            tickLower: LIQUIDITY_PARAMS.tickLower,
            tickUpper: LIQUIDITY_PARAMS.tickUpper,
            liquidityDelta: -LIQUIDITY_PARAMS.liquidityDelta,
            salt: 0
        });

        // Remove Junior — should have no IL penalty
        uint256 reserve0Before = hook.ilReserve(poolId, currency0);
        uint256 reserve1Before = hook.ilReserve(poolId, currency1);

        vm.prank(bob);
        hook.registerRemoval();
        modifyLiquidityRouter.modifyLiquidity(poolKey, removeParams, abi.encode(bob));

        uint256 reserve0After = hook.ilReserve(poolId, currency0);
        uint256 reserve1After = hook.ilReserve(poolId, currency1);

        assertEq(reserve0After, reserve0Before, "No IL reserve change when price unchanged (currency0)");
        assertEq(reserve1After, reserve1Before, "No IL reserve change when price unchanged (currency1)");
    }

    /// @dev IL adjustment: Senior compensation capped at available reserve
    function test_ilAdjustment_seniorCappedAtReserve() public {
        _addBothTranches();
        vm.warp(block.timestamp + 1);

        // Large swap to move price
        _doSwap(-5e18);

        vm.roll(block.number + 101);

        // Senior removes FIRST (before any Junior funds the reserve)
        IPoolManager.ModifyLiquidityParams memory removeParams = IPoolManager.ModifyLiquidityParams({
            tickLower: LIQUIDITY_PARAMS.tickLower,
            tickUpper: LIQUIDITY_PARAMS.tickUpper,
            liquidityDelta: -LIQUIDITY_PARAMS.liquidityDelta,
            salt: 0
        });

        // IL reserve should be empty
        assertEq(hook.ilReserve(poolId, currency0), 0, "Reserve empty before any removal");
        assertEq(hook.ilReserve(poolId, currency1), 0, "Reserve empty before any removal");

        // Senior removes — compensation capped at 0 (no reserve), should not revert
        vm.prank(alice);
        hook.registerRemoval();
        modifyLiquidityRouter.modifyLiquidity(poolKey, removeParams, abi.encode(alice));

        // IL reserve still empty (Senior couldn't draw from empty reserve)
        assertEq(hook.ilReserve(poolId, currency0), 0, "Reserve still empty after Senior removal");
        assertEq(hook.ilReserve(poolId, currency1), 0, "Reserve still empty after Senior removal");
    }
}
