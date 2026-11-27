import assert from 'assert';

/*
 * Intended AgglayerBridgeL2 interface changes from the archived v1.2.0 release to v1.3.0.
 * `bridgeManager` became a two-step role transfer: `setBridgeManager` and its event are replaced by
 * `transferBridgeManagerRole` / `acceptBridgeManagerRole`, and `pendingBridgeManager` takes the first slot of the
 * AgglayerBridgeL2 reserved gap. `DetailedBridgeEvent` is emitted after each BridgeEvent with tx.origin and msg.sender.
 * Every other ABI entry and storage field must stay identical.
 */
export const BRIDGE_L2_ABI_CHANGES = {
    removed: ['function setBridgeManager', 'event SetBridgeManager'],
    added: [
        'function pendingBridgeManager',
        'function transferBridgeManagerRole',
        'function acceptBridgeManagerRole',
        'event TransferBridgeManagerRole',
        'event AcceptBridgeManagerRole',
        'error OnlyPendingBridgeManager',
        'event DetailedBridgeEvent',
    ],
};

const abiKey = (entry: any) => (entry.name ? `${entry.type} ${entry.name}` : entry.type);
const canonical = (entries: any[]) => entries.map((entry) => JSON.stringify(entry)).sort();

/**
 * Asserts that `actual` equals the v1.2.0 ABI with exactly the declared entries removed and added
 * @param actual ABI of the current AgglayerBridgeL2
 * @param baseline ABI of the archived v1.2.0 AgglayerBridgeL2
 */
export function assertExpectedBridgeL2Abi(actual: any[], baseline: any[]) {
    const { removed, added } = BRIDGE_L2_ABI_CHANGES;
    removed.forEach((key) =>
        assert(
            baseline.some((entry) => abiKey(entry) === key),
            `${key} missing in v1.2.0`,
        ),
    );
    added.forEach((key) =>
        assert(
            actual.some((entry) => abiKey(entry) === key),
            `${key} missing in v1.3.0`,
        ),
    );
    assert(
        added.every((key) => !baseline.some((entry) => abiKey(entry) === key)),
        'An added entry already exists in v1.2.0',
    );
    assert.deepStrictEqual(
        canonical(actual.filter((entry) => !added.includes(abiKey(entry)))),
        canonical(baseline.filter((entry) => !removed.includes(abiKey(entry)))),
        'Bridge ABI differs from v1.2.0 beyond the declared changes',
    );
}

/**
 * Returns the expected `{ label, slot, offset }` fields of v1.3.0: the v1.2.0 fields with `pendingBridgeManager`
 * placed in the first slot of the AgglayerBridgeL2 gap and the gap starting one slot later
 * @param baselineLayout Storage layout of the archived v1.2.0 AgglayerBridgeL2
 */
export function expectedBridgeL2StorageFields(baselineLayout: { storage: any[] }) {
    const fields = baselineLayout.storage.map(({ label, slot, offset }: any) => ({ label, slot, offset }));
    const index = fields.findIndex(({ label }: any) => label === 'pendingEmergencyBridgeUnpauser');
    const gap = fields[index + 1];
    assert(index !== -1 && gap?.label === '__gap', 'Unexpected v1.2.0 AgglayerBridgeL2 layout');
    const newField = { label: 'pendingBridgeManager', slot: gap.slot, offset: 0 };
    return [
        ...fields.slice(0, index + 1),
        newField,
        { ...gap, slot: (BigInt(gap.slot) + 1n).toString() },
        ...fields.slice(index + 2),
    ];
}
