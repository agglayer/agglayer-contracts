/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved, import/extensions */
import fs from 'fs';
import path from 'path';

const agglayerMaangerAddress = '0xE2EF6215aDc132Df6913C8DD16487aBF118d1764';
const verifierTypeList = ['StateTransition', 'Pessimistic', 'ALGateway'];
const filtersRollupTypes = ['27', '30'];
const newRollupTypesID = ['31', '32'];
const upgradeData: any[] = [];

async function main() {
    const contractManager = await ethers.getContractAt('AgglayerManager', agglayerMaangerAddress);
    // TODO: upgradeData change every time we do a new upgrade
    // upgrade FEP
    const contractFEPFactory = await ethers.getContractFactory('AggchainFEP');
    const upgradeDataFEP = contractFEPFactory.interface.encodeFunctionData('upgradeFromPreviousFEP()');
    // upgrade Legacy Consensus
    const contractECDSAFactory = await ethers.getContractFactory('AggchainECDSAMultisig');
    const upgradeDataECDSAMultisig = contractECDSAFactory.interface.encodeFunctionData('migrateFromLegacyConsensus()');
    // Add upgradeData
    upgradeData.push(upgradeDataFEP);
    upgradeData.push(upgradeDataECDSAMultisig);
    const totalRollups = Number(await contractManager.rollupCount());
    console.log(`Total rollups: ${totalRollups}`);
    const rollupsIDsList = {
        StateTransition: [] as number[],
        Pessimistic: [] as number[],
        ALGateway: [] as number[],
    };
    const rollupsIDsListTypes = {
        27: [] as number[],
        30: [] as number[],
    };
    for (let rollupID = 0; rollupID < totalRollups + 1; rollupID++) {
        const data = await contractManager.rollupIDToRollupDataV2Deserialized(rollupID);
        const verifierType = data[9].toString();
        const rollupType = data[8].toString();
        console.log(`RollupID: ${rollupID}, VerifierType: ${verifierType}, RollupType: ${rollupType}`);
        const verifierTypeStr = verifierTypeList[verifierType];
        rollupsIDsList[verifierTypeStr].push(rollupID);
        if (filtersRollupTypes.includes(rollupType)) {
            rollupsIDsListTypes[rollupType].push({
                rollupID,
                rollupAddress: data[0], // rollupAddress
                newRollupTypeID: newRollupTypesID[filtersRollupTypes.indexOf(rollupType)],
                upgradeData: upgradeData[filtersRollupTypes.indexOf(rollupType)],
            });
        }
    }
    await fs.writeFileSync(
        path.join(__dirname, 'rollupsIDsListTypes.json'),
        JSON.stringify(rollupsIDsListTypes, null, 2),
    );
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
