use anchor_lang::{prelude::*, InstructionData};
use executor_account_resolver_svm::{
    find_account, missing_account, InstructionGroup, InstructionGroups, Resolver,
    SerializableAccountMeta, SerializableInstruction, RESOLVER_PUBKEY_PAYER,
    RESOLVER_PUBKEY_POSTED_VAA,
};

use crate::{
    config::Config,
    error::NTTError,
    instruction::{
        ReceiveWormholeMessage, Redeem, ReleaseInboundMint, ReleaseInboundMintExtension,
    },
    instructions::{RedeemArgs, ReleaseInboundArgs},
    messages::ValidatedTransceiverMessage,
    ntt_messages::{ChainId, TransceiverMessage, TransceiverMessageData, WormholeTransceiver},
    payloads::Payload,
    queue::{
        inbox::{InboxItem, InboxRateLimit},
        outbox::OutboxRateLimit,
    },
    registered_transceiver::RegisteredTransceiver,
    transceivers::accounts::peer::TransceiverPeer,
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
    let (fields, mut payload_body) = &vaa_body.split_at(51);
    let message: TransceiverMessage<WormholeTransceiver, Payload> =
        TransceiverMessage::deserialize(&mut payload_body).map_err(|_| NTTError::InvalidVAA)?;

    // This manager should be the recipient
    if message.recipient_ntt_manager != crate::ID.to_bytes() {
        return err!(NTTError::InvalidVAA);
    }

    let emitter_chain = &fields[8..10];

    let (config, _) = Pubkey::find_program_address(&[Config::SEED_PREFIX], &crate::ID);

    let config_data = if let Some(acc_info) = find_account(ctx.remaining_accounts, config) {
        let mut buf = &acc_info.try_borrow_mut_data()?[..];
        Config::try_deserialize(&mut buf)?
    } else {
        return Ok(missing_account(config));
    };

    let (peer, _) =
        Pubkey::find_program_address(&[TransceiverPeer::SEED_PREFIX, emitter_chain], &crate::ID);

    let (transceiver_message, _) = Pubkey::find_program_address(
        &[
            ValidatedTransceiverMessage::<TransceiverMessageData<Payload>>::SEED_PREFIX,
            emitter_chain,
            message.ntt_manager_payload.id.as_ref(),
        ],
        &crate::ID,
    );

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
        let (transceiver, _) = Pubkey::find_program_address(
            &[RegisteredTransceiver::SEED_PREFIX, &crate::ID.to_bytes()],
            &crate::ID,
        );

        let (inbox_item, _) = Pubkey::find_program_address(
            &[
                InboxItem::SEED_PREFIX,
                message
                    .ntt_manager_payload
                    .keccak256(ChainId {
                        id: u16::from_be_bytes(emitter_chain.try_into().unwrap()),
                    })
                    .as_ref(),
            ],
            &crate::ID,
        );

        let (inbox_rate_limit, _) =
            Pubkey::find_program_address(&[InboxRateLimit::SEED_PREFIX, emitter_chain], &crate::ID);

        let (outbox_rate_limit, _) =
            Pubkey::find_program_address(&[OutboxRateLimit::SEED_PREFIX], &crate::ID);

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

    let destination_mint = match &message.ntt_manager_payload.payload {
        Payload::NativeTokenTransfer(ntt) => {
            Pubkey::new_from_array(ntt.additional_payload.destination_token)
        }
    };

    // release_inbound_mint and release_inbound_mint_extension share accounts
    let release_accounts = vec![SerializableAccountMeta {
        pubkey: RESOLVER_PUBKEY_PAYER,
        is_writable: true,
        is_signer: true,
    }];

    // redeeming $M, use the standard release_inbound_mint instruction
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
                address_lookup_tables: vec![],
            },
        ])));
    }

    // redeeming extension tokens, use the release_inbound_mint_extension instruction
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
            address_lookup_tables: vec![],
        },
    ])))
}

#[cfg(test)]
mod tests {
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

        // Call the function
        let result = resolve_execute_vaa_v1(ctx, vaa_body);

        // Assert the result
        assert!(result.is_ok());
        let resolver = result.unwrap();
        assert!(matches!(resolver, Resolver::Resolved(_)));
    }
}
