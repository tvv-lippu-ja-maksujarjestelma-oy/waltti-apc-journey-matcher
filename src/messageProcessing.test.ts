import type pino from "pino";
import type Pulsar from "pulsar-client";
import type { ProcessingConfig } from "./config";
import keepProcessingMessages, {
  rewindVehicleRegistryConsumer,
} from "./messageProcessing";

const createMockLogger = (): pino.Logger =>
  ({
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  } as unknown as pino.Logger);

describe("rewindVehicleRegistryConsumer", () => {
  test("rewinds vehicle registry consumer to earliest available message", async () => {
    const logger = createMockLogger();
    const seek = jest.fn().mockResolvedValue(null);
    const consumer = {
      seek,
    } as unknown as Pulsar.Consumer;

    await expect(rewindVehicleRegistryConsumer(logger, consumer)).resolves.toBe(
      true
    );
    expect(seek).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  test("continues from current cursor when rewind fails", async () => {
    const logger = createMockLogger();
    const seekError = new Error("No such ledger exists on Bookies");
    const seek = jest.fn().mockRejectedValue(seekError);
    const consumer = {
      seek,
    } as unknown as Pulsar.Consumer;

    await expect(rewindVehicleRegistryConsumer(logger, consumer)).resolves.toBe(
      false
    );
    expect(seek).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      { err: seekError },
      "Could not rewind vehicle registry consumer; continuing from current cursor"
    );
  });
});

describe("keepProcessingMessages", () => {
  test("rejects when the GTFS-RT receive loop fails", async () => {
    const logger = createMockLogger();
    const receiveError = new Error("receive timeout");
    const config: ProcessingConfig = {
      apcWaitInSeconds: 6,
      gtfsrtReceiveTimeoutMs: 123000,
      countingSystemMap: new Map(),
      includedVehicles: new Set(),
      feedMap: new Map([
        [
          "persistent://tenant/namespace/splitted-gtfsrt-vp-fi-jyvaskyla",
          ["fi:jyvaskyla", "209", "Europe/Helsinki"],
        ],
      ]),
    };
    const producer = {} as unknown as Pulsar.Producer;
    const gtfsrtReceive = jest.fn().mockRejectedValue(receiveError);
    const gtfsrtConsumer = {
      receive: gtfsrtReceive,
    } as unknown as Pulsar.Consumer;
    const apcConsumer = {
      receive: jest.fn(
        () =>
          new Promise<Pulsar.Message>(() => {
            // Keep the APC loop pending so this test exercises GTFS-RT failure propagation.
          })
      ),
    } as unknown as Pulsar.Consumer;

    await expect(
      keepProcessingMessages(
        logger,
        producer,
        gtfsrtConsumer,
        apcConsumer,
        config
      )
    ).rejects.toBe(receiveError);

    expect(gtfsrtReceive).toHaveBeenCalledWith(123000);
    expect(logger.error).toHaveBeenCalledWith(
      { err: receiveError, receiveTimeoutMs: 123000 },
      "GTFS-RT consumer receive failed"
    );
  });
});
