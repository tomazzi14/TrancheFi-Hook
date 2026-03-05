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
import {StateLibrary} from "v4-core/libraries/StateLibrary.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {FullMath} from "v4-core/libraries/FullMath.sol";
import {LiquidityAmounts} from "v4-core-test/utils/LiquidityAmounts.sol";
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
    using StateLibrary for IPoolManager;

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
        uint256 rewardDebt0; // rewardPerShare snapshot for currency0
        uint256 rewardDebt1; // rewardPerShare snapshot for currency1
    }

    struct PoolConfig {
        uint256 seniorTargetAPY; // basis points, e.g. 500 = 5.00%
        uint256 maxSeniorRatio; // basis points, e.g. 8000 = 80%
        uint256 totalSeniorLiquidity;
        uint256 totalJuniorLiquidity;
        uint256 accumulatedFeesSenior;
        uint256 accumulatedFeesJunior;
        // DEEP FIX #3: separate reward tracking per currency
        uint256 rewardPerShareSenior0; // currency0 fees, scaled by PRECISION
        uint256 rewardPerShareSenior1; // currency1 fees, scaled by PRECISION
        uint256 rewardPerShareJunior0; // currency0 fees, scaled by PRECISION
        uint256 rewardPerShareJunior1; // currency1 fees, scaled by PRECISION
        uint256 lastUpdateTimestamp;
        uint160 initialSqrtPriceX96; // price at pool init, for IL calc
        bool initialized;
    }

    // ============ Constants ============

    uint256 public constant PRECISION = 1e18;
    uint256 public constant BASIS_POINTS = 10_000;
    uint256 public constant SECONDS_PER_YEAR = 365 days;
    uint256 public constant MIN_BLOCKS_LOCK = 100; // anti-flash-loan
    uint128 public constant TRANCHE_FEE_BIPS = 10; // 0.1% of swap output

    // ============ Immutables ============

    IPoolManager public immutable POOL_MANAGER;
    // DEEP FIX #5: deployer for initial RSC setup
    address public immutable DEPLOYER;

    // ============ Storage ============

    /// @dev Authorized Reactive Smart Contract (RSC) address
    address public authorizedRSC;

    /// @dev PoolId => PoolConfig
    mapping(PoolId => PoolConfig) public poolConfigs;

    /// @dev keccak256(lpAddress, poolId) => Position
    mapping(bytes32 => Position) public positions;

    /// @dev DEEP FIX #9: pull-pattern claimable balances (lp => currency => amount)
    mapping(address => mapping(Currency => uint256)) public claimableBalance;

    /// @dev AUDIT3 FIX #1: pre-registration to prevent hookData lpAddress spoofing
    mapping(address => bool) private _depositRegistered;
    mapping(address => Tranche) private _depositTranche;
    mapping(address => bool) private _removalRegistered;

    /// @dev IL reserve: tokens taken from Junior IL penalties, used to compensate Seniors
    mapping(PoolId => mapping(Currency => uint256)) public ilReserve;

    /// @dev AUDIT4 FIX #1: trusted router for atomic registration
    address public trustedRouter;

    // ============ Events ============

    event TranchDeposit(PoolId indexed poolId, address indexed lp, Tranche tranche, uint256 amount);
    event TrancheWithdraw(PoolId indexed poolId, address indexed lp, Tranche tranche, uint256 amount);
    event FeeDistributed(PoolId indexed poolId, uint256 seniorFees, uint256 juniorFees);
    event FeesClaimed(address indexed lp, PoolId indexed poolId, uint256 amount0, uint256 amount1);
    event PoolConfigured(PoolId indexed poolId, uint256 seniorTargetAPY, uint256 maxSeniorRatio);
    event RiskParameterAdjusted(PoolId indexed poolId, uint256 newSeniorTargetAPY);
    event AuthorizedRSCUpdated(address indexed oldRSC, address indexed newRSC);
    event TrustedRouterUpdated(address indexed oldRouter, address indexed newRouter);

    // ============ Errors ============

    error PoolNotInitialized();
    error MinBlockLockNotMet(uint256 currentBlock, uint256 depositBlock, uint256 minBlocks);
    error SeniorRatioExceeded(uint256 currentRatio, uint256 maxRatio);
    error NoPosition();
    error NoPendingFees();
    error Unauthorized();
    error ZeroAddress();
    error UnexpectedPositiveDelta();
    error TrancheMismatch(); // DEEP FIX #1
    error DepositNotRegistered(); // AUDIT3 FIX #1
    error RemovalNotRegistered(); // AUDIT3 FIX #1
    error NotTrustedRouter(); // AUDIT4 FIX #1

    // ============ Constructor ============

    constructor(IPoolManager _manager) {
        if (address(_manager) == address(0)) revert ZeroAddress();
        POOL_MANAGER = _manager;
        // DEEP FIX #5: store deployer for setAuthorizedRSC access control
        DEPLOYER = msg.sender;
    }

    // ============ Modifiers ============

    modifier onlyPoolManager() {
        require(msg.sender == address(POOL_MANAGER), "Not PoolManager");
        _;
    }

    // ============ Hook Permissions ============

    function getHookPermissions() public pure returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: true,
            beforeAddLiquidity: false,
            afterAddLiquidity: true,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: true,
            beforeSwap: false,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: true,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: true
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

        poolConfigs[poolId] = PoolConfig({
            seniorTargetAPY: 500, // 5% default
            maxSeniorRatio: 8000, // 80% default
            totalSeniorLiquidity: 0,
            totalJuniorLiquidity: 0,
            accumulatedFeesSenior: 0,
            accumulatedFeesJunior: 0,
            rewardPerShareSenior0: 0,
            rewardPerShareSenior1: 0,
            rewardPerShareJunior0: 0,
            rewardPerShareJunior1: 0,
            lastUpdateTimestamp: block.timestamp,
            initialSqrtPriceX96: sqrtPriceX96,
            initialized: true
        });

        emit PoolConfigured(poolId, 500, 8000);

        return IHooks.afterInitialize.selector;
    }

    /// @notice Called after liquidity is added. Registers the LP's tranche.
    /// @dev hookData = abi.encode(lpAddress, tranche)
    function afterAddLiquidity(
        address,
        PoolKey calldata key,
        IPoolManager.ModifyLiquidityParams calldata params,
        BalanceDelta,
        BalanceDelta,
        bytes calldata hookData
    ) external override onlyPoolManager returns (bytes4, BalanceDelta) {
        if (hookData.length == 0) {
            return (IHooks.afterAddLiquidity.selector, toBalanceDelta(0, 0));
        }

        PoolId poolId = key.toId();
        PoolConfig storage config = poolConfigs[poolId];

        (address lpAddress, Tranche tranche) = abi.decode(hookData, (address, Tranche));

        // AUDIT3 FIX #1: validate pre-registration (prevents hookData spoofing)
        if (!_depositRegistered[lpAddress] || _depositTranche[lpAddress] != tranche) {
            revert DepositNotRegistered();
        }
        delete _depositRegistered[lpAddress];
        delete _depositTranche[lpAddress];

        // AUDIT5 FIX #1: use V4-native liquidity units (decimal-agnostic)
        uint256 amount = uint256(params.liquidityDelta);

        // Senior ratio cap enforced always
        if (tranche == Tranche.SENIOR) {
            uint256 totalAfter = config.totalSeniorLiquidity + config.totalJuniorLiquidity + amount;
            uint256 seniorAfter = config.totalSeniorLiquidity + amount;
            uint256 ratio = (seniorAfter * BASIS_POINTS) / totalAfter;
            if (ratio > config.maxSeniorRatio) {
                revert SeniorRatioExceeded(ratio, config.maxSeniorRatio);
            }
        }

        // Register or accumulate position
        _registerPosition(lpAddress, poolId, key, config, tranche, amount);

        emit TranchDeposit(poolId, lpAddress, tranche, amount);

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

        // AUDIT3 FIX #4: skip fee when no LPs exist (prevents permanent fee lock)
        if (config.totalSeniorLiquidity + config.totalJuniorLiquidity == 0) {
            return (IHooks.afterSwap.selector, 0);
        }

        // Determine the unspecified (output) token and amount
        bool specifiedIs0 = (params.amountSpecified < 0 == params.zeroForOne);
        (Currency feeCurrency, int128 outputAmount) =
            specifiedIs0 ? (key.currency1, delta.amount1()) : (key.currency0, delta.amount0());

        // Output is negative for the pool (positive for swapper), we want absolute value
        if (outputAmount < 0) outputAmount = -outputAmount;
        if (outputAmount == 0) return (IHooks.afterSwap.selector, 0);

        // DEEP FIX #7: upcast to uint256 before multiplication to prevent uint128 overflow
        uint256 feeAmount = uint256(uint128(outputAmount)) * uint256(TRANCHE_FEE_BIPS) / BASIS_POINTS;
        if (feeAmount == 0) return (IHooks.afterSwap.selector, 0);

        // AUDIT4 FIX #2: skip take if fee too small to distribute (prevents dust lock)
        uint256 totalLiquidity = config.totalSeniorLiquidity + config.totalJuniorLiquidity;
        if ((feeAmount * PRECISION) / totalLiquidity == 0) {
            return (IHooks.afterSwap.selector, 0);
        }

        // AUDIT3 FIX #2+#5: use feeAmount directly (consistent delta, immune to dust donation)
        // Note: FOT tokens not supported — V4 pools generally don't support them either
        POOL_MANAGER.take(feeCurrency, address(this), feeAmount);

        // Determine which currency index this fee belongs to
        bool isCurrency0 = Currency.unwrap(feeCurrency) == Currency.unwrap(key.currency0);

        // Distribute via waterfall
        _distributeWaterfall(poolId, config, feeAmount, isCurrency0);

        // Return the fee amount as the hook's delta (consistent with take amount)
        return (IHooks.afterSwap.selector, feeAmount.toInt128());
    }

    /// @notice Called after liquidity is removed. Adjusts payout based on tranche.
    function afterRemoveLiquidity(
        address,
        PoolKey calldata key,
        IPoolManager.ModifyLiquidityParams calldata params,
        BalanceDelta,
        BalanceDelta,
        bytes calldata hookData
    ) external override onlyPoolManager returns (bytes4, BalanceDelta) {
        if (hookData.length == 0) {
            return (IHooks.afterRemoveLiquidity.selector, toBalanceDelta(0, 0));
        }

        PoolId poolId = key.toId();
        PoolConfig storage config = poolConfigs[poolId];
        address lpAddress = abi.decode(hookData, (address));

        // AUDIT3 FIX #1: validate pre-registration (prevents hookData spoofing)
        if (!_removalRegistered[lpAddress]) revert RemovalNotRegistered();
        delete _removalRegistered[lpAddress];

        bytes32 posKey = _positionKey(lpAddress, poolId);
        Position storage pos = positions[posKey];

        if (pos.amount == 0) revert NoPosition();

        // Anti flash-loan lock
        if (block.number - pos.depositBlock < MIN_BLOCKS_LOCK) {
            revert MinBlockLockNotMet(block.number, pos.depositBlock, MIN_BLOCKS_LOCK);
        }

        // Auto-claim pending fees (uses pull pattern — won't revert on blacklist)
        _claimFeesInternal(lpAddress, poolId, key, config, pos);

        // AUDIT5 FIX #1: use V4-native liquidity units (decimal-agnostic, matches deposit tracking)
        uint256 removedAmount = uint256(-params.liquidityDelta);

        // Cap at position amount
        if (removedAmount > pos.amount) removedAmount = pos.amount;

        // Update pool totals
        if (pos.tranche == Tranche.SENIOR) {
            config.totalSeniorLiquidity -= removedAmount;
        } else {
            config.totalJuniorLiquidity -= removedAmount;
        }

        // Update or delete position
        pos.amount -= removedAmount;
        if (pos.amount == 0) {
            emit TrancheWithdraw(poolId, lpAddress, pos.tranche, removedAmount);
            delete positions[posKey];
        } else {
            // Recalculate rewardDebt for remaining amount
            (uint256 rps0, uint256 rps1) = _getRewardPerShare(config, pos.tranche);
            pos.rewardDebt0 = (pos.amount * rps0) / PRECISION;
            pos.rewardDebt1 = (pos.amount * rps1) / PRECISION;
            emit TrancheWithdraw(poolId, lpAddress, pos.tranche, removedAmount);
        }

        // TODO Phase 2: IL adjustment via return delta
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

        _claimFeesInternal(msg.sender, poolId, key, config, pos);
    }

    /// @notice DEEP FIX #9: Pull pattern — LP withdraws claimable balance
    /// AUDIT5 FIX #2: supports both native ETH and ERC20 currencies
    function withdrawFees(Currency currency) external {
        uint256 amount = claimableBalance[msg.sender][currency];
        if (amount == 0) revert NoPendingFees();

        claimableBalance[msg.sender][currency] = 0;
        if (currency.isAddressZero()) {
            (bool success,) = msg.sender.call{value: amount}("");
            require(success, "ETH transfer failed");
        } else {
            IERC20(Currency.unwrap(currency)).safeTransfer(msg.sender, amount);
        }
    }

    /// @notice Called by Reactive Network RSC to adjust risk parameters
    function adjustRiskParameter(PoolKey calldata key, uint256 newSeniorTargetAPY) external {
        if (msg.sender != authorizedRSC) revert Unauthorized();
        PoolId poolId = key.toId();
        PoolConfig storage config = poolConfigs[poolId];
        if (!config.initialized) revert PoolNotInitialized();

        config.seniorTargetAPY = newSeniorTargetAPY;

        emit RiskParameterAdjusted(poolId, newSeniorTargetAPY);
    }

    /// @notice Set the authorized RSC address
    /// DEEP FIX #5: only DEPLOYER or current RSC can set
    function setAuthorizedRSC(address newRSC) external {
        if (msg.sender != DEPLOYER && msg.sender != authorizedRSC) revert Unauthorized();
        if (newRSC == address(0)) revert ZeroAddress();
        emit AuthorizedRSCUpdated(authorizedRSC, newRSC);
        authorizedRSC = newRSC;
    }

    /// @notice LP pre-registers intent to deposit (prevents hookData spoofing)
    /// @dev Must be called by the LP before calling PoolManager.modifyLiquidity
    function registerDeposit(Tranche tranche) external {
        _depositRegistered[msg.sender] = true;
        _depositTranche[msg.sender] = tranche;
    }

    /// @notice LP pre-registers intent to remove liquidity (prevents hookData spoofing)
    /// @dev Must be called by the LP before calling PoolManager.modifyLiquidity
    function registerRemoval() external {
        _removalRegistered[msg.sender] = true;
    }

    // ============ AUDIT4 FIX #1: Trusted Router Functions ============

    /// @notice Set the trusted router for atomic registration (only DEPLOYER)
    function setTrustedRouter(address _router) external {
        if (msg.sender != DEPLOYER) revert Unauthorized();
        if (_router == address(0)) revert ZeroAddress();
        emit TrustedRouterUpdated(trustedRouter, _router);
        trustedRouter = _router;
    }

    /// @notice Register deposit on behalf of LP (only trusted router)
    /// @dev Called atomically by TranchesRouter before modifyLiquidity
    function registerDepositFor(address lp, Tranche tranche) external {
        if (msg.sender != trustedRouter) revert NotTrustedRouter();
        _depositRegistered[lp] = true;
        _depositTranche[lp] = tranche;
    }

    /// @notice Register removal on behalf of LP (only trusted router)
    /// @dev Called atomically by TranchesRouter before modifyLiquidity
    function registerRemovalFor(address lp) external {
        if (msg.sender != trustedRouter) revert NotTrustedRouter();
        _removalRegistered[lp] = true;
    }

    // ============ Internal Functions ============

    /// @dev Calculate IL adjustment deltas for an LP removing liquidity.
    ///      Compares hold-value (at initial price) vs actual-value (at current price).
    ///      Senior: negative hookDelta (receives compensation from IL reserve).
    ///      Junior: positive hookDelta (penalty taken to fund IL reserve).
    function _calculateILDelta(
        PoolConfig storage config,
        PoolKey calldata key,
        IPoolManager.ModifyLiquidityParams calldata params,
        Tranche tranche
    ) internal view returns (int128 hookDelta0, int128 hookDelta1) {
        (uint160 currentSqrtPrice,,,) = POOL_MANAGER.getSlot0(key.toId());
        uint160 initialPrice = config.initialSqrtPriceX96;

        if (currentSqrtPrice == initialPrice) return (0, 0);

        uint128 liq = uint128(uint256(-params.liquidityDelta));
        uint160 sqrtA = TickMath.getSqrtPriceAtTick(params.tickLower);
        uint160 sqrtB = TickMath.getSqrtPriceAtTick(params.tickUpper);

        // What LP would have at initial price vs current price
        (uint256 hold0, uint256 hold1) = LiquidityAmounts.getAmountsForLiquidity(initialPrice, sqrtA, sqrtB, liq);
        (uint256 actual0, uint256 actual1) =
            LiquidityAmounts.getAmountsForLiquidity(currentSqrtPrice, sqrtA, sqrtB, liq);

        // IL per token (positive = LP lost this token due to IL)
        int256 il0 = int256(hold0) - int256(actual0);
        int256 il1 = int256(hold1) - int256(actual1);

        uint256 totalLiq = config.totalSeniorLiquidity + config.totalJuniorLiquidity;
        if (totalLiq == 0) return (0, 0);

        if (tranche == Tranche.SENIOR) {
            // Senior gets compensated: negative hookDelta = give tokens to LP
            hookDelta0 = -int128(il0 * int256(config.totalJuniorLiquidity) / int256(totalLiq));
            hookDelta1 = -int128(il1 * int256(config.totalJuniorLiquidity) / int256(totalLiq));
        } else {
            // Junior absorbs Senior's portion of IL: positive hookDelta = take tokens from LP
            hookDelta0 = int128(il0 * int256(config.totalSeniorLiquidity) / int256(totalLiq));
            hookDelta1 = int128(il1 * int256(config.totalSeniorLiquidity) / int256(totalLiq));
        }
    }

    /// @dev Register or accumulate a position (extracted to avoid stack-too-deep)
    function _registerPosition(
        address lpAddress,
        PoolId poolId,
        PoolKey calldata key,
        PoolConfig storage config,
        Tranche tranche,
        uint256 amount
    ) internal {
        bytes32 posKey = _positionKey(lpAddress, poolId);
        Position storage existing = positions[posKey];

        if (existing.amount > 0) {
            // DEEP FIX #1: enforce tranche consistency
            if (tranche != existing.tranche) revert TrancheMismatch();

            // Use EXISTING position's tranche for rewardPerShare (not hookData)
            (uint256 rps0, uint256 rps1) = _getRewardPerShare(config, existing.tranche);

            // Claim pending fees first
            _claimFeesInternal(lpAddress, poolId, key, config, existing);

            // Accumulate
            existing.amount += amount;
            existing.rewardDebt0 = (existing.amount * rps0) / PRECISION;
            existing.rewardDebt1 = (existing.amount * rps1) / PRECISION;
            // Do NOT reset depositBlock — preserve original lock

            // Update pool totals using existing tranche
            if (existing.tranche == Tranche.SENIOR) {
                config.totalSeniorLiquidity += amount;
            } else {
                config.totalJuniorLiquidity += amount;
            }
        } else {
            // New position
            (uint256 rps0, uint256 rps1) = _getRewardPerShare(config, tranche);
            positions[posKey] = Position({
                tranche: tranche,
                amount: amount,
                depositBlock: block.number,
                rewardDebt0: (amount * rps0) / PRECISION,
                rewardDebt1: (amount * rps1) / PRECISION
            });

            // Update pool totals
            if (tranche == Tranche.SENIOR) {
                config.totalSeniorLiquidity += amount;
            } else {
                config.totalJuniorLiquidity += amount;
            }
        }
    }

    /// @dev Get rewardPerShare pair for a tranche
    function _getRewardPerShare(PoolConfig storage config, Tranche tranche)
        internal
        view
        returns (uint256 rps0, uint256 rps1)
    {
        if (tranche == Tranche.SENIOR) {
            rps0 = config.rewardPerShareSenior0;
            rps1 = config.rewardPerShareSenior1;
        } else {
            rps0 = config.rewardPerShareJunior0;
            rps1 = config.rewardPerShareJunior1;
        }
    }

    /// @dev Distributes fees via waterfall: Senior first, Junior gets the rest
    /// DEEP FIX #3: tracks fees per currency
    /// DEEP FIX #8: proportional split when timeDelta == 0
    function _distributeWaterfall(PoolId poolId, PoolConfig storage config, uint256 totalFees, bool isCurrency0)
        internal
    {
        uint256 timeDelta = block.timestamp - config.lastUpdateTimestamp;
        config.lastUpdateTimestamp = block.timestamp;

        uint256 seniorOwed = 0;
        uint256 totalLiquidity = config.totalSeniorLiquidity + config.totalJuniorLiquidity;

        if (config.totalSeniorLiquidity > 0 && timeDelta > 0) {
            seniorOwed =
                (config.totalSeniorLiquidity * config.seniorTargetAPY * timeDelta) / (BASIS_POINTS * SECONDS_PER_YEAR);
        } else if (config.totalSeniorLiquidity > 0 && timeDelta == 0 && totalLiquidity > 0) {
            // DEEP FIX #8: same-block — split proportionally to prevent flash-loan manipulation
            seniorOwed = (totalFees * config.totalSeniorLiquidity) / totalLiquidity;
        }

        uint256 seniorFees;
        uint256 juniorFees;

        if (seniorOwed >= totalFees) {
            seniorFees = totalFees;
            juniorFees = 0;
        } else {
            seniorFees = seniorOwed;
            juniorFees = totalFees - seniorOwed;
        }

        // Update rewardPerShare for the correct currency
        if (seniorFees > 0 && config.totalSeniorLiquidity > 0) {
            uint256 increment = (seniorFees * PRECISION) / config.totalSeniorLiquidity;
            if (isCurrency0) {
                config.rewardPerShareSenior0 += increment;
            } else {
                config.rewardPerShareSenior1 += increment;
            }
            config.accumulatedFeesSenior += seniorFees;
        }

        if (juniorFees > 0 && config.totalJuniorLiquidity > 0) {
            uint256 increment = (juniorFees * PRECISION) / config.totalJuniorLiquidity;
            if (isCurrency0) {
                config.rewardPerShareJunior0 += increment;
            } else {
                config.rewardPerShareJunior1 += increment;
            }
            config.accumulatedFeesJunior += juniorFees;
        } else if (juniorFees > 0 && config.totalJuniorLiquidity == 0) {
            // Redirect to seniors
            if (config.totalSeniorLiquidity > 0) {
                uint256 increment = (juniorFees * PRECISION) / config.totalSeniorLiquidity;
                if (isCurrency0) {
                    config.rewardPerShareSenior0 += increment;
                } else {
                    config.rewardPerShareSenior1 += increment;
                }
                config.accumulatedFeesSenior += juniorFees;
            }
        }

        emit FeeDistributed(poolId, seniorFees, juniorFees);
    }

    /// @dev Internal fee claim logic
    /// DEEP FIX #3: claims both currencies
    /// DEEP FIX #9: uses pull pattern (stores in claimableBalance instead of direct transfer)
    function _claimFeesInternal(
        address lp,
        PoolId poolId,
        PoolKey calldata key,
        PoolConfig storage config,
        Position storage pos
    ) internal {
        (uint256 rps0, uint256 rps1) = _getRewardPerShare(config, pos.tranche);

        uint256 pending0 = (pos.amount * rps0 / PRECISION) - pos.rewardDebt0;
        uint256 pending1 = (pos.amount * rps1 / PRECISION) - pos.rewardDebt1;

        if (pending0 > 0 || pending1 > 0) {
            pos.rewardDebt0 = pos.amount * rps0 / PRECISION;
            pos.rewardDebt1 = pos.amount * rps1 / PRECISION;

            // DEEP FIX #9: store in claimable balance (pull pattern)
            // This prevents blacklisted LP from blocking afterRemoveLiquidity
            if (pending0 > 0) {
                claimableBalance[lp][key.currency0] += pending0;
            }
            if (pending1 > 0) {
                claimableBalance[lp][key.currency1] += pending1;
            }

            emit FeesClaimed(lp, poolId, pending0, pending1);
        }
    }

    // ============ View Functions ============

    function _positionKey(address lp, PoolId poolId) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(lp, PoolId.unwrap(poolId)));
    }

    /// @notice Get pending fees for an LP (both currencies)
    function pendingFees(address lp, PoolKey calldata key) external view returns (uint256 pending0, uint256 pending1) {
        PoolId poolId = key.toId();
        PoolConfig storage config = poolConfigs[poolId];
        bytes32 posKey = _positionKey(lp, poolId);
        Position storage pos = positions[posKey];

        if (pos.amount == 0) return (0, 0);

        (uint256 rps0, uint256 rps1) = _getRewardPerShare(config, pos.tranche);

        pending0 = (pos.amount * rps0 / PRECISION) - pos.rewardDebt0;
        pending1 = (pos.amount * rps1 / PRECISION) - pos.rewardDebt1;
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
