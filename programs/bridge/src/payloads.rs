pub enum PayloadType {
    TokenTransfer(TokenTransferPayload),
    Index(IndexPayload),
    RegistrarKey,
    RegistrarList,
    FillReport(FillReportPayload),
}

impl PayloadType {
    pub fn encode(&self) -> Vec<u8> {
        match self {
            PayloadType::TokenTransfer(payload) => {
                let mut data = vec![0u8];
                data.extend_from_slice(&payload.amount.to_be_bytes());
                data.extend_from_slice(&payload.destination_token);
                data.extend_from_slice(&payload.sender);
                data.extend_from_slice(&payload.recipient);
                data.extend_from_slice(&payload.index.to_be_bytes());
                data
            }
            PayloadType::Index(payload) => {
                let mut data = vec![1u8];
                data.extend_from_slice(&payload.index.to_be_bytes());
                data.extend_from_slice(&payload.message_id);
                data
            }
            PayloadType::RegistrarKey => vec![2u8],
            PayloadType::RegistrarList => vec![3u8],
            PayloadType::FillReport(payload) => {
                let mut data = vec![4u8];
                data.extend_from_slice(&payload.order_id);
                data.extend_from_slice(&payload.amount_in_to_release.to_be_bytes());
                data.extend_from_slice(&payload.amount_out_filled.to_be_bytes());
                data.extend_from_slice(&payload.origin_recipient);
                data
            }
        }
    }

    pub fn decode(data: Vec<u8>) -> Self {
        let (payload_type, data) = data.split_at(1);

        match payload_type[0] {
            0 => {
                let (amount_bytes, data) = data.split_at(16);
                let (destination_token_bytes, data) = data.split_at(32);
                let (sender_bytes, data) = data.split_at(32);
                let (recipient_bytes, data) = data.split_at(32);
                let (index_bytes, _) = data.split_at(8);

                PayloadType::TokenTransfer(TokenTransferPayload {
                    amount: u128::from_le_bytes(amount_bytes.try_into().unwrap()),
                    destination_token: destination_token_bytes.try_into().unwrap(),
                    sender: sender_bytes.try_into().unwrap(),
                    recipient: recipient_bytes.try_into().unwrap(),
                    index: u64::from_le_bytes(index_bytes.try_into().unwrap()),
                })
            }
            1 => {
                let (index_bytes, message_id_bytes) = data.split_at(8);
                let (message_id_bytes, _) = message_id_bytes.split_at(32);

                PayloadType::Index(IndexPayload {
                    index: u64::from_le_bytes(index_bytes.try_into().unwrap()),
                    message_id: message_id_bytes.try_into().unwrap(),
                })
            }
            2 => PayloadType::RegistrarKey,
            3 => PayloadType::RegistrarList,
            4 => {
                let (order_id_bytes, data) = data.split_at(32);
                let (amount_in_to_release_bytes, data) = data.split_at(16);
                let (amount_out_filled_bytes, data) = data.split_at(16);
                let (origin_recipient_bytes, _) = data.split_at(32);

                PayloadType::FillReport(FillReportPayload {
                    order_id: order_id_bytes.try_into().unwrap(),
                    amount_in_to_release: u128::from_le_bytes(
                        amount_in_to_release_bytes.try_into().unwrap(),
                    ),
                    amount_out_filled: u128::from_le_bytes(
                        amount_out_filled_bytes.try_into().unwrap(),
                    ),
                    origin_recipient: origin_recipient_bytes.try_into().unwrap(),
                })
            }
            _ => panic!("Invalid payload type"),
        }
    }
}

pub struct TokenTransferPayload {
    pub amount: u128,
    pub destination_token: [u8; 32],
    pub sender: [u8; 32],
    pub recipient: [u8; 32],
    pub index: u64,
}

pub struct FillReportPayload {
    pub order_id: [u8; 32],
    pub amount_in_to_release: u128,
    pub amount_out_filled: u128,
    pub origin_recipient: [u8; 32],
}

pub struct IndexPayload {
    pub index: u64,
    pub message_id: [u8; 32],
}
