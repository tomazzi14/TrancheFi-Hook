// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AbstractReactive} from "reactive-lib/abstract-base/AbstractReactive.sol";
import {IReactive} from "reactive-lib/interfaces/IReactive.sol";

/// @title TrancheFi Volatility RSC — Cross-Chain Volatility Monitor
/// @notice Deployed on Reactive Network. Subscribes to Uniswap V4 Swap events,
///         tracks sqrtPriceX96, computes realized volatility via EMA of squared
///         log-returns, and emits Callbacks to adjust TranchesHook risk parameters
///         when the volatility regime changes.
/// @dev Uses Reactive Network's event subscription system to monitor swaps
///      across one or more chains. The callback adjusts seniorTargetAPY:
///        - Low volatility  → 300 bps (3%)  — Senior gets less premium
///        - Medium volatility → 500 bps (5%) — Default
///        - High volatility → 1000 bps (10%) — Senior gets more for higher risk
contract TrancheFiVolatilityRSC is AbstractReactive {
    // ============ Constants ============

    /// @notice Uniswap V4 Swap event selector
    /// @dev keccak256("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)")
    uint256 public constant SWAP_EVENT_TOPIC0 =
        uint256(keccak256("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)"));

    /// @notice Callback gas limit for cross-chain calls
    uint64 public constant CALLBACK_GAS_LIMIT = 200_000;

    /// @notice EMA alpha factor (scaled by 1000): alpha=100 → 10% weight to new observation
    uint256 public constant EMA_ALPHA = 100;
    uint256 public constant EMA_SCALE = 1000;

    /// @notice Volatility thresholds (squared-return EMA, scaled by 1e18)
    /// @dev These represent approximate annualized volatility² thresholds:
    ///      LOW_THRESHOLD  ≈ (20% vol)²  → below this = low vol
    ///      HIGH_THRESHOLD ≈ (60% vol)²  → above this = high vol
    uint256 public constant LOW_THRESHOLD = 4e14; // ~20% annualized vol²
    uint256 public constant HIGH_THRESHOLD = 36e14; // ~60% annualized vol²

    /// @notice APY values for each volatility regime (basis points)
    uint256 public constant LOW_VOL_APY = 300; // 3%
    uint256 public constant MED_VOL_APY = 500; // 5%
    uint256 public constant HIGH_VOL_APY = 1000; // 10%

    // ============ Enums ============

    enum VolatilityRegime {
        LOW,
        MEDIUM,
        HIGH
    }

    // ============ State ============

    /// @notice Chain ID where the TranchesHook is deployed (Unichain = 130)
    uint256 public immutable destinationChainId;

    /// @notice The callback receiver contract address on the destination chain
    address public immutable callbackReceiver;

    /// @notice Last observed sqrtPriceX96 (for computing returns)
    uint256 public lastSqrtPriceX96;

    /// @notice EMA of squared log-returns (scaled by 1e18)
    uint256 public volatilityEMA;

    /// @notice Current volatility regime
    VolatilityRegime public currentRegime;

    /// @notice Number of swap observations processed
    uint256 public observationCount;

    // ============ Events ============

    event SwapObserved(uint256 indexed chainId, uint256 sqrtPriceX96, uint256 squaredReturn);
    event VolatilityRegimeChanged(VolatilityRegime oldRegime, VolatilityRegime newRegime, uint256 newAPY);

    // ============ Constructor ============

    /// @param _destinationChainId Chain ID where TranchesHook lives (130 for Unichain)
    /// @param _callbackReceiver TrancheFiCallbackReceiver address on destination chain
    /// @param _monitoredChainId Chain ID to monitor swaps on (can differ from destination)
    /// @param _poolManager PoolManager address on the monitored chain (or address(0) for all)
    constructor(
        uint256 _destinationChainId,
        address _callbackReceiver,
        uint256 _monitoredChainId,
        address _poolManager
    ) {
        destinationChainId = _destinationChainId;
        callbackReceiver = _callbackReceiver;
        currentRegime = VolatilityRegime.MEDIUM;

        // Subscribe to Swap events on the monitored chain
        // Only on Reactive Network (not in test VM)
        if (!vm) {
            service.subscribe(
                _monitoredChainId,
                _poolManager,
                SWAP_EVENT_TOPIC0,
                REACTIVE_IGNORE, // any pool ID
                REACTIVE_IGNORE, // any sender
                REACTIVE_IGNORE // unused topic3
            );
        }
    }

    // ============ Reactive Entry Point ============

    /// @notice Called by Reactive Network when a matching Swap event is detected
    /// @param log The intercepted log record containing swap data
    function react(IReactive.LogRecord calldata log) external vmOnly {
        // Decode sqrtPriceX96 from the event data
        // Swap data layout: (int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)
        // Offset: amount0 (32) + amount1 (32) = sqrtPriceX96 starts at byte 64
        uint256 sqrtPriceX96 = uint256(uint160(uint256(bytes32(_sliceBytes(log.data, 64, 32)))));

        if (sqrtPriceX96 == 0) return;

        if (lastSqrtPriceX96 > 0) {
            // Compute squared log-return approximation:
            // logReturn ≈ 2 * (sqrtPrice - lastSqrtPrice) / lastSqrtPrice
            // squaredReturn = logReturn² (scaled by 1e18)
            uint256 squaredReturn = _computeSquaredReturn(lastSqrtPriceX96, sqrtPriceX96);

            // Update EMA: ema = alpha * new + (1 - alpha) * old
            volatilityEMA = (EMA_ALPHA * squaredReturn + (EMA_SCALE - EMA_ALPHA) * volatilityEMA) / EMA_SCALE;

            emit SwapObserved(log.chain_id, sqrtPriceX96, squaredReturn);

            // Check for regime change (only after enough observations for stable EMA)
            observationCount++;
            if (observationCount >= 5) {
                _checkRegimeChange();
            }
        }

        lastSqrtPriceX96 = sqrtPriceX96;
    }

    // ============ Internal ============

    /// @notice Compute squared return from two sqrtPriceX96 values
    /// @dev Uses the approximation: return ≈ 2*(new-old)/old, then squares it
    ///      Result scaled by 1e18
    function _computeSquaredReturn(uint256 oldPrice, uint256 newPrice) internal pure returns (uint256) {
        // Compute percentage change * 1e18
        uint256 diff = newPrice >= oldPrice ? newPrice - oldPrice : oldPrice - newPrice;

        // Prevent overflow: compute (diff * 2 / oldPrice) * 1e18 for extreme ratios
        uint256 change;
        if (diff > type(uint128).max) {
            // For extreme price moves, compute ratio first to avoid overflow
            change = (diff / oldPrice) * 2 * 1e18;
        } else {
            change = (diff * 2 * 1e18) / oldPrice;
        }

        // Cap change to prevent overflow in squaring (max ~1e38 → squared fits uint256)
        uint256 MAX_CHANGE = 1e30;
        if (change > MAX_CHANGE) change = MAX_CHANGE;

        // Square it (result is in 1e18 scale: change² / 1e18)
        return (change * change) / 1e18;
    }

    /// @notice Check if volatility regime has changed, emit callback if so
    function _checkRegimeChange() internal {
        VolatilityRegime newRegime;
        uint256 newAPY;

        if (volatilityEMA < LOW_THRESHOLD) {
            newRegime = VolatilityRegime.LOW;
            newAPY = LOW_VOL_APY;
        } else if (volatilityEMA > HIGH_THRESHOLD) {
            newRegime = VolatilityRegime.HIGH;
            newAPY = HIGH_VOL_APY;
        } else {
            newRegime = VolatilityRegime.MEDIUM;
            newAPY = MED_VOL_APY;
        }

        if (newRegime != currentRegime) {
            emit VolatilityRegimeChanged(currentRegime, newRegime, newAPY);
            currentRegime = newRegime;

            // Emit callback to destination chain
            bytes memory payload = abi.encodeWithSignature(
                "onVolatilityUpdate(address,uint256)",
                address(0), // overwritten by Reactive Network with RVM ID
                newAPY
            );

            emit Callback(destinationChainId, callbackReceiver, CALLBACK_GAS_LIMIT, payload);
        }
    }

    /// @notice Extract a bytes32 from a bytes array at a given offset
    function _sliceBytes(bytes calldata data, uint256 offset, uint256 length) internal pure returns (bytes32 result) {
        require(data.length >= offset + length, "Slice out of bounds");
        assembly {
            result := calldataload(add(data.offset, offset))
        }
    }
}
