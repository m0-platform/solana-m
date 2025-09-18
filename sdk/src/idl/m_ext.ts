/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/m_ext.json`.
 */
export type MExt = {
  address: '3C865D264L4NkAm78zfnDzQJJvXuU3fMjRUvRxyPi5da';
  metadata: {
    name: 'mExt';
    version: '0.2.0';
    spec: '0.1.0';
    description: 'M extension program with various yield distribution options chosen at compile time';
  };
  instructions: [
    {
      name: 'acceptAdmin';
      discriminator: [112, 42, 45, 90, 116, 181, 13, 170];
      accounts: [
        {
          name: 'pendingAdmin';
          writable: true;
          signer: true;
        },
        {
          name: 'globalAccount';
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [103, 108, 111, 98, 97, 108];
              },
            ];
          };
        },
      ];
      args: [];
    },
    {
      name: 'addEarnManager';
      discriminator: [237, 29, 254, 71, 117, 177, 159, 25];
      accounts: [
        {
          name: 'admin';
          writable: true;
          signer: true;
          relations: ['globalAccount'];
        },
        {
          name: 'globalAccount';
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [103, 108, 111, 98, 97, 108];
              },
            ];
          };
        },
        {
          name: 'earnManagerAccount';
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [101, 97, 114, 110, 95, 109, 97, 110, 97, 103, 101, 114];
              },
              {
                kind: 'arg';
                path: 'earnManager';
              },
            ];
          };
        },
        {
          name: 'feeTokenAccount';
        },
        {
          name: 'systemProgram';
          address: '11111111111111111111111111111111';
        },
      ];
      args: [
        {
          name: 'earnManager';
          type: 'pubkey';
        },
        {
          name: 'feeBps';
          type: 'u64';
        },
      ];
    },
    {
      name: 'addEarner';
      discriminator: [191, 90, 193, 126, 226, 158, 64, 168];
      accounts: [
        {
          name: 'signer';
          writable: true;
          signer: true;
        },
        {
          name: 'earnManagerAccount';
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [101, 97, 114, 110, 95, 109, 97, 110, 97, 103, 101, 114];
              },
              {
                kind: 'account';
                path: 'signer';
              },
            ];
          };
        },
        {
          name: 'globalAccount';
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [103, 108, 111, 98, 97, 108];
              },
            ];
          };
        },
        {
          name: 'userTokenAccount';
        },
        {
          name: 'earnerAccount';
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [101, 97, 114, 110, 101, 114];
              },
              {
                kind: 'account';
                path: 'userTokenAccount';
              },
            ];
          };
        },
        {
          name: 'systemProgram';
          address: '11111111111111111111111111111111';
        },
      ];
      args: [
        {
          name: 'user';
          type: 'pubkey';
        },
      ];
    },
    {
      name: 'addWrapAuthority';
      discriminator: [234, 104, 99, 10, 191, 202, 68, 43];
      accounts: [
        {
          name: 'admin';
          writable: true;
          signer: true;
          relations: ['globalAccount'];
        },
        {
          name: 'globalAccount';
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [103, 108, 111, 98, 97, 108];
              },
            ];
          };
        },
        {
          name: 'systemProgram';
          address: '11111111111111111111111111111111';
        },
      ];
      args: [
        {
          name: 'newWrapAuthority';
          type: 'pubkey';
        },
      ];
    },
    {
      name: 'claimFor';
      discriminator: [245, 67, 97, 44, 59, 223, 144, 1];
      accounts: [
        {
          name: 'earnAuthority';
          signer: true;
        },
        {
          name: 'globalAccount';
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [103, 108, 111, 98, 97, 108];
              },
            ];
          };
        },
        {
          name: 'mMint';
          relations: ['globalAccount'];
        },
        {
          name: 'extMint';
          writable: true;
          relations: ['globalAccount'];
        },
        {
          name: 'extMintAuthority';
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [109, 105, 110, 116, 95, 97, 117, 116, 104, 111, 114, 105, 116, 121];
              },
            ];
          };
        },
        {
          name: 'mVaultAccount';
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [109, 95, 118, 97, 117, 108, 116];
              },
            ];
          };
        },
        {
          name: 'vaultMTokenAccount';
          pda: {
            seeds: [
              {
                kind: 'account';
                path: 'mVaultAccount';
              },
              {
                kind: 'account';
                path: 'mTokenProgram';
              },
              {
                kind: 'account';
                path: 'global_account.m_mint';
                account: 'extGlobalV2';
              },
            ];
            program: {
              kind: 'const';
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89,
              ];
            };
          };
        },
        {
          name: 'userTokenAccount';
          writable: true;
        },
        {
          name: 'earnerAccount';
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [101, 97, 114, 110, 101, 114];
              },
              {
                kind: 'account';
                path: 'earner_account.user_token_account';
                account: 'earner';
              },
            ];
          };
        },
        {
          name: 'earnManagerAccount';
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [101, 97, 114, 110, 95, 109, 97, 110, 97, 103, 101, 114];
              },
              {
                kind: 'account';
                path: 'earner_account.earn_manager';
                account: 'earner';
              },
            ];
          };
        },
        {
          name: 'earnManagerTokenAccount';
          docs: [
            'if the token account has been closed or is not initialized',
            'This prevents DoSing earner yield by closing this account',
          ];
          writable: true;
        },
        {
          name: 'mTokenProgram';
          address: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
        },
        {
          name: 'extTokenProgram';
        },
      ];
      args: [
        {
          name: 'snapshotBalance';
          type: 'u64';
        },
      ];
    },
    {
      name: 'configureEarnManager';
      discriminator: [116, 96, 19, 92, 147, 244, 108, 216];
      accounts: [
        {
          name: 'signer';
          writable: true;
          signer: true;
        },
        {
          name: 'globalAccount';
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [103, 108, 111, 98, 97, 108];
              },
            ];
          };
        },
        {
          name: 'earnManagerAccount';
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [101, 97, 114, 110, 95, 109, 97, 110, 97, 103, 101, 114];
              },
              {
                kind: 'account';
                path: 'signer';
              },
            ];
          };
        },
        {
          name: 'feeTokenAccount';
          optional: true;
        },
      ];
      args: [
        {
          name: 'feeBps';
          type: {
            option: 'u64';
          };
        },
      ];
    },
    {
      name: 'initialize';
      discriminator: [175, 175, 109, 31, 13, 152, 155, 237];
      accounts: [
        {
          name: 'admin';
          writable: true;
          signer: true;
        },
        {
          name: 'globalAccount';
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [103, 108, 111, 98, 97, 108];
              },
            ];
          };
        },
        {
          name: 'mMint';
        },
        {
          name: 'extMint';
          writable: true;
        },
        {
          name: 'extMintAuthority';
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [109, 105, 110, 116, 95, 97, 117, 116, 104, 111, 114, 105, 116, 121];
              },
            ];
          };
        },
        {
          name: 'mVault';
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [109, 95, 118, 97, 117, 108, 116];
              },
            ];
          };
        },
        {
          name: 'vaultMTokenAccount';
          pda: {
            seeds: [
              {
                kind: 'account';
                path: 'mVault';
              },
              {
                kind: 'account';
                path: 'mTokenProgram';
              },
              {
                kind: 'account';
                path: 'mMint';
              },
            ];
            program: {
              kind: 'const';
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89,
              ];
            };
          };
        },
        {
          name: 'mEarnGlobalAccount';
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [103, 108, 111, 98, 97, 108];
              },
            ];
            program: {
              kind: 'const';
              value: [
                11,
                134,
                11,
                7,
                229,
                245,
                33,
                49,
                225,
                170,
                183,
                171,
                210,
                177,
                147,
                110,
                166,
                55,
                182,
                49,
                97,
                242,
                35,
                170,
                152,
                135,
                152,
                108,
                102,
                78,
                112,
                208,
              ];
            };
          };
        },
        {
          name: 'mTokenProgram';
          address: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
        },
        {
          name: 'extTokenProgram';
        },
        {
          name: 'systemProgram';
          address: '11111111111111111111111111111111';
        },
      ];
      args: [
        {
          name: 'wrapAuthorities';
          type: {
            vec: 'pubkey';
          };
        },
        {
          name: 'earnAuthority';
          type: 'pubkey';
        },
      ];
    },
    {
      name: 'removeEarnManager';
      discriminator: [121, 207, 141, 182, 239, 154, 85, 152];
      accounts: [
        {
          name: 'admin';
          signer: true;
          relations: ['globalAccount'];
        },
        {
          name: 'globalAccount';
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [103, 108, 111, 98, 97, 108];
              },
            ];
          };
        },
        {
          name: 'earnManagerAccount';
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [101, 97, 114, 110, 95, 109, 97, 110, 97, 103, 101, 114];
              },
              {
                kind: 'account';
                path: 'earn_manager_account.earn_manager';
                account: 'earnManager';
              },
            ];
          };
        },
      ];
      args: [];
    },
    {
      name: 'removeEarner';
      discriminator: [195, 235, 44, 204, 195, 134, 98, 113];
      accounts: [
        {
          name: 'signer';
          writable: true;
          signer: true;
        },
        {
          name: 'earnerAccount';
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [101, 97, 114, 110, 101, 114];
              },
              {
                kind: 'account';
                path: 'earner_account.user_token_account';
                account: 'earner';
              },
            ];
          };
        },
        {
          name: 'earnManagerAccount';
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [101, 97, 114, 110, 95, 109, 97, 110, 97, 103, 101, 114];
              },
              {
                kind: 'account';
                path: 'signer';
              },
            ];
          };
        },
        {
          name: 'systemProgram';
          address: '11111111111111111111111111111111';
        },
      ];
      args: [];
    },
    {
      name: 'removeOrphanedEarner';
      discriminator: [39, 184, 151, 237, 10, 244, 132, 6];
      accounts: [
        {
          name: 'signer';
          writable: true;
          signer: true;
        },
        {
          name: 'globalAccount';
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [103, 108, 111, 98, 97, 108];
              },
            ];
          };
        },
        {
          name: 'earnerAccount';
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [101, 97, 114, 110, 101, 114];
              },
              {
                kind: 'account';
                path: 'earner_account.user_token_account';
                account: 'earner';
              },
            ];
          };
        },
        {
          name: 'earnManagerAccount';
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [101, 97, 114, 110, 95, 109, 97, 110, 97, 103, 101, 114];
              },
              {
                kind: 'account';
                path: 'earner_account.earn_manager';
                account: 'earner';
              },
            ];
          };
        },
        {
          name: 'systemProgram';
          address: '11111111111111111111111111111111';
        },
      ];
      args: [];
    },
    {
      name: 'removeWrapAuthority';
      discriminator: [218, 60, 185, 181, 112, 63, 60, 152];
      accounts: [
        {
          name: 'admin';
          writable: true;
          signer: true;
          relations: ['globalAccount'];
        },
        {
          name: 'globalAccount';
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [103, 108, 111, 98, 97, 108];
              },
            ];
          };
        },
        {
          name: 'systemProgram';
          address: '11111111111111111111111111111111';
        },
      ];
      args: [
        {
          name: 'wrapAuthority';
          type: 'pubkey';
        },
      ];
    },
    {
      name: 'revokeAdminTransfer';
      discriminator: [98, 62, 163, 107, 196, 212, 46, 102];
      accounts: [
        {
          name: 'admin';
          writable: true;
          signer: true;
          relations: ['globalAccount'];
        },
        {
          name: 'globalAccount';
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [103, 108, 111, 98, 97, 108];
              },
            ];
          };
        },
      ];
      args: [];
    },
    {
      name: 'setEarnAuthority';
      discriminator: [241, 163, 124, 135, 107, 230, 22, 157];
      accounts: [
        {
          name: 'admin';
          signer: true;
          relations: ['globalAccount'];
        },
        {
          name: 'globalAccount';
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [103, 108, 111, 98, 97, 108];
              },
            ];
          };
        },
      ];
      args: [
        {
          name: 'earnAuthority';
          type: 'pubkey';
        },
      ];
    },
    {
      name: 'setRecipient';
      discriminator: [133, 1, 115, 69, 206, 190, 17, 18];
      accounts: [
        {
          name: 'signer';
          signer: true;
        },
        {
          name: 'globalAccount';
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [103, 108, 111, 98, 97, 108];
              },
            ];
          };
        },
        {
          name: 'earnerAccount';
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [101, 97, 114, 110, 101, 114];
              },
              {
                kind: 'account';
                path: 'earner_account.user_token_account';
                account: 'earner';
              },
            ];
          };
        },
        {
          name: 'recipientTokenAccount';
          optional: true;
        },
      ];
      args: [];
    },
    {
      name: 'sync';
      discriminator: [4, 219, 40, 164, 21, 157, 189, 88];
      accounts: [
        {
          name: 'earnAuthority';
          signer: true;
        },
        {
          name: 'mMint';
          relations: ['globalAccount'];
        },
        {
          name: 'globalAccount';
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [103, 108, 111, 98, 97, 108];
              },
            ];
          };
        },
      ];
      args: [];
    },
    {
      name: 'transferAdmin';
      discriminator: [42, 242, 66, 106, 228, 10, 111, 156];
      accounts: [
        {
          name: 'admin';
          writable: true;
          signer: true;
          relations: ['globalAccount'];
        },
        {
          name: 'globalAccount';
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [103, 108, 111, 98, 97, 108];
              },
            ];
          };
        },
      ];
      args: [
        {
          name: 'newAdmin';
          type: 'pubkey';
        },
      ];
    },
    {
      name: 'transferEarner';
      discriminator: [100, 120, 80, 44, 163, 34, 79, 91];
      accounts: [
        {
          name: 'signer';
          signer: true;
        },
        {
          name: 'earnerAccount';
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [101, 97, 114, 110, 101, 114];
              },
              {
                kind: 'account';
                path: 'earner_account.user_token_account';
                account: 'earner';
              },
            ];
          };
        },
        {
          name: 'fromEarnManagerAccount';
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [101, 97, 114, 110, 95, 109, 97, 110, 97, 103, 101, 114];
              },
              {
                kind: 'account';
                path: 'signer';
              },
            ];
          };
        },
        {
          name: 'toEarnManagerAccount';
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [101, 97, 114, 110, 95, 109, 97, 110, 97, 103, 101, 114];
              },
              {
                kind: 'arg';
                path: 'toEarnManager';
              },
            ];
          };
        },
      ];
      args: [
        {
          name: 'toEarnManager';
          type: 'pubkey';
        },
      ];
    },
    {
      name: 'unwrap';
      discriminator: [126, 175, 198, 14, 212, 69, 50, 44];
      accounts: [
        {
          name: 'tokenAuthority';
          signer: true;
        },
        {
          name: 'unwrapAuthority';
          signer: true;
          optional: true;
        },
        {
          name: 'mMint';
          relations: ['globalAccount'];
        },
        {
          name: 'extMint';
          writable: true;
          relations: ['globalAccount'];
        },
        {
          name: 'globalAccount';
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [103, 108, 111, 98, 97, 108];
              },
            ];
          };
        },
        {
          name: 'mVault';
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [109, 95, 118, 97, 117, 108, 116];
              },
            ];
          };
        },
        {
          name: 'extMintAuthority';
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [109, 105, 110, 116, 95, 97, 117, 116, 104, 111, 114, 105, 116, 121];
              },
            ];
          };
        },
        {
          name: 'toMTokenAccount';
          writable: true;
        },
        {
          name: 'vaultMTokenAccount';
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'account';
                path: 'mVault';
              },
              {
                kind: 'account';
                path: 'mTokenProgram';
              },
              {
                kind: 'account';
                path: 'mMint';
              },
            ];
            program: {
              kind: 'const';
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89,
              ];
            };
          };
        },
        {
          name: 'fromExtTokenAccount';
          writable: true;
        },
        {
          name: 'mTokenProgram';
          address: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
        },
        {
          name: 'extTokenProgram';
        },
      ];
      args: [
        {
          name: 'amount';
          type: 'u64';
        },
      ];
    },
    {
      name: 'wrap';
      discriminator: [178, 40, 10, 189, 228, 129, 186, 140];
      accounts: [
        {
          name: 'tokenAuthority';
          signer: true;
        },
        {
          name: 'wrapAuthority';
          signer: true;
          optional: true;
        },
        {
          name: 'mMint';
          relations: ['globalAccount'];
        },
        {
          name: 'extMint';
          writable: true;
          relations: ['globalAccount'];
        },
        {
          name: 'globalAccount';
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [103, 108, 111, 98, 97, 108];
              },
            ];
          };
        },
        {
          name: 'mVault';
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [109, 95, 118, 97, 117, 108, 116];
              },
            ];
          };
        },
        {
          name: 'extMintAuthority';
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [109, 105, 110, 116, 95, 97, 117, 116, 104, 111, 114, 105, 116, 121];
              },
            ];
          };
        },
        {
          name: 'fromMTokenAccount';
          writable: true;
        },
        {
          name: 'vaultMTokenAccount';
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'account';
                path: 'mVault';
              },
              {
                kind: 'account';
                path: 'mTokenProgram';
              },
              {
                kind: 'account';
                path: 'mMint';
              },
            ];
            program: {
              kind: 'const';
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89,
              ];
            };
          };
        },
        {
          name: 'toExtTokenAccount';
          writable: true;
        },
        {
          name: 'mTokenProgram';
          address: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
        },
        {
          name: 'extTokenProgram';
        },
      ];
      args: [
        {
          name: 'amount';
          type: 'u64';
        },
      ];
    },
  ];
  accounts: [
    {
      name: 'earnGlobal';
      discriminator: [229, 50, 25, 132, 207, 93, 185, 23];
    },
    {
      name: 'earnManager';
      discriminator: [60, 115, 54, 201, 127, 74, 217, 18];
    },
    {
      name: 'earner';
      discriminator: [236, 126, 51, 96, 46, 225, 103, 207];
    },
    {
      name: 'extGlobalV2';
      discriminator: [116, 209, 219, 83, 70, 143, 55, 127];
    },
  ];
  events: [
    {
      name: 'feesClaimed';
      discriminator: [22, 104, 110, 222, 38, 157, 14, 62];
    },
    {
      name: 'rewardsClaim';
      discriminator: [84, 168, 212, 108, 203, 10, 250, 107];
    },
    {
      name: 'syncIndexUpdate';
      discriminator: [170, 178, 107, 120, 158, 139, 32, 113];
    },
  ];
  errors: [
    {
      code: 6000;
      name: 'notAuthorized';
      msg: 'Invalid signer.';
    },
    {
      code: 6001;
      name: 'invalidParam';
      msg: 'Invalid parameter.';
    },
    {
      code: 6002;
      name: 'invalidAccount';
      msg: 'Account does not match the expected key.';
    },
    {
      code: 6003;
      name: 'active';
      msg: 'Account is currently active.';
    },
    {
      code: 6004;
      name: 'notActive';
      msg: 'Account is not currently active.';
    },
    {
      code: 6005;
      name: 'insufficientCollateral';
      msg: 'Not enough M.';
    },
    {
      code: 6006;
      name: 'invalidMint';
      msg: 'Invalid Mint.';
    },
    {
      code: 6007;
      name: 'mathOverflow';
      msg: 'Math overflow error.';
    },
    {
      code: 6008;
      name: 'mathUnderflow';
      msg: 'Math underflow error.';
    },
    {
      code: 6009;
      name: 'typeConversionError';
      msg: 'Type conversion error.';
    },
    {
      code: 6010;
      name: 'invalidInput';
      msg: 'Invalid value provided for calculation';
    },
    {
      code: 6011;
      name: 'invalidAmount';
      msg: 'Invalid amount';
    },
    {
      code: 6012;
      name: 'alreadyClaimed';
      msg: 'Already claimed for user.';
    },
    {
      code: 6013;
      name: 'serializationError';
      msg: 'Failed to serialize account data.';
    },
    {
      code: 6014;
      name: 'invalidTokenProgram';
      msg: 'Invalid token program provided.';
    },
  ];
  types: [
    {
      name: 'earnGlobal';
      type: {
        kind: 'struct';
        fields: [
          {
            name: 'admin';
            type: 'pubkey';
          },
          {
            name: 'mMint';
            type: 'pubkey';
          },
          {
            name: 'portalAuthority';
            type: 'pubkey';
          },
          {
            name: 'extSwapGlobalAccount';
            type: 'pubkey';
          },
          {
            name: 'earnerMerkleRoot';
            type: {
              array: ['u8', 32];
            };
          },
          {
            name: 'bump';
            type: 'u8';
          },
        ];
      };
    },
    {
      name: 'earnManager';
      type: {
        kind: 'struct';
        fields: [
          {
            name: 'earnManager';
            type: 'pubkey';
          },
          {
            name: 'isActive';
            type: 'bool';
          },
          {
            name: 'feeBps';
            type: 'u64';
          },
          {
            name: 'feeTokenAccount';
            type: 'pubkey';
          },
          {
            name: 'bump';
            type: 'u8';
          },
        ];
      };
    },
    {
      name: 'earner';
      type: {
        kind: 'struct';
        fields: [
          {
            name: 'lastClaimIndex';
            type: 'u64';
          },
          {
            name: 'lastClaimTimestamp';
            type: 'u64';
          },
          {
            name: 'bump';
            type: 'u8';
          },
          {
            name: 'user';
            type: 'pubkey';
          },
          {
            name: 'userTokenAccount';
            type: 'pubkey';
          },
          {
            name: 'earnManager';
            type: 'pubkey';
          },
          {
            name: 'recipientTokenAccount';
            type: {
              option: 'pubkey';
            };
          },
        ];
      };
    },
    {
      name: 'extGlobalV2';
      type: {
        kind: 'struct';
        fields: [
          {
            name: 'admin';
            type: 'pubkey';
          },
          {
            name: 'pendingAdmin';
            type: {
              option: 'pubkey';
            };
          },
          {
            name: 'extMint';
            type: 'pubkey';
          },
          {
            name: 'mMint';
            type: 'pubkey';
          },
          {
            name: 'mEarnGlobalAccount';
            type: 'pubkey';
          },
          {
            name: 'bump';
            type: 'u8';
          },
          {
            name: 'mVaultBump';
            type: 'u8';
          },
          {
            name: 'extMintAuthorityBump';
            type: 'u8';
          },
          {
            name: 'yieldConfig';
            type: {
              defined: {
                name: 'yieldConfig';
              };
            };
          },
          {
            name: 'wrapAuthorities';
            type: {
              vec: 'pubkey';
            };
          },
        ];
      };
    },
    {
      name: 'feesClaimed';
      type: {
        kind: 'struct';
        fields: [
          {
            name: 'recipientTokenAccount';
            type: 'pubkey';
          },
          {
            name: 'amount';
            type: 'u64';
          },
          {
            name: 'principal';
            type: 'u64';
          },
        ];
      };
    },
    {
      name: 'rewardsClaim';
      type: {
        kind: 'struct';
        fields: [
          {
            name: 'tokenAccount';
            type: 'pubkey';
          },
          {
            name: 'recipientTokenAccount';
            type: 'pubkey';
          },
          {
            name: 'amount';
            type: 'u64';
          },
          {
            name: 'ts';
            type: 'u64';
          },
          {
            name: 'index';
            type: 'u64';
          },
          {
            name: 'fee';
            type: 'u64';
          },
        ];
      };
    },
    {
      name: 'syncIndexUpdate';
      type: {
        kind: 'struct';
        fields: [
          {
            name: 'index';
            type: 'u64';
          },
          {
            name: 'ts';
            type: 'u64';
          },
        ];
      };
    },
    {
      name: 'yieldConfig';
      type: {
        kind: 'struct';
        fields: [
          {
            name: 'yieldVariant';
            type: {
              defined: {
                name: 'yieldVariant';
              };
            };
          },
          {
            name: 'earnAuthority';
            type: 'pubkey';
          },
          {
            name: 'index';
            type: 'u64';
          },
          {
            name: 'timestamp';
            type: 'u64';
          },
        ];
      };
    },
    {
      name: 'yieldVariant';
      repr: {
        kind: 'rust';
      };
      type: {
        kind: 'enum';
        variants: [
          {
            name: 'noYield';
          },
          {
            name: 'scaledUi';
          },
          {
            name: 'crank';
          },
        ];
      };
    },
  ];
  constants: [
    {
      name: 'earnerSeed';
      type: 'bytes';
      value: '[101, 97, 114, 110, 101, 114]';
    },
    {
      name: 'earnManagerSeed';
      type: 'bytes';
      value: '[101, 97, 114, 110, 95, 109, 97, 110, 97, 103, 101, 114]';
    },
    {
      name: 'extGlobalSeed';
      type: 'bytes';
      value: '[103, 108, 111, 98, 97, 108]';
    },
    {
      name: 'mintAuthoritySeed';
      type: 'bytes';
      value: '[109, 105, 110, 116, 95, 97, 117, 116, 104, 111, 114, 105, 116, 121]';
    },
    {
      name: 'mVaultSeed';
      type: 'bytes';
      value: '[109, 95, 118, 97, 117, 108, 116]';
    },
  ];
};
