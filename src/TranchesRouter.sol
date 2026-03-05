// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {BalanceDelta} from "v4-core/types/BalanceDelta.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {CurrencySettler} from "v4-core-test/utils/CurrencySettler.sol";
import {TransientStateLibrary} from "v4-core/libraries/TransientStateLibrary.sol";
import {TranchesHook} from "./TranchesHook.sol";

/// @title TranchesRouter
/// @notice Atomic router for TranchesHook deposits and removals.
/// Combines pre-registration + modifyLiquidity in a single transaction,
/// eliminating the front-run window on hookData spoofing (AUDIT4 FIX #1).
contract TranchesRouter is IUnlockCallback {
    using CurrencySettler for Currency;
    using TransientStateLibrary for IPoolManager;

    IPoolManager public immutable manager;
    TranchesHook public immutable hook;

    struct CallbackData {
        address sender;
        PoolKey key;
        IPoolManager.ModifyLiquidityParams params;
        bytes hookData;
    }

    constructor(IPoolManager _manager, TranchesHook _hook) {
        manager = _manager;
        hook = _hook;
    }

    /// @notice Atomically register and add liquidity (prevents front-running)
    /// @dev LP must approve this router for both pool currencies before calling
    function addLiquidity(
        PoolKey memory key,
        IPoolManager.ModifyLiquidityParams memory params,
        TranchesHook.Tranche tranche
    ) external returns (BalanceDelta delta) {
        hook.registerDepositFor(msg.sender, tranche);
        bytes memory hookData = abi.encode(msg.sender, tranche);
        delta = abi.decode(manager.unlock(abi.encode(CallbackData(msg.sender, key, params, hookData))), (BalanceDelta));
    }

    /// @notice Atomically register and remove liquidity (prevents front-running)
    function removeLiquidity(PoolKey memory key, IPoolManager.ModifyLiquidityParams memory params)
        external
        returns (BalanceDelta delta)
    {
        hook.registerRemovalFor(msg.sender);
        bytes memory hookData = abi.encode(msg.sender);
        delta = abi.decode(manager.unlock(abi.encode(CallbackData(msg.sender, key, params, hookData))), (BalanceDelta));
    }

    /// @notice IUnlockCallback — executes modifyLiquidity and settles tokens
    function unlockCallback(bytes calldata rawData) external returns (bytes memory) {
        require(msg.sender == address(manager), "Not PoolManager");

        CallbackData memory data = abi.decode(rawData, (CallbackData));
        (BalanceDelta delta,) = manager.modifyLiquidity(data.key, data.params, data.hookData);

        // Read outstanding deltas from transient storage
        int256 delta0 = manager.currencyDelta(address(this), data.key.currency0);
        int256 delta1 = manager.currencyDelta(address(this), data.key.currency1);

        // Settle debts (add liquidity: router owes tokens → pull from LP)
        if (delta0 < 0) data.key.currency0.settle(manager, data.sender, uint256(-delta0), false);
        if (delta1 < 0) data.key.currency1.settle(manager, data.sender, uint256(-delta1), false);

        // Take credits (remove liquidity: pool owes tokens → send to LP)
        if (delta0 > 0) data.key.currency0.take(manager, data.sender, uint256(delta0), false);
        if (delta1 > 0) data.key.currency1.take(manager, data.sender, uint256(delta1), false);

        return abi.encode(delta);
    }
}
