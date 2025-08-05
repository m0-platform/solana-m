use anchor_lang::{prelude::*, InstructionData};
use anchor_spl::{associated_token::get_associated_token_address_with_program_id, token_2022};
use earn::{
    instructions::ext_swap::{self},
    state::GLOBAL_SEED,
};
use executor_account_resolver_svm::{
    find_account, InstructionGroup, InstructionGroups, MissingAccounts, Resolver,
    SerializableAccountMeta, SerializableInstruction, RESOLVER_PUBKEY_PAYER,
    RESOLVER_PUBKEY_POSTED_VAA,
};

use crate::{
    config::Config,
    error::NTTError,
    instruction::{
        ReceiveWormholeMessage, Redeem, ReleaseInboundMint, ReleaseInboundMintExtension,
    },
    instructions::{
        ext_swap::{accounts::SwapGlobal, types::WhitelistedExtension},
        get_inbox_recipient_token_account, RedeemArgs, ReleaseInboundArgs,
    },
    messages::ValidatedTransceiverMessage,
    ntt_messages::{ChainId, TransceiverMessage, TransceiverMessageData, WormholeTransceiver},
    payloads::Payload,
    queue::{
        inbox::{InboxItem, InboxRateLimit},
        outbox::OutboxRateLimit,
    },
    registered_transceiver::RegisteredTransceiver,
    transceivers::accounts::peer::TransceiverPeer,
    TOKEN_AUTHORITY_SEED,
};

#[derive(Accounts)]
pub struct ResolveExecuteVaaV1 {}

pub fn resolve_execute_vaa_v1(
    ctx: Context<ResolveExecuteVaaV1>,
    vaa_body: Vec<u8>,
) -> Result<Resolver<InstructionGroups>> {
    if vaa_body.len() < 51 {
        return err!(NTTError::InvalidVAA);
    }

    // Parse NativeTokenTransfer from VAA body
    let (fields, payload_body) = vaa_body.split_at(51);
    let message: TransceiverMessage<WormholeTransceiver, Payload> =
        TransceiverMessage::deserialize(&mut payload_body.as_ref())
            .map_err(|_| NTTError::InvalidVAA)?;

    let emitter_chain = &fields[8..10];
    let message_hash = message.ntt_manager_payload.keccak256(ChainId {
        id: u16::from_be_bytes(emitter_chain.try_into().unwrap()),
    });

    // This manager should be the recipient
    if message.recipient_ntt_manager != crate::ID.to_bytes() {
        return err!(NTTError::InvalidVAA);
    }

    let destination_mint = match &message.ntt_manager_payload.payload {
        Payload::NativeTokenTransfer(ntt) => {
            Pubkey::new_from_array(ntt.additional_payload.destination_token)
        }
    };

    // Accounts we need read data on
    let config = pda(&[Config::SEED_PREFIX]);
    let inbox_item = pda(&[InboxItem::SEED_PREFIX, message_hash.as_ref()]);
    let swap_global = Pubkey::find_program_address(&[GLOBAL_SEED], &ext_swap::ID).0;

    // Check for missing accounts
    {
        let mut missing: Vec<Pubkey> = Vec::with_capacity(3);
        if let Some(acc_info) = find_account(ctx.remaining_accounts, config) {
            let config = Config::try_deserialize(&mut &acc_info.try_borrow_mut_data()?[..])?;

            // Get mint for correct token account
            if find_account(ctx.remaining_accounts, config.mint).is_none() {
                missing.push(config.mint);
            }
        } else {
            missing.push(config);
        }

        if find_account(ctx.remaining_accounts, inbox_item).is_none() {
            missing.push(inbox_item);
        }
        if find_account(ctx.remaining_accounts, swap_global).is_none() {
            missing.push(swap_global);
        }

        if !missing.is_empty() {
            return Ok(Resolver::Missing(MissingAccounts {
                accounts: missing,
                address_lookup_tables: Vec::new(),
            }));
        }
    }

    // Parse accounts we know are on remaining_accounts
    let config_data = deserialize_account::<Config>(ctx.remaining_accounts, config)?;
    let inbox_item_data = deserialize_account::<InboxItem>(ctx.remaining_accounts, inbox_item)?;
    let swap_global_data = deserialize_account::<SwapGlobal>(ctx.remaining_accounts, swap_global)?;

    let token_program = find_account(ctx.remaining_accounts, config_data.mint)
        .unwrap()
        .owner;

    let peer = pda(&[TransceiverPeer::SEED_PREFIX, emitter_chain]);
    let transceiver_message = pda(&[
        ValidatedTransceiverMessage::<TransceiverMessageData<Payload>>::SEED_PREFIX,
        emitter_chain,
        message.ntt_manager_payload.id.as_ref(),
    ]);

    let receive_message = SerializableInstruction {
        program_id: crate::ID,
        data: ReceiveWormholeMessage {}.data(),
        accounts: vec![
            SerializableAccountMeta {
                pubkey: RESOLVER_PUBKEY_PAYER,
                is_writable: true,
                is_signer: true,
            },
            SerializableAccountMeta {
                pubkey: config,
                is_writable: false,
                is_signer: false,
            },
            SerializableAccountMeta {
                pubkey: peer,
                is_writable: false,
                is_signer: false,
            },
            SerializableAccountMeta {
                pubkey: RESOLVER_PUBKEY_POSTED_VAA,
                is_writable: false,
                is_signer: false,
            },
            SerializableAccountMeta {
                pubkey: transceiver_message,
                is_writable: true,
                is_signer: false,
            },
            SerializableAccountMeta {
                pubkey: System::id(),
                is_writable: false,
                is_signer: false,
            },
        ],
    };

    let redeem = {
        let transceiver = pda(&[RegisteredTransceiver::SEED_PREFIX, &crate::ID.to_bytes()]);
        let inbox_rate_limit = pda(&[InboxRateLimit::SEED_PREFIX, emitter_chain]);
        let outbox_rate_limit = pda(&[OutboxRateLimit::SEED_PREFIX]);

        SerializableInstruction {
            program_id: crate::ID,
            data: Redeem {
                args: RedeemArgs {},
            }
            .data(),
            accounts: vec![
                SerializableAccountMeta {
                    pubkey: RESOLVER_PUBKEY_PAYER,
                    is_writable: true,
                    is_signer: true,
                },
                SerializableAccountMeta {
                    pubkey: config,
                    is_writable: false,
                    is_signer: false,
                },
                SerializableAccountMeta {
                    pubkey: peer,
                    is_writable: false,
                    is_signer: false,
                },
                SerializableAccountMeta {
                    pubkey: transceiver_message,
                    is_writable: false,
                    is_signer: false,
                },
                SerializableAccountMeta {
                    pubkey: transceiver,
                    is_writable: false,
                    is_signer: false,
                },
                SerializableAccountMeta {
                    pubkey: config_data.mint,
                    is_writable: false,
                    is_signer: false,
                },
                SerializableAccountMeta {
                    pubkey: inbox_item,
                    is_writable: true,
                    is_signer: false,
                },
                SerializableAccountMeta {
                    pubkey: inbox_rate_limit,
                    is_writable: true,
                    is_signer: false,
                },
                SerializableAccountMeta {
                    pubkey: outbox_rate_limit,
                    is_writable: true,
                    is_signer: false,
                },
                SerializableAccountMeta {
                    pubkey: System::id(),
                    is_writable: false,
                    is_signer: false,
                },
            ],
        }
    };

    let token_auth = pda(&[TOKEN_AUTHORITY_SEED]);

    let recipient = get_inbox_recipient_token_account(
        &inbox_item_data,
        &token_auth,
        &config_data.mint,
        &token_program,
    )
    .unwrap_or_else(|| {
        // Transfer size is 0 so this account is just a placeholder
        get_associated_token_address_with_program_id(&token_auth, &config_data.mint, &token_program)
    });

    // release_inbound_mint and release_inbound_mint_extension share accounts
    let mut release_accounts = {
        let m_global = earn_pda(&[GLOBAL_SEED]);

        vec![
            SerializableAccountMeta {
                pubkey: RESOLVER_PUBKEY_PAYER,
                is_writable: true,
                is_signer: true,
            },
            SerializableAccountMeta {
                pubkey: config,
                is_writable: false,
                is_signer: false,
            },
            SerializableAccountMeta {
                pubkey: inbox_item,
                is_writable: true,
                is_signer: false,
            },
            SerializableAccountMeta {
                pubkey: recipient,
                is_writable: true,
                is_signer: false,
            },
            SerializableAccountMeta {
                pubkey: token_auth,
                is_writable: false,
                is_signer: false,
            },
            SerializableAccountMeta {
                pubkey: config_data.mint,
                is_writable: true,
                is_signer: false,
            },
            SerializableAccountMeta {
                pubkey: token_2022::ID,
                is_writable: false,
                is_signer: false,
            },
            SerializableAccountMeta {
                pubkey: config_data.custody,
                is_writable: true,
                is_signer: false,
            },
            SerializableAccountMeta {
                pubkey: earn::ID,
                is_writable: false,
                is_signer: false,
            },
            SerializableAccountMeta {
                pubkey: m_global,
                is_writable: false,
                is_signer: false,
            },
        ]
    };

    // Redeeming $M, use the standard release_inbound_mint instruction
    if destination_mint.eq(&config_data.mint) {
        let release_inbound_mint = {
            SerializableInstruction {
                program_id: crate::ID,
                data: ReleaseInboundMint {
                    args: ReleaseInboundArgs {
                        revert_when_not_ready: true,
                    },
                }
                .data(),
                accounts: release_accounts,
            }
        };

        return Ok(Resolver::Resolved(InstructionGroups(vec![
            InstructionGroup {
                instructions: vec![receive_message, redeem, release_inbound_mint],
                address_lookup_tables: Vec::new(),
            },
        ])));
    }

    // Find the extension program ID based on the destination mint
    let ext_program = swap_global_data
        .whitelisted_extensions
        .iter()
        .find(|ext| ext.mint.eq(&destination_mint))
        .unwrap_or_else(|| {
            // If the extension program is not found, fallback to first whitelisted extension
            let fallback = &swap_global_data.whitelisted_extensions[0];
            msg!(
                "Extension for {} not found, falling back to first whitelisted extension: {}",
                destination_mint.to_string(),
                fallback.mint.to_string(),
            );
            fallback
        });

    let &WhitelistedExtension {
        mint: destination_mint,
        program_id: ext_pid,
        token_program: ext_token_program,
    } = ext_program;

    let swap_global = Pubkey::find_program_address(&[GLOBAL_SEED], &ext_swap::ID).0;
    let ext_global = Pubkey::find_program_address(&[GLOBAL_SEED], &ext_pid).0;
    let ext_m_vault_auth = Pubkey::find_program_address(&[b"m_vault"], &ext_pid).0;
    let ext_mint_auth = Pubkey::find_program_address(&[b"mint_authority"], &ext_pid).0;

    let ext_m_vault = get_associated_token_address_with_program_id(
        &ext_m_vault_auth,
        &config_data.mint,
        token_program,
    );
    let ext_token_account = get_associated_token_address_with_program_id(
        &inbox_item_data.transfer.recipient,
        &destination_mint,
        &ext_token_program,
    );

    // Add extra accounts required for wrapping $M to extension tokens
    release_accounts.extend_from_slice(&[
        SerializableAccountMeta {
            pubkey: destination_mint,
            is_writable: true,
            is_signer: false,
        },
        SerializableAccountMeta {
            pubkey: swap_global,
            is_writable: true,
            is_signer: false,
        },
        SerializableAccountMeta {
            pubkey: ext_global,
            is_writable: true,
            is_signer: false,
        },
        SerializableAccountMeta {
            pubkey: ext_m_vault_auth,
            is_writable: false,
            is_signer: false,
        },
        SerializableAccountMeta {
            pubkey: ext_mint_auth,
            is_writable: false,
            is_signer: false,
        },
        SerializableAccountMeta {
            pubkey: ext_m_vault,
            is_writable: true,
            is_signer: false,
        },
        SerializableAccountMeta {
            pubkey: ext_token_account,
            is_writable: true,
            is_signer: false,
        },
        SerializableAccountMeta {
            pubkey: ext_swap::ID,
            is_writable: false,
            is_signer: false,
        },
        SerializableAccountMeta {
            pubkey: ext_pid,
            is_writable: false,
            is_signer: false,
        },
        SerializableAccountMeta {
            pubkey: System::id(),
            is_writable: false,
            is_signer: false,
        },
    ]);

    // Redeeming extension tokens, use the release_inbound_mint_extension instruction
    let release_inbound_mint = {
        SerializableInstruction {
            program_id: crate::ID,
            data: ReleaseInboundMintExtension {}.data(),
            accounts: release_accounts,
        }
    };

    Ok(Resolver::Resolved(InstructionGroups(vec![
        InstructionGroup {
            instructions: vec![receive_message, redeem, release_inbound_mint],
            address_lookup_tables: Vec::new(),
        },
    ])))
}

fn deserialize_account<T: AccountDeserialize>(
    remaining_accounts: &[AccountInfo],
    pubkey: Pubkey,
) -> Result<T> {
    let account = find_account(remaining_accounts, pubkey).unwrap();
    T::try_deserialize(&mut &account.try_borrow_mut_data()?[..])
}

fn pda(seeds: &[&[u8]]) -> Pubkey {
    Pubkey::find_program_address(seeds, &crate::ID).0
}

fn earn_pda(seeds: &[&[u8]]) -> Pubkey {
    Pubkey::find_program_address(seeds, &earn::ID).0
}

#[cfg(test)]
mod tests {
    use std::str::FromStr;

    use super::*;
    use base64::prelude::*;

    #[test]
    fn test_resolve_execute_vaa_v1() {
        // https://wormholescan.io/#/tx/64mNwu9cYuqtHsDSpFyeu4qavp8Uga3exZVaBtLSXH7kGB9in6fPZ54aR4K4aWMQssWkep311zSfoX3paMcERaZt?network=Mainnet&view=advanced
        let base64_vaa_body = "AQAAAAQNAOEQfkdj8QU0v8tMG3KXgSe0cGvhvNoomBfFuqqnO5ZpPfPIxe2GaoCq02QJMdGit75xWgw8gFkeKXGEWUw2eeoBA0XM4P5/NGxDGLexvWr+r44jbn3s1uIKqb3KLB8hCNDZPHk6sQ4aF2L6XKD998gzIMWlm7PLOrg17B5VJAtdwOABBBnJKiHH1lRfDRTHWyLElwQkTdJt2EaZo807t5Uhx+BIGlPOfZJkmfC4lvNuGG9fPfyk3gxfQy9Xt4/O6FG+KNUABv/689ZqEr0RAWZ2zczVhIyQ4ONoEmAQ5xpHsFF6qFY5Y7NP2pBNYQeJ/FdWjK4troWww+AWCDQp/HfXoqNX3uUABxRAGP18Ub3wDTZf5LvThl2JJy7p9guat2Ys6ungALIcdZQ/CTNB7dNPKe507foh601VD/UGyKIH3L0nUeRkGZMBCsYqjEf21UhdxqNbUfHSUUyTq2L9usVR8/k1LP2wdfZSNcjC+zIaPtNXVFCXMpW//RLa7I9DvC/++K5sJkamMrAADMFjLAjNHyaonjCS3eJG4olpBxmpcdBrmuaw0Hh4xBHqA+RcSMy2BFwqZrtcLuLqFWOgvxIsYiILTmLwxft5M9wADSTh/pAtqD6QBvslxMu3UvN7hyCBFPuRqxnkFjvZaF/DC0B+lKW3DwGchk6T4yQLP1pzFl5qxnyPLLGfk/MNRK0ADuY+bOQiOUG7bEdjLni3e3dzQCBYM32PsEeLLiJTv3d2apqidGhtb/cEmBAkKGDC72fk9SodJMV61wFb52xwExcBD5pzXLcMUow4em9PbpuR+SAGsSxZffafXOb073LTti1fC+v6KC/3wIMGA6ELxC0Vlu0gRpW6cRiUUUSz9R7th6AAEIK79nwQr+W+g7iQAFpXQlL1irLWZnEv+cCv64d1Em2eO0yXnOl7TERLAJIXt3hdkx8D9cFeG6RJNcQ7Ab78ksMAEevtsvM9TauPZ8U2Zjjp+clsE/hF/T3kl1nauJ6x54FwadnOvncV+gh29hGIPjmo4gKghPZ01Kh0j7OgzIOoGckAEnZgINlDijrzoAAvd9AAsk050qyrAJwWSSRb29+pKuARM8lAIFpUx2Sbs4RnfJclQUwES1J0ob3WyqNg316W8ygBaIy7VwAAAAAAAgAAAAAAAAAAAAAAAAdjGWoJFXWt+Z4jBuXpDgvlFUhBAAAAAAAAAJ8BmUX/EAAAAAAAAAAAAAAAANklyEtV5ORKU3Sf9fKloT9j0Sj9C4bsGBzUxcmE6QYrE/Ky3nufW15o6ENJIx1mFM3z+Z8AuwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAaGAAAAAAAAAAAAAAAAErGkImun2a1JJ3nJJLD8AL3LYhcAeZlOVFQGAAAAAAAAAAAAAAAAAAAAAAAAAACGaiv05XLLzzfVBxp6WFA7+za+GwAAAAAAAAAAAAAAABKxpCJrp9mtSSd5ySSw/AC9y2IXAAEAKAAAAPUHM8y8C4a+ZtMrxaS1qx/r30jjOwbDtaFjsZwXMO14cF9+9owAAA==";
        let vaa_raw = BASE64_STANDARD
            .decode(base64_vaa_body)
            .expect("Failed to decode base64 string");

        // remove header
        let header_len = 6 + vaa_raw[5] as usize * 66;
        let vaa_body = vaa_raw[header_len..].to_vec();

        // Create a mock context
        let mut accounts = ResolveExecuteVaaV1 {};
        let ctx = Context::<ResolveExecuteVaaV1>::new(
            &crate::ID,
            &mut accounts,
            &[],
            ResolveExecuteVaaV1Bumps {},
        );

        // Resolve the instructions
        let result = resolve_execute_vaa_v1(ctx, vaa_body.clone());

        // Assert the result
        assert!(result.is_ok());
        let config = Pubkey::from_str("3WEmFf1y7MYgNgEKHjY6p7cRDR2HGtBgxzfABb91eqHv").unwrap();

        match result.unwrap() {
            Resolver::Missing(missing) => {
                assert_eq!(missing.accounts.len(), 3);
                assert!(missing.accounts.contains(&config));
            }
            _ => panic!("Expected missing accounts"),
        }

        // Create config account
        let mut lamports = 3145920;
        let mut data = BASE64_STANDARD.decode("mwyq4B76zIL+fPdFxqVBFEp5/7f0fz7A3Zkq0wRAXqv3BYdIM/5geN8AC4a+ZtMrxaS1qx/r30jjOwbDtaFjsZwXMO14cF9+9owG3fbh7nWP3hhCXbzkbM3athr8TYO5DSf+vfko2KGL/AEBAAEBAQAAAAAAAAAAAAAAAAAAAAAPd/5swwIxm9aXWu3JBLq3Wd/touUX6Yg7zEIGWSGolgVgy8JwqLBOVRq04BrlmUIX0OY4HKRi8JolMXaC9I71AADkaDAG2jLyQU8kHCzJrJ2g5B9BcGWvkMJK2AkIIY/zFQABAAAAAAAAAAAAAAAAhmor9OVyy8831QcaelhQO/s2vhsAAAAAAAAAAAAAAABDfMMzRKCyekKfeV/2tGnHJpiykQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA").expect("config data to decode");
        let remaining_accounts = [AccountInfo::new(
            &config,
            false,
            false,
            &mut lamports,
            data.as_mut_slice(),
            &crate::ID,
            false,
            0,
        )];

        // Add the requested accounts
        let ctx = Context::<ResolveExecuteVaaV1>::new(
            &crate::ID,
            &mut accounts,
            &remaining_accounts,
            ResolveExecuteVaaV1Bumps {},
        );

        // Resolve the instructions
        let result = resolve_execute_vaa_v1(ctx, vaa_body);

        match result.unwrap() {
            Resolver::Missing(missing) => {
                assert_eq!(missing.accounts.len(), 3);

                // config no longer missing
                assert!(!missing.accounts.contains(&config));
            }
            _ => panic!("Expected missing accounts"),
        }
    }
}
