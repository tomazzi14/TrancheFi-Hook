// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {TranchesHook} from "../src/TranchesHook.sol";

/// @title HookDeployer — CREATE2 factory that retains DEPLOYER privilege
/// @notice Deploys TranchesHook via CREATE2 so this factory becomes the hook's DEPLOYER,
///         then exposes `configure()` to wire trustedRouter & authorizedRSC.
/// AUDIT7 FIX #6: configure() is now one-shot per hook to prevent permanent admin privilege.
///         Owner can still call reconfigure() but only for the RSC address (not the router).
contract HookDeployer {
    address public immutable owner;

    /// @dev AUDIT7 FIX #6: track which hooks have been initially configured
    mapping(address => bool) public configured;

    constructor() {
        owner = msg.sender;
    }

    /// @notice Deploy TranchesHook via CREATE2
    function deploy(bytes memory creationCode, uint256 salt) external returns (address addr) {
        require(msg.sender == owner, "only owner");
        assembly {
            addr := create2(0, add(creationCode, 0x20), mload(creationCode), salt)
        }
        require(addr != address(0), "CREATE2 failed");
    }

    /// @notice Wire the hook's admin settings (one-shot: sets router + RSC)
    /// AUDIT7 FIX #6: can only be called once per hook
    function configure(TranchesHook hook, address router, address rsc) external {
        require(msg.sender == owner, "only owner");
        require(!configured[address(hook)], "already configured");
        configured[address(hook)] = true;
        hook.setTrustedRouter(router);
        hook.setAuthorizedRSC(rsc);
    }

    /// @notice Update only the RSC address (for redeployments of the RSC contract)
    /// @dev Router is immutable after initial configure() to limit attack surface
    function updateRSC(TranchesHook hook, address rsc) external {
        require(msg.sender == owner, "only owner");
        require(configured[address(hook)], "not configured yet");
        hook.setAuthorizedRSC(rsc);
    }
}
