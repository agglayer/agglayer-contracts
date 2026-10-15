# AggchainQBFT test vectors

Copied verbatim from [`agglayer/prover-besu-qbft`](https://github.com/agglayer/prover-besu-qbft) at commit
`6815011` (`feat(vectors): 5-node Besu QBFT devnet, header/tally/aggchain_params/bridge vectors and Python reference`),
directory `vectors/`. They are copied (not referenced) so the contract tests are self-contained. The same files are
consumed by the QBFT SP1 program tests, which is what pins the contract and the program to the same bytes.

| File | Used for |
| --- | --- |
| `aggchain_params/*.json` | `(prev, new, chain config) -> aggchain_params` and the 128 byte `aggchain_data` (INTERFACES section 3 and 4). `AggchainQBFT.getVKeyAndAggchainParams` must reproduce both byte for byte |
| `headers/000000-genesis.json` | Genesis validator set and `consensus_hash_after`, the consensus state hash registered at `initialize` |
| `tally/replay.json` | Validator set and outstanding votes after every header, with the expected `consensus_hash_after` (checks the `abi.encode(address[], Vote[])` encoding with non empty votes) |

Do not edit them by hand: re-copy from `prover-besu-qbft/vectors/` when they are regenerated and update the commit above.
