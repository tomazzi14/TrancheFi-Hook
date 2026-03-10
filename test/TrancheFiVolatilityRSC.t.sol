// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, Vm} from "forge-std/Test.sol";
import {TrancheFiVolatilityRSC} from "../src/TrancheFiVolatilityRSC.sol";
import {IReactive} from "reactive-lib/interfaces/IReactive.sol";

contract TrancheFiVolatilityRSCTest is Test {
    TrancheFiVolatilityRSC rsc;

    address callbackReceiver = makeAddr("callbackReceiver");
    uint256 constant UNICHAIN_ID = 130;
    uint256 constant MONITORED_CHAIN = 130;
    address constant POOL_MANAGER = address(0xBEEF);

    // Multi-chain constants
    uint256 constant ETH_SEPOLIA = 11155111;
    uint256 constant BASE_SEPOLIA = 84532;
    uint256 constant UNICHAIN_SEPOLIA = 1301;

    /// @dev Uniswap V4 Swap event topic0
    uint256 constant SWAP_TOPIC0 =
        uint256(keccak256("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)"));

    function setUp() public {
        // Deploy RSC — constructor detects vm=true (no system contract), skips subscribe()
        uint256[] memory chainIds = new uint256[](1);
        chainIds[0] = MONITORED_CHAIN;
        address[] memory poolManagers = new address[](1);
        poolManagers[0] = POOL_MANAGER;
        rsc = new TrancheFiVolatilityRSC(address(0), UNICHAIN_ID, callbackReceiver, chainIds, poolManagers);
    }

    // ============ Helpers ============

    /// @dev Build a fake Swap log record with given sqrtPriceX96 from a specific chain
    function _makeSwapLogFromChain(uint256 chainId, address poolManager, uint256 sqrtPriceX96)
        internal
        view
        returns (IReactive.LogRecord memory)
    {
        bytes memory data = abi.encode(
            int128(1e18), // amount0
            int128(-1e18), // amount1
            uint160(sqrtPriceX96), // sqrtPriceX96
            uint128(1e18), // liquidity
            int24(0), // tick
            uint24(3000) // fee
        );

        return IReactive.LogRecord({
            chain_id: chainId,
            _contract: poolManager,
            topic_0: SWAP_TOPIC0,
            topic_1: 0, // poolId
            topic_2: 0, // sender
            topic_3: 0,
            data: data,
            block_number: block.number,
            op_code: 0,
            block_hash: 0,
            tx_hash: 0,
            log_index: 0
        });
    }

    /// @dev Build a fake Swap log record with given sqrtPriceX96 (default chain)
    function _makeSwapLog(uint256 sqrtPriceX96) internal view returns (IReactive.LogRecord memory) {
        return _makeSwapLogFromChain(MONITORED_CHAIN, POOL_MANAGER, sqrtPriceX96);
    }

    /// @dev Feed N swaps at stable price to build up observation count
    function _feedStableSwaps(uint256 price, uint256 count) internal {
        for (uint256 i = 0; i < count; i++) {
            rsc.react(_makeSwapLog(price));
        }
    }

    /// @dev Deploy a 3-chain RSC for multi-chain tests
    function _deploy3ChainRSC() internal returns (TrancheFiVolatilityRSC) {
        uint256[] memory chainIds = new uint256[](3);
        chainIds[0] = ETH_SEPOLIA;
        chainIds[1] = BASE_SEPOLIA;
        chainIds[2] = UNICHAIN_SEPOLIA;
        address[] memory poolManagers = new address[](3);
        poolManagers[0] = address(0x1111);
        poolManagers[1] = address(0x2222);
        poolManagers[2] = address(0x3333);
        return new TrancheFiVolatilityRSC(address(0), 1301, callbackReceiver, chainIds, poolManagers);
    }

    // ============ Deployment Tests ============

    function test_rscDeployed() public view {
        assertEq(rsc.destinationChainId(), UNICHAIN_ID, "Destination chain ID");
        assertEq(rsc.callbackReceiver(), callbackReceiver, "Callback receiver");
        assertEq(
            uint256(rsc.currentRegime()), uint256(TrancheFiVolatilityRSC.VolatilityRegime.MEDIUM), "Initial regime"
        );
        assertEq(rsc.observationCount(), 0, "No observations yet");
        assertEq(rsc.monitoredChainCount(), 1, "One monitored chain");
    }

    function test_constants() public view {
        assertEq(rsc.LOW_VOL_APY(), 300, "Low vol APY");
        assertEq(rsc.MED_VOL_APY(), 500, "Med vol APY");
        assertEq(rsc.HIGH_VOL_APY(), 1000, "High vol APY");
        assertEq(rsc.CALLBACK_GAS_LIMIT(), 200_000, "Callback gas limit");
    }

    // ============ Price Processing Tests ============

    function test_firstSwapSetsWeightedPrice() public {
        uint256 price = 79228162514264337593543950336; // 1:1 sqrtPriceX96
        rsc.react(_makeSwapLog(price));

        assertEq(rsc.lastWeightedPrice(), price, "Weighted price set (single chain = raw price)");
        assertEq(rsc.chainPrices(MONITORED_CHAIN), price, "Chain price stored");
        assertEq(rsc.observationCount(), 0, "No observation yet (need 2 data points)");
    }

    function test_secondSwapStartsTracking() public {
        uint256 price1 = 79228162514264337593543950336; // 1:1
        uint256 price2 = 79228162514264337593543950336; // same price (no volatility)

        rsc.react(_makeSwapLog(price1));
        rsc.react(_makeSwapLog(price2));

        assertEq(rsc.observationCount(), 1, "One observation after second swap");
        assertEq(rsc.volatilityEMA(), 0, "Zero vol for same price");
    }

    function test_stablePriceKeepsLowVolatility() public {
        uint256 stablePrice = 79228162514264337593543950336; // 1:1
        _feedStableSwaps(stablePrice, 10);

        assertEq(rsc.volatilityEMA(), 0, "EMA stays 0 with no price change");
    }

    // ============ Volatility Computation Tests ============

    function test_smallPriceChangeProducesLowVol() public {
        uint256 basePrice = 79228162514264337593543950336; // 1:1 sqrtPriceX96

        // Feed initial stable observations
        _feedStableSwaps(basePrice, 6);

        // Small price change: 0.1% → squared return ≈ (0.002)² * 1e18 = ~4e12
        uint256 smallChange = basePrice + (basePrice / 1000); // +0.1%
        rsc.react(_makeSwapLog(smallChange));

        assertTrue(rsc.volatilityEMA() > 0, "EMA > 0 after price change");
        assertTrue(rsc.volatilityEMA() < rsc.LOW_THRESHOLD(), "Small change stays below low threshold");
    }

    function test_largePriceChangeProducesHighVol() public {
        uint256 basePrice = 79228162514264337593543950336;

        // Feed base price first
        rsc.react(_makeSwapLog(basePrice));

        // Large price changes to push EMA above HIGH_THRESHOLD
        for (uint256 i = 0; i < 8; i++) {
            uint256 upPrice = basePrice + (basePrice / 5); // +20% each
            rsc.react(_makeSwapLog(upPrice));
            rsc.react(_makeSwapLog(basePrice)); // back down
        }

        assertTrue(rsc.volatilityEMA() > rsc.HIGH_THRESHOLD(), "EMA above high threshold after large swings");
    }

    // ============ Regime Change Tests ============

    function test_regimeChangeToHigh() public {
        uint256 basePrice = 79228162514264337593543950336;

        // Start with base
        rsc.react(_makeSwapLog(basePrice));

        // Create high volatility with large price swings
        for (uint256 i = 0; i < 10; i++) {
            uint256 upPrice = basePrice + (basePrice / 4); // +25%
            rsc.react(_makeSwapLog(upPrice));
            rsc.react(_makeSwapLog(basePrice));
        }

        assertEq(
            uint256(rsc.currentRegime()), uint256(TrancheFiVolatilityRSC.VolatilityRegime.HIGH), "Regime should be HIGH"
        );
    }

    function test_regimeChangeToLow() public {
        uint256 basePrice = 79228162514264337593543950336;

        // First create high vol
        rsc.react(_makeSwapLog(basePrice));
        for (uint256 i = 0; i < 10; i++) {
            rsc.react(_makeSwapLog(basePrice + (basePrice / 4)));
            rsc.react(_makeSwapLog(basePrice));
        }
        assertEq(uint256(rsc.currentRegime()), uint256(TrancheFiVolatilityRSC.VolatilityRegime.HIGH), "Now HIGH");

        // Then feed many stable prices to bring EMA down
        for (uint256 i = 0; i < 100; i++) {
            rsc.react(_makeSwapLog(basePrice));
        }

        assertEq(
            uint256(rsc.currentRegime()), uint256(TrancheFiVolatilityRSC.VolatilityRegime.LOW), "Regime should be LOW"
        );
    }

    // ============ Callback Emission Tests ============

    function test_callbackEmittedOnRegimeChange() public {
        uint256 basePrice = 79228162514264337593543950336;

        rsc.react(_makeSwapLog(basePrice));

        // Create high volatility — expect Callback event
        vm.recordLogs();
        for (uint256 i = 0; i < 10; i++) {
            rsc.react(_makeSwapLog(basePrice + (basePrice / 4)));
            rsc.react(_makeSwapLog(basePrice));
        }

        // Check that Callback event was emitted
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 callbackTopic = keccak256("Callback(uint256,address,uint64,bytes)");

        bool callbackFound = false;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics.length > 0 && logs[i].topics[0] == callbackTopic) {
                // Verify chain_id (topic1) is destination chain
                assertEq(uint256(logs[i].topics[1]), UNICHAIN_ID, "Callback targets Unichain");
                // Verify contract (topic2) is callback receiver
                assertEq(address(uint160(uint256(logs[i].topics[2]))), callbackReceiver, "Callback targets receiver");
                callbackFound = true;
                break;
            }
        }
        assertTrue(callbackFound, "Callback event emitted on regime change");
    }

    function test_noCallbackWhenRegimeSame() public {
        uint256 basePrice = 79228162514264337593543950336;

        // Feed stable prices (regime stays MEDIUM since initial EMA=0 but regime starts MEDIUM)
        // Actually first push to LOW
        _feedStableSwaps(basePrice, 10);

        // Now regime should be LOW (EMA=0 < LOW_THRESHOLD)
        assertEq(uint256(rsc.currentRegime()), uint256(TrancheFiVolatilityRSC.VolatilityRegime.LOW));

        // Feed more stable prices — regime stays LOW, no callback
        vm.recordLogs();
        _feedStableSwaps(basePrice, 5);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bytes32 callbackTopic = keccak256("Callback(uint256,address,uint64,bytes)");
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics.length > 0 && logs[i].topics[0] == callbackTopic) {
                fail("Should not emit Callback when regime unchanged");
            }
        }
    }

    // ============ Edge Cases ============

    function test_zeroSqrtPriceIgnored() public {
        rsc.react(_makeSwapLog(0));
        assertEq(rsc.lastWeightedPrice(), 0, "Zero price ignored");
        assertEq(rsc.observationCount(), 0, "No observation");
    }

    function test_sqrtPriceOverflowSafety() public {
        // Very large sqrtPriceX96 (near uint160 max)
        uint256 maxPrice = type(uint160).max;
        uint256 smallPrice = 1e18;

        rsc.react(_makeSwapLog(smallPrice));
        rsc.react(_makeSwapLog(maxPrice));

        // Should not revert, volatility should be very high
        assertTrue(rsc.volatilityEMA() > 0, "EMA updated with extreme price");
    }

    // ============ Constructor Validation ============

    function test_multiChainConstructor() public {
        TrancheFiVolatilityRSC multiRsc = _deploy3ChainRSC();
        assertEq(multiRsc.destinationChainId(), 1301);
        assertEq(multiRsc.callbackReceiver(), callbackReceiver);
        assertEq(multiRsc.monitoredChainCount(), 3, "3 monitored chains");
        assertEq(multiRsc.monitoredChainIds(0), ETH_SEPOLIA);
        assertEq(multiRsc.monitoredChainIds(1), BASE_SEPOLIA);
        assertEq(multiRsc.monitoredChainIds(2), UNICHAIN_SEPOLIA);
    }

    function test_constructorRevertsEmptyChains() public {
        uint256[] memory chainIds = new uint256[](0);
        address[] memory poolManagers = new address[](0);
        vm.expectRevert("No chains to monitor");
        new TrancheFiVolatilityRSC(address(0), 1301, callbackReceiver, chainIds, poolManagers);
    }

    function test_constructorRevertsMismatchedArrays() public {
        uint256[] memory chainIds = new uint256[](2);
        chainIds[0] = 1;
        chainIds[1] = 2;
        address[] memory poolManagers = new address[](1);
        poolManagers[0] = address(0x1111);
        vm.expectRevert("Array length mismatch");
        new TrancheFiVolatilityRSC(address(0), 1301, callbackReceiver, chainIds, poolManagers);
    }

    // ============ Weighted Price Tests (Multi-Chain) ============

    function test_singleChainWeightedPriceEqualsRawPrice() public {
        // With only 1 monitored chain, weighted price = chain price
        uint256 price = 79228162514264337593543950336;
        rsc.react(_makeSwapLog(price));

        assertEq(rsc.lastWeightedPrice(), price, "Single chain: weighted == raw");
        assertEq(rsc.chainPrices(MONITORED_CHAIN), price, "Chain price stored");
    }

    function test_weightedPriceAverages3Chains() public {
        TrancheFiVolatilityRSC multiRsc = _deploy3ChainRSC();

        uint256 priceEth = 79228162514264337593543950336; // 1:1
        uint256 priceBase = 79228162514264337593543950336 + 1e27; // slightly higher
        uint256 priceUni = 79228162514264337593543950336 - 1e27; // slightly lower

        // Feed from each chain
        multiRsc.react(_makeSwapLogFromChain(ETH_SEPOLIA, address(0x1111), priceEth));
        multiRsc.react(_makeSwapLogFromChain(BASE_SEPOLIA, address(0x2222), priceBase));
        multiRsc.react(_makeSwapLogFromChain(UNICHAIN_SEPOLIA, address(0x3333), priceUni));

        // Weighted price should be average of all 3
        uint256 expectedAvg = (priceEth + priceBase + priceUni) / 3;
        assertEq(multiRsc.lastWeightedPrice(), expectedAvg, "Weighted price = average of 3 chains");

        // Individual chain prices stored correctly
        assertEq(multiRsc.chainPrices(ETH_SEPOLIA), priceEth);
        assertEq(multiRsc.chainPrices(BASE_SEPOLIA), priceBase);
        assertEq(multiRsc.chainPrices(UNICHAIN_SEPOLIA), priceUni);
    }

    function test_partialChainDataUsesAvailableChains() public {
        TrancheFiVolatilityRSC multiRsc = _deploy3ChainRSC();

        uint256 priceEth = 79228162514264337593543950336;

        // Only Ethereum has reported a swap
        multiRsc.react(_makeSwapLogFromChain(ETH_SEPOLIA, address(0x1111), priceEth));

        // Weighted price = just Ethereum's price (only 1 active chain)
        assertEq(multiRsc.lastWeightedPrice(), priceEth, "Partial data: uses available chain only");
        assertEq(multiRsc.chainPrices(BASE_SEPOLIA), 0, "Base has no data yet");
        assertEq(multiRsc.chainPrices(UNICHAIN_SEPOLIA), 0, "Unichain has no data yet");
    }

    function test_singleChainDeviationDampenedByOthers() public {
        // KEY INSIGHT: If ETH spikes on one chain but stays stable on others,
        // the weighted average dampens the spike → lower perceived volatility
        TrancheFiVolatilityRSC multiRsc = _deploy3ChainRSC();

        uint256 basePrice = 79228162514264337593543950336;

        // All 3 chains at base price
        multiRsc.react(_makeSwapLogFromChain(ETH_SEPOLIA, address(0x1111), basePrice));
        multiRsc.react(_makeSwapLogFromChain(BASE_SEPOLIA, address(0x2222), basePrice));
        multiRsc.react(_makeSwapLogFromChain(UNICHAIN_SEPOLIA, address(0x3333), basePrice));

        // Now Ethereum spikes +30%, others stay same
        uint256 spikedPrice = basePrice + (basePrice * 30 / 100);
        multiRsc.react(_makeSwapLogFromChain(ETH_SEPOLIA, address(0x1111), spikedPrice));

        // Weighted price: (spiked + base + base) / 3 = base + spike/3 ≈ +10%
        uint256 expectedWeighted = (spikedPrice + basePrice + basePrice) / 3;
        assertEq(multiRsc.lastWeightedPrice(), expectedWeighted, "Spike dampened by average");

        // The EMA should reflect ~10% move, not 30%
        uint256 ema = multiRsc.volatilityEMA();
        assertTrue(ema > 0, "Some volatility registered");

        // Compare: deploy single-chain RSC and feed same 30% spike
        uint256[] memory chainIds = new uint256[](1);
        chainIds[0] = ETH_SEPOLIA;
        address[] memory pms = new address[](1);
        pms[0] = address(0x1111);
        TrancheFiVolatilityRSC singleRsc = new TrancheFiVolatilityRSC(address(0), 1301, callbackReceiver, chainIds, pms);

        singleRsc.react(_makeSwapLogFromChain(ETH_SEPOLIA, address(0x1111), basePrice));
        singleRsc.react(_makeSwapLogFromChain(ETH_SEPOLIA, address(0x1111), spikedPrice));

        // Single-chain EMA should be HIGHER (full 30% spike)
        assertTrue(singleRsc.volatilityEMA() > ema, "Single-chain sees higher vol than multi-chain dampened");
    }

    function test_allChainsMoveSameDirectionFullCapture() public {
        // When ALL chains move together (correlated), weighted average captures full move
        TrancheFiVolatilityRSC multiRsc = _deploy3ChainRSC();

        uint256 basePrice = 79228162514264337593543950336;

        // All 3 chains at base price
        multiRsc.react(_makeSwapLogFromChain(ETH_SEPOLIA, address(0x1111), basePrice));
        multiRsc.react(_makeSwapLogFromChain(BASE_SEPOLIA, address(0x2222), basePrice));
        multiRsc.react(_makeSwapLogFromChain(UNICHAIN_SEPOLIA, address(0x3333), basePrice));

        // ALL chains crash -20%
        uint256 crashedPrice = basePrice - (basePrice * 20 / 100);
        multiRsc.react(_makeSwapLogFromChain(ETH_SEPOLIA, address(0x1111), crashedPrice));
        multiRsc.react(_makeSwapLogFromChain(BASE_SEPOLIA, address(0x2222), crashedPrice));
        multiRsc.react(_makeSwapLogFromChain(UNICHAIN_SEPOLIA, address(0x3333), crashedPrice));

        // Weighted price should be exactly crashed price (all equal)
        assertEq(multiRsc.lastWeightedPrice(), crashedPrice, "All chains crashed: weighted = crashed price");

        // High volatility should be registered
        assertTrue(multiRsc.volatilityEMA() > 0, "Correlated crash captured");
    }

    function test_multiChainRegimeChangeToHigh() public {
        // Full integration: multi-chain volatile swaps → regime changes to HIGH → callback emitted
        TrancheFiVolatilityRSC multiRsc = _deploy3ChainRSC();

        uint256 basePrice = 79228162514264337593543950336;

        // Initialize all chains
        multiRsc.react(_makeSwapLogFromChain(ETH_SEPOLIA, address(0x1111), basePrice));
        multiRsc.react(_makeSwapLogFromChain(BASE_SEPOLIA, address(0x2222), basePrice));
        multiRsc.react(_makeSwapLogFromChain(UNICHAIN_SEPOLIA, address(0x3333), basePrice));

        // Volatile swaps across all chains — all move ±25%
        vm.recordLogs();
        for (uint256 i = 0; i < 10; i++) {
            uint256 upPrice = basePrice + (basePrice / 4);
            multiRsc.react(_makeSwapLogFromChain(ETH_SEPOLIA, address(0x1111), upPrice));
            multiRsc.react(_makeSwapLogFromChain(BASE_SEPOLIA, address(0x2222), upPrice));
            multiRsc.react(_makeSwapLogFromChain(UNICHAIN_SEPOLIA, address(0x3333), upPrice));
            multiRsc.react(_makeSwapLogFromChain(ETH_SEPOLIA, address(0x1111), basePrice));
            multiRsc.react(_makeSwapLogFromChain(BASE_SEPOLIA, address(0x2222), basePrice));
            multiRsc.react(_makeSwapLogFromChain(UNICHAIN_SEPOLIA, address(0x3333), basePrice));
        }

        assertEq(
            uint256(multiRsc.currentRegime()),
            uint256(TrancheFiVolatilityRSC.VolatilityRegime.HIGH),
            "Multi-chain regime should be HIGH"
        );

        // Verify callback was emitted
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 callbackTopic = keccak256("Callback(uint256,address,uint64,bytes)");
        bool callbackFound = false;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics.length > 0 && logs[i].topics[0] == callbackTopic) {
                callbackFound = true;
                break;
            }
        }
        assertTrue(callbackFound, "Callback emitted on multi-chain regime change");
    }
}
