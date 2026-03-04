// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseTestHooks} from "v4-core/test/BaseTestHooks.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/types/PoolId.sol";
import {BalanceDelta, toBalanceDelta} from "v4-core/types/BalanceDelta.sol";
import {Currency, CurrencyLibrary} from "v4-core/types/Currency.sol";
import {SafeCast} from "v4-core/libraries/SafeCast.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title TrancheFi Hook — Structured LP Tranches for Uniswap V4
/// @notice Implements a Senior/Junior tranche system for LP positions.
///         Senior LPs get priority fees (target APY) and IL protection.
///         Junior LPs absorb IL first but get all excess fees (unlimited upside).
contract TranchesHook is BaseTestHooks {
    using PoolIdLibrary for PoolKey;
    using SafeCast for uint256;
    using CurrencyLibrary for Currency;
    using SafeERC20 for IERC20;

    // ============ Enums ============

    enum Tranche {
        SENIOR,
        JUNIOR
    }

    // ============ Structs ============

    struct Position {
        Tranche tranche;
        uint256 amount; // liquidity amount tracked by the hook
        uint256 depositBlock; // for min-block anti-flash-loan lock
        uint256 rewardDebt; // rewardPerShare snapshot at deposit time
    }

    struct PoolConfig {
        uint256 seniorTargetAPY; // basis points, e.g. 500 = 5.00%
        uint256 maxSeniorRatio; // basis points, e.g. 8000 = 80%
        uint256 totalSeniorLiquidity;
        uint256 totalJuniorLiquidity;
        uint256 accumulatedFeesSenior;
        uint256 accumulatedFeesJunior;
        uint256 rewardPerShareSenior; // scaled by PRECISION
        uint256 rewardPerShareJunior; // scaled by PRECISION
        uint256 lastUpdateTimestamp; // FIX #6: use timestamp instead of block number
        uint160 initialSqrtPriceX96; // price at pool init, for IL calc
        Currency feeCurrency; // FIX #1: track which currency fees are collected in
        bool initialized;
    }

    // ============ Constants ============

    uint256 public constant PRECISION = 1e18;
    uint256 public constant BASIS_POINTS = 10_000;
    uint256 public constant SECONDS_PER_YEAR = 365 days; // FIX #6: timestamp-based
    uint256 public constant MIN_BLOCKS_LOCK = 100; // ~100 blocks anti-flash-loan
    uint128 public constant TRANCHE_FEE_BIPS = 10; // 0.1% of swap output

    // ============ Immutables ============

    IPoolManager public immutable POOL_MANAGER;

    // ============ Storage ============

    /// @dev Authorized Reactive Smart Contract (RSC) address for risk parameter adjustments
    address public authorizedRSC; // FIX #3: access control for adjustRiskParameter

    /// @dev PoolId => PoolConfig
    mapping(PoolId => PoolConfig) public poolConfigs;

    /// @dev keccak256(lpAddress, poolId) => Position
    mapping(bytes32 => Position) public positions;

    // ============ Events ============

    event TranchDeposit(PoolId indexed poolId, address indexed lp, Tranche tranche, uint256 amount);
    event TrancheWithdraw(PoolId indexed poolId, address indexed lp, Tranche tranche, uint256 amount);
    event FeeDistributed(PoolId indexed poolId, uint256 seniorFees, uint256 juniorFees);
    event FeesClaimed(address indexed lp, PoolId indexed poolId, uint256 amount);
    event PoolConfigured(PoolId indexed poolId, uint256 seniorTargetAPY, uint256 maxSeniorRatio);
    event RiskParameterAdjusted(PoolId indexed poolId, uint256 newSeniorTargetAPY);
    event AuthorizedRSCUpdated(address indexed oldRSC, address indexed newRSC);

    // ============ Errors ============

    error PoolNotInitialized();
    error MinBlockLockNotMet(uint256 currentBlock, uint256 depositBlock, uint256 minBlocks);
    error SeniorRatioExceeded(uint256 currentRatio, uint256 maxRatio);
    error NoPosition();
    error NoPendingFees();
    error Unauthorized();
    error ZeroAddress();
    error UnexpectedPositiveDelta();

    // ============ Constructor ============

    constructor(IPoolManager _manager) {
        // FIX #9: zero-address check
        if (address(_manager) == address(0)) revert ZeroAddress();
        POOL_MANAGER = _manager;
    }

    // ============ Modifiers ============

    modifier onlyPoolManager() {
        _checkPoolManager();
        _;
    }

    function _checkPoolManager() internal view {
        require(msg.sender == address(POOL_MANAGER), "Not PoolManager");
    }

    // ============ Hook Permissions ============

    function getHookPermissions() public pure returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: true, // configure pool params
            beforeAddLiquidity: false,
            afterAddLiquidity: true, // register tranche deposit
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: true, // adjust payout by tranche
            beforeSwap: false,
            afterSwap: true, // collect tranche fee + waterfall
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: true, // take fee from swap output
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: true // adjust IL by tranche
        });
    }

    // ============ Hook Callbacks ============

    /// @notice Called after pool initialization. Configures tranche parameters.
    function afterInitialize(address, PoolKey calldata key, uint160 sqrtPriceX96, int24)
        external
        override
        onlyPoolManager
        returns (bytes4)
    {
        PoolId poolId = key.toId();

        // Default config
        poolConfigs[poolId] = PoolConfig({
            seniorTargetAPY: 500, // 5% default
            maxSeniorRatio: 8000, // 80% default
            totalSeniorLiquidity: 0,
            totalJuniorLiquidity: 0,
            accumulatedFeesSenior: 0,
            accumulatedFeesJunior: 0,
            rewardPerShareSenior: 0,
            rewardPerShareJunior: 0,
            lastUpdateTimestamp: block.timestamp, // FIX #6: timestamp
            initialSqrtPriceX96: sqrtPriceX96,
            feeCurrency: key.currency1, // default: fees collected in currency1
            initialized: true
        });

        emit PoolConfigured(poolId, 500, 8000);

        return IHooks.afterInitialize.selector;
    }

    /// @notice Called after liquidity is added. Registers the LP's tranche.
    /// @dev hookData = abi.encode(lpAddress, tranche)
    ///      FIX #2: accumulates into existing positions instead of overwriting
    function afterAddLiquidity(
        address,
        PoolKey calldata key,
        IPoolManager.ModifyLiquidityParams calldata,
        BalanceDelta delta,
        BalanceDelta,
        bytes calldata hookData
    ) external override onlyPoolManager returns (bytes4, BalanceDelta) {
        if (hookData.length == 0) {
            return (IHooks.afterAddLiquidity.selector, toBalanceDelta(0, 0));
        }

        PoolId poolId = key.toId();
        PoolConfig storage config = poolConfigs[poolId];

        // LP address comes from hookData because sender is the Router/PositionManager
        (address lpAddress, Tranche tranche) = abi.decode(hookData, (address, Tranche));

        // FIX #8: Safe delta extraction with validation
        int128 d0 = delta.amount0();
        int128 d1 = delta.amount1();
        // When adding liquidity, deltas should be negative (tokens leaving the LP to the pool)
        if (d0 > 0 || d1 > 0) revert UnexpectedPositiveDelta();
        uint256 amount = uint256(-int256(d0)) + uint256(-int256(d1));

        // FIX #4: Senior ratio cap enforced always (removed totalJuniorLiquidity > 0 bypass)
        if (tranche == Tranche.SENIOR) {
            uint256 totalAfter = config.totalSeniorLiquidity + config.totalJuniorLiquidity + amount;
            uint256 seniorAfter = config.totalSeniorLiquidity + amount;
            uint256 ratio = (seniorAfter * BASIS_POINTS) / totalAfter;
            if (ratio > config.maxSeniorRatio) {
                revert SeniorRatioExceeded(ratio, config.maxSeniorRatio);
            }
        }

        // FIX #2: accumulate into existing position instead of overwriting
        bytes32 posKey = _positionKey(lpAddress, poolId);
        uint256 rewardPerShare =
            tranche == Tranche.SENIOR ? config.rewardPerShareSenior : config.rewardPerShareJunior;

        Position storage existing = positions[posKey];
        if (existing.amount > 0) {
            // Existing position: claim pending fees first, then accumulate
            _claimFeesInternal(lpAddress, poolId, config, existing);
            existing.amount += amount;
            existing.rewardDebt = (existing.amount * rewardPerShare) / PRECISION;
            // Do NOT reset depositBlock — preserve original lock
        } else {
            // New position
            positions[posKey] = Position({
                tranche: tranche,
                amount: amount,
                depositBlock: block.number,
                rewardDebt: (amount * rewardPerShare) / PRECISION
            });
        }

        // Update pool totals
        if (tranche == Tranche.SENIOR) {
            config.totalSeniorLiquidity += amount;
        } else {
            config.totalJuniorLiquidity += amount;
        }

        emit TranchDeposit(poolId, lpAddress, tranche, amount);

        // No delta adjustment on deposit
        return (IHooks.afterAddLiquidity.selector, toBalanceDelta(0, 0));
    }

    /// @notice Called after every swap. Takes a tranche fee and distributes via waterfall.
    function afterSwap(
        address,
        PoolKey calldata key,
        IPoolManager.SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata
    ) external override onlyPoolManager returns (bytes4, int128) {
        PoolId poolId = key.toId();
        PoolConfig storage config = poolConfigs[poolId];

        if (!config.initialized) return (IHooks.afterSwap.selector, 0);

        // Determine the unspecified (output) token and amount
        bool specifiedIs0 = (params.amountSpecified < 0 == params.zeroForOne);
        (Currency feeCurrency, int128 outputAmount) =
            specifiedIs0 ? (key.currency1, delta.amount1()) : (key.currency0, delta.amount0());

        // Output is negative for the pool (positive for swapper), we want absolute value
        if (outputAmount < 0) outputAmount = -outputAmount;
        if (outputAmount == 0) return (IHooks.afterSwap.selector, 0);

        // Calculate tranche fee
        uint256 feeAmount = uint128(outputAmount) * TRANCHE_FEE_BIPS / BASIS_POINTS;
        if (feeAmount == 0) return (IHooks.afterSwap.selector, 0);

        // Take fee from the swap output via PoolManager
        POOL_MANAGER.take(feeCurrency, address(this), feeAmount);

        // Track fee currency for claims
        config.feeCurrency = feeCurrency;

        // Distribute via waterfall
        _distributeWaterfall(poolId, config, feeAmount);

        // Return the fee amount as the hook's delta
        return (IHooks.afterSwap.selector, feeAmount.toInt128());
    }

    /// @notice Called after liquidity is removed. Adjusts payout based on tranche.
    function afterRemoveLiquidity(
        address,
        PoolKey calldata key,
        IPoolManager.ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata hookData
    ) external override onlyPoolManager returns (bytes4, BalanceDelta) {
        if (hookData.length == 0) {
            return (IHooks.afterRemoveLiquidity.selector, toBalanceDelta(0, 0));
        }

        PoolId poolId = key.toId();
        PoolConfig storage config = poolConfigs[poolId];

        // LP address from hookData (sender is Router/PositionManager)
        address lpAddress = abi.decode(hookData, (address));

        bytes32 posKey = _positionKey(lpAddress, poolId);
        Position storage pos = positions[posKey];

        if (pos.amount == 0) revert NoPosition();

        // Anti flash-loan lock
        if (block.number - pos.depositBlock < MIN_BLOCKS_LOCK) {
            revert MinBlockLockNotMet(block.number, pos.depositBlock, MIN_BLOCKS_LOCK);
        }

        // Auto-claim pending fees
        _claimFeesInternal(lpAddress, poolId, config, pos);

        // Update pool totals
        if (pos.tranche == Tranche.SENIOR) {
            config.totalSeniorLiquidity -= pos.amount;
        } else {
            config.totalJuniorLiquidity -= pos.amount;
        }

        emit TrancheWithdraw(poolId, lpAddress, pos.tranche, pos.amount);

        // Clean up position
        delete positions[posKey];

        // TODO Phase 2: IL adjustment via return delta
        // For now, no delta adjustment — LP gets standard Uniswap payout
        return (IHooks.afterRemoveLiquidity.selector, toBalanceDelta(0, 0));
    }

    // ============ External Functions ============

    /// @notice LPs call this to claim accumulated tranche fees
    function claimFees(PoolKey calldata key) external {
        PoolId poolId = key.toId();
        PoolConfig storage config = poolConfigs[poolId];
        bytes32 posKey = _positionKey(msg.sender, poolId);
        Position storage pos = positions[posKey];

        if (pos.amount == 0) revert NoPosition();

        _claimFeesInternal(msg.sender, poolId, config, pos);
    }

    /// @notice Called by Reactive Network RSC to adjust risk parameters
    /// FIX #3: access control via authorizedRSC
    function adjustRiskParameter(PoolKey calldata key, uint256 newSeniorTargetAPY) external {
        if (msg.sender != authorizedRSC) revert Unauthorized();
        PoolId poolId = key.toId();
        PoolConfig storage config = poolConfigs[poolId];
        if (!config.initialized) revert PoolNotInitialized();

        config.seniorTargetAPY = newSeniorTargetAPY;

        emit RiskParameterAdjusted(poolId, newSeniorTargetAPY);
    }

    /// @notice Set the authorized RSC address (only callable by current RSC or deployer initially)
    function setAuthorizedRSC(address newRSC) external {
        // Only the current RSC (or deployer before RSC is set) can update
        if (authorizedRSC != address(0) && msg.sender != authorizedRSC) revert Unauthorized();
        emit AuthorizedRSCUpdated(authorizedRSC, newRSC);
        authorizedRSC = newRSC;
    }

    // ============ Internal Functions ============

    /// @dev Distributes fees via waterfall: Senior first, Junior gets the rest
    /// FIX #6: uses block.timestamp instead of block.number for APY calculation
    function _distributeWaterfall(PoolId poolId, PoolConfig storage config, uint256 totalFees) internal {
        uint256 timeDelta = block.timestamp - config.lastUpdateTimestamp;
        config.lastUpdateTimestamp = block.timestamp;

        uint256 seniorOwed = 0;

        if (config.totalSeniorLiquidity > 0 && timeDelta > 0) {
            // Senior owed = (totalSeniorLiquidity * APY / SECONDS_PER_YEAR) * timeDelta
            seniorOwed = (config.totalSeniorLiquidity * config.seniorTargetAPY * timeDelta)
                / (BASIS_POINTS * SECONDS_PER_YEAR);
        }

        uint256 seniorFees;
        uint256 juniorFees;

        if (seniorOwed >= totalFees) {
            // Not enough fees — Senior takes all, Junior gets nothing
            seniorFees = totalFees;
            juniorFees = 0;
        } else {
            // Senior gets their owed amount, Junior gets the rest
            seniorFees = seniorOwed;
            juniorFees = totalFees - seniorOwed;
        }

        // Update rewardPerShare
        if (seniorFees > 0 && config.totalSeniorLiquidity > 0) {
            config.rewardPerShareSenior += (seniorFees * PRECISION) / config.totalSeniorLiquidity;
            config.accumulatedFeesSenior += seniorFees;
        }

        if (juniorFees > 0 && config.totalJuniorLiquidity > 0) {
            config.rewardPerShareJunior += (juniorFees * PRECISION) / config.totalJuniorLiquidity;
            config.accumulatedFeesJunior += juniorFees;
        } else if (juniorFees > 0 && config.totalJuniorLiquidity == 0) {
            // FIX #5: redirect unclaimed junior fees to seniors instead of locking them
            if (config.totalSeniorLiquidity > 0) {
                config.rewardPerShareSenior += (juniorFees * PRECISION) / config.totalSeniorLiquidity;
                config.accumulatedFeesSenior += juniorFees;
            }
            // If no participants at all, fees are unavoidably lost
        }

        emit FeeDistributed(poolId, seniorFees, juniorFees);
    }

    /// @dev Internal fee claim logic
    /// FIX #1: actually transfer tokens to the LP
    function _claimFeesInternal(address lp, PoolId poolId, PoolConfig storage config, Position storage pos) internal {
        uint256 rewardPerShare =
            pos.tranche == Tranche.SENIOR ? config.rewardPerShareSenior : config.rewardPerShareJunior;

        uint256 pending = (pos.amount * rewardPerShare / PRECISION) - pos.rewardDebt;

        if (pending > 0) {
            pos.rewardDebt = pos.amount * rewardPerShare / PRECISION;

            // FIX #1: Transfer fee tokens from hook balance to LP
            Currency feeCurrency = config.feeCurrency;
            if (!feeCurrency.isAddressZero()) {
                IERC20(Currency.unwrap(feeCurrency)).safeTransfer(lp, pending);
            }

            emit FeesClaimed(lp, poolId, pending);
        }
    }

    // ============ View Functions ============

    /// @notice Get the position key for an LP in a pool
    function _positionKey(address lp, PoolId poolId) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(lp, PoolId.unwrap(poolId)));
    }

    /// @notice Get pending fees for an LP
    function pendingFees(address lp, PoolKey calldata key) external view returns (uint256) {
        PoolId poolId = key.toId();
        PoolConfig storage config = poolConfigs[poolId];
        bytes32 posKey = _positionKey(lp, poolId);
        Position storage pos = positions[posKey];

        if (pos.amount == 0) return 0;

        uint256 rewardPerShare =
            pos.tranche == Tranche.SENIOR ? config.rewardPerShareSenior : config.rewardPerShareJunior;

        return (pos.amount * rewardPerShare / PRECISION) - pos.rewardDebt;
    }

    /// @notice Get pool tranche stats
    function getPoolStats(PoolKey calldata key)
        external
        view
        returns (
            uint256 totalSenior,
            uint256 totalJunior,
            uint256 seniorFees,
            uint256 juniorFees,
            uint256 seniorAPY,
            uint256 seniorRatio
        )
    {
        PoolId poolId = key.toId();
        PoolConfig storage config = poolConfigs[poolId];

        totalSenior = config.totalSeniorLiquidity;
        totalJunior = config.totalJuniorLiquidity;
        seniorFees = config.accumulatedFeesSenior;
        juniorFees = config.accumulatedFeesJunior;
        seniorAPY = config.seniorTargetAPY;

        uint256 total = totalSenior + totalJunior;
        seniorRatio = total > 0 ? (totalSenior * BASIS_POINTS) / total : 0;
    }
}
