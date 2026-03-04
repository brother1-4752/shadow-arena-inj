use cosmwasm_std::{Addr, Timestamp, Uint128};
use cw_storage_plus::{Item, Map};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum MatchState {
    Created,
    Funded,
    Active,
    ResultPending,
    Finished,
    Disputed,
    Resolved,
    Settled,
    Cancelled,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct PendingResult {
    pub winner: Addr,
    pub multiplier: u8,
    pub game_hash: Vec<u8>,
    pub player_a_confirmed: bool,
    pub player_b_confirmed: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct Match {
    pub match_id: String,
    pub player_a: Addr,
    pub player_b: Addr,
    pub stake: Uint128,
    pub denom: String,
    pub player_a_funded: bool,
    pub player_b_funded: bool,
    pub funded_at: Option<Timestamp>,
    pub pending_result: Option<PendingResult>,
    pub winner: Option<Addr>,
    pub multiplier: Option<u8>,
    pub game_hash: Option<Vec<u8>>,
    pub finished_at: Option<Timestamp>,
    pub state: MatchState,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct Config {
    pub owner: Addr,
    pub server_authority: Addr,
    pub dispute_resolver: Addr,
    pub fee_bps: u16,
    pub dispute_window_secs: u64,
    pub resolve_deadline_secs: u64,
}

pub const CONFIG: Item<Config> = Item::new("config");
pub const MATCHES: Map<&str, Match> = Map::new("matches");
pub const COLLECTED_FEES: Item<Uint128> = Item::new("collected_fees");
