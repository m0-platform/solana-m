use anchor_lang::{
    prelude::*,
    system_program::{transfer, Transfer},
};

use crate::{
    errors::ExtError,
    state::{ExtGlobal, EXT_GLOBAL_SEED},
};

#[derive(Accounts)]
pub struct AddWrapAuthority<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [EXT_GLOBAL_SEED],
        bump,
    )]
    /// CHECK: Account is validated in the handler
    pub global_account: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<AddWrapAuthority>, new_wrap_authority: Pubkey) -> Result<()> {
    let global_account = &mut ctx.accounts.global_account;

    if global_account.data_is_empty() {
        return err!(ExtError::InvalidAccount);
    }

    // Get number of authorities in the global account
    let authorities = if global_account.data_len() < ExtGlobal::size(0) {
        0 // Old format with no wrap authorities
    } else {
        let mut buf = &global_account.try_borrow_data()?[..];
        ExtGlobal::try_deserialize(&mut buf)?.wrap_authorities.len()
    };

    let new_size = ExtGlobal::size(authorities + 1);

    // Reallocate more space if needed
    // (removing whitelisted items does not shrink the account)
    if global_account.data_len() < new_size {
        global_account.realloc(new_size, false)?;

        // If more lamports are needed, transfer them to the account
        let rent_exempt_lamports = Rent::get().unwrap().minimum_balance(new_size).max(1);
        let top_up_lamports =
            rent_exempt_lamports.saturating_sub(global_account.to_account_info().lamports());

        if top_up_lamports > 0 {
            transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.admin.to_account_info(),
                        to: global_account.to_account_info(),
                    },
                ),
                top_up_lamports,
            )?;
        }
    }

    let data = &mut global_account.try_borrow_mut_data()?[..];
    let mut global = ExtGlobal::try_deserialize(&mut &data[..])?;

    // Validate now that we can parse the account
    if !global.admin.eq(ctx.accounts.admin.key) {
        return err!(ExtError::NotAuthorized);
    }
    if global.wrap_authorities.contains(&new_wrap_authority) {
        return err!(ExtError::InvalidParam);
    }

    global.wrap_authorities.push(new_wrap_authority);
    data[8..].copy_from_slice(global.try_to_vec()?.as_slice());

    Ok(())
}
