// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Deployers} from "v4-core-test/utils/Deployers.sol";
import {TranchesHook} from "../src/TranchesHook.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/types/PoolId.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {BalanceDelta} from "v4-core/types/BalanceDelta.sol";
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

    function test_depositSenior() public {
        // Add liquidity as Senior
        bytes memory hookData = abi.encode(alice, TranchesHook.Tranche.SENIOR);

        modifyLiquidityRouter.modifyLiquidity(poolKey, LIQUIDITY_PARAMS, hookData);

        // Verify position registered
        (uint256 totalSenior, uint256 totalJunior,,,,) = hook.getPoolStats(poolKey);

        assertGt(totalSenior, 0, "Senior liquidity should be > 0");
        assertEq(totalJunior, 0, "Junior liquidity should be 0");
    }

    function test_depositJunior() public {
        // Add liquidity as Junior
        bytes memory hookData = abi.encode(bob, TranchesHook.Tranche.JUNIOR);

        modifyLiquidityRouter.modifyLiquidity(poolKey, LIQUIDITY_PARAMS, hookData);

        // Verify position registered
        (uint256 totalSenior, uint256 totalJunior,,,,) = hook.getPoolStats(poolKey);

        assertEq(totalSenior, 0, "Senior liquidity should be 0");
        assertGt(totalJunior, 0, "Junior liquidity should be > 0");
    }

    function test_depositBothTranches() public {
        // Senior deposit
        bytes memory seniorData = abi.encode(alice, TranchesHook.Tranche.SENIOR);
        modifyLiquidityRouter.modifyLiquidity(poolKey, LIQUIDITY_PARAMS, seniorData);

        // Junior deposit
        bytes memory juniorData = abi.encode(bob, TranchesHook.Tranche.JUNIOR);
        modifyLiquidityRouter.modifyLiquidity(poolKey, LIQUIDITY_PARAMS, juniorData);

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
}
