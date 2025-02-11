/* eslint-disable no-plusplus, no-await-in-loop */
import {expect} from "chai";
import {ethers, upgrades} from "hardhat";
import {
    AggLayerGateway,
    SP1VerifierPlonk
} from "../../typechain-types";
import input from "./real-prover-sp1/test-inputs/input.json";
import { pessimistic } from "../../typechain-types/contracts/v2/consensus";

describe("AggLayerGateway tests", () => {

    upgrades.silenceWarnings()

    let aggLayerGatewayContract: AggLayerGateway;
    let verifierContract: SP1VerifierPlonk;

    let deployer: any;
    let defaultAdmin: any;
    let aggLayerAdmin: any;

    const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
    const AGGCHAIN_ADMIN_ROLE = ethers.id("AGGCHAIN_ADMIN_ROLE");
    const AGGLAYER_ADD_ROUTE_ROLE = ethers.id("AGGLAYER_ADD_ROUTE_ROLE");
    const AGGLAYER_FREEZE_ROUTE_ROLE = ethers.id("AGGLAYER_FREEZE_ROUTE_ROLE");

    const selector = input["proof"].slice(0, 10);
    const pessimisticVKey = input["vkey"];
    const newPessimisticVKey = "0xaaaaaa85702e0582d900f3a19521270c92a58e2588230c4a5cf3b45103f4a512"

    beforeEach("Deploy contracts", async () => {
        // load signers
        [deployer, defaultAdmin, aggLayerAdmin] = await ethers.getSigners();

        // deploy AggLayerGateway
        const AggLayerGatewayFactory = await ethers.getContractFactory("AggLayerGateway");
        aggLayerGatewayContract = (await upgrades.deployProxy(AggLayerGatewayFactory, [], {
            initializer: false,
            unsafeAllow: ["constructor"],
        })) as unknown as AggLayerGateway;

        // initialize AggLayerGateway
        await expect(aggLayerGatewayContract.initialize(defaultAdmin.address))
        .to.emit(aggLayerGatewayContract, "RoleGranted")
        .withArgs(DEFAULT_ADMIN_ROLE, defaultAdmin.address, deployer.address);

        // deploy verifier contract
        const SP1VerifierPlonkFactory = await ethers.getContractFactory("SP1VerifierPlonk");
        verifierContract = (await SP1VerifierPlonkFactory.deploy()) as SP1VerifierPlonk;
        
    });

    it("should check the initialize parameters", async () => {
        expect(await aggLayerGatewayContract.hasRole(DEFAULT_ADMIN_ROLE, defaultAdmin.address)).to.be.equal(true);
    });

    it("should check error 'contract is already initialized'", async () => {
        // initialize AggLayerGateway
        await expect(aggLayerGatewayContract.initialize(aggLayerAdmin.address))
        .to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("addPessimisticVKeyRoute", async () => {
        // add pessimistic vkey route
        // check onlyRole
        await expect(aggLayerGatewayContract.addPessimisticVKeyRoute(
            selector,
            verifierContract.target,
            pessimisticVKey
        ))
        .to.be.revertedWithCustomError(
            aggLayerGatewayContract,
            "AccessControlUnauthorizedAccount"
        )
        .withArgs(deployer.address, AGGLAYER_ADD_ROUTE_ROLE);

        // grantRole AGGLAYER_ADD_ROUTE_ROLE --> aggLayerAdmin
        await expect(aggLayerGatewayContract.connect(defaultAdmin).grantRole(AGGLAYER_ADD_ROUTE_ROLE, aggLayerAdmin.address))
        .to.emit(aggLayerGatewayContract, "RoleGranted")
        .withArgs(AGGLAYER_ADD_ROUTE_ROLE, aggLayerAdmin.address, defaultAdmin.address);

        expect(await aggLayerGatewayContract.hasRole(AGGLAYER_ADD_ROUTE_ROLE, aggLayerAdmin.address)).to.be.true;

        // check SelectorCannotBeZero
        await expect(aggLayerGatewayContract.connect(aggLayerAdmin).addPessimisticVKeyRoute(
            "0x00000000",
            verifierContract.target,
            pessimisticVKey
        ))
        .to.be.revertedWithCustomError(
            aggLayerGatewayContract,
            "SelectorCannotBeZero"
        );

        // check RouteAdded
        await expect(aggLayerGatewayContract.connect(aggLayerAdmin).addPessimisticVKeyRoute(
            selector,
            verifierContract.target,
            pessimisticVKey
        ))
        .to.emit(aggLayerGatewayContract, "RouteAdded")
        .withArgs(selector, verifierContract.target, pessimisticVKey);

        // check RouteAlreadyExists
        await expect(aggLayerGatewayContract.connect(aggLayerAdmin).addPessimisticVKeyRoute(
            selector,
            verifierContract.target,
            pessimisticVKey
        ))
        .to.be.revertedWithCustomError(
            aggLayerGatewayContract,
            "RouteAlreadyExists"
        )
        .withArgs(verifierContract.target);
    });

    it("freezePessimisticVKeyRoute", async () => {
        const testSelector = "0x00000002";

        // grantRole AGGLAYER_ADD_ROUTE_ROLE --> aggLayerAdmin
        await expect(aggLayerGatewayContract.connect(defaultAdmin).grantRole(AGGLAYER_ADD_ROUTE_ROLE, aggLayerAdmin.address))
        .to.emit(aggLayerGatewayContract, "RoleGranted")
        .withArgs(AGGLAYER_ADD_ROUTE_ROLE, aggLayerAdmin.address, defaultAdmin.address);

        expect(await aggLayerGatewayContract.hasRole(AGGLAYER_ADD_ROUTE_ROLE, aggLayerAdmin.address)).to.be.true;

        // add pessimistic vkey route
        await expect(aggLayerGatewayContract.connect(aggLayerAdmin).addPessimisticVKeyRoute(
            selector,
            verifierContract.target,
            pessimisticVKey
        ))
        .to.emit(aggLayerGatewayContract, "RouteAdded")
        .withArgs(selector, verifierContract.target, pessimisticVKey);

        // freeze pessimistic vkey route
        // check onlyRole
        await expect(aggLayerGatewayContract.freezePessimisticVKeyRoute(
            selector,
        ))
        .to.be.revertedWithCustomError(
            aggLayerGatewayContract,
            "AccessControlUnauthorizedAccount"
        )
        .withArgs(deployer.address, AGGLAYER_FREEZE_ROUTE_ROLE);

        // grantRole AGGLAYER_FREEZE_ROUTE_ROLE --> aggLayerAdmin
        await expect(aggLayerGatewayContract.connect(defaultAdmin).grantRole(AGGLAYER_FREEZE_ROUTE_ROLE, aggLayerAdmin.address))
        .to.emit(aggLayerGatewayContract, "RoleGranted")
        .withArgs(AGGLAYER_FREEZE_ROUTE_ROLE, aggLayerAdmin.address, defaultAdmin.address);

        expect(await aggLayerGatewayContract.hasRole(AGGLAYER_FREEZE_ROUTE_ROLE, aggLayerAdmin.address)).to.be.true;

        // check RouteNotFound
        await expect(aggLayerGatewayContract.connect(aggLayerAdmin).freezePessimisticVKeyRoute(
            testSelector
        ))
        .to.be.revertedWithCustomError(
            aggLayerGatewayContract,
            "RouteNotFound"
        )
        .withArgs(testSelector);

        // check RouteFrozen
        await expect(aggLayerGatewayContract.connect(aggLayerAdmin).freezePessimisticVKeyRoute(
            selector
        ))
        .to.emit(aggLayerGatewayContract, "RouteFrozen")
        .withArgs(selector, verifierContract.target);

        // check RouteIsFrozen
        await expect(aggLayerGatewayContract.connect(aggLayerAdmin).freezePessimisticVKeyRoute(
            selector
        ))
        .to.be.revertedWithCustomError(
            aggLayerGatewayContract,
            "RouteIsFrozen"
        )
        .withArgs(selector);

    });

    it("addDefaultAggchainVKey", async () => {
        // add pessimistic vkey route
        // check onlyRole
        await expect(aggLayerGatewayContract.addDefaultAggchainVKey(
            selector,
            pessimisticVKey
        ))
        .to.be.revertedWithCustomError(
            aggLayerGatewayContract,
            "AccessControlUnauthorizedAccount"
        )
        .withArgs(deployer.address, AGGCHAIN_ADMIN_ROLE);

        // grantRole AGGCHAIN_ADMIN_ROLE --> aggLayerAdmin
        await expect(aggLayerGatewayContract.connect(defaultAdmin).grantRole(AGGCHAIN_ADMIN_ROLE, aggLayerAdmin.address))
        .to.emit(aggLayerGatewayContract, "RoleGranted")
        .withArgs(AGGCHAIN_ADMIN_ROLE, aggLayerAdmin.address, defaultAdmin.address);

        expect(await aggLayerGatewayContract.hasRole(AGGCHAIN_ADMIN_ROLE, aggLayerAdmin.address)).to.be.true;

        // check AddDefaultAggchainVKey
        await expect(aggLayerGatewayContract.connect(aggLayerAdmin).addDefaultAggchainVKey(
            selector,
            pessimisticVKey
        ))
        .to.emit(aggLayerGatewayContract, "AddDefaultAggchainVKey")
        .withArgs(selector, pessimisticVKey);

        // check AggchainVKeyAlreadyExists
        await expect(aggLayerGatewayContract.connect(aggLayerAdmin).addDefaultAggchainVKey(
            selector,
            pessimisticVKey
        ))
        .to.be.revertedWithCustomError(
            aggLayerGatewayContract,
            "AggchainVKeyAlreadyExists"
        );
    });

    it("getDefaultAggchainVKey & updateDefaultAggchainVKey", async () => {
        // add pessimistic vkey route
        // check onlyRole
        await expect(aggLayerGatewayContract.addDefaultAggchainVKey(
            selector,
            pessimisticVKey
        ))
        .to.be.revertedWithCustomError(
            aggLayerGatewayContract,
            "AccessControlUnauthorizedAccount"
        )
        .withArgs(deployer.address, AGGCHAIN_ADMIN_ROLE);

        // grantRole AGGCHAIN_ADMIN_ROLE --> aggLayerAdmin
        await expect(aggLayerGatewayContract.connect(defaultAdmin).grantRole(AGGCHAIN_ADMIN_ROLE, aggLayerAdmin.address))
        .to.emit(aggLayerGatewayContract, "RoleGranted")
        .withArgs(AGGCHAIN_ADMIN_ROLE, aggLayerAdmin.address, defaultAdmin.address);

        // check AggchainVKeyNotFound
        await expect(aggLayerGatewayContract.connect(aggLayerAdmin).updateDefaultAggchainVKey(
            selector,
            pessimisticVKey
        ))
        .to.be.revertedWithCustomError(
            aggLayerGatewayContract,
            "AggchainVKeyNotFound"
        );

        // check getDefaultAggchainVKey --> ethers.ZeroHash
        await expect(aggLayerGatewayContract.getDefaultAggchainVKey(selector))
        .to.be.revertedWithCustomError(
            aggLayerGatewayContract,
            "AggchainVKeyNotFound"
        );

        // check AddDefaultAggchainVKey
        await expect(aggLayerGatewayContract.connect(aggLayerAdmin).addDefaultAggchainVKey(
            selector,
            pessimisticVKey
        ))
        .to.emit(aggLayerGatewayContract, "AddDefaultAggchainVKey")
        .withArgs(selector, pessimisticVKey);

        // check getDefaultAggchainVKey --> pessimisticVKey
        expect(await aggLayerGatewayContract.getDefaultAggchainVKey(selector))
        .to.be.equal(pessimisticVKey);

        // check onlyRole
        await expect(aggLayerGatewayContract.updateDefaultAggchainVKey(
            selector,
            pessimisticVKey
        ))
        .to.be.revertedWithCustomError(
            aggLayerGatewayContract,
            "AccessControlUnauthorizedAccount"
        )
        .withArgs(deployer.address, AGGCHAIN_ADMIN_ROLE);

        // check UpdateDefaultAggchainVKey
        await expect(aggLayerGatewayContract.connect(aggLayerAdmin).updateDefaultAggchainVKey(
            selector,
            newPessimisticVKey
        ))
        .to.emit(aggLayerGatewayContract, "UpdateDefaultAggchainVKey")
        .withArgs(selector, newPessimisticVKey);

        // check getDefaultAggchainVKey --> newPessimisticVKey
        expect(await aggLayerGatewayContract.getDefaultAggchainVKey(selector))
        .to.be.equal(newPessimisticVKey);
    });

    it("verifyPessimisticProof", async () => {
        // verifyPessimisticProof
        // check RouteNotFound
        await expect(aggLayerGatewayContract.verifyPessimisticProof(
            input["public-values"],
            input["proof"]
        ))
        .to.be.revertedWithCustomError(
            aggLayerGatewayContract,
            "RouteNotFound"
        )
        .withArgs(selector);

        // grantRole AGGLAYER_ADD_ROUTE_ROLE --> aggLayerAdmin
        await expect(aggLayerGatewayContract.connect(defaultAdmin).grantRole(AGGLAYER_ADD_ROUTE_ROLE, aggLayerAdmin.address))
        .to.emit(aggLayerGatewayContract, "RoleGranted")
        .withArgs(AGGLAYER_ADD_ROUTE_ROLE, aggLayerAdmin.address, defaultAdmin.address);

        expect(await aggLayerGatewayContract.hasRole(AGGLAYER_ADD_ROUTE_ROLE, aggLayerAdmin.address)).to.be.true;

        await expect(aggLayerGatewayContract.connect(aggLayerAdmin).addPessimisticVKeyRoute(
            selector,
            verifierContract.target,
            pessimisticVKey
        ))
        .to.emit(aggLayerGatewayContract, "RouteAdded")
        .withArgs(selector, verifierContract.target, pessimisticVKey);

        // check verifyProof
        await expect(aggLayerGatewayContract.verifyPessimisticProof(
            input["public-values"],
            input["proof"]
        ));

        // grantRole AGGLAYER_FREEZE_ROUTE_ROLE --> aggLayerAdmin
        await expect(aggLayerGatewayContract.connect(defaultAdmin).grantRole(AGGLAYER_FREEZE_ROUTE_ROLE, aggLayerAdmin.address))
        .to.emit(aggLayerGatewayContract, "RoleGranted")
        .withArgs(AGGLAYER_FREEZE_ROUTE_ROLE, aggLayerAdmin.address, defaultAdmin.address);

        expect(await aggLayerGatewayContract.hasRole(AGGLAYER_FREEZE_ROUTE_ROLE, aggLayerAdmin.address)).to.be.true;

        // frozen route
        await expect(aggLayerGatewayContract.connect(aggLayerAdmin).freezePessimisticVKeyRoute(
            selector
        ))
        .to.emit(aggLayerGatewayContract, "RouteFrozen")
        .withArgs(selector, verifierContract.target);

        // check RouteFrozen
        await expect(aggLayerGatewayContract.verifyPessimisticProof(
            input["public-values"],
            input["proof"]
        ))
        .to.be.revertedWithCustomError(
            aggLayerGatewayContract,
            "RouteIsFrozen"
        )
        .withArgs(selector);
    });
});