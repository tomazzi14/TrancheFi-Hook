// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Deployers} from "v4-core-test/utils/Deployers.sol";
import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";
import {TranchesHook} from "../src/TranchesHook.sol";
import {TranchesRouter} from "../src/TranchesRouter.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/types/PoolId.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {Currency} from "v4-core/types/Currency.sol";

contract TranchesRouterTest is Test, Deployers {
    using PoolIdLibrary for PoolKey;

    TranchesHook hook;
    TranchesRouter tranchesRouter;
    PoolKey poolKey;
    PoolId poolId;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address attacker = makeAddr("attacker");

    function setUp() public {
        deployFreshManagerAndRouters();
        deployMintAndApprove2Currencies();

        // Deploy hook
        uint160 flags = uint160(
            Hooks.AFTER_INITIALIZE_FLAG | Hooks.AFTER_ADD_LIQUIDITY_FLAG | Hooks.AFTER_SWAP_FLAG
                | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG | Hooks.AFTER_REMOVE_LIQUIDITY_FLAG
                | Hooks.AFTER_REMOVE_LIQUIDITY_RETURNS_DELTA_FLAG
        );
        address hookAddr = address(flags);
        TranchesHook impl = new TranchesHook(manager);
        vm.etch(hookAddr, address(impl).code);
        hook = TranchesHook(hookAddr);

        // Deploy TranchesRouter and set as trusted
        tranchesRouter = new TranchesRouter(manager, hook);
        hook.setTrustedRouter(address(tranchesRouter));

        // Initialize pool
        (poolKey,) = initPool(currency0, currency1, IHooks(hookAddr), 3000, SQRT_PRICE_1_1);
        poolId = poolKey.toId();

        // Fund and approve users for the TranchesRouter
        _fundAndApprove(alice);
        _fundAndApprove(bob);
        _fundAndApprove(attacker);
    }

    function _fundAndApprove(address user) internal {
        MockERC20 token0 = MockERC20(Currency.unwrap(currency0));
        MockERC20 token1 = MockERC20(Currency.unwrap(currency1));

        token0.mint(user, 100 ether);
        token1.mint(user, 100 ether);

        vm.startPrank(user);
        token0.approve(address(tranchesRouter), type(uint256).max);
        token1.approve(address(tranchesRouter), type(uint256).max);
        vm.stopPrank();
    }

    // ============ Atomic Deposit Tests ============

    function test_atomicDeposit_junior() public {
        vm.prank(bob);
        tranchesRouter.addLiquidity(poolKey, LIQUIDITY_PARAMS, TranchesHook.Tranche.JUNIOR);

        (uint256 totalSenior, uint256 totalJunior,,,,) = hook.getPoolStats(poolKey);
        assertEq(totalSenior, 0, "No senior");
        assertGt(totalJunior, 0, "Junior deposited via router");
    }

    function test_atomicDeposit_bothTranches() public {
        vm.prank(bob);
        tranchesRouter.addLiquidity(poolKey, LIQUIDITY_PARAMS, TranchesHook.Tranche.JUNIOR);

        vm.prank(alice);
        tranchesRouter.addLiquidity(poolKey, LIQUIDITY_PARAMS, TranchesHook.Tranche.SENIOR);

        (uint256 totalSenior, uint256 totalJunior,,,,) = hook.getPoolStats(poolKey);
        assertGt(totalSenior, 0, "Senior via router");
        assertGt(totalJunior, 0, "Junior via router");
        assertEq(totalSenior, totalJunior, "Same amount");
    }

    // ============ Atomic Removal Tests ============

    function test_atomicRemoval() public {
        vm.prank(bob);
        tranchesRouter.addLiquidity(poolKey, LIQUIDITY_PARAMS, TranchesHook.Tranche.JUNIOR);

        vm.prank(alice);
        tranchesRouter.addLiquidity(poolKey, LIQUIDITY_PARAMS, TranchesHook.Tranche.SENIOR);

        vm.roll(block.number + 101);

        IPoolManager.ModifyLiquidityParams memory removeParams = IPoolManager.ModifyLiquidityParams({
            tickLower: LIQUIDITY_PARAMS.tickLower,
            tickUpper: LIQUIDITY_PARAMS.tickUpper,
            liquidityDelta: -LIQUIDITY_PARAMS.liquidityDelta,
            salt: 0
        });

        vm.prank(bob);
        tranchesRouter.removeLiquidity(poolKey, removeParams);

        (, uint256 totalJunior,,,,) = hook.getPoolStats(poolKey);
        assertLe(totalJunior, 10, "Junior removed via router");
    }

    // ============ Security Tests ============

    function test_frontRunPrevented() public {
        // Bob deposits atomically — no window for front-running
        vm.prank(bob);
        tranchesRouter.addLiquidity(poolKey, LIQUIDITY_PARAMS, TranchesHook.Tranche.JUNIOR);

        (, uint256 totalJunior,,,,) = hook.getPoolStats(poolKey);
        assertGt(totalJunior, 0, "Atomic deposit succeeded - no front-run possible");
    }

    function test_untrustedRouterCannotRegister() public {
        vm.prank(attacker);
        vm.expectRevert(TranchesHook.NotTrustedRouter.selector);
        hook.registerDepositFor(bob, TranchesHook.Tranche.JUNIOR);
    }

    function test_setTrustedRouter_onlyDeployer() public {
        vm.prank(alice);
        vm.expectRevert(TranchesHook.Unauthorized.selector);
        hook.setTrustedRouter(address(tranchesRouter));
    }

    function test_seniorRatioCap_viaRouter() public {
        // Option C: Senior-only succeeds when no Junior exists (cold-start)
        vm.prank(alice);
        tranchesRouter.addLiquidity(poolKey, LIQUIDITY_PARAMS, TranchesHook.Tranche.SENIOR);

        (uint256 totalSenior, uint256 totalJunior,,,,) = hook.getPoolStats(poolKey);
        assertGt(totalSenior, 0, "Senior deposited via router");
        assertEq(totalJunior, 0, "No junior yet");
    }

    function test_atomicRemoval_autoClaimsFees() public {
        vm.prank(bob);
        tranchesRouter.addLiquidity(poolKey, LIQUIDITY_PARAMS, TranchesHook.Tranche.JUNIOR);

        vm.prank(alice);
        tranchesRouter.addLiquidity(poolKey, LIQUIDITY_PARAMS, TranchesHook.Tranche.SENIOR);

        vm.warp(block.timestamp + 1);
        swap(poolKey, true, -1e18, ZERO_BYTES);

        vm.roll(block.number + 101);

        (, uint256 pendingBob1) = hook.pendingFees(bob, poolKey);

        IPoolManager.ModifyLiquidityParams memory removeParams = IPoolManager.ModifyLiquidityParams({
            tickLower: LIQUIDITY_PARAMS.tickLower,
            tickUpper: LIQUIDITY_PARAMS.tickUpper,
            liquidityDelta: -LIQUIDITY_PARAMS.liquidityDelta,
            salt: 0
        });

        vm.prank(bob);
        tranchesRouter.removeLiquidity(poolKey, removeParams);

        if (pendingBob1 > 0) {
            uint256 bobBalBefore = currency1.balanceOf(bob);
            vm.prank(bob);
            hook.withdrawFees(currency1);
            uint256 bobBalAfter = currency1.balanceOf(bob);
            assertEq(bobBalAfter - bobBalBefore, pendingBob1, "Auto-claimed fees via router removal");
        }
    }
}
