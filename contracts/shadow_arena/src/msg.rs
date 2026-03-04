use cosmwasm_schema::{cw_serde, QueryResponses};

#[cw_serde]
pub struct InstantiateMsg {
    pub server_authority: String,
    pub dispute_resolver: String,
    pub fee_bps: u16,
    pub dispute_window_secs: u64,
    pub resolve_deadline_secs: u64,
}

#[cw_serde]
pub enum ExecuteMsg {
    CreateMatch {
        match_id: String,
        player_a: String,
        player_b: String,
        stake: String,
        denom: String,
    },
    FundMatch {
        match_id: String,
    },
    SubmitResult {
        match_id: String,
        winner: String,
        multiplier: u8,
        game_hash: String,
        evidence_hash: Option<String>,
    },
    ConfirmResult {
        match_id: String,
    },
    RaiseDispute {
        match_id: String,
        evidence_hash: String,
    },
    ResolveDispute {
        match_id: String,
        final_winner: String,
        final_multiplier: u8,
    },
    Claim {
        match_id: String,
    },
    EmergencyCancel {
        match_id: String,
    },
    UpdateConfig {
        server_authority: Option<String>,
        dispute_resolver: Option<String>,
        fee_bps: Option<u16>,
    },
    WithdrawFees {
        recipient: String,
    },
}

#[cw_serde]
#[derive(QueryResponses)]
pub enum QueryMsg {
    #[returns(crate::state::Config)]
    GetConfig {},

    #[returns(crate::state::Match)]
    GetMatch { match_id: String },

    #[returns(FeesResponse)]
    GetCollectedFees {},
}

#[cw_serde]
pub struct FeesResponse {
    pub amount: String,
    pub denom: String,
}
