import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { bufferManager } from "../src/memory/BufferManager";
import { mappingManager } from "../src/memory/MappingManager";
import { SC } from "../src/plc/programs/SC";

class TestSC extends SC
{
    input = 1;

    protected square(): number
    {
        return this.input;
    }
}

function createDigitalOnlyPLC(): TestSC
{
    const plc = new TestSC();
    plc.init();
    // Isolate digital behavior from overlapping analog output and delay addresses.
    for (let number = 1; number <= plc.IA_SIZE; number++)
    {
        mock.method(plc.getAnalogico(number).valor, "write", () => {});
    }
    return plc;
}

beforeEach(() =>
{
    mappingManager.clear();
    bufferManager.clear();
});

afterEach(() =>
{
    mock.restoreAll();
    mappingManager.clear();
    bufferManager.clear();
});

test("all 20 digital instruments expose four fields with the PLC bit positions", () =>
{
    const plc = new TestSC();
    plc.init();
    const snapshots = mappingManager.getAll();
    const digitals = snapshots.filter((entry) => entry.group === "Digital");
    assert.equal(digitals.length, 20 * 4);

    for (let number = 1; number <= plc.ID_SIZE; number++)
    {
        const rows = digitals.filter((entry) => entry.instrument?.number === number);
        assert.deepEqual(rows.map((entry) => entry.instrument?.field).sort(),
            ["config", "delayActivacion", "delayDesactivacion", "valor"]);
        const config = rows.find((entry) => entry.instrument?.field === "config");
        const value = rows.find((entry) => entry.instrument?.field === "valor");
        assert.equal(config?.address, 152 + number - 1);
        assert.equal(value?.address, 2422 + number - 1);
        assert.equal(rows.find((entry) => entry.instrument?.field === "delayActivacion")?.address, 2522 + number - 1);
        assert.equal(rows.find((entry) => entry.instrument?.field === "delayDesactivacion")?.address, 2622 + number - 1);
        assert.deepEqual(config?.instrument?.bits, {
            habilitado: plc.ID_CONFIG_POS_HABILITADO,
            noAlarma: plc.ID_CONFIG_POS_NO_ALARMA,
            habilitada: plc.ID_CONFIG_POS_HABILITADA,
            ...Object.fromEntries(plc.ID_CONFIG_POS_INTERLOCKS.map((bit, index) => [`intlk${index + 1}`, bit]))
        });
        assert.deepEqual(value?.instrument?.bits, { valor: 0, activada: 1 });
    }

    assert.ok(snapshots.filter((entry) => entry.group === "Directo").every((entry) => !entry.instrument));
    plc.init();
    assert.equal(mappingManager.getAll().filter((entry) => entry.group === "Digital").length, 80);
    assert.equal(plc.getDigital(20).valor.getAddress(), 2441);
    assert.throws(() => plc.getDigital(21), RangeError);
});

test("digital value and active alarm occupy separate bits", () =>
{
    const plc = createDigitalOnlyPLC();
    const digital = plc.getDigital(1);
    digital.config.write((1 << plc.ID_CONFIG_POS_HABILITADO) | (1 << plc.ID_CONFIG_POS_HABILITADA));
    plc.execute();
    assert.equal(digital.valor.read(), 3);
    const snapshot = mappingManager.getAll().find((entry) =>
        entry.group === "Digital" && entry.instrument?.number === 1 && entry.instrument.field === "valor");
    assert.equal(snapshot?.value, 3);
    assert.deepEqual(snapshot?.instrument?.bits, { valor: 0, activada: 1 });
});

test("NoAlarma, disabled flags and each interlock suppress alarms without changing the input", () =>
{
    const plc = createDigitalOnlyPLC();
    const digital = plc.getDigital(1);
    const enabled = (1 << plc.ID_CONFIG_POS_HABILITADO) | (1 << plc.ID_CONFIG_POS_HABILITADA);
    for (const config of [
        0,
        1 << plc.ID_CONFIG_POS_HABILITADO,
        1 << plc.ID_CONFIG_POS_HABILITADA,
        enabled | (1 << plc.ID_CONFIG_POS_NO_ALARMA),
        ...plc.ID_CONFIG_POS_INTERLOCKS.map((position) => enabled | (1 << position))
    ])
    {
        digital.config.write(enabled);
        plc.execute();
        assert.equal(digital.valor.read(1), 1);
        digital.config.write(config);
        plc.execute();
        assert.equal(digital.valor.read(0), 1);
        assert.equal(digital.valor.read(1), 0);
    }
});

test("activation and deactivation delays retain their configured values and behavior", () =>
{
    let now = 1000;
    mock.method(Date, "now", () => now);
    const plc = createDigitalOnlyPLC();
    const digital = plc.getDigital(1);
    digital.config.write((1 << plc.ID_CONFIG_POS_HABILITADO) | (1 << plc.ID_CONFIG_POS_HABILITADA));
    digital.delayActivacion.write(100);
    digital.delayDesactivacion.write(200);

    plc.execute();
    assert.equal(digital.valor.read(1), 0);
    now = 1100;
    plc.execute();
    assert.equal(digital.valor.read(1), 1);
    plc.input = 0;
    plc.execute();
    assert.equal(digital.valor.read(0), 0);
    assert.equal(digital.valor.read(1), 1);
    now = 1299;
    plc.execute();
    assert.equal(digital.valor.read(1), 1);
    now = 1300;
    plc.execute();
    assert.equal(digital.valor.read(1), 0);
    assert.equal(digital.delayActivacion.read(), 100);
    assert.equal(digital.delayDesactivacion.read(), 200);
});
