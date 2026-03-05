// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AbstractCallback} from "reactive-lib/abstract-base/AbstractCallback.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";

/// @notice Minimal interface for the TranchesHook risk adjustment
interface ITranchesHook {
    function adjustRiskParameter(PoolKey calldata key, uint256 newSeniorTargetAPY) external;
}

/// @title TrancheFi Callback Receiver — Reactive Network → Unichain bridge endpoint
/// @notice Deployed on Unichain. Receives volatility callbacks from the Reactive Network
///         RSC and relays risk-parameter adjustments to the TranchesHook.
/// @dev The first `address` parameter in callback functions is auto-overwritten by the
///      Reactive Network with the RVM ID of the calling RSC instance.
contract TrancheFiCallbackReceiver is AbstractCallback {
    // ============ State ============

    /// @notice The TranchesHook contract on Unichain
    ITranchesHook public immutable hook;

    /// @notice The deployer address (for admin functions)
    address public immutable deployer;

    /// @notice Stored PoolKey so the RSC only needs to send the new APY value
    PoolKey public poolKey;

    /// @notice Whether the pool key has been set
    bool public poolKeySet;

    // ============ Events ============

    event VolatilityCallbackReceived(address indexed rvmId, uint256 newSeniorTargetAPY);
    event PoolKeyUpdated();

    // ============ Errors ============

    error OnlyDeployer();
    error PoolKeyNotSet();

    // ============ Constructor ============

    /// @param _callbackSender The Reactive Network callback proxy on Unichain
    ///        Mainnet: 0x9299472A6399Fd1027ebF067571Eb3e3D7837FC4
    /// @param _hook The TranchesHook contract address on Unichain
    constructor(address _callbackSender, address _hook) AbstractCallback(_callbackSender) {
        hook = ITranchesHook(_hook);
        deployer = msg.sender;
    }

    // ============ Admin ============

    /// @notice Set the pool key that this receiver manages
    /// @dev Must be called after pool initialization. Only deployer can set.
    function setPoolKey(PoolKey calldata _key) external {
        if (msg.sender != deployer) revert OnlyDeployer();
        poolKey = _key;
        poolKeySet = true;
        emit PoolKeyUpdated();
    }

    // ============ Reactive Callback ============

    /// @notice Called by Reactive Network when the volatility RSC detects a regime change
    /// @dev The `_rvmId` parameter is auto-overwritten by Reactive Network with the RSC's
    ///      RVM ID. The `authorizedSenderOnly` modifier (from AbstractPayer) ensures only
    ///      the callback proxy can call this. The `rvmIdOnly` modifier ensures it comes
    ///      from the correct RSC instance.
    /// @param _rvmId Auto-filled by Reactive Network — the RVM ID of the calling RSC
    /// @param _newSeniorTargetAPY New senior target APY in basis points (e.g. 500 = 5%)
    function onVolatilityUpdate(address _rvmId, uint256 _newSeniorTargetAPY)
        external
        authorizedSenderOnly
        rvmIdOnly(_rvmId)
    {
        if (!poolKeySet) revert PoolKeyNotSet();

        hook.adjustRiskParameter(poolKey, _newSeniorTargetAPY);

        emit VolatilityCallbackReceived(_rvmId, _newSeniorTargetAPY);
    }
}
