#!/bin/bash
# Set the -e option to stop the script if any command fails
set -e
# Run docker tests
# Run container
docker run -p 8545:8545 -d --name docker_test hermeznetwork/geth-zkevm-contracts
cp docker/deploymentOutput/genesis.json tools/createNewRollup/genesis.json
# Run docker tests
npx hardhat test docker/docker-tests.test.ts --network localhost
# Run tooling tests to docker
npx hardhat test docker/tools-docker-tests.test.ts --network localhost
# stop container
docker stop docker_test
# remove container
docker container rm docker_test