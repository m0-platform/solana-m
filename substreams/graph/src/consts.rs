use substreams_solana_utils::pubkey::Pubkey;

macro_rules! pubkey {
    ($input:literal) => {
        Pubkey(five8_const::decode_32_const($input))
    };
}

pub const COMPUTE_PID: Pubkey = pubkey!("ComputeBudget111111111111111111111111111111");
pub const SYSTEM_PID: Pubkey = pubkey!("11111111111111111111111111111111");
pub const MEMO_PID: Pubkey = pubkey!("Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo");

pub const SYSTEM_PROGRAMS: [Pubkey; 3] = [SYSTEM_PID, COMPUTE_PID, MEMO_PID];
