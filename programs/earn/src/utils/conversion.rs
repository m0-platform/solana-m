use crate::{
    constants::{INDEX_SCALE_F64, INDEX_SCALE_U64},
    errors::EarnError,
};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_spl::token_interface::{Mint, Token2022};
use spl_token_2022::extension::{
    scaled_ui_amount::ScaledUiAmountConfig, BaseStateWithExtensions, StateWithExtensions,
};

pub fn update_multiplier<'info>(
    mint: &mut InterfaceAccount<'info, Mint>,
    authority: &AccountInfo<'info>,
    authority_seeds: &[&[&[u8]]],
    token_program: &Program<'info, Token2022>,
    index: u64,
    timestamp: i64,
) -> Result<()> {
    let multiplier = (index as f64) / INDEX_SCALE_F64;

    // Only update multiplier if the new multiplier is greater than the current multiplier
    // Indices in the M protocol are monotonically increasing, but we may receive a stale update
    // from another chain.
    let scaled_ui_config = get_scaled_ui_config(mint)?;
    if multiplier > scaled_ui_config.new_multiplier.into() {
        // Update the multiplier and timestamp in the mint account
        invoke_signed(
            &spl_token_2022::extension::scaled_ui_amount::instruction::update_multiplier(
                &token_program.key(),
                &mint.key(),
                &authority.key(),
                &[],
                multiplier,
                timestamp,
            )?,
            &[mint.to_account_info(), authority.clone()],
            authority_seeds,
        )?;

        // Reload the mint account so the new multiplier is reflected
        mint.reload()?;
    }

    Ok(())
}

pub fn amount_to_principal_down(amount: u64, multiplier: f64) -> Result<u64> {
    // If the multiplier is 1, return the amount directly
    if multiplier == 1.0 {
        return Ok(amount);
    }

    // We want to avoid precision errors with floating point numbers
    // Therefore, we use integer math.
    let index = (multiplier * INDEX_SCALE_F64).trunc() as u128;

    // Calculate the principal from the amount and index, rounding down
    let principal: u64 = (amount as u128)
        .checked_mul(INDEX_SCALE_U64 as u128)
        .ok_or(EarnError::MathOverflow)?
        .checked_div(index)
        .ok_or(EarnError::MathUnderflow)?
        .try_into()?;

    Ok(principal)
}

pub fn amount_to_principal_up(amount: u64, multiplier: f64) -> Result<u64> {
    // If the multiplier is 1, return the amount directly
    if multiplier == 1.0 {
        return Ok(amount);
    }

    // We want to avoid precision errors with floating point numbers
    // Therefore, we use integer math.
    let index = (multiplier * INDEX_SCALE_F64).trunc() as u128;

    // Calculate the principal from the amount and index, rounding up
    let principal: u64 = (amount as u128)
        .checked_mul(INDEX_SCALE_U64 as u128)
        .ok_or(EarnError::MathOverflow)?
        .checked_add(index.checked_sub(1u128).ok_or(EarnError::MathUnderflow)?)
        .ok_or(EarnError::MathOverflow)?
        .checked_div(index)
        .ok_or(EarnError::MathUnderflow)?
        .try_into()?;

    Ok(principal)
}

pub fn principal_to_amount_down(principal: u64, multiplier: f64) -> Result<u64> {
    // If the multiplier is 1, return the principal directly
    if multiplier == 1.0 {
        return Ok(principal);
    }

    // We want to avoid precision errors with floating point numbers
    // Therefore, we use integer math.
    let index = (multiplier * INDEX_SCALE_F64).trunc() as u128;

    // Calculate the amount from the principal and index, rounding down
    let amount: u64 = index
        .checked_mul(principal as u128)
        .ok_or(EarnError::MathOverflow)?
        .checked_div(INDEX_SCALE_U64 as u128)
        .ok_or(EarnError::MathUnderflow)?
        .try_into()?;

    Ok(amount)
}

pub fn principal_to_amount_up(principal: u64, multiplier: f64) -> Result<u64> {
    // If the multiplier is 1, return the principal directly
    if multiplier == 1.0 {
        return Ok(principal);
    }

    // We want to avoid precision errors with floating point numbers
    // Therefore, we use integer math.
    let index = (multiplier * INDEX_SCALE_F64).trunc() as u128;

    // Calculate the amount from the principal and index, rounding up
    let amount: u64 = index
        .checked_mul(principal as u128)
        .ok_or(EarnError::MathOverflow)?
        .checked_add(
            (INDEX_SCALE_U64 as u128)
                .checked_sub(1u128)
                .ok_or(EarnError::MathUnderflow)?,
        )
        .ok_or(EarnError::MathOverflow)?
        .checked_div(INDEX_SCALE_U64 as u128)
        .ok_or(EarnError::MathUnderflow)?
        .try_into()?;

    Ok(amount)
}

pub fn get_mint_extensions<'info>(
    mint: &InterfaceAccount<'info, Mint>,
) -> Result<Vec<spl_token_2022::extension::ExtensionType>> {
    // Get the mint account data
    let account_info = mint.to_account_info();
    let mint_data = account_info.try_borrow_data()?;
    let mint_ext_data = StateWithExtensions::<spl_token_2022::state::Mint>::unpack(&mint_data)?;

    let extensions = mint_ext_data.get_extension_types()?;

    Ok(extensions)
}

pub fn get_scaled_ui_config<'info>(
    mint: &InterfaceAccount<'info, Mint>,
) -> Result<ScaledUiAmountConfig> {
    // Get the mint account data with extensions
    let account_info = mint.to_account_info();
    let mint_data = account_info.try_borrow_data()?;
    let mint_ext_data = StateWithExtensions::<spl_token_2022::state::Mint>::unpack(&mint_data)?;

    // Get the scaled UI config extension
    let scaled_ui_config = mint_ext_data.get_extension::<ScaledUiAmountConfig>()?;

    Ok(*scaled_ui_config)
}
