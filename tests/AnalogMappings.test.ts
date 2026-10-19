import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { bufferManager } from "../src/memory/BufferManager";
import { mappingManager } from "../src/memory/MappingManager";
import { AddresType, DataModel } from "../src/plc/core/DataModel";
import { SC } from "../src/plc/programs/SC";

beforeEach(() =>
{
    mappingManager.clear();
    bufferManager.clear();
});

afterEach(() =>
{
    mappingManager.clear();
    bufferManager.clear();
});

test("mapping snapshots preserve explicit instrument metadata and existing lookups", () =>
{
    const data = new DataModel("CUSTOM_CONFIG", 101, AddresType.HR);
    const instrument = { number: 7, field: "config", alarmBits: { HH: 3, H: 2, L: 1, LL: 0 } };
    mappingManager.registerMapping(data.getName(), data, instrument);
    data.write(10);

    assert.deepEqual(mappingManager.getAll(), [{
        name: "CUSTOM_CONFIG",
        address: 101,
        addressType: AddresType.HR,
        value: 10,
        group: data.getGroup(),
        instrument
    }]);
    assert.equal(mappingManager.getAddressByName("CUSTOM_CONFIG"), 101);
    assert.equal(mappingManager.getValueByName("CUSTOM_CONFIG"), 10);
});

test("unstructured mappings remain supported and clearing removes metadata", () =>
{
    const data = new DataModel("D_TEST", 10, AddresType.HR);
    mappingManager.registerMapping(data.getName(), data, { number: 1, field: "valor" });
    mappingManager.clear();
    assert.deepEqual(mappingManager.getAll(), []);
    assert.equal(mappingManager.getAddressByName(data.getName()), undefined);
    assert.equal(mappingManager.getValueByName(data.getName()), undefined);

    mappingManager.registerMapping(data.getName(), data);
    data.write(42);
    assert.equal(mappingManager.getAll()[0].instrument, undefined);
    assert.equal(mappingManager.getValueByName(data.getName()), 42);
});

test("all analog fields have instrument metadata and alarm bits match the PLC", () =>
{
    class TestSC extends SC {}
    const plc = new TestSC();
    plc.init();
    const snapshots = mappingManager.getAll();
    const analogs = snapshots.filter((entry) => entry.group === "Analogico");
    assert.equal(analogs.length, 50 * 13);
    assert.equal(snapshots.filter((entry) => entry.group === "Digital").length, 20 * 4);
    const byName = new Map(analogs.map((entry) => [entry.name, entry]));

    for (let number = 1; number <= plc.IA_SIZE; number++)
    {
        for (const [field, data] of Object.entries(plc.getAnalogico(number)))
        {
            const snapshot = byName.get(data.getName());
            assert.ok(snapshot);
            assert.equal(snapshot.instrument?.number, number);
            assert.equal(snapshot.instrument?.field, field);
            assert.equal(snapshot.address, data.getAddress());
            if (field === "config" || field === "estado")
            {
                assert.deepEqual(snapshot.instrument?.alarmBits, {
                    HH: plc.IA_CONFIG_ALARM_POS_HIHI,
                    H: plc.IA_CONFIG_ALARM_POS_HI,
                    L: plc.IA_CONFIG_ALARM_POS_LO,
                    LL: plc.IA_CONFIG_ALARM_POS_LOLO
                });
            }
        }
    }
    assert.ok(snapshots.filter((entry) => entry.group === "Directo").every((entry) => !entry.instrument));
});
