// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
import {Script} from "forge-std/Script.sol";
interface IMockERC20 { function mint(address,uint256) external; function balanceOf(address) external view returns(uint256); }
contract MintTo is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);
        address to = 0x15794065BCAB506399A6891FDD51B9Ee96270a31;
        IMockERC20(0xa86dccA9D2A55c08DE7F7c1a9b6D91D31c40fc9A).mint(to, 50_000_000 ether);
        IMockERC20(0x38747E5317bBC519E194faD3a73daA2D2e1cbF9E).mint(to, 5_000 ether);
        vm.stopBroadcast();
    }
}
