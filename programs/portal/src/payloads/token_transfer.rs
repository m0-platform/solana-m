use anchor_lang::prelude::*;
use std::io;

use wormhole_io::{Readable, TypePrefixedPayload, Writeable};

use crate::ntt_messages::{ChainId, TrimmedAmount};

#[derive(Debug, Clone, PartialEq, Eq, AnchorSerialize, AnchorDeserialize, InitSpace)]
pub struct NativeTokenTransfer {
    pub amount: TrimmedAmount,
    pub source_token: [u8; 32],
    pub to: [u8; 32],
    pub to_chain: ChainId,
    pub additional_payload: AdditionalPayload,
}

impl NativeTokenTransfer {
    pub const PREFIX: [u8; 4] = [0x99, 0x4E, 0x54, 0x54];
}

impl TypePrefixedPayload for NativeTokenTransfer {
    const TYPE: Option<u8> = None;
}

impl Readable for NativeTokenTransfer {
    const SIZE: Option<usize> = None;

    fn read<R>(reader: &mut R) -> io::Result<Self>
    where
        Self: Sized,
        R: io::Read,
    {
        let amount = Readable::read(reader)?;
        let source_token = Readable::read(reader)?;
        let to = Readable::read(reader)?;
        let to_chain = Readable::read(reader)?;

        // additional payload
        let mut additional_payload = AdditionalPayload::default();
        let payload_len: u16 = Readable::read(reader)?;
        msg!("additional payload length: {}", payload_len);

        additional_payload.index = Readable::read(reader)?;
        additional_payload.destination_token = Readable::read(reader)?;

        // L2s will not propagate this data
        if payload_len >= 72 {
            additional_payload.earner_root = Some(Readable::read(reader)?);
        }

        Ok(Self {
            amount,
            source_token,
            to,
            to_chain,
            additional_payload,
        })
    }
}

impl Writeable for NativeTokenTransfer {
    fn written_size(&self) -> usize {
        Self::PREFIX.len()
            + TrimmedAmount::SIZE.unwrap()
            + self.source_token.len()
            + self.to.len()
            + ChainId::SIZE.unwrap()
            + u16::SIZE.unwrap()
            + self.additional_payload.written_size()
    }

    fn write<W>(&self, writer: &mut W) -> io::Result<()>
    where
        W: io::Write,
    {
        let NativeTokenTransfer {
            amount,
            source_token,
            to,
            to_chain,
            additional_payload,
        } = self;

        Self::PREFIX.write(writer)?;
        amount.write(writer)?;
        source_token.write(writer)?;
        to.write(writer)?;
        to_chain.write(writer)?;

        let len: u16 = u16::try_from(additional_payload.written_size()).expect("u16 overflow");
        len.write(writer)?;
        additional_payload.write(writer)?;

        Ok(())
    }
}

#[derive(Debug, PartialEq, Eq, Default, Clone, AnchorSerialize, AnchorDeserialize, InitSpace)]
pub struct AdditionalPayload {
    pub index: u64,
    pub destination_token: [u8; 32], // address of the token (M or Wrapped M) on the destination chain
    pub earner_root: Option<[u8; 32]>,
}

impl AdditionalPayload {
    pub fn with_destination_token(destination_token: [u8; 32]) -> Self {
        Self {
            index: 0,
            destination_token,
            earner_root: None,
        }
    }
}

impl Writeable for AdditionalPayload {
    fn written_size(&self) -> usize {
        let mut size = u64::SIZE.unwrap() + self.destination_token.len();

        if self.earner_root.is_some() {
            size += self.earner_root.unwrap().len();
        }

        size
    }

    fn write<W>(&self, writer: &mut W) -> io::Result<()>
    where
        W: io::Write,
    {
        self.index.write(writer)?;
        self.destination_token.write(writer)?;

        if self.earner_root.is_some() {
            self.earner_root.unwrap().write(writer)?;
        }

        Ok(())
    }
}
