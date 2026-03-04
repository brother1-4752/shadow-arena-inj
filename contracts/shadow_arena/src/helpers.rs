use crate::error::ContractError;
use cosmwasm_std::Uint128;

pub fn parse_hash(hex_str: &str) -> Result<Vec<u8>, ContractError> {
    let bytes = hex::decode(hex_str)
        .map_err(|_| ContractError::Std(cosmwasm_std::StdError::generic_err("Invalid hex hash")))?;
    if bytes.len() != 32 {
        return Err(ContractError::Std(cosmwasm_std::StdError::generic_err(
            "Hash must be exactly 32 bytes",
        )));
    }
    Ok(bytes)
}

pub fn calculate_fee(gross: Uint128, fee_bps: u16) -> Uint128 {
    gross.multiply_ratio(fee_bps as u128, 10_000u128)
}

/// gross payout 계산 (MVP pool cap 적용)
/// Normal (1x): stake + stake*1 = 2*stake (= full pool)
/// Gammon (2x): stake + stake*2 = 3*stake → cap at 2*stake
/// Backgammon (3x): stake + stake*3 = 4*stake → cap at 2*stake
pub fn calculate_gross_payout(stake: Uint128, multiplier: u8) -> Uint128 {
    let total_pool = stake * Uint128::new(2);
    let gross = stake + stake * Uint128::new(multiplier as u128);
    if gross > total_pool {
        total_pool
    } else {
        gross
    }
}
