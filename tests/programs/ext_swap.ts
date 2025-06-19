/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/ext_swap.json`.
 */
export type ExtSwap = {
  "address": "MSwapi3WhNKMUGm9YrxGhypgUEt7wYQH3ZgG32XoWzH",
  "metadata": {
    "name": "extSwap",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "initializeGlobal",
      "discriminator": [
        47,
        225,
        15,
        112,
        86,
        51,
        190,
        231
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "swapGlobal",
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
          "name": "mMint",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "removeWhitelistedExtension",
      "discriminator": [
        248,
        52,
        115,
        71,
        67,
        42,
        71,
        252
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "swapGlobal",
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
          "name": "extProgram",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "removeWhitelistedUnwrapper",
      "discriminator": [
        166,
        23,
        120,
        95,
        66,
        168,
        192,
        163
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "swapGlobal",
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
          "name": "authority",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "swap",
      "discriminator": [
        248,
        198,
        158,
        145,
        225,
        117,
        135,
        200
      ],
      "accounts": [
        {
          "name": "signer",
          "writable": true,
          "signer": true
        },
        {
          "name": "wrapAuthority",
          "signer": true,
          "optional": true
        },
        {
          "name": "unwrapAuthority",
          "signer": true,
          "optional": true
        },
        {
          "name": "swapGlobal",
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
          "name": "fromGlobal",
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
            ],
            "program": {
              "kind": "account",
              "path": "fromExtProgram"
            }
          }
        },
        {
          "name": "toGlobal",
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
            ],
            "program": {
              "kind": "account",
              "path": "toExtProgram"
            }
          }
        },
        {
          "name": "fromMEarner",
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
                "path": "fromMVault"
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
          "name": "toMEarner",
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
                "path": "toMVault"
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
          "name": "fromMint",
          "writable": true
        },
        {
          "name": "toMint",
          "writable": true
        },
        {
          "name": "mMint",
          "relations": [
            "swapGlobal"
          ]
        },
        {
          "name": "fromTokenAccount",
          "writable": true
        },
        {
          "name": "toTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "signer"
              },
              {
                "kind": "account",
                "path": "toTokenProgram"
              },
              {
                "kind": "account",
                "path": "toMint"
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
          "name": "intermediateMAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "signer"
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
          "name": "fromMVaultAuth",
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
            ],
            "program": {
              "kind": "account",
              "path": "fromExtProgram"
            }
          }
        },
        {
          "name": "toMVaultAuth",
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
            ],
            "program": {
              "kind": "account",
              "path": "toExtProgram"
            }
          }
        },
        {
          "name": "fromMintAuthority",
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
            ],
            "program": {
              "kind": "account",
              "path": "fromExtProgram"
            }
          }
        },
        {
          "name": "toMintAuthority",
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
            ],
            "program": {
              "kind": "account",
              "path": "toExtProgram"
            }
          }
        },
        {
          "name": "fromMVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "fromMVaultAuth"
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
          "name": "toMVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "toMVaultAuth"
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
          "name": "fromTokenProgram"
        },
        {
          "name": "toTokenProgram"
        },
        {
          "name": "mTokenProgram"
        },
        {
          "name": "fromExtProgram"
        },
        {
          "name": "toExtProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "remainingAccountsSplitIdx",
          "type": "u8"
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
          "name": "signer",
          "writable": true,
          "signer": true
        },
        {
          "name": "unwrapAuthority",
          "signer": true,
          "optional": true
        },
        {
          "name": "swapGlobal",
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
          "name": "fromGlobal",
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
            ],
            "program": {
              "kind": "account",
              "path": "fromExtProgram"
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
                "path": "fromMVault"
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
          "name": "fromMint",
          "writable": true
        },
        {
          "name": "mMint",
          "relations": [
            "swapGlobal"
          ]
        },
        {
          "name": "mTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "signer"
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
          "name": "fromTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "signer"
              },
              {
                "kind": "account",
                "path": "fromTokenProgram"
              },
              {
                "kind": "account",
                "path": "fromMint"
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
          "name": "fromMVaultAuth",
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
            ],
            "program": {
              "kind": "account",
              "path": "fromExtProgram"
            }
          }
        },
        {
          "name": "fromMintAuthority",
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
            ],
            "program": {
              "kind": "account",
              "path": "fromExtProgram"
            }
          }
        },
        {
          "name": "fromMVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "fromMVaultAuth"
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
          "name": "fromTokenProgram"
        },
        {
          "name": "mTokenProgram"
        },
        {
          "name": "fromExtProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
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
      "name": "whitelistExtension",
      "discriminator": [
        186,
        175,
        23,
        231,
        77,
        201,
        205,
        165
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "swapGlobal",
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
          "name": "extProgram",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "whitelistUnwrapper",
      "discriminator": [
        219,
        87,
        23,
        47,
        189,
        191,
        123,
        235
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "swapGlobal",
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
          "name": "authority",
          "type": "pubkey"
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
          "name": "signer",
          "writable": true,
          "signer": true
        },
        {
          "name": "wrapAuthority",
          "signer": true,
          "optional": true
        },
        {
          "name": "swapGlobal",
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
          "name": "toGlobal",
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
            ],
            "program": {
              "kind": "account",
              "path": "toExtProgram"
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
                "path": "toMVault"
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
          "name": "toMint",
          "writable": true
        },
        {
          "name": "mMint",
          "relations": [
            "swapGlobal"
          ]
        },
        {
          "name": "mTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "signer"
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
          "name": "toTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "signer"
              },
              {
                "kind": "account",
                "path": "toTokenProgram"
              },
              {
                "kind": "account",
                "path": "toMint"
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
          "name": "toMVaultAuth",
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
            ],
            "program": {
              "kind": "account",
              "path": "toExtProgram"
            }
          }
        },
        {
          "name": "toMintAuthority",
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
            ],
            "program": {
              "kind": "account",
              "path": "toExtProgram"
            }
          }
        },
        {
          "name": "toMVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "toMVaultAuth"
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
          "name": "toTokenProgram"
        },
        {
          "name": "mTokenProgram"
        },
        {
          "name": "toExtProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
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
      "name": "swapGlobal",
      "discriminator": [
        15,
        184,
        147,
        129,
        183,
        219,
        223,
        163
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidExtension",
      "msg": "Extension is not whitelisted"
    },
    {
      "code": 6001,
      "name": "alreadyWhitelisted",
      "msg": "Extension is already whitelisted"
    },
    {
      "code": 6002,
      "name": "invalidIndex",
      "msg": "Index invalid for length of the array"
    },
    {
      "code": 6003,
      "name": "unauthorizedUnwrapper",
      "msg": "Signer is not whitelisted"
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
      "name": "swapGlobal",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "mMint",
            "type": "pubkey"
          },
          {
            "name": "whitelistedUnwrappers",
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "whitelistedExtensions",
            "type": {
              "vec": "pubkey"
            }
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "globalSeed",
      "type": "bytes",
      "value": "[103, 108, 111, 98, 97, 108]"
    }
  ]
};
