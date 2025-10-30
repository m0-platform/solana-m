use anchor_lang::{prelude::Pubkey, pubkey};

cfg_if::cfg_if! {
    if #[cfg(feature = "mainnet")] {
        pub const CORE_BRIDGE_PROGRAM_ID: Pubkey = pubkey!("worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth");
        pub const CORE_BRIDGE_FEE_COLLECTOR: Pubkey = pubkey!("9bFNrXNb2WTx8fMHXCheaZqkLZ3YCCaiqTftHxeintHy");
        pub const CORE_BRIDGE_CONFIG: Pubkey = pubkey!("2yVjuQwpsvdsrywzsJJVs9Ueh4zayyo5DYJbBNc3DDpn");
    } else if #[cfg(feature = "devnet")] {
        pub const CORE_BRIDGE_PROGRAM_ID: Pubkey = pubkey!("3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5");
        pub const CORE_BRIDGE_FEE_COLLECTOR: Pubkey = pubkey!("7s3a1ycs16d6SNDumaRtjcoyMaTDZPavzgsmS3uUZYWX");
        pub const CORE_BRIDGE_CONFIG: Pubkey = pubkey!("6bi4JGDoRwUs9TYBuvoA7dUVyikTJDrJsJU1ew6KVLiu");
    }
}
