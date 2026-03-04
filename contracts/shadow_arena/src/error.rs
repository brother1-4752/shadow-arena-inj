use cosmwasm_std::StdError;
use thiserror::Error;

#[derive(Error, Debug, PartialEq)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] StdError),

    #[error("Unauthorized: {msg}")]
    Unauthorized { msg: String },

    #[error("Match already exists: {match_id}")]
    MatchAlreadyExists { match_id: String },

    #[error("Match not found: {match_id}")]
    MatchNotFound { match_id: String },

    #[error("Invalid state transition: expected {expected}, got {actual}")]
    InvalidState { expected: String, actual: String },

    #[error("Already funded by this player")]
    AlreadyFunded,

    #[error("Incorrect stake amount: expected {expected}, got {actual}")]
    IncorrectStake { expected: String, actual: String },

    #[error("Incorrect denom: expected {expected}, got {actual}")]
    IncorrectDenom { expected: String, actual: String },

    #[error("Invalid multiplier: {value}. Must be 1, 2, or 3")]
    InvalidMultiplier { value: u8 },

    #[error("Dispute window has expired")]
    DisputeWindowExpired,

    #[error("Dispute window has not yet expired")]
    DisputeWindowNotExpired,

    #[error("Already settled")]
    AlreadySettled,

    #[error("Not a player in this match")]
    NotAPlayer,

    #[error("Invalid winner: must be playerA or playerB")]
    InvalidWinner,

    #[error("Result already submitted")]
    ResultAlreadySubmitted,

    #[error("Already confirmed by this player")]
    AlreadyConfirmed,

    #[error("No result pending confirmation")]
    NoResultPending,

    #[error("Emergency cancel not yet available: match not timed out")]
    NotTimedOut,

    #[error("Zero stake not allowed")]
    ZeroStake,

    #[error("Match ID too long (max 64 chars)")]
    MatchIdTooLong,
}
