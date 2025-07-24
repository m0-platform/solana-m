use ::spl_token_2022::extension::immutable_owner::ImmutableOwner;
use ::spl_token_2022::extension::BaseStateWithExtensions;
use ::spl_token_2022::extension::PodStateWithExtensions;
use ::spl_token_2022::pod::PodAccount;
use anchor_lang::{prelude::*, solana_program::program::invoke_signed};
use anchor_spl::{
    token_2022::spl_token_2022,
    token_interface::{transfer_checked, Mint, Token2022, TokenAccount, TransferChecked},
};

pub fn has_immutable_owner<'info>(token_account: &InterfaceAccount<'info, TokenAccount>) -> bool {
    let account_info = token_account.to_account_info();
    let data = account_info.data.borrow();

    match PodStateWithExtensions::<PodAccount>::unpack(&data) {
        Ok(account) => account.get_extension::<ImmutableOwner>().is_ok(),
        Err(_) => return false,
    }
}

pub fn freeze_token_account<'info>(
    token_account: &InterfaceAccount<'info, TokenAccount>,
    mint: &InterfaceAccount<'info, Mint>,
    authority: &AccountInfo<'info>,
    authority_seeds: &[&[&[u8]]],
    token_program: &Program<'info, Token2022>,
) -> Result<()> {
    invoke_signed(
        &spl_token_2022::instruction::freeze_account(
            token_program.to_account_info().key,
            token_account.to_account_info().key,
            mint.to_account_info().key,
            authority.to_account_info().key,
            &[],
        )?,
        &[
            token_account.to_account_info(),
            mint.to_account_info(),
            authority.clone(),
        ],
        authority_seeds,
    )?;

    Ok(())
}

pub fn thaw_token_account<'info>(
    token_account: &InterfaceAccount<'info, TokenAccount>,
    mint: &InterfaceAccount<'info, Mint>,
    authority: &AccountInfo<'info>,
    authority_seeds: &[&[&[u8]]],
    token_program: &Program<'info, Token2022>,
) -> Result<()> {
    invoke_signed(
        &spl_token_2022::instruction::thaw_account(
            token_program.to_account_info().key,
            token_account.to_account_info().key,
            mint.to_account_info().key,
            authority.to_account_info().key,
            &[],
        )?,
        &[
            token_account.to_account_info(),
            mint.to_account_info(),
            authority.clone(),
        ],
        authority_seeds,
    )?;

    Ok(())
}

pub fn transfer_tokens_from_program<'info>(
    from: &InterfaceAccount<'info, TokenAccount>,
    to: &InterfaceAccount<'info, TokenAccount>,
    amount: u64,
    mint: &InterfaceAccount<'info, Mint>,
    authority: &AccountInfo<'info>,
    authority_seeds: &[&[&[u8]]],
    token_program: &Program<'info, Token2022>,
) -> Result<()> {
    // Build the arguments for the transfer instruction
    let transfer_options = TransferChecked {
        from: from.to_account_info(),
        to: to.to_account_info(),
        mint: mint.to_account_info(),
        authority: authority.clone(),
    };
    let cpi_context = CpiContext::new_with_signer(
        token_program.to_account_info(),
        transfer_options,
        authority_seeds,
    );

    // Call the transfer instruction
    transfer_checked(cpi_context, amount, mint.decimals)?;

    Ok(())
}
