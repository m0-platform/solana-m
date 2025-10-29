use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct SendFillReport<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
}

impl SendFillReport<'_> {
    pub fn handler(ctx: Context<Self>) -> Result<()> {
        Ok(())
    }
}
