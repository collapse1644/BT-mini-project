// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract SpeedrunRegistry {
    struct Run {
        string player;
        string game;
        string category;
        uint256 timeSeconds;
        bytes32 proofHash;
        uint256 timestamp;
    }

    Run[] private runs;
    mapping(bytes32 => bool) public proofHashExists;

    event RunSubmitted(
        uint256 indexed runId,
        string player,
        string game,
        string category,
        uint256 timeSeconds,
        bytes32 indexed proofHash,
        uint256 timestamp
    );

    function submitRun(
        string calldata player,
        string calldata game,
        string calldata category,
        uint256 timeSeconds,
        bytes32 proofHash
    ) external {
        require(bytes(player).length > 0, "Player is required");
        require(bytes(game).length > 0, "Game is required");
        require(bytes(category).length > 0, "Category is required");
        require(timeSeconds > 0, "Time must be positive");
        require(proofHash != bytes32(0), "Proof hash is required");
        require(!proofHashExists[proofHash], "Duplicate proof hash");

        proofHashExists[proofHash] = true;

        runs.push(
            Run({
                player: player,
                game: game,
                category: category,
                timeSeconds: timeSeconds,
                proofHash: proofHash,
                timestamp: block.timestamp
            })
        );

        emit RunSubmitted(
            runs.length - 1,
            player,
            game,
            category,
            timeSeconds,
            proofHash,
            block.timestamp
        );
    }

    function getRuns() external view returns (Run[] memory) {
        return runs;
    }

    function totalRuns() external view returns (uint256) {
        return runs.length;
    }
}
