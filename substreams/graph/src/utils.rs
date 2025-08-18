use crate::{
    events::{BridgeEvent, IndexUpdate, IndexUpdateV2, DISCRIMINATOR_SIZE},
    pb::transfers::v1::{self, instruction::Update},
};
use anchor_lang::{prelude::*, Discriminator};
use regex::Regex;
use std::collections::HashMap;
use substreams_solana::pb::sf::solana::r#type::v1::ConfirmedTransaction;
use substreams_solana_utils::{
    log::{DataLog, Log},
    pubkey::{Pubkey, PubkeyRef},
    spl_token::TokenAccount,
};

pub fn parse_logs_for_events(logs: Option<&Vec<Log>>) -> Option<Update> {
    if logs.is_none() {
        return None;
    }

    for log in logs.unwrap() {
        if let Log::Data(log) = log {
            if let Some(update) = parse_log_for_events(log) {
                return Some(update);
            }
        }
    }

    None
}

pub fn parse_logs_for_instruction_name(logs: Option<&Vec<Log>>) -> Option<String> {
    if logs.is_none() {
        return None;
    }

    let re = Regex::new(r"Program log: Instruction: (.+)").unwrap();

    for l in logs.unwrap() {
        if let Some(captures) = re.captures(&l.to_string()) {
            return Some(captures.get(1).unwrap().as_str().to_string());
        }
    }

    None
}

pub fn parse_log_for_events(log: &DataLog) -> Option<Update> {
    let data = match log.data() {
        Ok(data) => data,
        Err(_) => return None,
    };

    if data.len() < DISCRIMINATOR_SIZE {
        return None;
    }

    let (discriminator, buffer) = data.split_at(DISCRIMINATOR_SIZE);

    if IndexUpdate::DISCRIMINATOR == discriminator {
        let update = match IndexUpdate::try_from_slice(buffer) {
            Ok(update) => update,
            Err(_) => return None,
        };
        return Some(Update::IndexUpdate(v1::IndexUpdate {
            index: update.index,
            ts: update.ts,
            token_supply: update.supply,
            max_yield: update.max_yield,
        }));
    }
    if IndexUpdateV2::DISCRIMINATOR == discriminator {
        let update = match IndexUpdateV2::try_from_slice(buffer) {
            Ok(update) => update,
            Err(_) => return None,
        };
        return Some(Update::IndexUpdateV2(v1::IndexUpdateV2 {
            index: update.index,
            ts: update.ts as u64,
            token_supply: update.supply,
            current_multiplier: update.current_multiplier,
            new_multiplier: update.new_multiplier,
        }));
    }
    if BridgeEvent::DISCRIMINATOR == discriminator {
        let event = match BridgeEvent::try_from_slice(buffer) {
            Ok(event) => event,
            Err(_) => return None,
        };
        return Some(Update::BridgeEvent(v1::BridgeEvent {
            amount: event.amount,
            token_supply: event.token_supply,
            from: event.from.to_vec(),
            to: event.to.to_vec(),
            chain: wormhole_id_to_chain(event.wormhole_chain_id),
        }));
    }

    None
}

pub fn token_accounts(t: &ConfirmedTransaction) -> Vec<TokenAccount> {
    let accounts = t
        .resolved_accounts()
        .iter()
        .map(|x| PubkeyRef { 0: x })
        .collect::<Vec<_>>();

    let mut token_accounts: HashMap<PubkeyRef, TokenAccount> = HashMap::new();

    for token_balance in &t.meta.as_ref().unwrap().post_token_balances {
        let balance = token_balance
            .ui_token_amount
            .as_ref()
            .unwrap()
            .amount
            .parse::<u64>()
            .unwrap_or(0);

        let token_account = TokenAccount {
            address: accounts[token_balance.account_index as usize].clone(),
            mint: Pubkey::try_from_string(&token_balance.mint).unwrap(),
            owner: Pubkey::try_from_string(&token_balance.owner).unwrap(),
            pre_balance: Some(0),
            post_balance: Some(balance),
        };

        token_accounts.insert(token_account.address, token_account);
    }

    // account with no balace prior to the transaction will be missing
    for token_balance in &t.meta.as_ref().unwrap().pre_token_balances {
        let balance = token_balance
            .ui_token_amount
            .as_ref()
            .unwrap()
            .amount
            .parse::<u64>()
            .unwrap_or(0);

        token_accounts
            .entry(accounts[token_balance.account_index as usize])
            .and_modify(|e| e.pre_balance = Some(balance));
    }

    token_accounts.values().cloned().collect()
}

fn wormhole_id_to_chain(id: u16) -> String {
    match id {
        1 => "Solana".to_string(),
        2 => "Ethereum".to_string(),
        10002 => "Sepolia".to_string(),
        23 => "Arbitrum".to_string(),
        10003 => "Arbitrum Sepolia".to_string(),
        21 => "Sui".to_string(),
        24 => "Optimism".to_string(),
        10005 => "Optimism Sepolia".to_string(),
        30 => "Base".to_string(),
        10004 => "Base Sepolia".to_string(),
        _ => format!("Unknown({})", id),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use substreams_solana_utils::log::DataLog;

    #[test]
    fn test_parse_log_for_events_index_update() {
        // Logged pulled from devnet
        let log_str =
            "Program data: CHN6vDbOelfI5i/h6QAAAJ9J5GcAAAAAP3cbAAAAAAAjEgAAAAAAAA==".to_string();
        let log = DataLog::new(&log_str);

        // Parse the log
        let result = parse_log_for_events(&log);

        // Verify the result
        assert!(result.is_some());
        if let Some(Update::IndexUpdate(update)) = result {
            assert_eq!(update.index, 1004505392840);
            assert_eq!(update.ts, 1743014303);
            assert_eq!(update.token_supply, 1799999);
            assert_eq!(update.max_yield, 4643);
        } else {
            panic!("Expected IndexUpdate event");
        }
    }
}
