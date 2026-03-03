// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ShadowArenaEscrow is EIP712, ReentrancyGuard, Ownable {
    using ECDSA for bytes32;

    enum Status {
        None,
        Created,
        Active,
        Finished,
        Disputed,
        Settled
    }

    struct MatchInfo {
        address playerA;
        address playerB;
        uint256 baseStake;
        uint256 pot; // total funded amount (2 * stake)
        Status status;
        uint64 disputeUntil; // unix timestamp
        address winner;
        uint8 multiplier; // 1,2,3
        bytes32 gameHash;
    }

    // EIP-712 typed data
    struct MatchResult {
        bytes32 matchId;
        address playerA;
        address playerB;
        uint256 baseStake;
        uint8 multiplier;
        address winner;
        bytes32 gameHash;
    }

    bytes32 public constant MATCHRESULT_TYPEHASH =
        keccak256(
            "MatchResult(bytes32 matchId,address playerA,address playerB,uint256 baseStake,uint8 multiplier,address winner,bytes32 gameHash)"
        );

    uint16 public platformFeeBps = 400; // 4%
    uint32 public disputeWindowSec = 10 minutes;

    mapping(bytes32 => MatchInfo) public matches;
    mapping(bytes32 => mapping(address => bool)) public funded;

    event MatchCreated(
        bytes32 indexed matchId,
        address indexed playerA,
        address indexed playerB,
        uint256 stake
    );
    event MatchFunded(
        bytes32 indexed matchId,
        address indexed funder,
        uint256 amount,
        uint256 pot
    );
    event GameSubmitted(
        bytes32 indexed matchId,
        address winner,
        uint8 multiplier,
        bytes32 gameHash,
        uint64 disputeUntil
    );
    event Disputed(
        bytes32 indexed matchId,
        address indexed by,
        bytes32 evidenceHash
    );
    event Settled(
        bytes32 indexed matchId,
        address winner,
        uint256 payout,
        uint256 fee
    );

    constructor() EIP712("ShadowArenaEscrow", "1") Ownable(msg.sender) {}

    function setPlatformFeeBps(uint16 bps) external onlyOwner {
        require(bps <= 1000, "fee too high"); // <=10%
        platformFeeBps = bps;
    }

    function setDisputeWindow(uint32 sec_) external onlyOwner {
        require(sec_ >= 60 && sec_ <= 1 days, "bad window");
        disputeWindowSec = sec_;
    }

    function createMatch(
        bytes32 matchId,
        address playerA,
        address playerB,
        uint256 stake
    ) external {
        require(matches[matchId].status == Status.None, "match exists");
        require(
            playerA != address(0) &&
                playerB != address(0) &&
                playerA != playerB,
            "bad players"
        );
        require(stake > 0, "stake=0");

        matches[matchId] = MatchInfo({
            playerA: playerA,
            playerB: playerB,
            baseStake: stake,
            pot: 0,
            status: Status.Created,
            disputeUntil: 0,
            winner: address(0),
            multiplier: 0,
            gameHash: bytes32(0)
        });

        emit MatchCreated(matchId, playerA, playerB, stake);
    }

    function fundMatch(bytes32 matchId) external payable {
        MatchInfo storage m = matches[matchId];
        require(
            m.status == Status.Created || m.status == Status.Active,
            "not fundable"
        );
        require(
            msg.sender == m.playerA || msg.sender == m.playerB,
            "not player"
        );
        require(!funded[matchId][msg.sender], "already funded");
        require(msg.value == m.baseStake, "wrong stake");

        funded[matchId][msg.sender] = true;
        m.pot += msg.value;

        if (funded[matchId][m.playerA] && funded[matchId][m.playerB]) {
            m.status = Status.Active;
        }

        emit MatchFunded(matchId, msg.sender, msg.value, m.pot);
    }

    function submitGame(
        MatchResult calldata r,
        bytes calldata serverSig,
        bytes calldata sigA,
        bytes calldata sigB
    ) external {
        MatchInfo storage m = matches[r.matchId];
        require(m.status == Status.Active, "not active");
        require(m.pot == 2 * m.baseStake, "not fully funded");
        require(
            r.playerA == m.playerA && r.playerB == m.playerB,
            "players mismatch"
        );
        require(r.baseStake == m.baseStake, "stake mismatch");
        require(r.winner == m.playerA || r.winner == m.playerB, "bad winner");
        require(
            r.multiplier == 1 || r.multiplier == 2 || r.multiplier == 3,
            "bad mult"
        );

        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    MATCHRESULT_TYPEHASH,
                    r.matchId,
                    r.playerA,
                    r.playerB,
                    r.baseStake,
                    r.multiplier,
                    r.winner,
                    r.gameHash
                )
            )
        );

        // NOTE: server signer management to be added (placeholder: owner is server)
        require(digest.recover(serverSig) == owner(), "bad server sig");
        require(digest.recover(sigA) == m.playerA, "bad sigA");
        require(digest.recover(sigB) == m.playerB, "bad sigB");

        m.status = Status.Finished;
        m.winner = r.winner;
        m.multiplier = r.multiplier;
        m.gameHash = r.gameHash;
        m.disputeUntil = uint64(block.timestamp + disputeWindowSec);

        emit GameSubmitted(
            r.matchId,
            r.winner,
            r.multiplier,
            r.gameHash,
            m.disputeUntil
        );
    }

    function raiseDispute(bytes32 matchId, bytes32 evidenceHash) external {
        MatchInfo storage m = matches[matchId];
        require(m.status == Status.Finished, "not finished");
        require(block.timestamp <= m.disputeUntil, "window over");
        require(
            msg.sender == m.playerA || msg.sender == m.playerB,
            "not player"
        );

        m.status = Status.Disputed;
        emit Disputed(matchId, msg.sender, evidenceHash);
    }

    function settle(bytes32 matchId) external nonReentrant {
        MatchInfo storage m = matches[matchId];
        require(m.status == Status.Finished, "not settleable");
        require(block.timestamp > m.disputeUntil, "dispute window");

        _payout(matchId);
    }

    // Owner resolves dispute off-chain; in future can add resolver role + evidence processing
    function resolveDispute(
        bytes32 matchId,
        address finalWinner
    ) external onlyOwner nonReentrant {
        MatchInfo storage m = matches[matchId];
        require(m.status == Status.Disputed, "not disputed");
        require(
            finalWinner == m.playerA || finalWinner == m.playerB,
            "bad winner"
        );

        m.winner = finalWinner;
        _payout(matchId);
    }

    function _payout(bytes32 matchId) internal {
        MatchInfo storage m = matches[matchId];
        require(
            m.status == Status.Finished || m.status == Status.Disputed,
            "bad status"
        );

        uint256 fee = (m.pot * platformFeeBps) / 10_000;
        uint256 payout = m.pot - fee;

        m.status = Status.Settled;

        (bool ok1, ) = payable(m.winner).call{value: payout}("");
        require(ok1, "payout fail");
        if (fee > 0) {
            (bool ok2, ) = payable(owner()).call{value: fee}("");
            require(ok2, "fee fail");
        }

        emit Settled(matchId, m.winner, payout, fee);
    }
}
