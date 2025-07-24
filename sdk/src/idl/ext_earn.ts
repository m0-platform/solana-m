/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/ext_earn.json`.
 */
export type ExtEarn = {
  "address": "wMXX1K1nca5W4pZr1piETe78gcAVVrEFi9f4g46uXko",
  "metadata": {
    "name": "extEarn",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "addEarnManager",
      "discriminator": [
        237,
        29,
        254,
        71,
        117,
        177,
        159,
        25
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
          "name": "earnManagerAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  97,
                  114,
                  110,
                  95,
                  109,
                  97,
                  110,
                  97,
                  103,
                  101,
                  114
                ]
              },
              {
                "kind": "arg",
                "path": "earnManager"
              }
            ]
          }
        },
        {
          "name": "feeTokenAccount"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "earnManager",
          "type": "pubkey"
        },
        {
          "name": "feeBps",
          "type": "u64"
        }
      ]
    },
    {
      "name": "addEarner",
      "discriminator": [
        191,
        90,
        193,
        126,
        226,
        158,
        64,
        168
      ],
      "accounts": [
        {
          "name": "signer",
          "writable": true,
          "signer": true
        },
        {
          "name": "earnManagerAccount",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  97,
                  114,
                  110,
                  95,
                  109,
                  97,
                  110,
                  97,
                  103,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "signer"
              }
            ]
          }
        },
        {
          "name": "globalAccount",
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
          "name": "userTokenAccount"
        },
        {
          "name": "earnerAccount",
          "writable": true,
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
                "path": "userTokenAccount"
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
          "name": "user",
          "type": "pubkey"
        }
      ]
    },
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
      "name": "claimFor",
      "discriminator": [
        245,
        67,
        97,
        44,
        59,
        223,
        144,
        1
      ],
      "accounts": [
        {
          "name": "earnAuthority",
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
          "name": "mVaultAccount",
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
                "path": "mVaultAccount"
              },
              {
                "kind": "account",
                "path": "token2022"
              },
              {
                "kind": "account",
                "path": "global_account.m_mint",
                "account": "extGlobal"
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
          "name": "userTokenAccount",
          "writable": true
        },
        {
          "name": "earnerAccount",
          "writable": true,
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
                "path": "earner_account.user_token_account",
                "account": "earner"
              }
            ]
          }
        },
        {
          "name": "earnManagerAccount",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  97,
                  114,
                  110,
                  95,
                  109,
                  97,
                  110,
                  97,
                  103,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "earner_account.earn_manager",
                "account": "earner"
              }
            ]
          }
        },
        {
          "name": "earnManagerTokenAccount",
          "docs": [
            "if the token account has been closed or is not initialized",
            "This prevents DoSing earner yield by closing this account"
          ],
          "writable": true
        },
        {
          "name": "token2022",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        }
      ],
      "args": [
        {
          "name": "snapshotBalance",
          "type": "u64"
        }
      ]
    },
    {
      "name": "configureEarnManager",
      "discriminator": [
        116,
        96,
        19,
        92,
        147,
        244,
        108,
        216
      ],
      "accounts": [
        {
          "name": "signer",
          "writable": true,
          "signer": true
        },
        {
          "name": "globalAccount",
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
          "name": "earnManagerAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  97,
                  114,
                  110,
                  95,
                  109,
                  97,
                  110,
                  97,
                  103,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "signer"
              }
            ]
          }
        },
        {
          "name": "feeTokenAccount",
          "optional": true
        }
      ],
      "args": [
        {
          "name": "feeBps",
          "type": {
            "option": "u64"
          }
        }
      ]
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
          "name": "extMint"
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
          "name": "token2022",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "earnAuthority",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "removeEarnManager",
      "discriminator": [
        121,
        207,
        141,
        182,
        239,
        154,
        85,
        152
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
          "name": "earnManagerAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  97,
                  114,
                  110,
                  95,
                  109,
                  97,
                  110,
                  97,
                  103,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "earn_manager_account.earn_manager",
                "account": "earnManager"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "removeEarner",
      "discriminator": [
        195,
        235,
        44,
        204,
        195,
        134,
        98,
        113
      ],
      "accounts": [
        {
          "name": "signer",
          "writable": true,
          "signer": true
        },
        {
          "name": "earnerAccount",
          "writable": true,
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
                "path": "earner_account.user_token_account",
                "account": "earner"
              }
            ]
          }
        },
        {
          "name": "earnManagerAccount",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  97,
                  114,
                  110,
                  95,
                  109,
                  97,
                  110,
                  97,
                  103,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "signer"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "removeOrphanedEarner",
      "discriminator": [
        39,
        184,
        151,
        237,
        10,
        244,
        132,
        6
      ],
      "accounts": [
        {
          "name": "signer",
          "writable": true,
          "signer": true
        },
        {
          "name": "globalAccount",
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
          "name": "earnerAccount",
          "writable": true,
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
                "path": "earner_account.user_token_account",
                "account": "earner"
              }
            ]
          }
        },
        {
          "name": "earnManagerAccount",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  97,
                  114,
                  110,
                  95,
                  109,
                  97,
                  110,
                  97,
                  103,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "earner_account.earn_manager",
                "account": "earner"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
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
      "name": "setEarnAuthority",
      "discriminator": [
        241,
        163,
        124,
        135,
        107,
        230,
        22,
        157
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
        }
      ],
      "args": [
        {
          "name": "newEarnAuthority",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "setMMint",
      "discriminator": [
        235,
        27,
        65,
        160,
        39,
        11,
        1,
        2
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
          "name": "mMint",
          "relations": [
            "globalAccount"
          ]
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
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  238,
                  117,
                  143,
                  222,
                  24,
                  66,
                  93,
                  188,
                  228,
                  108,
                  205,
                  218,
                  182,
                  26,
                  252,
                  77,
                  131,
                  185,
                  13,
                  39,
                  254,
                  189,
                  249,
                  40,
                  216,
                  161,
                  139,
                  252
                ]
              },
              {
                "kind": "account",
                "path": "global_account.m_mint",
                "account": "extGlobal"
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
          "name": "newMMint"
        },
        {
          "name": "newVaultMTokenAccount",
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "mVault"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  238,
                  117,
                  143,
                  222,
                  24,
                  66,
                  93,
                  188,
                  228,
                  108,
                  205,
                  218,
                  182,
                  26,
                  252,
                  77,
                  131,
                  185,
                  13,
                  39,
                  254,
                  189,
                  249,
                  40,
                  216,
                  161,
                  139,
                  252
                ]
              },
              {
                "kind": "account",
                "path": "newMMint"
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
        }
      ],
      "args": []
    },
    {
      "name": "setRecipient",
      "discriminator": [
        133,
        1,
        115,
        69,
        206,
        190,
        17,
        18
      ],
      "accounts": [
        {
          "name": "signer",
          "signer": true
        },
        {
          "name": "globalAccount",
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
          "name": "earnerAccount",
          "writable": true,
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
                "path": "earner_account.user_token_account",
                "account": "earner"
              }
            ]
          }
        },
        {
          "name": "recipientTokenAccount",
          "optional": true
        }
      ],
      "args": []
    },
    {
      "name": "sync",
      "discriminator": [
        4,
        219,
        40,
        164,
        21,
        157,
        189,
        88
      ],
      "accounts": [
        {
          "name": "earnAuthority",
          "signer": true,
          "relations": [
            "globalAccount"
          ]
        },
        {
          "name": "mEarnGlobalAccount",
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
        }
      ],
      "args": []
    },
    {
      "name": "transferEarner",
      "discriminator": [
        100,
        120,
        80,
        44,
        163,
        34,
        79,
        91
      ],
      "accounts": [
        {
          "name": "signer",
          "signer": true
        },
        {
          "name": "earnerAccount",
          "writable": true,
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
                "path": "earner_account.user_token_account",
                "account": "earner"
              }
            ]
          }
        },
        {
          "name": "fromEarnManagerAccount",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  97,
                  114,
                  110,
                  95,
                  109,
                  97,
                  110,
                  97,
                  103,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "signer"
              }
            ]
          }
        },
        {
          "name": "toEarnManagerAccount",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  97,
                  114,
                  110,
                  95,
                  109,
                  97,
                  110,
                  97,
                  103,
                  101,
                  114
                ]
              },
              {
                "kind": "arg",
                "path": "toEarnManager"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "toEarnManager",
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
          "name": "programAuthority",
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
          "name": "mEarnerAccount",
          "optional": true
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
                "path": "token2022"
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
          "name": "token2022",
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
          "name": "programAuthority",
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
          "name": "mEarnerAccount",
          "optional": true
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
                "path": "token2022"
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
          "name": "token2022",
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
      "name": "earnManager",
      "discriminator": [
        60,
        115,
        54,
        201,
        127,
        74,
        217,
        18
      ]
    },
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
      "name": "syncIndexUpdate",
      "discriminator": [
        170,
        178,
        107,
        120,
        158,
        139,
        32,
        113
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "alreadyClaimed",
      "msg": "Already claimed for user."
    },
    {
      "code": 6001,
      "name": "notAuthorized",
      "msg": "Invalid signer."
    },
    {
      "code": 6002,
      "name": "invalidParam",
      "msg": "Invalid parameter."
    },
    {
      "code": 6003,
      "name": "invalidAccount",
      "msg": "Account does not match the expected key."
    },
    {
      "code": 6004,
      "name": "active",
      "msg": "Account is currently active."
    },
    {
      "code": 6005,
      "name": "notActive",
      "msg": "Account is not currently active."
    },
    {
      "code": 6006,
      "name": "mutableOwner",
      "msg": "Token account owner is required to be immutable."
    },
    {
      "code": 6007,
      "name": "insufficientCollateral",
      "msg": "Not enough M."
    },
    {
      "code": 6008,
      "name": "invalidMint",
      "msg": "Invalid Mint."
    }
  ],
  "types": [
    {
      "name": "earnManager",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "earnManager",
            "type": "pubkey"
          },
          {
            "name": "isActive",
            "type": "bool"
          },
          {
            "name": "feeBps",
            "type": "u64"
          },
          {
            "name": "feeTokenAccount",
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
          },
          {
            "name": "earnManager",
            "type": "pubkey"
          },
          {
            "name": "recipientTokenAccount",
            "type": {
              "option": "pubkey"
            }
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
            "name": "earnAuthority",
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
            "name": "index",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "u64"
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
            "name": "wrapAuthorities",
            "type": {
              "vec": "pubkey"
            }
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
      "name": "syncIndexUpdate",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "index",
            "type": "u64"
          },
          {
            "name": "ts",
            "type": "u64"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "earnerSeed",
      "type": "bytes",
      "value": "[101, 97, 114, 110, 101, 114]"
    },
    {
      "name": "earnManagerSeed",
      "type": "bytes",
      "value": "[101, 97, 114, 110, 95, 109, 97, 110, 97, 103, 101, 114]"
    },
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
