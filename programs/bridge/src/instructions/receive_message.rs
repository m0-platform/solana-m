use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct ReceiveMessage<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
}

impl ReceiveMessage<'_> {
    pub fn handler(ctx: Context<Self>, payload: Vec<u8>) -> Result<()> {
        Ok(())
    }
}
