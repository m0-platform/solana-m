pub mod initialize;
pub mod receive_message;
pub mod send_fill_report;
pub mod send_token;

use anchor_lang::prelude::*;
pub use initialize::*;
pub use receive_message::*;
pub use send_fill_report::*;
pub use send_token::*;

use crate::errors::MessengerError;

declare_program!(ext_swap);
declare_program!(wormhole_adapter);
declare_program!(earn);

pub fn send_message<'info>(
    bridge_adapter: AccountInfo<'info>,
    sender: AccountInfo<'info>,
    messenger_authority: AccountInfo<'info>,
    system_program: AccountInfo<'info>,
    remaining_accounts: Vec<AccountInfo<'info>>,
    message: Vec<u8>,
) -> Result<()> {
    // Relay the message based on provided adapter
    if bridge_adapter.key() == wormhole_adapter::ID {
        // Delegate account validation to wormhole adapter
        let [
                wormhole_global,
                bridge,
                message_account,
                emitter,
                sequence,
                fee_collector,
                clock,
                wormhole_program,
                wormhole_post_message_shim_ea,
                wormhole_post_message_shim
            ]: [AccountInfo; 10] = remaining_accounts
                .try_into()
                .map_err(|_| MessengerError::InvalidRemainingAccounts)?;

        wormhole_adapter::cpi::relay_message(
            CpiContext::new(
                bridge_adapter.to_account_info(),
                wormhole_adapter::cpi::accounts::RelayMessage {
                    payer: sender,
                    wormhole_global,
                    messenger_authority,
                    bridge,
                    message: message_account,
                    emitter,
                    sequence,
                    fee_collector,
                    clock,
                    system_program,
                    wormhole_program,
                    wormhole_post_message_shim_ea,
                    wormhole_post_message_shim,
                },
            ),
            message,
        )
    } else {
        err!(MessengerError::InvalidBridgeAdapter)
    }
}
