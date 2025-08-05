export type VaaResolver = {
  address: 'mzp1q2j5Hr1QuLC3KFBCAUz5aUckT6qyuZKZ3WJnMmY';
  metadata: {
    name: 'vaaResolver';
    description: 'Created with Anchor';
  };
  instructions: [
    {
      name: 'resolveExecuteVaaV1';
      docs: [
        'This instruction returns the instruction for execution based on a v1 VAA',
        '# Arguments',
        '',
        '* `ctx` - `ResolveExecuteVaaV1` context',
        '* `vaa_body` - Body of the VAA for execution',
      ];
      discriminator: [148, 184, 169, 222, 207, 8, 154, 127];
      accounts: [];
      args: [
        {
          name: 'vaaBody';
          type: 'bytes';
        },
      ];
      returns: {
        defined: {
          name: 'resolver';
          generics: [
            {
              kind: 'type';
              type: {
                defined: {
                  name: 'instructionGroups';
                };
              };
            },
          ];
        };
      };
    },
  ];
  accounts: [];
  errors: [];
  types: [
    {
      name: 'instructionGroup';
      type: {
        kind: 'struct';
        fields: [
          {
            name: 'instructions';
            type: {
              vec: {
                defined: {
                  name: 'serializableInstruction';
                };
              };
            };
          },
          {
            name: 'addressLookupTables';
            type: {
              vec: 'pubkey';
            };
          },
        ];
      };
    },
    {
      name: 'instructionGroups';
      type: {
        kind: 'struct';
        fields: [
          {
            vec: {
              defined: {
                name: 'instructionGroup';
              };
            };
          },
        ];
      };
    },
    {
      name: 'missingAccounts';
      type: {
        kind: 'struct';
        fields: [
          {
            name: 'accounts';
            type: {
              vec: 'pubkey';
            };
          },
          {
            name: 'addressLookupTables';
            type: {
              vec: 'pubkey';
            };
          },
        ];
      };
    },
    {
      name: 'resolver';
      generics: [
        {
          kind: 'type';
          name: 't';
        },
      ];
      type: {
        kind: 'enum';
        variants: [
          {
            name: 'resolved';
            fields: [
              {
                generic: 't';
              },
            ];
          },
          {
            name: 'missing';
            fields: [
              {
                defined: {
                  name: 'missingAccounts';
                };
              },
            ];
          },
          {
            name: 'account';
            fields: [];
          },
        ];
      };
    },
    {
      name: 'serializableAccountMeta';
      type: {
        kind: 'struct';
        fields: [
          {
            name: 'pubkey';
            type: 'pubkey';
          },
          {
            name: 'isSigner';
            type: 'bool';
          },
          {
            name: 'isWritable';
            type: 'bool';
          },
        ];
      };
    },
    {
      name: 'serializableInstruction';
      type: {
        kind: 'struct';
        fields: [
          {
            name: 'programId';
            type: 'pubkey';
          },
          {
            name: 'accounts';
            type: {
              vec: {
                defined: {
                  name: 'serializableAccountMeta';
                };
              };
            };
          },
          {
            name: 'data';
            type: 'bytes';
          },
        ];
      };
    },
  ];
};
