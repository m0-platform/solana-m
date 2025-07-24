pub mod token_transfer;

use anchor_lang::prelude::*;
use std::io;
use token_transfer::NativeTokenTransfer;
use wormhole_io::{Readable, TypePrefixedPayload, Writeable};

use crate::ntt_messages::ChainId;

#[derive(Debug, Clone, PartialEq, Eq, AnchorSerialize, AnchorDeserialize, InitSpace)]
pub enum Payload {
    NativeTokenTransfer(NativeTokenTransfer),
}

impl Payload {
    pub fn to_chain(&self) -> ChainId {
        match self {
            Payload::NativeTokenTransfer(ntt) => ntt.to_chain,
        }
    }
}

impl Readable for Payload {
    const SIZE: Option<usize> = None;

    fn read<R>(reader: &mut R) -> io::Result<Self>
    where
        Self: Sized,
        R: io::Read,
    {
        let prefix: [u8; 4] = Readable::read(reader)?;

        match prefix {
            NativeTokenTransfer::PREFIX => Ok(Self::NativeTokenTransfer(Readable::read(reader)?)),
            _ => Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "Invalid payload type prefix",
            )),
        }
    }
}

impl Writeable for Payload {
    fn written_size(&self) -> usize {
        match self {
            Payload::NativeTokenTransfer(ntt) => ntt.written_size(),
        }
    }

    fn write<W>(&self, writer: &mut W) -> io::Result<()>
    where
        W: io::Write,
    {
        match self {
            Payload::NativeTokenTransfer(ntt) => ntt.write(writer),
        }
    }
}

impl TypePrefixedPayload for Payload {
    const TYPE: Option<u8> = None;
}
