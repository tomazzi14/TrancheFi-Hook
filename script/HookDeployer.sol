// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {TranchesHook} from "../src/TranchesHook.sol";

/// @title HookDeployer — CREATE2 factory that retains DEPLOYER privilege
/// @notice Deploys TranchesHook via CREATE2 so this factory becomes the hook's DEPLOYER,
///         then exposes `configure()` to wire trustedRouter & authorizedRSC.
contract HookDeployer {
    address public immutable owner;

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

    /// @notice Wire the hook's admin settings (only this factory can, as DEPLOYER)
    function configure(TranchesHook hook, address router, address rsc) external {
        require(msg.sender == owner, "only owner");
        hook.setTrustedRouter(router);
        hook.setAuthorizedRSC(rsc);
    }
}
