pub mod initialize;
pub mod receive_message;
pub mod relay_message;
pub mod resolve_execute;

use anchor_lang::prelude::{borsh::de, *};
use common::{Payload, TokenTransferPayload};
pub use initialize::*;
pub use receive_message::*;
pub use relay_message::*;
pub use resolve_execute::*;

use crate::errors::WormholeError;

declare_program!(wormhole_post_message_shim);
declare_program!(messenger);
declare_program!(wormhole_verify_vaa_shim);
declare_program!(earn);
declare_program!(ext_swap);

#[derive(Debug)]
pub struct VaaBody {
    pub timestamp: u32,
    pub nonce: u32,
    pub emitter_chain: u16,
    pub emitter_address: [u8; 32],
    pub sequence: u64,
    pub consistency_level: u8,
    pub payload: Payload,
}

impl VaaBody {
    pub fn from_bytes(data: &Vec<u8>) -> Result<Self> {
        if data.len() < 51 {
            return err!(WormholeError::InvalidVaa);
        }

        let (timestamp_bytes, data) = data.split_at(4);
        let (nonce_bytes, data) = data.split_at(4);
        let (emitter_chain_bytes, data) = data.split_at(2);
        let (emitter_address_bytes, data) = data.split_at(32);
        let (sequence_bytes, data) = data.split_at(8);
        let (consistency_level_bytes, payload_bytes) = data.split_at(1);

        // Transform legacy TransceiverMessage
        let payload = if payload_bytes.starts_with(&[0x99, 0x45, 0xFF, 0x10]) {
            let (_source_ntt_manager, rest) = payload_bytes[4..].split_at(32);
            let (_recipient_ntt_manager, rest) = rest.split_at(32);
            let (_ntt_manager_payload_len, rest) = rest.split_at(2);

            // NttManagerMessage
            let (_id, rest) = rest.split_at(32);
            let (_sender, rest) = rest.split_at(32);
            let (_payload_len, rest) = rest.split_at(2);

            // NativeTokenTransfer
            if rest.starts_with(&[0x99, 0x4E, 0x54, 0x54]) {
                let (_decimals, rest) = rest[4..].split_at(1);
                let (amount_bytes, rest) = rest.split_at(8);
                let (_source_token, rest) = rest.split_at(32);
                let (to, rest) = rest.split_at(32);
                let (_to_chain, rest) = rest.split_at(2);
                let (_additional_payload_len, rest) = rest.split_at(2);
                let (index, rest) = rest.split_at(8);
                let (destination_token, _rest) = rest.split_at(32);

                Payload::TokenTransfer(TokenTransferPayload {
                    amount: u64::from_be_bytes(amount_bytes.try_into().unwrap()) as u128,
                    destination_token: destination_token.try_into().unwrap(),
                    recipient: to.try_into().unwrap(),
                    index: u64::from_be_bytes(index.try_into().unwrap()),
                    sender: [0u8; 32], // NTT does not provide sender info
                })
            } else {
                return err!(WormholeError::InvalidVaa);
            }
        } else {
            // M0 message format
            Payload::decode(payload_bytes.to_vec())
        };

        Ok(VaaBody {
            timestamp: u32::from_be_bytes(timestamp_bytes.try_into().unwrap()),
            nonce: u32::from_be_bytes(nonce_bytes.try_into().unwrap()),
            emitter_chain: u16::from_be_bytes(emitter_chain_bytes.try_into().unwrap()),
            emitter_address: emitter_address_bytes.try_into().unwrap(),
            sequence: u64::from_be_bytes(sequence_bytes.try_into().unwrap()),
            consistency_level: consistency_level_bytes[0],
            payload,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::prelude::*;

    #[test]
    fn test_decode() {
        // https://wormholescan.io/#/tx/0xb5facd3e37ba9445ced457f9eaa92d79bdaef8174a13dd926b40391ee7b0df53
        let base64_vaa_body = "AQAAAAQNAEB8GSlxb+LWPHSUDwfXubwFURE/BV/Ie8PVybmJjhZFWFF1ZrkfGbx1+eF+f2RpkajacPcXAzyAYvsXqW0NOggBAbHuj0adu9UvVa58TSclonygT/DWqnl4ijXL9CkWkeFRIoaQA5II3JwQwx16nn+Uet1NuVNlP1jnw5M8MmiMsSIAAkV7UPeSLR+ud4bpn2h3om8FzOI4tXwWupTrvts/gr3RQaT3UhMaD5Xx8zht6It25BU7QdGP1m5X1/vnWC89YDMABLDp89mjghq49fLI9GSlTc4kbR0IRYuTtIbyroVjJFDMH16s8rU/eSiPOokBKOtcuVDl6uPFtlkyBwnsMULg3SEABgvWGKVcZbDJQretT4N1Ic2bwZw9XuTtOVt5Z5APLao0d2ARkW/CWbPiBw13FXNHyHq5kWMFvzcfO4YS/g4PCccAB/yB4y3ADSucgdd3fwwpCk87BvCVrXNblSli6o8/ecolCTyLj92hwJr5F8VBqB3W0d4Y0C/hxrGDdRPHUref5hEACY8JMx7KsMnSj9oPlm3vSec8v9POz2I6HIqFgcsCb/0gfQ+BRYiJ6N1ob4cmEmDIzrW7S9pxEaI/xKtCiSkK4nwACphSIuZ1plQhobSuR65L6pmZak9/uZaufJNhwndcFO8ybIgBLO3L2LZ+YWJ5ZY4U+4wnfBfzf5n2WJdaObV6tpsADO9x6/PRPJ0E2g9SDpt638BLSqCSDmY4DZ8WljoSaF2cAJ+/Z4LF6Z7R/KUXlwmUlXzD528zqdnYj59LhMRRQBcADRAuM1LVW8Gq2ooJ1LbS30fPuJmxJ5EtoMsbLrF6RrEbF3PIkRbXAdoMCZLeN4DbFtc3EO1zSISP2DiQO4uPsFABDxNH1ZYh2Rv/Ip3HoDnqzxeNbZDJDKleV6Zkfro9AnuuOqeKy+RIcePeakMDButaQte898AsdSkg2YniO5kOjgAAEQNDAgkCeizbHIJLiryJmx8WvlULaB5pnNB2oOUjhSyjUBVJVnQnpVAQaNi8c+C447dyVAn0rWML0BPIfxmxvZ4BEsljDDnK8hIAcJEA1KoHt9Mp9u2lbf0IOJCbYWGnFhb/UQzAf3qourLVZFrczYwyZw5uIw5e1MvJgRB+hXeqKhYBaQNiDwAAAAAAAgAAAAAAAAAAAAAAAAdjGWoJFXWt+Z4jBuXpDgvlFUhBAAAAAAAAAXMBmUX/EAAAAAAAAAAAAAAAANklyEtV5ORKU3Sf9fKloT9j0Sj9C4bsGBzUxcmE6QYrE/Ky3nufW15o6ENJIx1mFM3z+Z8AuwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1hAAAAAAAAAAAAAAAAIvBKbNk1v6O00ACk49QHmtsUgZgAeZlOVFQGAAAAAAAAAAIAAAAAAAAAAAAAAACGaiv05XLLzzfVBxp6WFA7+za+G7Pce1wTXGKGGjMlYml282w+cbkUAoVQV4nvBkkivE/2AAEAKAAAAPdzhDNJC4a+ZrwfmLR9IKO+YVpJBagluCaGTioPTJSEZ9M+5wkAAA==";
        let vaa_raw = BASE64_STANDARD
            .decode(base64_vaa_body)
            .expect("Failed to decode base64 string");

        // remove header
        let header_len = 6 + vaa_raw[5] as usize * 66;
        let vaa_body = vaa_raw[header_len..].to_vec();

        let vaa = VaaBody::from_bytes(&vaa_body).unwrap();

        // vaa fields
        assert_eq!(vaa.emitter_chain, 2);
        assert_eq!(vaa.timestamp, 1761829391);
        assert_eq!(vaa.sequence, 371);
        assert_eq!(vaa.consistency_level, 1);

        // payload verification
        match vaa.payload {
            Payload::TokenTransfer(ref payload) => {
                assert_eq!(payload.amount, 2);
                assert_eq!(payload.index, 1062794965833);
                assert_eq!(
                    Pubkey::new_from_array(payload.destination_token).to_string(),
                    "mzeroXDoBpRVhnEXBra27qzAMdxgpWVY3DzQW7xMVJp"
                );
                assert_eq!(
                    Pubkey::new_from_array(payload.recipient).to_string(),
                    "D76ySoHPwD8U2nnTTDqXeUJQg5UkD9UD1PUE1rnvPAGm"
                );
            }
            _ => panic!("Expected TokenTransfer payload"),
        }
    }
}
