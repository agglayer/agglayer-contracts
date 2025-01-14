/* eslint-disable no-plusplus, no-await-in-loop */
import {expect} from "chai";
import {ethers, upgrades} from "hardhat";
import {
    PolygonVerifierGateway,
    SP1Verifier
} from "../../typechain-types";
import input from "./real-prover-sp1/test-inputs/input.json";

describe("PolygonVerifierGateway tests", () => {
    upgrades.silenceWarnings();

    let polygonVerifierGatewayContract: PolygonVerifierGateway;
    let verifierContract: SP1Verifier;
    let verifierContractHash0: SP1Verifier_hash0;

    let deployer: any;
    let admin: any;
    let newAdmin: any;

    const pessimisticVKeyInit = "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const selector = "0x54bdcae3"

    beforeEach("Deploy contracts", async () => {
        // load signers
        [deployer, admin, newAdmin] = await ethers.getSigners();

        // deploy polygonVerifierGateway
        const PolygonVerifierGatewayFactory = await ethers.getContractFactory("PolygonVerifierGateway");
        polygonVerifierGatewayContract = (await upgrades.deployProxy(PolygonVerifierGatewayFactory, [], {
            initializer: false,
            unsafeAllow: ["constructor"],
        })) as unknown as PolygonVerifierGateway;

        // initialize polygonVerifierGateway
        await polygonVerifierGatewayContract.initialize(
            admin.address,
            pessimisticVKeyInit,
        );

        // deploy SP1 verifier
        const SP1VerifierFactory = await ethers.getContractFactory("SP1Verifier");
        verifierContract = await SP1VerifierFactory.deploy();
        
    });

    it("should check the initialize parameters", async () => {
        expect(await polygonVerifierGatewayContract.admin()).to.be.equal(admin.address);
        expect(await polygonVerifierGatewayContract.pessimisticVKey()).to.be.equal(pessimisticVKeyInit);
    });

    it("add new route", async () => {

        await expect(polygonVerifierGatewayContract.addRoute(verifierContract.target)).to.be.revertedWithCustomError(
            polygonVerifierGatewayContract,
            "OnlyAdmin"
        );

        // deploy SP1 verifier
        const SP1VerifierHash0Factory = await ethers.getContractFactory("SP1Verifier_hash0");
        verifierContractHash0 = await SP1VerifierHash0Factory.deploy();

        await expect(polygonVerifierGatewayContract.connect(admin).addRoute(verifierContractHash0.target)).to.be.revertedWithCustomError(
            polygonVerifierGatewayContract,
            "SelectorCannotBeZero"
        );

        await expect(polygonVerifierGatewayContract.connect(admin).addRoute(verifierContract.target))
            .to.emit(polygonVerifierGatewayContract, "RouteAdded")
            .withArgs(selector, verifierContract.target);

        await expect(polygonVerifierGatewayContract.connect(admin).addRoute(verifierContract.target)).to.be.revertedWithCustomError(
            polygonVerifierGatewayContract,
            "RouteAlreadyExists"
        );
        await expect((await polygonVerifierGatewayContract.routes(selector))[0]).to.be.equal(verifierContract.target);
        await expect((await polygonVerifierGatewayContract.routes(selector))[1]).to.be.equal(false);
    });

    it("freeze route", async () => {

        await expect(polygonVerifierGatewayContract.connect(admin).addRoute(verifierContract.target))
            .to.emit(polygonVerifierGatewayContract, "RouteAdded")
            .withArgs(selector, verifierContract.target);

        await expect(polygonVerifierGatewayContract.freezeRoute(selector)).to.be.revertedWithCustomError(
            polygonVerifierGatewayContract,
            "OnlyAdmin"
        );

        await expect(polygonVerifierGatewayContract.connect(admin).freezeRoute("0x12345678"))
            .to.be.revertedWithCustomError(polygonVerifierGatewayContract, "RouteNotFound")
            .withArgs("0x12345678");

        await expect(polygonVerifierGatewayContract.connect(admin).freezeRoute(selector))
            .to.emit(polygonVerifierGatewayContract, "RouteFrozen")
            .withArgs(selector, verifierContract.target);

        await expect(polygonVerifierGatewayContract.connect(admin).freezeRoute(selector))
            .to.be.revertedWithCustomError(polygonVerifierGatewayContract, "RouteIsFrozen")
            .withArgs(selector);
    });

    it("setPessimisticVKey", async () => {
        const newPessimisticVKey = "0x1111111122222222333333334444444455555555666666667777777788888888"
        
        expect(await polygonVerifierGatewayContract.pessimisticVKey()).to.be.equal(pessimisticVKeyInit);

        await expect(polygonVerifierGatewayContract.setPessimisticVKey(newPessimisticVKey)).to.be.revertedWithCustomError(
            polygonVerifierGatewayContract,
            "OnlyAdmin"
        );

        expect(await polygonVerifierGatewayContract.pessimisticVKey()).to.be.equal(pessimisticVKeyInit);

        await expect(polygonVerifierGatewayContract.connect(admin).setPessimisticVKey(newPessimisticVKey))
            .to.emit(polygonVerifierGatewayContract, "SetPessimisticVKey")
            .withArgs(newPessimisticVKey);

        expect(await polygonVerifierGatewayContract.pessimisticVKey()).to.be.equal(newPessimisticVKey);
    });

    it("transfer admin role", async () => {
        
        expect(await polygonVerifierGatewayContract.admin()).to.be.equal(admin.address);

        await expect(polygonVerifierGatewayContract.transferAdminRole(newAdmin.address)).to.be.revertedWithCustomError(
            polygonVerifierGatewayContract,
            "OnlyAdmin"
        );

        await expect(polygonVerifierGatewayContract.connect(admin).transferAdminRole(newAdmin.address))
            .to.emit(polygonVerifierGatewayContract, "TransferAdminRole")
            .withArgs(newAdmin.address);

        expect(await polygonVerifierGatewayContract.admin()).to.be.equal(admin.address);

        expect(await polygonVerifierGatewayContract.pendingAdmin()).to.be.equal(newAdmin.address);

        await expect(polygonVerifierGatewayContract.connect(admin).acceptAdminRole()).to.be.revertedWithCustomError(
            polygonVerifierGatewayContract,
            "OnlyPendingAdmin"
        );

        await expect(polygonVerifierGatewayContract.connect(newAdmin).acceptAdminRole())
            .to.emit(polygonVerifierGatewayContract, "AcceptAdminRole")
            .withArgs(newAdmin.address);
    });

    it("verifyPessimisticProof", async () => {

        await expect(polygonVerifierGatewayContract.verifyPessimisticProof(input["public-values"], input['proof']))
        .to.be.revertedWithCustomError(polygonVerifierGatewayContract, "RouteNotFound")
        .withArgs(selector);

        await expect(polygonVerifierGatewayContract.connect(admin).addRoute(verifierContract.target))
            .to.emit(polygonVerifierGatewayContract, "RouteAdded")
            .withArgs(selector, verifierContract.target);

        await expect(polygonVerifierGatewayContract.connect(admin).setPessimisticVKey(input.vkey))
            .to.emit(polygonVerifierGatewayContract, "SetPessimisticVKey")
            .withArgs(input.vkey);

        await polygonVerifierGatewayContract.verifyPessimisticProof(input["public-values"], input['proof']);

        await expect(polygonVerifierGatewayContract.connect(admin).freezeRoute(selector))
            .to.emit(polygonVerifierGatewayContract, "RouteFrozen")
            .withArgs(selector, verifierContract.target);

        await expect(polygonVerifierGatewayContract.verifyPessimisticProof(input["public-values"], input['proof']))
            .to.be.revertedWithCustomError(polygonVerifierGatewayContract, "RouteIsFrozen")
            .withArgs(selector);
    });

});