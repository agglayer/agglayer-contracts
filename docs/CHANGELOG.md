
## [v12.1.2] - 2025-10-14

### 🚨 Breaking Changes
- New tooling package (v12.1.2)
- Rename & Reorg: contracts/v2/PolygonRollupManager.sol -> contracts/AgglayerManager.sol: v1.0.0
- Rename & Reorg: contracts/v2/PolygonZkEVMBridgeV2.sol -> contracts/AgglayerBridge.sol: v1.1.0
- Rename & Reorg: contracts/v2/PolygonZkEVMGlobalExitRootV2.sol -> contracts/AgglayerGER.sol: v1.0.0
- Reorg: contracts/v2/AggLayerGateway.sol -> contracts/AggLayerGateway.sol: v1.1.0
- Rename & Reorg: contracts/v2/sovereignChains/BridgeL2SovereignChain.sol -> contracts/sovereignChains/AgglayerBridgeL2.sol: v1.1.0
- Rename & Reorg: contracts/v2/sovereignChains/GlobalExitRootManagerL2SovereignChain.sol -> contracts/sovereignChains/AgglayerGERL2.sol: v1.0.0
- Reorg: contracts/v2/sovereignChains/AggOracleCommittee.sol -> contracts/sovereignChains/AggOracleCommittee.sol: v1.0.0

### ✨ New Features
- ➕ New! contracts/aggchains/AggchainECDSAMultisig.sol: v1.0.0
- ➕ New! contracts/aggchains/AggchainFEP.sol: v3.0.0 // Op L2OO Semantic version
- ➕ New! contracts/sovereignChains/AggOracleCommittee.sol: v1.0.0

### 📜 Changelog (PRs)
[PR #546](https://github.com/agglayer/agglayer-contracts/pull/546) - fix sovereign genesis tool
[PR #543](https://github.com/agglayer/agglayer-contracts/pull/543) - Feature/fix upgrade v12
[PR #544](https://github.com/agglayer/agglayer-contracts/pull/544) - Feature/full upgrade v12
[PR #527](https://github.com/agglayer/agglayer-contracts/pull/527) - Feature/udpate tools
[PR #542](https://github.com/agglayer/agglayer-contracts/pull/542) - renaming timelock
[PR #537](https://github.com/agglayer/agglayer-contracts/pull/537) - Feature/audit remediations
[PR #538](https://github.com/agglayer/agglayer-contracts/pull/538) - several remediations
[PR #534](https://github.com/agglayer/agglayer-contracts/pull/534) - Feature/fix migration
[PR #536](https://github.com/agglayer/agglayer-contracts/pull/536) - fix genesis bridgeLib + inconsistencies
[PR #526](https://github.com/agglayer/agglayer-contracts/pull/526) - reorg v2 -> contracts
[PR #525](https://github.com/agglayer/agglayer-contracts/pull/525) - Feature/renaming agglayer
[PR #532](https://github.com/agglayer/agglayer-contracts/pull/532) - allow aggchainECDSAMultig with isVanillaClient = false. Add batchData…
[PR #529](https://github.com/agglayer/agglayer-contracts/pull/529) - all global owners
[PR #524](https://github.com/agglayer/agglayer-contracts/pull/524) - Feature/initialize tool refactor
[PR #528](https://github.com/agglayer/agglayer-contracts/pull/528) - Internal audit + initializaiton fixes
[PR #522](https://github.com/agglayer/agglayer-contracts/pull/522) - feat: Finished upgrade contracts to v12 script
[PR #504](https://github.com/agglayer/agglayer-contracts/pull/504) - [v0.3.5 phase III]:newConsensusType-outpostsL2
[PR #520](https://github.com/agglayer/agglayer-contracts/pull/520) - small docs fixes
[PR #519](https://github.com/agglayer/agglayer-contracts/pull/519) - Fix found informationals
[PR #517](https://github.com/agglayer/agglayer-contracts/pull/517) - internal audit fixes and PR comments
[PR #518](https://github.com/agglayer/agglayer-contracts/pull/518) - trigger tests on feature/outposts branch
[PR #516](https://github.com/agglayer/agglayer-contracts/pull/516) - update changelog
[PR #507](https://github.com/agglayer/agglayer-contracts/pull/507) - add critical tooling tag check
[PR #515](https://github.com/agglayer/agglayer-contracts/pull/515) - Rebase multisig PR with outposts current work
[PR #511](https://github.com/agglayer/agglayer-contracts/pull/511) - Audit remediations
[PR #506](https://github.com/agglayer/agglayer-contracts/pull/506) - L2OO v3
[PR #509](https://github.com/agglayer/agglayer-contracts/pull/509) - Add IVersion interface
[PR #499](https://github.com/agglayer/agglayer-contracts/pull/499) - agg oracle comittee
[PR #502](https://github.com/agglayer/agglayer-contracts/pull/502) - update versions


---

> This CHANGELOG is a bit different; we are only adding the versions for the first time.
> In the Breaking Changes section, we’ve listed the versions that have been changed.
> In the New Features section, we’ve listed the versions that didn’t exist before.

## [v11.0.0-rc.3] - 2025-07-24

### 🚨 Breaking Changes
- contracts/v2/PolygonRollupManager.sol: al-v0.3.1
- contracts/v2/PolygonZkEVMBridgeV2.sol: al-v0.3.1
- contracts/v2/PolygonZkEVMGlobalExitRootV2.sol: al-v0.3.0
- contracts/v2/sovereignChains/GlobalExitRootManagerL2SovereignChain.sol: al-v0.3.0
- contracts/v2/sovereignChains/BridgeL2SovereignChain.sol: v10.1.2

### 📝 Updates / 🐛 Bugfixes
- New tooling package (v11.0.0)

### 📜 Changelog (PRs)
[PR #478](https://github.com/agglayer/agglayer-contracts/pull/478) - Feature/zk evm to pp
[PR #500](https://github.com/agglayer/agglayer-contracts/pull/500) - Slack Release Notification Bot
[PR #498](https://github.com/agglayer/agglayer-contracts/pull/498) - Add build & push docker GHA
[PR #494](https://github.com/agglayer/agglayer-contracts/pull/494) - Feature/merge zkevm to pp
[PR #495](https://github.com/agglayer/agglayer-contracts/pull/495) - add test invalid global index
[PR #489](https://github.com/agglayer/agglayer-contracts/pull/489) - fix: update readme
[PR #493](https://github.com/agglayer/agglayer-contracts/pull/493) - add audit report migration
[PR #492](https://github.com/agglayer/agglayer-contracts/pull/492) - fix getGitInfo tool upgrade v0.3.1
[PR #491](https://github.com/agglayer/agglayer-contracts/pull/491) - Update migration ALGateway
[PR #490](https://github.com/agglayer/agglayer-contracts/pull/490) - Remediations migration
[PR #483](https://github.com/agglayer/agglayer-contracts/pull/483) - add rollupTypes maiunnet 10, 11 and 12
[PR #486](https://github.com/agglayer/agglayer-contracts/pull/486) - check global index
[PR #487](https://github.com/agglayer/agglayer-contracts/pull/487) - fix comment
[PR #482](https://github.com/agglayer/agglayer-contracts/pull/482) - merge tests & validate upgrade zkevmetrog
[PR #471](https://github.com/agglayer/agglayer-contracts/pull/471) - add tools to update rangeVkeyCommitment & aggregationVkey
[PR #472](https://github.com/agglayer/agglayer-contracts/pull/472) - Feature/sp1 v5
[PR #475](https://github.com/agglayer/agglayer-contracts/pull/475) - fix initialize rollup tool
[PR #481](https://github.com/agglayer/agglayer-contracts/pull/481) - add OZ comment renamed & test validateUpgrade
[PR #479](https://github.com/agglayer/agglayer-contracts/pull/479) - Feature/add test migrate


