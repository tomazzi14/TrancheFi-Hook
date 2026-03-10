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

    /// @dev Build a fake Swap log record with given sqrtPriceX96
    function _makeSwapLog(uint256 sqrtPriceX96) internal view returns (IReactive.LogRecord memory) {
        // Swap data: (int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)
        bytes memory data = abi.encode(
            int128(1e18), // amount0
            int128(-1e18), // amount1
            uint160(sqrtPriceX96), // sqrtPriceX96
            uint128(1e18), // liquidity
            int24(0), // tick
            uint24(3000) // fee
        );

        return IReactive.LogRecord({
            chain_id: MONITORED_CHAIN,
            _contract: POOL_MANAGER,
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

    /// @dev Feed N swaps at stable price to build up observation count
    function _feedStableSwaps(uint256 price, uint256 count) internal {
        for (uint256 i = 0; i < count; i++) {
            rsc.react(_makeSwapLog(price));
        }
    }

    // ============ Deployment Tests ============

    function test_rscDeployed() public view {
        assertEq(rsc.destinationChainId(), UNICHAIN_ID, "Destination chain ID");
        assertEq(rsc.callbackReceiver(), callbackReceiver, "Callback receiver");
        assertEq(
            uint256(rsc.currentRegime()), uint256(TrancheFiVolatilityRSC.VolatilityRegime.MEDIUM), "Initial regime"
        );
        assertEq(rsc.observationCount(), 0, "No observations yet");
    }

    function test_constants() public view {
        assertEq(rsc.LOW_VOL_APY(), 300, "Low vol APY");
        assertEq(rsc.MED_VOL_APY(), 500, "Med vol APY");
        assertEq(rsc.HIGH_VOL_APY(), 1000, "High vol APY");
        assertEq(rsc.CALLBACK_GAS_LIMIT(), 200_000, "Callback gas limit");
    }

    // ============ Price Processing Tests ============

    function test_firstSwapSetsLastPrice() public {
        uint256 price = 79228162514264337593543950336; // 1:1 sqrtPriceX96
        rsc.react(_makeSwapLog(price));

        assertEq(rsc.lastSqrtPriceX96(), price, "Last price set");
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
        assertEq(rsc.lastSqrtPriceX96(), 0, "Zero price ignored");
        assertEq(rsc.observationCount(), 0, "No observation");
    }

    function test_multiChainConstructor() public {
        // Deploy with 3 chains (mimicking Eth Sepolia + Base Sepolia + Unichain Sepolia)
        uint256[] memory chainIds = new uint256[](3);
        chainIds[0] = 11155111; // Ethereum Sepolia
        chainIds[1] = 84532; // Base Sepolia
        chainIds[2] = 1301; // Unichain Sepolia
        address[] memory poolManagers = new address[](3);
        poolManagers[0] = address(0x1111);
        poolManagers[1] = address(0x2222);
        poolManagers[2] = address(0x3333);

        // Should deploy without reverting (vm=true skips subscribe)
        TrancheFiVolatilityRSC multiRsc =
            new TrancheFiVolatilityRSC(address(0), 1301, callbackReceiver, chainIds, poolManagers);
        assertEq(multiRsc.destinationChainId(), 1301);
        assertEq(multiRsc.callbackReceiver(), callbackReceiver);
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

    function test_sqrtPriceOverflowSafety() public {
        // Very large sqrtPriceX96 (near uint160 max)
        uint256 maxPrice = type(uint160).max;
        uint256 smallPrice = 1e18;

        rsc.react(_makeSwapLog(smallPrice));
        rsc.react(_makeSwapLog(maxPrice));

        // Should not revert, volatility should be very high
        assertTrue(rsc.volatilityEMA() > 0, "EMA updated with extreme price");
    }
}
