use base64::prelude::*;
use consts::{MINTS, SYSTEM_PROGRAMS};
use pb::{
    database::v1::{table_change::Operation, DatabaseChanges, Field, TableChange},
    transfers::v1::{
        instruction::Update, Instruction, TokenBalanceUpdate, TokenTransaction, TokenTransactions,
    },
};
use substreams_solana::pb::sf::solana::r#type::v1::Block;
use substreams_solana_utils::{
    instruction::{self, StructuredInstructions},
    pubkey::Pubkey,
    transaction,
};
use utils::{parse_logs_for_events, parse_logs_for_instruction_name, token_accounts};

mod consts;
mod pb;
mod utils;

#[substreams::handlers::map]
fn map_transfer_events(block: Block) -> TokenTransactions {
    let mut events = TokenTransactions {
        blockhash: block.blockhash,
        slot: block.slot,
        block_time: 0,
        block_height: 0,
        transactions: vec![],
    };

    if let Some(height) = block.block_height {
        events.block_height = height.block_height;
    }
    if let Some(time) = block.block_time {
        events.block_time = time.timestamp;
    }

    for t in block.transactions {
        let context = match transaction::get_context(&t) {
            Ok(context) => context,
            Err(_) => continue,
        };

        let mut txn = TokenTransaction {
            signature: context.signature.to_string(),
            balance_updates: vec![],
            instructions: vec![],
        };

        // Parse token account balance updates from mints and transfers
        for token_account in token_accounts(&t) {
            if !MINTS.contains(&token_account.mint) {
                continue;
            }
            if token_account.pre_balance == token_account.post_balance {
                continue;
            }
            txn.balance_updates.push(TokenBalanceUpdate {
                pubkey: token_account.address.to_string(),
                mint: token_account.mint.to_string(),
                owner: token_account.owner.to_string(),
                pre_balance: token_account.pre_balance.unwrap_or(0),
                post_balance: token_account.post_balance.unwrap_or(0),
            });
        }

        let instructions = match instruction::get_structured_instructions(&t) {
            Ok(instructions) => instructions.flattened(),
            Err(_) => continue,
        };

        // Parse instruction logs and updates
        for ix in instructions {
            let pid = ix.program_id().to_pubkey().unwrap_or(Pubkey::default());

            // Ignore system programs
            if SYSTEM_PROGRAMS.contains(&pid) {
                continue;
            }

            // Use logs to get events and instruction name
            txn.instructions.push(Instruction {
                program_id: pid.to_string(),
                instruction: parse_logs_for_instruction_name(ix.logs().as_ref()),
                update: parse_logs_for_events(ix.logs().as_ref()),
            });
        }

        events.transactions.push(txn);
    }

    events
}

#[substreams::handlers::map]
fn map_transfer_events_to_db(block: Block) -> DatabaseChanges {
    let mut db_changes = DatabaseChanges {
        table_changes: vec![],
    };

    let block_time = block.block_time.unwrap_or_default().timestamp.to_string();

    for (i, t) in block.transactions.into_iter().enumerate() {
        let context = match transaction::get_context(&t) {
            Ok(context) => context,
            Err(_) => continue,
        };

        let mut transaction = TableChange {
            table: "transactions".to_owned(),
            ordinal: i as u64,
            operation: Operation::Create.into(),
            pk: context.signature.to_string(),
            fields: vec![
                Field {
                    name: "blockhash".to_owned(),
                    old_value: "".to_owned(),
                    new_value: block.blockhash.to_string(),
                },
                Field {
                    name: "slot".to_owned(),
                    old_value: "".to_owned(),
                    new_value: block.slot.to_string(),
                },
                Field {
                    name: "signature".to_owned(),
                    old_value: "".to_owned(),
                    new_value: context.signature.clone(),
                },
                Field {
                    name: "block_time".to_owned(),
                    old_value: "".to_owned(),
                    new_value: block_time.clone(),
                },
            ],
        };

        if let Some(ref height) = block.block_height {
            transaction.fields.push(Field {
                name: "block_height".to_owned(),
                old_value: "".to_owned(),
                new_value: height.block_height.to_string(),
            });
        }

        // Parse token account balance updates from mints and transfers
        for token_account in token_accounts(&t) {
            if !MINTS.contains(&token_account.mint) {
                continue;
            }
            if token_account.pre_balance == token_account.post_balance {
                continue;
            }

            let pre_balance = token_account.pre_balance.unwrap_or(0);
            let post_balance = token_account.post_balance.unwrap_or(0);

            let balance_update = TableChange {
                table: "balance_updates".to_owned(),
                ordinal: i as u64,
                operation: Operation::Create.into(),
                pk: format!(
                    "pubkey::{}-signature::{}",
                    token_account.address.to_string(),
                    context.signature.to_string()
                ),
                fields: vec![
                    new_field("pubkey", token_account.address.to_string()),
                    new_field("mint", token_account.mint.to_string()),
                    new_field("owner", token_account.owner.to_string()),
                    new_field("pre_balance", pre_balance),
                    new_field("post_balance", post_balance),
                    new_field("signature", context.signature.clone()),
                    new_field("ts", block_time.clone()),
                ],
            };

            db_changes.table_changes.push(balance_update);
        }

        let instructions = match instruction::get_structured_instructions(&t) {
            Ok(instructions) => instructions.flattened(),
            Err(_) => continue,
        };

        // Parse instruction logs and updates
        for (ix_idx, ix) in instructions.iter().enumerate() {
            let pid = ix.program_id().to_pubkey().unwrap_or(Pubkey::default());

            // Ignore system programs
            if SYSTEM_PROGRAMS.contains(&pid) {
                continue;
            }

            let ix_name = parse_logs_for_instruction_name(ix.logs().as_ref()).unwrap_or_default();

            let mut event = TableChange {
                table: "events".to_owned(),
                ordinal: ix_idx as u64,
                operation: Operation::Create.into(),
                pk: format!(
                    "instruction::{}-signature::{}",
                    ix_idx,
                    context.signature.to_string()
                ),
                fields: vec![
                    new_field("program_id", pid.to_string()),
                    new_field("instruction", ix_name),
                    new_field("signature", context.signature.clone()),
                    new_field("ts", block_time.clone()),
                ],
            };

            // Look for events in the logs
            let log_event = match parse_logs_for_events(ix.logs().as_ref()) {
                Some(log_event) => log_event,
                _ => continue,
            };

            match log_event {
                Update::BridgeEvent(bridge) => {
                    event.pk = format!("{}-bridge", event.pk);

                    event.fields.extend(vec![
                        new_field("event", "bridge"),
                        new_field("amount", bridge.amount),
                        new_field("token_supply", bridge.token_supply),
                        new_field("from", BASE64_STANDARD.encode(bridge.from)),
                        new_field("to", BASE64_STANDARD.encode(bridge.to)),
                        new_field("chain", bridge.chain),
                    ]);
                }
                Update::IndexUpdate(update) => {
                    event.pk = format!("{}-index_update", event.pk);

                    event.fields.extend(vec![
                        new_field("event", "index_update"),
                        new_field("index", update.index),
                        new_field("ts", update.ts),
                        new_field("token_supply", update.token_supply),
                        new_field("max_yield", update.max_yield),
                    ]);
                }
                Update::Claim(claim) => {
                    event.pk = format!("{}-claim", event.pk);

                    event.fields.extend(vec![
                        new_field("event", "claim"),
                        new_field("token_account", claim.token_account),
                        new_field("recipient_token_account", claim.recipient_token_account),
                        new_field("amount", claim.amount),
                        new_field("manager_fee", claim.manager_fee),
                        new_field("index", claim.index),
                    ]);
                }
            };

            db_changes.table_changes.push(event);
        }

        db_changes.table_changes.push(transaction);
    }

    db_changes
}

fn new_field<T: ToString>(name: &str, new_value: T) -> Field {
    Field {
        name: name.to_owned(),
        old_value: "".to_owned(),
        new_value: new_value.to_string(),
    }
}
