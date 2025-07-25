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
    "version": "0.1.0",
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
                5,
                96,
                203,
                194,
                112,
                168,
                176,
                78,
                85,
                26,
                180,
                224,
                26,
                229,
                153,
                66,
                23,
                208,
                230,
                56,
                28,
                164,
                98,
                240,
                154,
                37,
                49,
                118,
                130,
                244,
                142,
                245
              ]
            }
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
          "name": "extTokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
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
                5,
                96,
                203,
                194,
                112,
                168,
                176,
                78,
                85,
                26,
                180,
                224,
                26,
                229,
                153,
                66,
                23,
                208,
                230,
                56,
                28,
                164,
                98,
                240,
                154,
                37,
                49,
                118,
                130,
                244,
                142,
                245
              ]
            }
          }
        },
        {
          "name": "mEarnerAccount",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  97,
                  114,
                  110,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "vaultMTokenAccount"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                5,
                96,
                203,
                194,
                112,
                168,
                176,
                78,
                85,
                26,
                180,
                224,
                26,
                229,
                153,
                66,
                23,
                208,
                230,
                56,
                28,
                164,
                98,
                240,
                154,
                37,
                49,
                118,
                130,
                244,
                142,
                245
              ]
            }
          }
        },
        {
          "name": "mTokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "extTokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
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
                5,
                96,
                203,
                194,
                112,
                168,
                176,
                78,
                85,
                26,
                180,
                224,
                26,
                229,
                153,
                66,
                23,
                208,
                230,
                56,
                28,
                164,
                98,
                240,
                154,
                37,
                49,
                118,
                130,
                244,
                142,
                245
              ]
            }
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
          "name": "extTokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
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
                5,
                96,
                203,
                194,
                112,
                168,
                176,
                78,
                85,
                26,
                180,
                224,
                26,
                229,
                153,
                66,
                23,
                208,
                230,
                56,
                28,
                164,
                98,
                240,
                154,
                37,
                49,
                118,
                130,
                244,
                142,
                245
              ]
            }
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
          "name": "extTokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
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
      "name": "earner",
      "discriminator": [
        236,
        126,
        51,
        96,
        46,
        225,
        103,
        207
      ]
    },
    {
      "name": "extGlobal",
      "discriminator": [
        157,
        61,
        26,
        72,
        16,
        241,
        83,
        140
      ]
    },
    {
      "name": "global",
      "discriminator": [
        167,
        232,
        232,
        177,
        200,
        108,
        114,
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
    }
  ],
  "types": [
    {
      "name": "earner",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "lastClaimIndex",
            "type": "u64"
          },
          {
            "name": "lastClaimTimestamp",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "userTokenAccount",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "extGlobal",
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
      "name": "global",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "earnAuthority",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "index",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "u64"
          },
          {
            "name": "claimCooldown",
            "type": "u64"
          },
          {
            "name": "maxSupply",
            "type": "u64"
          },
          {
            "name": "maxYield",
            "type": "u64"
          },
          {
            "name": "distributed",
            "type": "u64"
          },
          {
            "name": "claimComplete",
            "type": "bool"
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
            "name": "portalAuthority",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "yieldConfig",
      "type": {
        "kind": "struct",
        "fields": []
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
