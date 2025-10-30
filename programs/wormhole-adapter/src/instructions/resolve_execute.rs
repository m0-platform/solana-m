use anchor_lang::{
    prelude::*,
    solana_program::{
        entrypoint::MAX_PERMITTED_DATA_INCREASE, system_instruction::MAX_PERMITTED_DATA_LENGTH,
    },
    system_program, InstructionData,
};

use anchor_spl::token_2022;
use executor_account_resolver_svm::{
    find_account, InstructionGroup, InstructionGroups, MissingAccounts, Resolver,
    SerializableAccountMeta, SerializableInstruction, RESOLVER_PUBKEY_PAYER,
    RESOLVER_PUBKEY_POSTED_VAA, RESOLVER_RESULT_ACCOUNT, RESOLVER_RESULT_ACCOUNT_SEED,
};

use crate::{
    errors::WormholeError,
    instruction::ReceiveMessage,
    instructions::{earn, ext_swap, messenger, VaaBody},
    state::GLOBAL_SEED,
};

#[derive(Accounts)]
pub struct ResolveExecuteVaa {}

#[account(discriminator = RESOLVER_RESULT_ACCOUNT)]
pub struct ExecutorAccountResolverResult(Resolver<InstructionGroups>);

impl ResolveExecuteVaa {
    pub fn handler(ctx: Context<Self>, vaa_body: Vec<u8>) -> Result<Resolver<InstructionGroups>> {
        let vaa = VaaBody::from_bytes(&vaa_body)?;

        // Accounts we need read data on
        let swap_global = Pubkey::find_program_address(&[GLOBAL_SEED], &ext_swap::ID).0;
        let result_account =
            Pubkey::find_program_address(&[RESOLVER_RESULT_ACCOUNT_SEED], &crate::ID).0;

        // Check for missing accounts
        {
            let mut missing: Vec<Pubkey> = Vec::with_capacity(3);

            // Account to load result into
            if find_account(ctx.remaining_accounts, result_account).is_none() {
                missing.push(result_account);
            }

            // Need swap global for extension info
            if find_account(ctx.remaining_accounts, swap_global).is_none() {
                missing.push(swap_global);
            }

            // Need system program for creating result account
            if find_account(ctx.remaining_accounts, System::id()).is_none() {
                missing.push(System::id());
            }

            if !missing.is_empty() {
                // Placeholder for payer we know is missing
                missing.push(RESOLVER_PUBKEY_PAYER);
                missing.push(RESOLVER_PUBKEY_POSTED_VAA);

                return Ok(Resolver::Missing(MissingAccounts {
                    accounts: missing,
                    address_lookup_tables: Vec::new(),
                }));
            }
        }

        // Increase the size of the return account then parse it
        let mut ret = {
            let return_account = find_account(ctx.remaining_accounts, result_account).unwrap();
            let system_account = find_account(ctx.remaining_accounts, System::id()).unwrap();

            // Find the payer account
            let payer_account = ctx
                .remaining_accounts
                .iter()
                .find(|acc_info| acc_info.is_signer && acc_info.is_writable)
                .ok_or(WormholeError::MissingPayerAccount)?;

            if !return_account.is_writable {
                return err!(WormholeError::InvalidReturnAccount);
            }

            let size = usize::min(
                return_account.data_len() + MAX_PERMITTED_DATA_INCREASE,
                MAX_PERMITTED_DATA_LENGTH.try_into()?,
            );

            let lamports = Rent::get()
                .unwrap()
                .minimum_balance(size)
                .saturating_sub(return_account.lamports());

            system_program::transfer(
                CpiContext::new(
                    system_account.to_account_info(),
                    system_program::Transfer {
                        from: payer_account.to_account_info(),
                        to: return_account.to_account_info(),
                    },
                ),
                lamports,
            )?;

            return_account.realloc(size, false)?;

            Account::<ExecutorAccountResolverResult>::try_from(return_account)?
        };

        let receive_message_ix = SerializableInstruction {
            program_id: crate::ID,
            data: ReceiveMessage {
                guardian_set_index: 0, // TODO
                vaa_body,
            }
            .data(),
            accounts: vec![
                SerializableAccountMeta {
                    pubkey: Pubkey::find_program_address(&[GLOBAL_SEED], &crate::ID).0,
                    is_writable: false,
                    is_signer: false,
                },
                SerializableAccountMeta {
                    pubkey: Pubkey::find_program_address(&[b"authority"], &messenger::ID).0,
                    is_writable: false,
                    is_signer: false,
                },
                SerializableAccountMeta {
                    pubkey: guardian_set,
                    is_writable: false,
                    is_signer: false,
                },
                SerializableAccountMeta {
                    pubkey: guardian_signatures,
                    is_writable: false,
                    is_signer: false,
                },
                SerializableAccountMeta {
                    pubkey: Pubkey::find_program_address(&[GLOBAL_SEED], &earn::ID).0,
                    is_writable: false,
                    is_signer: false,
                },
                SerializableAccountMeta {
                    pubkey: m_mint,
                    is_writable: false,
                    is_signer: false,
                },
                SerializableAccountMeta {
                    pubkey: wormhole_verify_vaa_shim,
                    is_writable: false,
                    is_signer: false,
                },
                SerializableAccountMeta {
                    pubkey: earn::ID,
                    is_writable: false,
                    is_signer: false,
                },
                SerializableAccountMeta {
                    pubkey: token_2022::ID,
                    is_writable: false,
                    is_signer: false,
                },
            ],
        };

        ret.set_inner(ExecutorAccountResolverResult(Resolver::Resolved(
            InstructionGroups(vec![InstructionGroup {
                instructions: vec![receive_message_ix],
                address_lookup_tables: vec![],
            }]),
        )));
        ret.exit(ctx.program_id)?;
        Ok(Resolver::Account())
    }
}
