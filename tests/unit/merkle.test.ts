import { MerkleTree } from '@m0-foundation/solana-m-sdk/src/merkle';
import { PublicKey } from '@solana/web3.js';

describe('MerkleTree unit tests', () => {
  let tree: MerkleTree;

  describe('empty tree', () => {
    beforeAll(() => {
      tree = new MerkleTree([]);
    });

    describe('inclusion proof tests', () => {
      it('should throw an error for any key', () => {
        const key = PublicKey.unique();
        expect(() => tree.getInclusionProof(key)).toThrowError('Leaf not found in the tree');
      });
    });

    describe('exclusion proof tests', () => {
      it('should return an empty exclusion proof for any key', () => {
        const key = PublicKey.unique();
        const { proofs, neighbors } = tree.getExclusionProof(key);

        // There should only be one proof, which is the empty proof
        expect(proofs.length).toBe(1);
        expect(proofs[0]).toEqual([]);
        expect(neighbors.length).toBe(1);
        expect(neighbors[0]).toEqual(Array.from(PublicKey.default.toBytes()));
      });
    });
  });

  describe('single node tree', () => {
    let key: PublicKey;
    beforeAll(() => {
      key = PublicKey.unique();
      tree = new MerkleTree([key]);
    });

    describe('inclusion proof tests', () => {
      it('should an empty inclusion proof for the single member', () => {
        const { proof } = tree.getInclusionProof(key);

        // The proof should be empty since the single node is all that is required to calculate the root
        expect(proof).toEqual([]);

        // Verify the proof
        expect(tree.verifyInclusionProof(key, proof)).toBe(true);
      });

      it('should throw an error for any key not in the tree', () => {
        let otherKey = PublicKey.unique();
        while (otherKey.equals(key)) {
          otherKey = PublicKey.unique();
        }

        expect(() => tree.getInclusionProof(otherKey)).toThrowError('Leaf not found in the tree');
      });
    });

    describe('exclusion proof tests', () => {
      it('should throw an error for the single member', () => {
        expect(() => tree.getExclusionProof(key)).toThrowError('Leaf found in the tree');
      });

      it('should return a valid exclusion proof for any key not in the tree', () => {
        let otherKey = PublicKey.unique();
        while (otherKey.equals(key)) {
          otherKey = PublicKey.unique();
        }

        const { proofs, neighbors } = tree.getExclusionProof(otherKey);

        // There should be one proof and one neighbor since the tree has only one node
        expect(proofs.length).toBe(1);
        expect(proofs[0].length).toBe(0); // The proof should be empty
        expect(neighbors.length).toBe(1);
        expect(neighbors[0]).toEqual(Array.from(key.toBytes()));

        // Verify the exclusion proof
        expect(tree.verifyExclusionProof(otherKey, proofs, neighbors)).toBe(true);
      });
    });
  });

  describe('6 node tree (from bug case)', () => {
    let leaves: PublicKey[] = [
      new PublicKey('3jjzuwuYxzHRn39D26KWDtGQCWMc12uXK41jBB3njEqi'),
      new PublicKey('6gG7w73TvK4WTccs9N9wjYERSasczd9x68NgTDy2zBvQ'),
      new PublicKey('8vtsGdu4ErjK2skhV7FfPQwXdae6myWjgWJ8gRMnXi2K'),
      new PublicKey('93rkP7LJx47fn3AckRcvyiAZBCoSkpcTnCcTtQGGPCGJ'),
      new PublicKey('D76ySoHPwD8U2nnTTDqXeUJQg5UkD9UD1PUE1rnvPAGm'),
      new PublicKey('ERJHhMRf53swz5APhH3dXr26i3icH2rf6UhBAEmA19G8'),
    ];

    beforeAll(() => {
      tree = new MerkleTree(leaves);
    });

    describe('inclusion proof tests', () => {
      it('should return a valid inclusion proof for each leaf', () => {
        leaves.forEach((leaf) => {
          const { proof } = tree.getInclusionProof(leaf);
          let valid = tree.verifyInclusionProof(leaf, proof);
          if (!valid) {
            console.error(`Inclusion proof for ${leaf.toBase58()} is invalid`);
          }
          expect(valid).toBe(true);
        });
      });

      it('should throw an error for any key not in the tree', () => {
        let otherKey = PublicKey.unique();
        while (leaves.some((leaf) => leaf.equals(otherKey))) {
          otherKey = PublicKey.unique();
        }

        expect(() => tree.getInclusionProof(otherKey)).toThrowError('Leaf not found in the tree');
      });
    });

    describe('exclusion proof tests', () => {
      it('should throw an error for any key in the tree', () => {
        leaves.forEach((leaf) => {
          expect(() => tree.getExclusionProof(leaf)).toThrowError('Leaf found in the tree');
        });
      });

      it('should return a valid exclusion proof for any key not in the tree', () => {
        let otherKey = PublicKey.unique();
        while (leaves.some((leaf) => leaf.equals(otherKey))) {
          otherKey = PublicKey.unique();
        }

        const { proofs, neighbors } = tree.getExclusionProof(otherKey);
        // There will be either 1 or 2 proofs and neighbors depending on where the key is in relationship to the tree
        // The tree has 3 levels before the root so, the proofs should be 3 nodes long
        if (
          Buffer.compare(otherKey.toBuffer(), leaves[0].toBuffer()) < 0 ||
          Buffer.compare(otherKey.toBuffer(), leaves[leaves.length - 1].toBuffer()) > 0
        ) {
          expect(proofs.length).toBe(1);
          expect(proofs[0].length).toBe(3);
          expect(neighbors.length).toBe(1);
        } else {
          expect(proofs.length).toBe(2);
          expect(proofs[0].length).toBe(3);
          expect(proofs[1].length).toBe(3);
          expect(neighbors.length).toBe(2);
        }

        // Verify the exclusion proof
        let valid = tree.verifyExclusionProof(otherKey, proofs, neighbors);
        if (!valid) {
          console.error(`Exclusion proof for ${otherKey.toBase58()} is invalid`);
        }
        expect(valid).toBe(true);
      });
    });
  });

  describe('random trees up to 100 nodes', () => {
    for (let i = 2; i <= 100; i++) {
      let tree: MerkleTree; // re-declare so it's scoped within the loop
      let leaves: PublicKey[] = [];
      for (let j = 0; j < i; j++) {
        leaves.push(PublicKey.unique());
      }

      beforeAll(() => {
        tree = new MerkleTree(leaves);
      });

      describe(`inclusion proof tests for ${i} nodes`, () => {
        it('should return a valid inclusion proof for each leaf', () => {
          leaves.forEach((leaf, index) => {
            const { proof } = tree.getInclusionProof(leaf);
            let valid = tree.verifyInclusionProof(leaf, proof);
            if (!valid) {
              console.error(`Inclusion proof for leaf ${index} with tree size ${i} is invalid`);
              console.error(`Leaf: ${leaf.toBase58()}`);
              console.error(`Leaves: ${leaves.map((l) => l.toBase58())}`);
              console.error(`Proof: ${proof}`);
            }
            expect(valid).toBe(true);
          });
        });
        it('should throw an error for any key not in the tree', () => {
          let otherKey = PublicKey.unique();
          while (leaves.some((leaf) => leaf.equals(otherKey))) {
            otherKey = PublicKey.unique();
          }
          expect(() => tree.getInclusionProof(otherKey)).toThrowError('Leaf not found in the tree');
        });
      });

      describe(`exclusion proof tests for ${i} nodes`, () => {
        it('should throw an error for any key in the tree', () => {
          leaves.forEach((leaf) => {
            expect(() => tree.getExclusionProof(leaf)).toThrowError('Leaf found in the tree');
          });
        });

        it('should return a valid exclusion proof for any key not in the tree', () => {
          let otherKey = PublicKey.unique();
          while (leaves.some((leaf) => leaf.equals(otherKey))) {
            otherKey = PublicKey.unique();
          }
          const { proofs, neighbors } = tree.getExclusionProof(otherKey);
          // There will be either 1 or 2 proofs and neighbors depending on where the key is in relationship to the tree
          // The tree has log2(i) levels before the root so, the proofs should be log2(i) nodes long
          if (
            Buffer.compare(otherKey.toBuffer(), leaves[0].toBuffer()) < 0 ||
            Buffer.compare(otherKey.toBuffer(), leaves[leaves.length - 1].toBuffer()) > 0
          ) {
            expect(proofs.length).toBe(1);
            expect(proofs[0].length).toBe(Math.ceil(Math.log2(i)));
            expect(neighbors.length).toBe(1);
          } else {
            expect(proofs.length).toBe(2);
            expect(proofs[0].length).toBe(Math.ceil(Math.log2(i)));
            expect(proofs[1].length).toBe(Math.ceil(Math.log2(i)));
            expect(neighbors.length).toBe(2);
          }

          // Verify the exclusion proof
          let valid = tree.verifyExclusionProof(otherKey, proofs, neighbors);
          if (!valid) {
            console.error(`Exclusion proof for non-member in tree with size ${i} is invalid`);
            console.error(`Key: ${otherKey.toBase58()}`);
            console.error(`Leaves: ${leaves.map((leaf) => leaf.toBase58())}`);
            console.error(`Proofs: ${proofs}`);
            console.error(`Neighbors: ${neighbors}`);
          }
          expect(valid).toBe(true);
        });
      });
    }
  });
});
