use anchor_lang::prelude::{borsh::to_vec, *};

use executor_account_resolver_svm::{
    find_account, InstructionGroup, InstructionGroups, MissingAccounts, Resolver,
    SerializableAccountMeta, SerializableInstruction, RESOLVER_PUBKEY_PAYER,
    RESOLVER_PUBKEY_POSTED_VAA, RESOLVER_RESULT_ACCOUNT, RESOLVER_RESULT_ACCOUNT_SEED,
};

use crate::instructions::VaaBody;

#[derive(Accounts)]
pub struct ResolveExecuteVaa {}

#[account(discriminator = RESOLVER_RESULT_ACCOUNT)]
pub struct ExecutorAccountResolverResult(Resolver<InstructionGroups>);

impl ResolveExecuteVaa {
    pub fn handler(ctx: Context<Self>, vaa_body: Vec<u8>) -> Result<()> {
        let vaa = VaaBody::from_bytes(&vaa_body)?;

        Ok(())
    }
}
