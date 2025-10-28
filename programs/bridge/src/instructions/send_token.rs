use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct SendTokens<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
}

impl SendTokens<'_> {
    pub fn handler(ctx: Context<Self>) -> Result<()> {
        Ok(())
    }
}
