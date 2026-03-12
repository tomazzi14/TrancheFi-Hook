// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title HookMiner — Brute-force CREATE2 salt for V4 hook flag matching
/// @notice Finds a salt such that the CREATE2 address has EXACTLY the required flag bits set
///         (no extra before* flags). Used off-chain (in Foundry scripts) — never deployed on-chain.
library HookMiner {
    /// @dev Mask covering all 14 V4 hook flag bits (bits 0-13 of the address)
    uint160 constant FLAG_MASK = uint160((1 << 14) - 1);

    /// @notice Find a salt whose CREATE2 address has exactly `flags` in the flag region
    /// @param deployer  The address that will call CREATE2 (the script's tx.origin or a factory)
    /// @param flags     Required flag bits in the hook address (exact match within FLAG_MASK)
    /// @param creationCode  The full creation bytecode (type(Contract).creationCode ++ abi.encode(args))
    /// @param maxIterations  Maximum salts to try before reverting
    /// @return salt  The first matching salt
    /// @return hookAddress  The resulting CREATE2 address
    function find(address deployer, uint160 flags, bytes memory creationCode, uint256 maxIterations)
        internal
        pure
        returns (uint256 salt, address hookAddress)
    {
        bytes32 codeHash = keccak256(creationCode);

        for (uint256 i = 0; i < maxIterations; i++) {
            salt = i;
            hookAddress = _computeAddress(deployer, salt, codeHash);

            // Exact match: only the required flags are set, no extras
            if (uint160(hookAddress) & FLAG_MASK == flags) {
                return (salt, hookAddress);
            }
        }

        revert("HookMiner: no valid salt found");
    }

    /// @dev Standard CREATE2 address computation
    function _computeAddress(address deployer, uint256 salt, bytes32 codeHash) internal pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), deployer, bytes32(salt), codeHash)))));
    }
}
