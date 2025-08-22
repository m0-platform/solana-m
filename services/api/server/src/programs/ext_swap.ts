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
      "args": []
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
          "signer": true,
          "relations": [
            "swapGlobal"
          ]
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
          "signer": true,
          "relations": [
            "swapGlobal"
          ]
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
          "name": "mGlobal",
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
          "name": "fromMint",
          "docs": [
            "Validated by unwrap on the extension program"
          ],
          "writable": true
        },
        {
          "name": "toMint",
          "docs": [
            "Validated by wrap on the extension program"
          ],
          "writable": true
        },
        {
          "name": "mMint"
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
          "name": "fromMEarnerAccount"
        },
        {
          "name": "toMEarnerAccount"
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
          "name": "mGlobal",
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
          "name": "fromMint",
          "docs": [
            "Validated by unwrap on the extension program"
          ],
          "writable": true
        },
        {
          "name": "mMint"
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
          "name": "fromMEarnerAccount"
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
          "signer": true,
          "relations": [
            "swapGlobal"
          ]
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
        },
        {
          "name": "extProgram"
        }
      ],
      "args": []
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
          "signer": true,
          "relations": [
            "swapGlobal"
          ]
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
          "name": "mGlobal",
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
          "name": "toMint",
          "docs": [
            "Validated by wrap on the extension program"
          ],
          "writable": true
        },
        {
          "name": "mMint"
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
          "name": "toMEarnerAccount"
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
    },
    {
      "code": 6004,
      "name": "notAuthorized",
      "msg": "Signer is not authorized to perform this action"
    },
    {
      "code": 6005,
      "name": "invalidAmount",
      "msg": "Invalid amount"
    }
  ],
  "types": [
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
