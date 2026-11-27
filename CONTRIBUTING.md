# Contributing to Agglayer Contracts

Thank you for considering contributing to the Agglayer contracts!
These contracts secure real funds on Ethereum and on every chain connected to the Agglayer, so we hold changes to a high standard of correctness, testing and review. This guide explains how we collaborate and what we expect from a contribution.

> **Security vulnerabilities must not be reported through public issues or pull requests.** Follow [SECURITY.md](./SECURITY.md).

---

## Before you start

- **Open an issue first** for anything beyond a small fix: new features, interface changes, storage layout changes or behaviour changes in deployed contracts. Agreeing on the approach before writing code saves review rounds.
- Keep pull requests **focused and small**. One logical change per PR is much easier to review and audit.
- If your PR is large or experimental, **open it as a draft** to get early feedback.

## Getting started

Requirements: Node 22.x and npm 10.x. [Foundry](https://getfoundry.sh/) is only needed for the Foundry tests and the pre-commit hook.

1. Fork the repository and clone your fork.
2. Install dependencies:
   ```bash
   npm i
   ```
3. Create a branch from the branch you are targeting (see [Branches](#branches)):
   ```bash
   git checkout -b feature/my-change
   ```
4. Make your changes, following the conventions of the surrounding code and the [coding guidelines](#coding-guidelines).
5. Write or update tests, run the [local checks](#local-checks) and open a pull request.

## Branches

- `main` is the latest released code.
- `feature/vX` (for example `feature/v13`) is the integration branch of the next release. Contract changes for the next release should target it.
- Name your branch after the change: `feature/...`, `fix/...`, `docs/...`, `test/...`, `chore/...`.

## Local checks

CI runs these on every pull request, so run them locally before asking for review:

```bash
npm run lint                  # ESLint on all TypeScript (deployment, tools, upgrade, tests, ...)
npm run prettier:contracts    # Solidity formatting (fix with npm run prettier:contracts:fix)
npm run compile               # Hardhat compilation
npm run test                  # Hardhat test suite
npm run coverage              # Coverage report, the target is 100% for contract changes
```

**Compiled artifacts.** CI fails if `compiled-contracts/` does not match the sources. If you change any contract, regenerate and commit it:

```bash
npx hardhat compile --force && ./copy-compiled-contracts.sh
```

The optional pre-commit hook does this for you, and also regenerates `docs/` (selectors, storage layouts and contract docs, which need Foundry nightly):

```bash
git config --local core.hooksPath .githooks/
```

**Docker.** If you touch `deployment/`, `docker/` or a tool used by the docker tests, also run the docker build and its tests (see [docker/README.md](./docker/README.md)):

```bash
npm run docker:contracts && npm run docker:tests
```

## Coding guidelines

### Solidity

- Compiler `0.8.28` with the settings in `hardhat.config.ts`. Some contracts have per-file optimizer overrides: keep them when moving or renaming files.
- Use the Agglayer names (`AgglayerManager`, `AgglayerBridge`, `AgglayerGER`, `AgglayerGateway`, `AgglayerTimelock`), not the legacy Polygon names.
- Use the OpenZeppelin version the contract already uses (`contracts4`, `contracts5` or `contracts52`). New contracts use the newest one.
- Document every public and external function, event and error with NatSpec.
- Do not modify deprecated code or `contracts/previousVersions/`: those contracts are kept only to test upgrades.
- Production deployments and upgrades must use the **Hardhat** artifacts. Foundry builds produce different bytecode and are for testing only.

### Upgradeable contracts

Most core contracts are deployed behind proxies, so a change can break a live deployment even if every test passes.

- **Preserve the storage layout.** Never reorder, remove or retype existing variables. Append new variables or take them from a reserved `__gap` and shrink it. Renames must keep the slot and use `/// @custom:oz-renamed-from`.
- **Bump the version** constant of every contract whose behaviour changes, and use a higher `reinitializer` version when the upgrade needs an initializer.
- **Keep the existing ABI unless the change is agreed.** Removing or changing functions, events or errors breaks integrators (nodes, bridge services, indexers, tooling) and must be called out in the PR.
- Check the deployed bytecode size stays under the 24 KB limit.
- Update the upgrade scripts and checks in `upgrade/` and the operational tools in `tools/` affected by the change.

### TypeScript (tests, tools and scripts)

- Follow the ESLint and Prettier configuration of the repository.
- Tests use Hardhat, ethers v6 and TypeChain. Foundry tests complement, but do not replace, the Hardhat tests.
- Do not commit secrets, private keys or `.env` files, and do not hardcode machine-specific paths.

## Pull requests

### Title and commits

- PR titles follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/), with the affected contract or area as scope when it helps:
  - `feat(AgglayerBridgeL2): ...`, `fix(tools): ...`, `refactor(AgglayerManager): ...`
  - `test: ...`, `docs: ...`, `chore(docker): ...`, `ci: ...`
- **Sign your commits.** Signed commits are required on the protected branches. See GitHub's guide on [signing commits](https://docs.github.com/en/authentication/managing-commit-signature-verification/signing-commits).
- Write clear commit messages: PRs are merged with a merge commit, so the branch history is kept.

### Description

Explain **what** changes and **why**. For contract changes, also state:

- **Breaking changes:** removed or changed functions, events, errors or behaviour.
- **Storage layout changes** and how they stay compatible with deployed contracts.
- **Upgrade and deployment impact:** new initializer, version bumps, changes to deployment or upgrade scripts, genesis or docker.
- **How it was tested:** new tests, coverage, docker or fork runs.
- Links to the related issue and to any related PRs in other repositories.

Release PRs use the [release template](./.github/PULL_REQUEST_TEMPLATE/release.md).

### Reviews

- Reviewers are assigned through [CODEOWNERS](./.github/CODEOWNERS).
- Maintainers acknowledge new PRs as soon as they can. If a review will take longer, they leave a comment with the expected timeline.
- **Force-push policy:** force-push freely while the PR is a draft. Once it is ready for review, do not force-push: add one commit per requested change and merge the target branch in to pick up new changes. This lets reviewers see exactly what changed since their last review.
- Reply to every review comment, and resolve threads only once the change is agreed.

### Merging

- A PR is merged once CI passes and the required approvals are in place.
- Merging a PR does not deploy anything. Deployments and upgrades of live contracts are done by the protocol team through a separate change management process, including security review.

## Documentation

- Update the README, the tool READMEs and the `CLAUDE.md` files when you change how something is used.
- Protocol-level changes (new contract versions, migration paths, roles) are also documented in the [protocol team docs](https://github.com/agglayer/protocol-team-docs).

## Communication

- Use GitHub issues for bugs and feature proposals, and PR comments for discussions about a specific change.
- For larger design discussions, open an issue before writing code.

## License

By contributing, you agree that your contributions are licensed under the [GNU Affero General Public License v3](./LICENSE), the license of this repository.

---

Thank you for helping make the Agglayer better! 💜
