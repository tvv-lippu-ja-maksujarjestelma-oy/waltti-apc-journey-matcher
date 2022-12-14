import pino from "pino";
import Pulsar from "pulsar-client";
import type { CountingSystemMap, ProcessingConfig } from "./config";
import {
  extractVehiclesFromCountingSystemMap,
  getUniqueVehicleId,
  initializeMatching,
} from "./matching";
import { transit_realtime } from "./protobuf/gtfsRealtime";
import * as matchedApc from "./quicktype/matchedApc";
import * as stringentApc from "./quicktype/stringentApc";

test("Extracting vehicles from a valid counting system map succeeds", () => {
  const countingSystemMap: CountingSystemMap = new Map([
    ["CountingSystemFoo", ["VehicleBar", "VendorBaz"]],
    ["CountingSystem2", ["Vehicle2", "Vendor2"]],
  ]);
  const uniqueVehicleIds = ["VehicleBar", "Vehicle2"];
  expect(extractVehiclesFromCountingSystemMap(countingSystemMap)).toStrictEqual(
    uniqueVehicleIds
  );
});

test("Getting the unique vehicle ID from a valid FeedEntity succeeds", () => {
  const entity: transit_realtime.IFeedEntity = {
    id: "44517_160",
    vehicle: {
      trip: {
        tripId: "Talvikausi_Koulp_4_0_180300_183700_1",
        startTime: "18:03:00",
        startDate: "20221102",
        scheduleRelationship:
          transit_realtime.TripDescriptor.ScheduleRelationship.SCHEDULED,
        routeId: "4",
        directionId: 0,
      },
      position: {
        latitude: 62.8871765,
        longitude: 27.6281261,
        bearing: 270,
        speed: 8.72222233,
      },
      currentStopSequence: 23,
      currentStatus:
        transit_realtime.VehiclePosition.VehicleStopStatus.IN_TRANSIT_TO,
      timestamp: 1667406730,
      congestionLevel:
        transit_realtime.VehiclePosition.CongestionLevel
          .UNKNOWN_CONGESTION_LEVEL,
      stopId: "201548",
      vehicle: {
        id: "44517_160",
        // Real example. Not in UTF-8.
        label: "NeulamÃ¤ki",
        licensePlate: "JLJ-160",
      },
    },
  };
  const feedPublisherId = "fi:kuopio";
  const uniqueVehicleId = "fi:kuopio:44517_160";
  expect(getUniqueVehicleId(entity, feedPublisherId)).toBe(uniqueVehicleId);
});

const mockPulsarMessage = ({
  topic,
  buffer,
  eventTimestamp,
}: {
  topic: string;
  buffer: Buffer;
  eventTimestamp: number;
}): Pulsar.Message => {
  const message = Object.defineProperties(new Pulsar.Message(), {
    getData: {
      value: () => buffer,
      writable: true,
    },
    getEventTimestamp: {
      value: () => eventTimestamp,
      writable: true,
    },
    getTopicName: {
      value: () => topic,
      writable: true,
    },
  });
  return message;
};

const mockApcMessage = ({
  topic,
  content,
  eventTimestamp,
}: {
  topic: string;
  content: stringentApc.StringentApcMessage;
  eventTimestamp: number;
}): Pulsar.Message => {
  const buffer = Buffer.from(
    stringentApc.Convert.stringentApcMessageToJson(content),
    "utf8"
  );
  return mockPulsarMessage({ topic, buffer, eventTimestamp });
};

const mockGtfsrtMessage = ({
  topic,
  content,
  eventTimestamp,
}: {
  topic: string;
  content: transit_realtime.IFeedMessage;
  eventTimestamp: number;
}): Pulsar.Message => {
  const verificationErrorMessage = transit_realtime.FeedMessage.verify(content);
  if (verificationErrorMessage) {
    throw Error(verificationErrorMessage);
  }
  const buffer = Buffer.from(
    transit_realtime.FeedMessage.encode(
      transit_realtime.FeedMessage.create(content)
    ).finish()
  );
  transit_realtime.FeedMessage.decode(buffer);
  return mockPulsarMessage({ topic, buffer, eventTimestamp });
};

const mockMatchedApcPulsarProducerMessage = ({
  content,
  eventTimestamp,
}: {
  content: matchedApc.MatchedApc;
  eventTimestamp: number;
}): Pulsar.ProducerMessage => ({
  data: Buffer.from(matchedApc.Convert.matchedApcToJson(content), "utf8"),
  eventTimestamp,
});

test("initializeMatching", () => {
  const logger = pino({
    name: "tester",
    timestamp: pino.stdTimeFunctions.isoTime,
  });
  const config: ProcessingConfig = {
    apcWaitInSeconds: 6,
    countingSystemMap: new Map([
      ["device1", ["fi:kuopio:44517_160", "Vendor1"]],
      ["device2", ["fi:kuopio:44517_6", "Vendor1"]],
      ["device3", ["fi:jyvaskyla:6714_523", "Vendor1"]],
      ["device4", ["fi:jyvaskyla:6714_518", "Vendor1"]],
      ["system160", ["fi:kuopio:44517_160", "Vendor2"]],
    ]),
    feedMap: new Map([
      [
        "persistent://tenant/namespace/gtfs-realtime-vp-fi-kuopio",
        ["fi:kuopio", "Europe/Helsinki"],
      ],
      [
        "persistent://tenant/namespace/gtfs-realtime-vp-fi-jyvaskyla",
        ["fi:jyvaskyla", "Europe/Helsinki"],
      ],
    ]),
  };
  const apcMessage1 = mockApcMessage({
    topic: "persistent://tenant/namespace/apc",
    content: {
      APC: {
        countingSystemId: "device1",
        messageId: "66fc04a9-0adf-475e-af5c-ea0e10fa7fbe",
        schemaVersion: "1-1-0",
        tst: "2022-11-02T18:32:01.599Z",
        vehiclecounts: {
          countquality: stringentApc.Countquality.Regular,
          doorcounts: [
            {
              door: "1",
              count: [{ class: stringentApc.Class.Adult, in: 1, out: 0 }],
            },
            {
              door: "2",
              count: [{ class: stringentApc.Class.Adult, in: 0, out: 0 }],
            },
            {
              door: "3",
              count: [{ class: stringentApc.Class.Adult, in: 0, out: 0 }],
            },
          ],
        },
      },
    },
    eventTimestamp: 1667413923789,
  });
  const apcMessage2 = mockApcMessage({
    topic: "persistent://tenant/namespace/apc",
    content: {
      APC: {
        countingSystemId: "device1",
        messageId: "06915913-7939-493f-b820-bfd7bc8f0614",
        schemaVersion: "1-1-0",
        tst: "2022-11-02T18:32:06.001Z",
        vehiclecounts: {
          countquality: stringentApc.Countquality.Regular,
          doorcounts: [
            {
              door: "1",
              count: [{ class: stringentApc.Class.Adult, in: 1, out: 0 }],
            },
            {
              door: "2",
              count: [{ class: stringentApc.Class.Adult, in: 0, out: 0 }],
            },
            {
              door: "3",
              count: [{ class: stringentApc.Class.Adult, in: 0, out: 0 }],
            },
          ],
        },
      },
    },
    eventTimestamp: 1667413927456,
  });
  const gtfsrtMessage = mockGtfsrtMessage({
    topic: "persistent://tenant/namespace/gtfs-realtime-vp-fi-kuopio",
    content: {
      header: {
        gtfsRealtimeVersion: "2.0",
        incrementality: transit_realtime.FeedHeader.Incrementality.FULL_DATASET,
        timestamp: 1667413936,
      },
      entity: [
        {
          id: "44517_160",
          vehicle: {
            trip: {
              tripId: "Talvikausi_Koulp_4_0_180300_183700_1",
              startTime: "18:03:00",
              startDate: "20221102",
              scheduleRelationship:
                transit_realtime.TripDescriptor.ScheduleRelationship.SCHEDULED,
              routeId: "4",
              directionId: 0,
            },
            position: {
              latitude: 62.8871765,
              longitude: 27.6281261,
              bearing: 270,
              speed: 8.72222233,
            },
            // Scheduled to happen at 18:32.
            currentStopSequence: 23,
            currentStatus:
              transit_realtime.VehiclePosition.VehicleStopStatus.IN_TRANSIT_TO,
            timestamp: 1667406730,
            congestionLevel:
              transit_realtime.VehiclePosition.CongestionLevel
                .UNKNOWN_CONGESTION_LEVEL,
            stopId: "201548",
            vehicle: {
              id: "44517_160",
              // Real example. Encoding is not UTF-8.
              label: "NeulamÃ¤ki",
              licensePlate: "JLJ-160",
            },
          },
        },
      ],
    },
    eventTimestamp: 1667413937123,
  });
  const expectedApcMessage = mockMatchedApcPulsarProducerMessage({
    content: {
      countQuality: "regular",
      countingVendorName: "Vendor1",
      directionId: 0,
      doorClassCounts: [{ countClass: "adult", doorName: "1", in: 2, out: 0 }],
      feedPublisherId: "fi:kuopio",
      routeId: "4",
      startDate: "20221102",
      startTime: "18:03:00",
      stopId: "201548",
      stopSequence: 23,
      timezoneName: "Europe/Helsinki",
      tripId: "Talvikausi_Koulp_4_0_180300_183700_1",
    },
    eventTimestamp: 1667413927456,
  });
  const { updateApcCache, expandWithApcAndSend } = initializeMatching(
    logger,
    config
  );
  updateApcCache(apcMessage1);
  updateApcCache(apcMessage2);
  expandWithApcAndSend(gtfsrtMessage, (matchedApcMessage) => {
    expect(matchedApcMessage).toStrictEqual(expectedApcMessage);
  });
});
