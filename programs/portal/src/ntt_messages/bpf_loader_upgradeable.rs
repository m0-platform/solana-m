pub use anchor_lang::solana_program::bpf_loader_upgradeable::{self, id, ID};
use anchor_lang::{
    prelude::*,
    solana_program::{instruction::Instruction, program::invoke_signed},
};

#[derive(Debug, Clone)]
pub struct BpfLoaderUpgradeable;

impl anchor_lang::Id for BpfLoaderUpgradeable {
    fn id() -> Pubkey {
        ID
    }
}

pub use __private::{
    set_buffer_authority, set_buffer_authority_checked, set_upgrade_authority,
    set_upgrade_authority_checked, upgrade, SetBufferAuthority, SetBufferAuthorityChecked,
    SetUpgradeAuthority, SetUpgradeAuthorityChecked, Upgrade,
};

fn invoke_with_context<'info, A>(
    ix: &Instruction,
    ctx: CpiContext<'_, '_, '_, 'info, A>,
) -> Result<()>
where
    A: ToAccountMetas + ToAccountInfos<'info>,
{
    invoke_signed(ix, &ctx.to_account_infos(), ctx.signer_seeds).map_err(Into::into)
}

mod __private {
    use super::*;

    pub fn set_upgrade_authority<'info>(
        ctx: CpiContext<'_, '_, '_, 'info, SetUpgradeAuthority<'info>>,
        program_id: &Pubkey,
    ) -> Result<()> {
        invoke_with_context(
            &bpf_loader_upgradeable::set_upgrade_authority(
                program_id,
                ctx.accounts.current_authority.key,
                ctx.accounts.new_authority.as_ref().map(|a| a.key),
            ),
            ctx,
        )
    }

    pub struct SetUpgradeAuthority<'info> {
        pub program_data: AccountInfo<'info>,
        pub current_authority: AccountInfo<'info>,
        pub new_authority: Option<AccountInfo<'info>>,
    }

    impl ToAccountMetas for SetUpgradeAuthority<'_> {
        fn to_account_metas(&self, _is_signer: Option<bool>) -> Vec<AccountMeta> {
            vec![]
        }
    }

    impl<'info> ToAccountInfos<'info> for SetUpgradeAuthority<'info> {
        fn to_account_infos(&self) -> Vec<AccountInfo<'info>> {
            match &self.new_authority {
                Some(new_authority) => vec![
                    self.program_data.clone(),
                    self.current_authority.clone(),
                    new_authority.clone(),
                ],
                None => vec![self.program_data.clone(), self.current_authority.clone()],
            }
        }
    }

    pub fn set_upgrade_authority_checked<'info>(
        ctx: CpiContext<'_, '_, '_, 'info, SetUpgradeAuthorityChecked<'info>>,
        program_id: &Pubkey,
    ) -> Result<()> {
        invoke_with_context(
            &bpf_loader_upgradeable::set_upgrade_authority_checked(
                program_id,
                ctx.accounts.current_authority.key,
                ctx.accounts.new_authority.key,
            ),
            ctx,
        )
    }

    #[derive(Accounts)]
    pub struct SetUpgradeAuthorityChecked<'info> {
        /// CHECK: copied from wormhole repo
        pub program_data: AccountInfo<'info>,
        /// CHECK: copied from wormhole repo
        pub current_authority: AccountInfo<'info>,
        /// CHECK: copied from wormhole repo
        pub new_authority: AccountInfo<'info>,
    }

    pub fn set_buffer_authority<'info>(
        ctx: CpiContext<'_, '_, '_, 'info, SetBufferAuthority<'info>>,
    ) -> Result<()> {
        invoke_with_context(
            &bpf_loader_upgradeable::set_buffer_authority(
                ctx.accounts.buffer.key,
                ctx.accounts.current_authority.key,
                ctx.accounts.new_authority.key,
            ),
            ctx,
        )
    }

    #[derive(Accounts)]
    pub struct SetBufferAuthority<'info> {
        /// CHECK: copied from wormhole repo
        pub buffer: AccountInfo<'info>,
        /// CHECK: copied from wormhole repo
        pub current_authority: AccountInfo<'info>,
        /// CHECK: copied from wormhole repo
        pub new_authority: AccountInfo<'info>,
    }

    pub fn set_buffer_authority_checked<'info>(
        ctx: CpiContext<'_, '_, '_, 'info, SetBufferAuthorityChecked<'info>>,
    ) -> Result<()> {
        invoke_with_context(
            &bpf_loader_upgradeable::set_buffer_authority_checked(
                ctx.accounts.buffer.key,
                ctx.accounts.current_authority.key,
                ctx.accounts.new_authority.key,
            ),
            ctx,
        )
    }

    #[derive(Accounts)]
    pub struct SetBufferAuthorityChecked<'info> {
        /// CHECK: copied from wormhole repo
        pub buffer: AccountInfo<'info>,
        /// CHECK: copied from wormhole repo
        pub current_authority: AccountInfo<'info>,
        /// CHECK: copied from wormhole repo
        pub new_authority: AccountInfo<'info>,
    }

    pub fn upgrade<'info>(ctx: CpiContext<'_, '_, '_, 'info, Upgrade<'info>>) -> Result<()> {
        invoke_with_context(
            &bpf_loader_upgradeable::upgrade(
                ctx.accounts.program.key,
                ctx.accounts.buffer.key,
                ctx.accounts.authority.key,
                ctx.accounts.spill.key,
            ),
            ctx,
        )
    }

    #[derive(Accounts)]
    pub struct Upgrade<'info> {
        /// CHECK: copied from wormhole repo
        pub program: AccountInfo<'info>,
        /// CHECK: TODO
        pub program_data: AccountInfo<'info>,
        /// CHECK: copied from wormhole repo
        pub buffer: AccountInfo<'info>,
        /// CHECK: copied from wormhole repo
        pub authority: AccountInfo<'info>,
        /// CHECK: copied from wormhole repo
        pub spill: AccountInfo<'info>,
        /// CHECK: copied from wormhole repo
        pub rent: AccountInfo<'info>,
        /// CHECK: copied from wormhole repo
        pub clock: AccountInfo<'info>,
    }
}
