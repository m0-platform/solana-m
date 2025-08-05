/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/m_ext.json`.
 */
export type MExt = {
  "address": "3C865D264L4NkAm78zfnDzQJJvXuU3fMjRUvRxyPi5da",
  "metadata": {
    "name": "mExt",
    "version": "0.2.0",
    "spec": "0.1.0",
    "description": "M extension program with various yield distribution options chosen at compile time"
  },
  "instructions": [
    {
      "name": "addWrapAuthority",
      "discriminator": [
        234,
        104,
        99,
        10,
        191,
        202,
        68,
        43
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "globalAccount"
          ]
        },
        {
          "name": "globalAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "newWrapAuthority",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "claimFees",
      "discriminator": [
        82,
        251,
        233,
        156,
        12,
        52,
        184,
        202
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "globalAccount"
          ]
        },
        {
          "name": "globalAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "mMint",
          "relations": [
            "globalAccount"
          ]
        },
        {
          "name": "extMint",
          "writable": true,
          "relations": [
            "globalAccount"
          ]
        },
        {
          "name": "extMintAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "mVault",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "vaultMTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "mVault"
              },
              {
                "kind": "account",
                "path": "mTokenProgram"
              },
              {
                "kind": "account",
                "path": "mMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
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
                89
              ]
            }
          }
        },
        {
          "name": "recipientExtTokenAccount",
          "docs": [
            "so the authority of this token account is not checked"
          ],
          "writable": true
        },
        {
          "name": "mTokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "extTokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "initialize",
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "globalAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "mMint"
        },
        {
          "name": "extMint",
          "writable": true
        },
        {
          "name": "extMintAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "mVault",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "vaultMTokenAccount",
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "mVault"
              },
              {
                "kind": "account",
                "path": "mTokenProgram"
              },
              {
                "kind": "account",
                "path": "mMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
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
                89
              ]
            }
          }
        },
        {
          "name": "mEarnGlobalAccount",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ],
            "program": {
              "kind": "const",
              "value": [
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
                208
              ]
            }
          }
        },
        {
          "name": "mTokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "extTokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "wrapAuthorities",
          "type": {
            "vec": "pubkey"
          }
        }
      ]
    },
    {
      "name": "removeWrapAuthority",
      "discriminator": [
        218,
        60,
        185,
        181,
        112,
        63,
        60,
        152
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "globalAccount"
          ]
        },
        {
          "name": "globalAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "wrapAuthority",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "unwrap",
      "discriminator": [
        126,
        175,
        198,
        14,
        212,
        69,
        50,
        44
      ],
      "accounts": [
        {
          "name": "tokenAuthority",
          "signer": true
        },
        {
          "name": "unwrapAuthority",
          "signer": true,
          "optional": true
        },
        {
          "name": "mMint",
          "relations": [
            "globalAccount"
          ]
        },
        {
          "name": "extMint",
          "writable": true,
          "relations": [
            "globalAccount"
          ]
        },
        {
          "name": "globalAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "mVault",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "extMintAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "toMTokenAccount",
          "writable": true
        },
        {
          "name": "vaultMTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "mVault"
              },
              {
                "kind": "account",
                "path": "mTokenProgram"
              },
              {
                "kind": "account",
                "path": "mMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
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
                89
              ]
            }
          }
        },
        {
          "name": "fromExtTokenAccount",
          "writable": true
        },
        {
          "name": "mTokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "extTokenProgram"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "wrap",
      "discriminator": [
        178,
        40,
        10,
        189,
        228,
        129,
        186,
        140
      ],
      "accounts": [
        {
          "name": "tokenAuthority",
          "signer": true
        },
        {
          "name": "wrapAuthority",
          "signer": true,
          "optional": true
        },
        {
          "name": "mMint",
          "relations": [
            "globalAccount"
          ]
        },
        {
          "name": "extMint",
          "writable": true,
          "relations": [
            "globalAccount"
          ]
        },
        {
          "name": "globalAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "mVault",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "extMintAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "fromMTokenAccount",
          "writable": true
        },
        {
          "name": "vaultMTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "mVault"
              },
              {
                "kind": "account",
                "path": "mTokenProgram"
              },
              {
                "kind": "account",
                "path": "mMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
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
                89
              ]
            }
          }
        },
        {
          "name": "toExtTokenAccount",
          "writable": true
        },
        {
          "name": "mTokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "extTokenProgram"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "earnGlobal",
      "discriminator": [
        229,
        50,
        25,
        132,
        207,
        93,
        185,
        23
      ]
    },
    {
      "name": "extGlobalV2",
      "discriminator": [
        116,
        209,
        219,
        83,
        70,
        143,
        55,
        127
      ]
    }
  ],
  "events": [
    {
      "name": "feesClaimed",
      "discriminator": [
        22,
        104,
        110,
        222,
        38,
        157,
        14,
        62
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "notAuthorized",
      "msg": "Invalid signer."
    },
    {
      "code": 6001,
      "name": "invalidParam",
      "msg": "Invalid parameter."
    },
    {
      "code": 6002,
      "name": "invalidAccount",
      "msg": "Account does not match the expected key."
    },
    {
      "code": 6003,
      "name": "active",
      "msg": "Account is currently active."
    },
    {
      "code": 6004,
      "name": "notActive",
      "msg": "Account is not currently active."
    },
    {
      "code": 6005,
      "name": "insufficientCollateral",
      "msg": "Not enough M."
    },
    {
      "code": 6006,
      "name": "invalidMint",
      "msg": "Invalid Mint."
    },
    {
      "code": 6007,
      "name": "mathOverflow",
      "msg": "Math overflow error."
    },
    {
      "code": 6008,
      "name": "mathUnderflow",
      "msg": "Math underflow error."
    },
    {
      "code": 6009,
      "name": "typeConversionError",
      "msg": "Type conversion error."
    },
    {
      "code": 6010,
      "name": "invalidInput",
      "msg": "Invalid value provided for calculation"
    },
    {
      "code": 6011,
      "name": "invalidAmount",
      "msg": "Invalid amount"
    },
    {
      "code": 6012,
      "name": "alreadyClaimed",
      "msg": "Already claimed for user."
    },
    {
      "code": 6013,
      "name": "serializationError",
      "msg": "Failed to serialize account data."
    },
    {
      "code": 6014,
      "name": "invalidTokenProgram",
      "msg": "Invalid token program provided."
    }
  ],
  "types": [
    {
      "name": "earnGlobal",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "mMint",
            "type": "pubkey"
          },
          {
            "name": "portalAuthority",
            "type": "pubkey"
          },
          {
            "name": "extSwapGlobalAccount",
            "type": "pubkey"
          },
          {
            "name": "earnerMerkleRoot",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "extGlobalV2",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "extMint",
            "type": "pubkey"
          },
          {
            "name": "mMint",
            "type": "pubkey"
          },
          {
            "name": "mEarnGlobalAccount",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "mVaultBump",
            "type": "u8"
          },
          {
            "name": "extMintAuthorityBump",
            "type": "u8"
          },
          {
            "name": "yieldConfig",
            "type": {
              "defined": {
                "name": "yieldConfig"
              }
            }
          },
          {
            "name": "wrapAuthorities",
            "type": {
              "vec": "pubkey"
            }
          }
        ]
      }
    },
    {
      "name": "feesClaimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "recipientTokenAccount",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "principal",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "yieldConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "yieldVariant",
            "type": {
              "defined": {
                "name": "yieldVariant"
              }
            }
          }
        ]
      }
    },
    {
      "name": "yieldVariant",
      "repr": {
        "kind": "rust"
      },
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "noYield"
          },
          {
            "name": "scaledUi"
          },
          {
            "name": "crank"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "extGlobalSeed",
      "type": "bytes",
      "value": "[103, 108, 111, 98, 97, 108]"
    },
    {
      "name": "mintAuthoritySeed",
      "type": "bytes",
      "value": "[109, 105, 110, 116, 95, 97, 117, 116, 104, 111, 114, 105, 116, 121]"
    },
    {
      "name": "mVaultSeed",
      "type": "bytes",
      "value": "[109, 95, 118, 97, 117, 108, 116]"
    }
  ]
};
