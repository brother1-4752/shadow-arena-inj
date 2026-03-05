#[cfg(not(feature = "library"))]
use cosmwasm_std::entry_point;

use cosmwasm_std::{
    attr, to_json_binary, Addr, BankMsg, Binary, Coin, Deps, DepsMut, Env, MessageInfo, Response,
    StdResult, Uint128,
};
use cw2::set_contract_version;

use crate::error::ContractError;
use crate::helpers::{calculate_fee, calculate_gross_payout, parse_hash};
use crate::msg::{ExecuteMsg, FeesResponse, InstantiateMsg, QueryMsg};
use crate::state::{Config, Match, MatchState, PendingResult, COLLECTED_FEES, CONFIG, MATCHES};

const CONTRACT_NAME: &str = "shadow-arena-escrow";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;

    if msg.fee_bps > 1000 {
        return Err(ContractError::Unauthorized {
            msg: "fee_bps cannot exceed 10%".to_string(),
        });
    }

    let config = Config {
        owner: info.sender.clone(),
        server_authority: Addr::unchecked(&msg.server_authority),
        dispute_resolver: Addr::unchecked(&msg.dispute_resolver),
        fee_bps: msg.fee_bps,
        dispute_window_secs: msg.dispute_window_secs,
        resolve_deadline_secs: msg.resolve_deadline_secs,
    };

    CONFIG.save(deps.storage, &config)?;
    COLLECTED_FEES.save(deps.storage, &Uint128::zero())?;

    Ok(Response::new()
        .add_attribute("action", "instantiate")
        .add_attribute("owner", info.sender))
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        ExecuteMsg::CreateMatch {
            match_id,
            player_a,
            player_b,
            stake,
            denom,
        } => exec_create_match(deps, info, match_id, player_a, player_b, stake, denom),
        ExecuteMsg::FundMatch { match_id } => exec_fund_match(deps, env, info, match_id),
        ExecuteMsg::SubmitResult {
            match_id,
            winner,
            multiplier,
            game_hash,
            evidence_hash: _,
        } => exec_submit_result(deps, info, match_id, winner, multiplier, game_hash),
        ExecuteMsg::ConfirmResult { match_id } => exec_confirm_result(deps, env, info, match_id),
        ExecuteMsg::RaiseDispute {
            match_id,
            evidence_hash,
        } => exec_raise_dispute(deps, env, info, match_id, evidence_hash),
        ExecuteMsg::ResolveDispute {
            match_id,
            final_winner,
            final_multiplier,
        } => exec_resolve_dispute(deps, info, match_id, final_winner, final_multiplier),
        ExecuteMsg::Claim { match_id } => exec_claim(deps, env, match_id),
        ExecuteMsg::EmergencyCancel { match_id } => {
            exec_emergency_cancel(deps, env, info, match_id)
        }
        ExecuteMsg::CancelUnfunded { match_id } => exec_cancel_unfunded(deps, info, match_id),
        ExecuteMsg::UpdateConfig {
            server_authority,
            dispute_resolver,
            fee_bps,
        } => exec_update_config(deps, info, server_authority, dispute_resolver, fee_bps),
        ExecuteMsg::WithdrawFees { recipient } => exec_withdraw_fees(deps, info, recipient),
    }
}

fn exec_create_match(
    deps: DepsMut,
    _info: MessageInfo,
    match_id: String,
    player_a: String,
    player_b: String,
    stake: String,
    denom: String,
) -> Result<Response, ContractError> {
    if match_id.len() > 64 {
        return Err(ContractError::MatchIdTooLong);
    }
    if MATCHES.may_load(deps.storage, &match_id)?.is_some() {
        return Err(ContractError::MatchAlreadyExists { match_id });
    }

    let player_a_addr = Addr::unchecked(&player_a);
    let player_b_addr = Addr::unchecked(&player_b);

    if player_a_addr == player_b_addr {
        return Err(ContractError::InvalidWinner);
    }

    let stake_amount = stake.parse::<u128>().map(Uint128::new).map_err(|_| {
        ContractError::Std(cosmwasm_std::StdError::generic_err("Invalid stake amount"))
    })?;

    if stake_amount.is_zero() {
        return Err(ContractError::ZeroStake);
    }

    MATCHES.save(
        deps.storage,
        &match_id,
        &Match {
            match_id: match_id.clone(),
            player_a: player_a_addr,
            player_b: player_b_addr,
            stake: stake_amount,
            denom,
            player_a_funded: false,
            player_b_funded: false,
            funded_at: None,
            pending_result: None,
            winner: None,
            multiplier: None,
            game_hash: None,
            finished_at: None,
            state: MatchState::Created,
        },
    )?;

    Ok(Response::new()
        .add_attribute("action", "create_match")
        .add_attribute("match_id", match_id))
}

fn exec_fund_match(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    match_id: String,
) -> Result<Response, ContractError> {
    let mut m = load_match(deps.storage, &match_id)?;

    match m.state {
        MatchState::Created | MatchState::Funded => {}
        _ => {
            return Err(ContractError::InvalidState {
                expected: "Created or Funded".to_string(),
                actual: format!("{:?}", m.state),
            })
        }
    }

    let sent = info
        .funds
        .iter()
        .find(|c| c.denom == m.denom)
        .map(|c| c.amount)
        .unwrap_or_default();

    if sent != m.stake {
        return Err(ContractError::IncorrectStake {
            expected: m.stake.to_string(),
            actual: sent.to_string(),
        });
    }

    let is_a = info.sender == m.player_a;
    let is_b = info.sender == m.player_b;
    if !is_a && !is_b {
        return Err(ContractError::NotAPlayer);
    }

    if is_a {
        if m.player_a_funded {
            return Err(ContractError::AlreadyFunded);
        }
        m.player_a_funded = true;
    } else {
        if m.player_b_funded {
            return Err(ContractError::AlreadyFunded);
        }
        m.player_b_funded = true;
    }

    let both = m.player_a_funded && m.player_b_funded;
    if both {
        m.state = MatchState::Active;
        m.funded_at = Some(env.block.time);
    } else {
        m.state = MatchState::Funded;
    }

    MATCHES.save(deps.storage, &match_id, &m)?;

    Ok(Response::new().add_attributes(vec![
        attr("action", "fund_match"),
        attr("match_id", &match_id),
        attr("both_funded", both.to_string()),
    ]))
}

fn exec_submit_result(
    deps: DepsMut,
    info: MessageInfo,
    match_id: String,
    winner: String,
    multiplier: u8,
    game_hash: String,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;

    if info.sender != config.server_authority {
        return Err(ContractError::Unauthorized {
            msg: "Only server_authority can submit results".to_string(),
        });
    }

    let mut m = load_match(deps.storage, &match_id)?;

    if m.state != MatchState::Active {
        return Err(ContractError::InvalidState {
            expected: "Active".to_string(),
            actual: format!("{:?}", m.state),
        });
    }
    if m.pending_result.is_some() {
        return Err(ContractError::ResultAlreadySubmitted);
    }
    if !(1..=3).contains(&multiplier) {
        return Err(ContractError::InvalidMultiplier { value: multiplier });
    }

    let winner_addr = Addr::unchecked(&winner);
    if winner_addr != m.player_a && winner_addr != m.player_b {
        return Err(ContractError::InvalidWinner);
    }

    let hash_bytes = parse_hash(&game_hash)?;

    m.pending_result = Some(PendingResult {
        winner: winner_addr,
        multiplier,
        game_hash: hash_bytes,
        player_a_confirmed: false,
        player_b_confirmed: false,
    });
    m.state = MatchState::ResultPending;

    MATCHES.save(deps.storage, &match_id, &m)?;

    Ok(Response::new().add_attributes(vec![
        attr("action", "submit_result"),
        attr("match_id", &match_id),
        attr("multiplier", multiplier.to_string()),
    ]))
}

fn exec_confirm_result(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    match_id: String,
) -> Result<Response, ContractError> {
    let mut m = load_match(deps.storage, &match_id)?;

    if m.state != MatchState::ResultPending {
        return Err(ContractError::InvalidState {
            expected: "ResultPending".to_string(),
            actual: format!("{:?}", m.state),
        });
    }

    let pending = m
        .pending_result
        .as_mut()
        .ok_or(ContractError::NoResultPending)?;

    let is_a = info.sender == m.player_a;
    let is_b = info.sender == m.player_b;
    if !is_a && !is_b {
        return Err(ContractError::NotAPlayer);
    }

    if is_a {
        if pending.player_a_confirmed {
            return Err(ContractError::AlreadyConfirmed);
        }
        pending.player_a_confirmed = true;
    } else {
        if pending.player_b_confirmed {
            return Err(ContractError::AlreadyConfirmed);
        }
        pending.player_b_confirmed = true;
    }

    let both_confirmed = pending.player_a_confirmed && pending.player_b_confirmed;

    if both_confirmed {
        let p = m.pending_result.take().unwrap();
        m.winner = Some(p.winner);
        m.multiplier = Some(p.multiplier);
        m.game_hash = Some(p.game_hash);
        m.finished_at = Some(env.block.time);
        m.state = MatchState::Finished;
    }

    MATCHES.save(deps.storage, &match_id, &m)?;

    Ok(Response::new().add_attributes(vec![
        attr("action", "confirm_result"),
        attr("match_id", &match_id),
        attr("confirmer", info.sender.to_string()),
        attr("both_confirmed", both_confirmed.to_string()),
    ]))
}

fn exec_raise_dispute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    match_id: String,
    evidence_hash: String,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    let mut m = load_match(deps.storage, &match_id)?;

    match m.state {
        MatchState::ResultPending | MatchState::Finished => {}
        _ => {
            return Err(ContractError::InvalidState {
                expected: "ResultPending or Finished".to_string(),
                actual: format!("{:?}", m.state),
            })
        }
    }

    if info.sender != m.player_a && info.sender != m.player_b {
        return Err(ContractError::NotAPlayer);
    }

    if m.state == MatchState::Finished {
        let deadline = m.finished_at.unwrap().seconds() + config.dispute_window_secs;
        if env.block.time.seconds() > deadline {
            return Err(ContractError::DisputeWindowExpired);
        }
    }

    parse_hash(&evidence_hash)?;

    m.state = MatchState::Disputed;
    MATCHES.save(deps.storage, &match_id, &m)?;

    Ok(Response::new().add_attributes(vec![
        attr("action", "raise_dispute"),
        attr("match_id", &match_id),
        attr("raiser", info.sender.to_string()),
    ]))
}

fn exec_resolve_dispute(
    deps: DepsMut,
    info: MessageInfo,
    match_id: String,
    final_winner: String,
    final_multiplier: u8,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;

    if info.sender != config.dispute_resolver && info.sender != config.owner {
        return Err(ContractError::Unauthorized {
            msg: "Only dispute_resolver or owner".to_string(),
        });
    }

    let mut m = load_match(deps.storage, &match_id)?;

    if m.state != MatchState::Disputed {
        return Err(ContractError::InvalidState {
            expected: "Disputed".to_string(),
            actual: format!("{:?}", m.state),
        });
    }
    if !(1..=3).contains(&final_multiplier) {
        return Err(ContractError::InvalidMultiplier {
            value: final_multiplier,
        });
    }

    let winner_addr = Addr::unchecked(&final_winner);
    if winner_addr != m.player_a && winner_addr != m.player_b {
        return Err(ContractError::InvalidWinner);
    }

    m.winner = Some(winner_addr.clone());
    m.multiplier = Some(final_multiplier);
    m.state = MatchState::Resolved;
    MATCHES.save(deps.storage, &match_id, &m)?;

    let msgs = build_payout_msgs(deps.storage, &match_id)?;

    let mut m2 = load_match(deps.storage, &match_id)?;
    m2.state = MatchState::Settled;
    m2.pending_result = None; // 추가
    MATCHES.save(deps.storage, &match_id, &m2)?;

    Ok(Response::new().add_messages(msgs).add_attributes(vec![
        attr("action", "resolve_dispute"),
        attr("match_id", &match_id),
        attr("final_winner", winner_addr.to_string()),
    ]))
}

fn exec_claim(deps: DepsMut, env: Env, match_id: String) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    let m = load_match(deps.storage, &match_id)?;

    if m.state != MatchState::Finished {
        return Err(ContractError::InvalidState {
            expected: "Finished".to_string(),
            actual: format!("{:?}", m.state),
        });
    }

    let deadline = m.finished_at.unwrap().seconds() + config.dispute_window_secs;
    if env.block.time.seconds() <= deadline {
        return Err(ContractError::DisputeWindowNotExpired);
    }

    let msgs = build_payout_msgs(deps.storage, &match_id)?;

    let mut m2 = load_match(deps.storage, &match_id)?;
    m2.state = MatchState::Settled;
    MATCHES.save(deps.storage, &match_id, &m2)?;

    Ok(Response::new()
        .add_messages(msgs)
        .add_attributes(vec![attr("action", "claim"), attr("match_id", &match_id)]))
}

fn exec_emergency_cancel(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    match_id: String,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    let mut m = load_match(deps.storage, &match_id)?;

    match m.state {
        MatchState::Active | MatchState::ResultPending => {}
        _ => {
            return Err(ContractError::InvalidState {
                expected: "Active or ResultPending".to_string(),
                actual: format!("{:?}", m.state),
            })
        }
    }

    if info.sender != m.player_a && info.sender != m.player_b {
        return Err(ContractError::NotAPlayer);
    }

    let funded_at = m.funded_at.ok_or(ContractError::NotTimedOut)?;
    if env.block.time.seconds() < funded_at.seconds() + config.resolve_deadline_secs {
        return Err(ContractError::NotTimedOut);
    }

    m.state = MatchState::Cancelled;
    MATCHES.save(deps.storage, &match_id, &m)?;

    Ok(Response::new()
        .add_message(BankMsg::Send {
            to_address: m.player_a.to_string(),
            amount: vec![Coin {
                denom: m.denom.clone(),
                amount: m.stake,
            }],
        })
        .add_message(BankMsg::Send {
            to_address: m.player_b.to_string(),
            amount: vec![Coin {
                denom: m.denom.clone(),
                amount: m.stake,
            }],
        })
        .add_attributes(vec![
            attr("action", "emergency_cancel"),
            attr("match_id", &match_id),
        ]))
}

/// Cancel a match that is still in Created or Funded state (not yet Active).
/// Either player can call this. Refunds any player who has already funded.
fn exec_cancel_unfunded(
    deps: DepsMut,
    info: MessageInfo,
    match_id: String,
) -> Result<Response, ContractError> {
    let mut m = load_match(deps.storage, &match_id)?;

    match m.state {
        MatchState::Created | MatchState::Funded => {}
        _ => {
            return Err(ContractError::InvalidState {
                expected: "Created or Funded".to_string(),
                actual: format!("{:?}", m.state),
            })
        }
    }

    if info.sender != m.player_a && info.sender != m.player_b {
        return Err(ContractError::NotAPlayer);
    }

    m.state = MatchState::Cancelled;
    MATCHES.save(deps.storage, &match_id, &m)?;

    let mut resp = Response::new();

    if m.player_a_funded {
        resp = resp.add_message(BankMsg::Send {
            to_address: m.player_a.to_string(),
            amount: vec![Coin {
                denom: m.denom.clone(),
                amount: m.stake,
            }],
        });
    }
    if m.player_b_funded {
        resp = resp.add_message(BankMsg::Send {
            to_address: m.player_b.to_string(),
            amount: vec![Coin {
                denom: m.denom.clone(),
                amount: m.stake,
            }],
        });
    }

    Ok(resp.add_attributes(vec![
        attr("action", "cancel_unfunded"),
        attr("match_id", &match_id),
    ]))
}

fn exec_update_config(
    deps: DepsMut,
    info: MessageInfo,
    server_authority: Option<String>,
    dispute_resolver: Option<String>,
    fee_bps: Option<u16>,
) -> Result<Response, ContractError> {
    let mut config = CONFIG.load(deps.storage)?;

    if info.sender != config.owner {
        return Err(ContractError::Unauthorized {
            msg: "Only owner".to_string(),
        });
    }

    if let Some(sa) = server_authority {
        config.server_authority = Addr::unchecked(sa);
    }
    if let Some(dr) = dispute_resolver {
        config.dispute_resolver = Addr::unchecked(dr);
    }
    if let Some(bps) = fee_bps {
        if bps > 1000 {
            return Err(ContractError::Unauthorized {
                msg: "fee_bps > 10%".to_string(),
            });
        }
        config.fee_bps = bps;
    }

    CONFIG.save(deps.storage, &config)?;

    Ok(Response::new().add_attribute("action", "update_config"))
}

fn exec_withdraw_fees(
    deps: DepsMut,
    info: MessageInfo,
    recipient: String,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;

    if info.sender != config.owner {
        return Err(ContractError::Unauthorized {
            msg: "Only owner".to_string(),
        });
    }

    let fees = COLLECTED_FEES.load(deps.storage)?;
    if fees.is_zero() {
        return Ok(Response::new().add_attribute("action", "withdraw_fees_noop"));
    }

    COLLECTED_FEES.save(deps.storage, &Uint128::zero())?;

    Ok(Response::new()
        .add_message(BankMsg::Send {
            to_address: recipient.clone(),
            amount: vec![Coin {
                denom: "inj".to_string(),
                amount: fees,
            }],
        })
        .add_attributes(vec![
            attr("action", "withdraw_fees"),
            attr("amount", fees.to_string()),
        ]))
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::GetConfig {} => to_json_binary(&CONFIG.load(deps.storage)?),
        QueryMsg::GetMatch { match_id } => to_json_binary(&MATCHES.load(deps.storage, &match_id)?),
        QueryMsg::GetCollectedFees {} => to_json_binary(&FeesResponse {
            amount: COLLECTED_FEES.load(deps.storage)?.to_string(),
            denom: "inj".to_string(),
        }),
    }
}

fn load_match(storage: &dyn cosmwasm_std::Storage, match_id: &str) -> Result<Match, ContractError> {
    MATCHES
        .load(storage, match_id)
        .map_err(|_| ContractError::MatchNotFound {
            match_id: match_id.to_string(),
        })
}

fn build_payout_msgs(
    storage: &mut dyn cosmwasm_std::Storage,
    match_id: &str,
) -> Result<Vec<BankMsg>, ContractError> {
    let config = CONFIG.load(storage)?;
    let m = MATCHES
        .load(storage, match_id)
        .map_err(|_| ContractError::MatchNotFound {
            match_id: match_id.to_string(),
        })?;

    let winner = m.winner.as_ref().unwrap();
    let loser = if *winner == m.player_a {
        &m.player_b
    } else {
        &m.player_a
    };
    let mult = m.multiplier.unwrap();

    let gross = calculate_gross_payout(m.stake, mult);
    let fee = calculate_fee(gross, config.fee_bps);
    let net = gross - fee;
    let loser_refund = m.stake * Uint128::new(2) - gross;

    let current_fees = COLLECTED_FEES.load(storage)?;
    COLLECTED_FEES.save(storage, &(current_fees + fee))?;

    let mut msgs = vec![BankMsg::Send {
        to_address: winner.to_string(),
        amount: vec![Coin {
            denom: m.denom.clone(),
            amount: net,
        }],
    }];

    if !loser_refund.is_zero() {
        msgs.push(BankMsg::Send {
            to_address: loser.to_string(),
            amount: vec![Coin {
                denom: m.denom.clone(),
                amount: loser_refund,
            }],
        });
    }

    Ok(msgs)
}
