import pino from "pino";
import Pulsar from "pulsar-client";
import type { CountingSystemMap, ProcessingConfig } from "./config";
import {
  calculateUtcStartTime,
  extractVehiclesFromCountingSystemMap,
  getCountingSystemIdFromMqttTopic,
  getUniqueVehicleId,
  initializeMatching,
} from "./matching";
import { transit_realtime } from "./protobuf/gtfsRealtime";
import * as matchedApc from "./quicktype/matchedApc";
import * as stringentApc from "./quicktype/stringentApc";

test("Extracting vehicles from a valid counting system map succeeds", () => {
  const countingSystemMap: CountingSystemMap = new Map([
    ["CountingSystemFoo", ["Authority2:VehicleBar", "VendorBaz"]],
    ["CountingSystem2", ["Authority5:Vehicle2", "Vendor2"]],
    ["CountingSystem3", ["Authority2:VehicleBar", "Vendor2"]],
  ]);
  const uniqueVehicleIds = new Set([
    "Authority2:VehicleBar",
    "Authority5:Vehicle2",
  ]);
  expect(extractVehiclesFromCountingSystemMap(countingSystemMap)).toStrictEqual(
    uniqueVehicleIds
  );
});

test("Calculating UTC start time from GTFS start during DST change succeeds", () => {
  const startDate = "20221030";
  const startTime = "01:31:23";
  const timezoneName = "Europe/Helsinki";
  const expected = "2022-10-29T23:31:23Z";
  expect(
    calculateUtcStartTime(startDate, startTime, timezoneName)
  ).toStrictEqual(expected);
});

test("Extracting countingSystemId from a valid MQTT topic succeeds", () => {
  const mqttTopic =
    "apc-from-vehicle/v1/fi/waltti/telia/luminator-telia-apc-00160";
  const result = "luminator-telia-apc-00160";
  expect(getCountingSystemIdFromMqttTopic(mqttTopic)).toStrictEqual(result);
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
  properties,
  buffer,
  eventTimestamp,
}: {
  topic: string;
  properties: { [key: string]: string };
  buffer: Buffer;
  eventTimestamp: number;
}): Pulsar.Message => {
  const message = Object.defineProperties(new Pulsar.Message(), {
    getProperties: {
      value: () => properties,
      writable: true,
    },
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

const mockStringentApcMessage = ({
  topic,
  properties,
  content,
  eventTimestamp,
}: {
  topic: string;
  properties: { [key: string]: string };
  content: stringentApc.StringentApcMessage;
  eventTimestamp: number;
}): Pulsar.Message => {
  const buffer = Buffer.from(
    stringentApc.Convert.stringentApcMessageToJson(content),
    "utf8"
  );
  return mockPulsarMessage({ topic, properties, buffer, eventTimestamp });
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
  return mockPulsarMessage({ topic, properties: {}, buffer, eventTimestamp });
};

const mockMatchedApcPulsarProducerMessage = ({
  properties,
  content,
  eventTimestamp,
}: {
  properties: { [key: string]: string };
  content: matchedApc.MatchedApc;
  eventTimestamp: number;
}): Pulsar.ProducerMessage => ({
  properties,
  data: Buffer.from(matchedApc.Convert.matchedApcToJson(content), "utf8"),
  eventTimestamp,
});

const decodeMatchedApcPulsarProducerMessage = (
  message: Pulsar.ProducerMessage
) => matchedApc.Convert.toMatchedApc(message.data.toString("utf8"));

// eslint-disable-next-line jest/no-done-callback
test("Match with results of initializeMatching", (done) => {
  const logger = pino(
    {
      name: "tester",
      timestamp: pino.stdTimeFunctions.isoTime,
      level: "info",
    },
    pino.destination({ sync: true })
  );
  jest.useFakeTimers({ doNotFake: ["performance"] });
  jest.spyOn(global, "setTimeout");

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
        ["fi:kuopio", "221", "Europe/Helsinki"],
      ],
      [
        "persistent://tenant/namespace/gtfs-realtime-vp-fi-jyvaskyla",
        ["fi:jyvaskyla", "209", "Europe/Helsinki"],
      ],
    ]),
  };
  const apcMessage1 = mockStringentApcMessage({
    topic: "persistent://tenant/namespace/apc",
    properties: {
      mqttTopic: "apc-from-vehicle/v1/fi/waltti/Vendor1/device1",
    },
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
  const apcMessage2 = mockStringentApcMessage({
    topic: "persistent://tenant/namespace/apc",
    properties: {
      mqttTopic: "apc-from-vehicle/v1/fi/waltti/Vendor1/device1",
    },
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
  const gtfsrtMessageBeforeStop = mockGtfsrtMessage({
    topic: "persistent://tenant/namespace/gtfs-realtime-vp-fi-kuopio",
    content: {
      header: {
        gtfsRealtimeVersion: "2.0",
        incrementality: transit_realtime.FeedHeader.Incrementality.FULL_DATASET,
        timestamp: 1667406730,
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
  const gtfsrtMessageAfterStop = mockGtfsrtMessage({
    topic: "persistent://tenant/namespace/gtfs-realtime-vp-fi-kuopio",
    content: {
      header: {
        gtfsRealtimeVersion: "2.0",
        incrementality: transit_realtime.FeedHeader.Incrementality.FULL_DATASET,
        timestamp: 1667406732,
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
              latitude: 62.8861765,
              longitude: 27.6283261,
              bearing: 271,
              speed: 8.62222233,
            },
            currentStopSequence: 24,
            currentStatus:
              transit_realtime.VehiclePosition.VehicleStopStatus.IN_TRANSIT_TO,
            timestamp: 1667406732,
            congestionLevel:
              transit_realtime.VehiclePosition.CongestionLevel
                .UNKNOWN_CONGESTION_LEVEL,
            // Fake stopId
            stopId: "123456",
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
    eventTimestamp: 1667413939023,
  });
  const expectedApcMessage = mockMatchedApcPulsarProducerMessage({
    properties: { topicSuffix: "221" },
    content: {
      schemaVersion: "1-0-0",
      authorityId: "221",
      timezoneName: "Europe/Helsinki",
      gtfsrtTripId: "Talvikausi_Koulp_4_0_180300_183700_1",
      gtfsrtStartDate: "2022-11-02",
      gtfsrtStartTime: "18:03:00",
      gtfsrtRouteId: "4",
      gtfsrtDirectionId: 0,
      gtfsrtCurrentStopSequence: 23,
      gtfsrtStopId: "201548",
      gtfsrtVehicleId: "44517_160",
      utcStartTime: "2022-11-02T16:03:00Z",
      countingDeviceId: "device1",
      countingVendorName: "Vendor1",
      countQuality: matchedApc.CountQuality.Regular,
      doorClassCounts: [
        {
          countClass: matchedApc.CountClass.Adult,
          doorName: "1",
          in: 2,
          out: 0,
        },
        {
          countClass: matchedApc.CountClass.Adult,
          doorName: "2",
          in: 0,
          out: 0,
        },
        {
          countClass: matchedApc.CountClass.Adult,
          doorName: "3",
          in: 0,
          out: 0,
        },
      ],
    },
    eventTimestamp: 1667413927456,
  });
  const callback1 = jest.fn();
  const callback2 = (matchedApcMessage: Pulsar.ProducerMessage) => {
    try {
      const received = decodeMatchedApcPulsarProducerMessage(matchedApcMessage);
      const expected =
        decodeMatchedApcPulsarProducerMessage(expectedApcMessage);
      expect(received).toStrictEqual(expected);
      done();
    } catch (error) {
      done(error);
    }
  };
  const spy = jest.spyOn({ f: callback2 }, "f");
  const { updateApcCache, expandWithApcAndSend } = initializeMatching(
    logger,
    config
  );

  updateApcCache(apcMessage1);
  updateApcCache(apcMessage2);
  expandWithApcAndSend(gtfsrtMessageBeforeStop, callback1);
  expandWithApcAndSend(gtfsrtMessageAfterStop, callback2);

  expect(spy).not.toHaveBeenCalled();
  jest.runAllTimers();
  expect(callback1).not.toHaveBeenCalled();
});
