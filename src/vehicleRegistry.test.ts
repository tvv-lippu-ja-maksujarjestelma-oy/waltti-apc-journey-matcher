import pino from "pino";
import type Pulsar from "pulsar-client";
import type { CountingSystemMap, UniqueVehicleId } from "./config";
import {
  updateCountingSystemMapFromMessage,
  createVehicleRegistryHandler,
} from "./vehicleRegistry";

const logger = pino({ level: "silent" });

const createMockMessage = (
  data: string,
  topicName: string = "persistent://apc-sandbox/source/vehicle-catalogue-fi-jyvaskyla"
): Pulsar.Message =>
  ({
    getData: () => Buffer.from(data, "utf8"),
    getTopicName: () => topicName,
    getMessageId: () => ({ toString: () => "mock-message-id" }),
    getEventTimestamp: () => Date.now(),
    getProperties: () => ({}),
  } as unknown as Pulsar.Message);

describe("updateCountingSystemMapFromMessage", () => {
  test("adds single counting system to map and includedVehicles", () => {
    const countingSystemMap: CountingSystemMap = new Map();
    const includedVehicles = new Set<UniqueVehicleId>();
    const vehicleData = JSON.stringify([
      {
        operatorId: "6714",
        vehicleShortName: "518",
        equipment: [
          {
            id: "JL518-0009d80670fc",
            type: "PASSENGER_COUNTER",
            apcSystem: "Telia",
          },
        ],
      },
    ]);
    const message = createMockMessage(vehicleData);

    updateCountingSystemMapFromMessage(
      logger,
      message,
      "fi:jyvaskyla",
      countingSystemMap,
      includedVehicles
    );

    expect(countingSystemMap.size).toBe(1);
    expect(countingSystemMap.get("jl518-0009d80670fc")).toEqual([
      "fi:jyvaskyla:6714_518",
      "Telia",
    ]);
    expect(
      includedVehicles.has("fi:jyvaskyla:6714_518" as UniqueVehicleId)
    ).toBe(true);
  });

  test("adds all PASSENGER_COUNTER devices for one vehicle", () => {
    const countingSystemMap: CountingSystemMap = new Map();
    const includedVehicles = new Set<UniqueVehicleId>();
    const vehicleData = JSON.stringify([
      {
        operatorId: "6714",
        vehicleShortName: "520",
        equipment: [
          {
            id: "JL520-device1",
            type: "PASSENGER_COUNTER",
            apcSystem: "VendorA",
          },
          {
            id: "JL520-device2",
            type: "PASSENGER_COUNTER",
            apcSystem: "VendorB",
          },
        ],
      },
    ]);
    const message = createMockMessage(vehicleData);

    updateCountingSystemMapFromMessage(
      logger,
      message,
      "fi:jyvaskyla",
      countingSystemMap,
      includedVehicles
    );

    expect(countingSystemMap.size).toBe(2);
    expect(countingSystemMap.get("jl520-device1")).toEqual([
      "fi:jyvaskyla:6714_520",
      "VendorA",
    ]);
    expect(countingSystemMap.get("jl520-device2")).toEqual([
      "fi:jyvaskyla:6714_520",
      "VendorB",
    ]);
    expect(includedVehicles.size).toBe(1);
    expect(
      includedVehicles.has("fi:jyvaskyla:6714_520" as UniqueVehicleId)
    ).toBe(true);
  });

  test("uses unknown when apcSystem is missing", () => {
    const countingSystemMap: CountingSystemMap = new Map();
    const includedVehicles = new Set<UniqueVehicleId>();
    const vehicleData = JSON.stringify([
      {
        operatorId: "6714",
        vehicleShortName: "521",
        equipment: [{ id: "JL521-APC", type: "PASSENGER_COUNTER" }],
      },
    ]);
    const message = createMockMessage(vehicleData);

    updateCountingSystemMapFromMessage(
      logger,
      message,
      "fi:jyvaskyla",
      countingSystemMap,
      includedVehicles
    );

    expect(countingSystemMap.get("jl521-apc")).toEqual([
      "fi:jyvaskyla:6714_521",
      "unknown",
    ]);
  });

  test("ignores non-PASSENGER_COUNTER equipment", () => {
    const countingSystemMap: CountingSystemMap = new Map();
    const includedVehicles = new Set<UniqueVehicleId>();
    const vehicleData = JSON.stringify([
      {
        operatorId: "6714",
        vehicleShortName: "521",
        equipment: [
          { id: "JL521-APC", type: "PASSENGER_COUNTER", apcSystem: "Telia" },
          { id: "JL521-GPS", type: "GPS" },
        ],
      },
    ]);
    const message = createMockMessage(vehicleData);

    updateCountingSystemMapFromMessage(
      logger,
      message,
      "fi:jyvaskyla",
      countingSystemMap,
      includedVehicles
    );

    expect(countingSystemMap.size).toBe(1);
    expect(countingSystemMap.has("jl521-gps")).toBe(false);
    expect(countingSystemMap.get("jl521-apc")).toEqual([
      "fi:jyvaskyla:6714_521",
      "Telia",
    ]);
  });

  test("skips vehicle with no PASSENGER_COUNTER equipment", () => {
    const countingSystemMap: CountingSystemMap = new Map();
    const includedVehicles = new Set<UniqueVehicleId>();
    const vehicleData = JSON.stringify([
      {
        operatorId: "6714",
        vehicleShortName: "522",
        equipment: [{ id: "JL522-GPS", type: "GPS" }],
      },
    ]);
    const message = createMockMessage(vehicleData);

    updateCountingSystemMapFromMessage(
      logger,
      message,
      "fi:jyvaskyla",
      countingSystemMap,
      includedVehicles
    );

    expect(countingSystemMap.size).toBe(0);
    expect(includedVehicles.size).toBe(0);
  });

  test("clears previous entries for same feedPublisherId only", () => {
    const countingSystemMap: CountingSystemMap = new Map();
    const includedVehicles = new Set<UniqueVehicleId>([
      "fi:jyvaskyla:6714_old" as UniqueVehicleId,
      "fi:kuopio:44517_other" as UniqueVehicleId,
    ]);
    countingSystemMap.set("old-device", ["fi:jyvaskyla:6714_old", "Telia"]);
    countingSystemMap.set("other-device", ["fi:kuopio:44517_other", "Telia"]);

    const vehicleData = JSON.stringify([
      {
        operatorId: "6714",
        vehicleShortName: "518",
        equipment: [
          {
            id: "JL518-0009d80670fc",
            type: "PASSENGER_COUNTER",
            apcSystem: "Telia",
          },
        ],
      },
    ]);
    const message = createMockMessage(vehicleData);

    updateCountingSystemMapFromMessage(
      logger,
      message,
      "fi:jyvaskyla",
      countingSystemMap,
      includedVehicles
    );

    expect(countingSystemMap.has("old-device")).toBe(false);
    expect(countingSystemMap.get("other-device")).toEqual([
      "fi:kuopio:44517_other",
      "Telia",
    ]);
    expect(countingSystemMap.get("jl518-0009d80670fc")).toEqual([
      "fi:jyvaskyla:6714_518",
      "Telia",
    ]);
    expect(
      includedVehicles.has("fi:jyvaskyla:6714_old" as UniqueVehicleId)
    ).toBe(false);
    expect(
      includedVehicles.has("fi:kuopio:44517_other" as UniqueVehicleId)
    ).toBe(true);
    expect(
      includedVehicles.has("fi:jyvaskyla:6714_518" as UniqueVehicleId)
    ).toBe(true);
  });

  test("later message with new format overrides earlier message with old format", () => {
    const countingSystemMap: CountingSystemMap = new Map();
    const includedVehicles = new Set<UniqueVehicleId>();

    const oldFormatMessage = createMockMessage(
      JSON.stringify([
        {
          operatorId: "6714",
          vehicleShortName: "483",
          equipment: [
            { id: "6714_483", type: "PASSENGER_COUNTER", apcSystem: "TELIA" },
          ],
        },
      ])
    );
    updateCountingSystemMapFromMessage(
      logger,
      oldFormatMessage,
      "fi:jyvaskyla",
      countingSystemMap,
      includedVehicles
    );

    expect(countingSystemMap.size).toBe(1);
    expect(countingSystemMap.get("6714_483")).toEqual([
      "fi:jyvaskyla:6714_483",
      "TELIA",
    ]);

    const newFormatMessage = createMockMessage(
      JSON.stringify([
        {
          operatorId: "6714",
          vehicleShortName: "483",
          equipment: [
            {
              id: "JL483-0009d8066d7c",
              type: "PASSENGER_COUNTER",
              apcSystem: "TELIA",
            },
          ],
        },
      ])
    );
    updateCountingSystemMapFromMessage(
      logger,
      newFormatMessage,
      "fi:jyvaskyla",
      countingSystemMap,
      includedVehicles
    );

    expect(countingSystemMap.size).toBe(1);
    expect(countingSystemMap.has("6714_483")).toBe(false);
    expect(countingSystemMap.get("jl483-0009d8066d7c")).toEqual([
      "fi:jyvaskyla:6714_483",
      "TELIA",
    ]);
    expect(
      includedVehicles.has("fi:jyvaskyla:6714_483" as UniqueVehicleId)
    ).toBe(true);
  });

  test("handles multiple vehicles in one message", () => {
    const countingSystemMap: CountingSystemMap = new Map();
    const includedVehicles = new Set<UniqueVehicleId>();
    const vehicleData = JSON.stringify([
      {
        operatorId: "6714",
        vehicleShortName: "518",
        equipment: [
          { id: "JL518-APC", type: "PASSENGER_COUNTER", apcSystem: "Telia" },
        ],
      },
      {
        operatorId: "6714",
        vehicleShortName: "519",
        equipment: [
          { id: "JL519-APC", type: "PASSENGER_COUNTER", apcSystem: "Telia" },
        ],
      },
    ]);
    const message = createMockMessage(vehicleData);

    updateCountingSystemMapFromMessage(
      logger,
      message,
      "fi:jyvaskyla",
      countingSystemMap,
      includedVehicles
    );

    expect(countingSystemMap.size).toBe(2);
    expect(countingSystemMap.get("jl518-apc")).toEqual([
      "fi:jyvaskyla:6714_518",
      "Telia",
    ]);
    expect(countingSystemMap.get("jl519-apc")).toEqual([
      "fi:jyvaskyla:6714_519",
      "Telia",
    ]);
    expect(includedVehicles.size).toBe(2);
  });

  test("handles invalid JSON gracefully", () => {
    const countingSystemMap: CountingSystemMap = new Map();
    const includedVehicles = new Set<UniqueVehicleId>();
    const message = createMockMessage("not valid json");

    updateCountingSystemMapFromMessage(
      logger,
      message,
      "fi:jyvaskyla",
      countingSystemMap,
      includedVehicles
    );

    expect(countingSystemMap.size).toBe(0);
    expect(includedVehicles.size).toBe(0);
  });
});

describe("createVehicleRegistryHandler", () => {
  test("extracts feedPublisherId from topic name and updates map", () => {
    const countingSystemMap: CountingSystemMap = new Map();
    const includedVehicles = new Set<UniqueVehicleId>();

    const { update } = createVehicleRegistryHandler(
      logger,
      countingSystemMap,
      includedVehicles
    );

    const vehicleData = JSON.stringify([
      {
        operatorId: "6714",
        vehicleShortName: "518",
        equipment: [
          {
            id: "JL518-0009d80670fc",
            type: "PASSENGER_COUNTER",
            apcSystem: "Telia",
          },
        ],
      },
    ]);
    const message = createMockMessage(
      vehicleData,
      "persistent://apc-sandbox/source/vehicle-catalogue-fi-jyvaskyla"
    );

    update(message);

    expect(countingSystemMap.size).toBe(1);
    expect(countingSystemMap.get("jl518-0009d80670fc")).toEqual([
      "fi:jyvaskyla:6714_518",
      "Telia",
    ]);
    expect(
      includedVehicles.has("fi:jyvaskyla:6714_518" as UniqueVehicleId)
    ).toBe(true);
  });

  test("handles topic with different feedPublisherId", () => {
    const countingSystemMap: CountingSystemMap = new Map();
    const includedVehicles = new Set<UniqueVehicleId>();

    const { update } = createVehicleRegistryHandler(
      logger,
      countingSystemMap,
      includedVehicles
    );

    const vehicleData = JSON.stringify([
      {
        operatorId: "44517",
        vehicleShortName: "6",
        equipment: [
          {
            id: "KL006-0009d8066d7c",
            type: "PASSENGER_COUNTER",
            apcSystem: "Telia",
          },
        ],
      },
    ]);
    const message = createMockMessage(
      vehicleData,
      "persistent://apc-sandbox/source/vehicle-catalogue-fi-kuopio"
    );

    update(message);

    expect(countingSystemMap.size).toBe(1);
    expect(countingSystemMap.get("kl006-0009d8066d7c")).toEqual([
      "fi:kuopio:44517_6",
      "Telia",
    ]);
    expect(includedVehicles.has("fi:kuopio:44517_6" as UniqueVehicleId)).toBe(
      true
    );
  });

  test("does not update map when topic name has no vehicle-catalogue prefix", () => {
    const countingSystemMap: CountingSystemMap = new Map();
    const includedVehicles = new Set<UniqueVehicleId>();

    const { update } = createVehicleRegistryHandler(
      logger,
      countingSystemMap,
      includedVehicles
    );

    const vehicleData = JSON.stringify([
      {
        operatorId: "6714",
        vehicleShortName: "518",
        equipment: [
          { id: "JL518-APC", type: "PASSENGER_COUNTER", apcSystem: "Telia" },
        ],
      },
    ]);
    const message = createMockMessage(
      vehicleData,
      "persistent://apc-sandbox/source/some-other-topic"
    );

    update(message);

    expect(countingSystemMap.size).toBe(0);
    expect(includedVehicles.size).toBe(0);
  });
});
