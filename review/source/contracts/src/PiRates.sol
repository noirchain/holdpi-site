// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

library PiRates {
    uint256 internal constant DAY = 1 days;
    uint256 internal constant BUY_BPS = 500;
    function birth(uint256 timestamp) internal pure returns (uint256) {
        return (timestamp + DAY - 1) / DAY;
    }
    function age(
        uint256 born,
        uint256 timestamp
    ) internal pure returns (uint256) {
        uint256 today = timestamp / DAY;
        return today > born ? today - born : 0;
    }
    function sell(uint256 d) internal pure returns (uint256) {
        if (d < 1) return 1000;
        if (d < 3) return 800 - (200 * (d - 1)) / 2;
        if (d < 7) return 600 - (200 * (d - 3)) / 4;
        if (d < 14) return 400 - (200 * (d - 7)) / 7;
        if (d < 30) return 200 - (100 * (d - 14)) / 16;
        return 100;
    }
    // Two units represent 1x; integer weights 2/3/4 represent 1x/1.5x/2x.
    function weight(uint256 d) internal pure returns (uint256) {
        return
            d < 1
                ? 0
                : d < 7
                    ? 2
                    : d < 30
                        ? 3
                        : 4;
    }
}
