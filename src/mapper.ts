import type pino from "pino";
import type Pulsar from "pulsar-client";
import * as apc from "./apc";
import type { MapperConfig } from "./config";
import root from "./gtfsRealtime";

// Modified from waltti-apc-aggregation-test-data-generator.
export interface TripDetails {
  feedPublisherId: string;
  tripId: string;
  startDate: string;
  startTime: string;
  routeId: string;
  directionId: number;
  timezoneName: string;
  stopId: string;
  stopSequence: number;
}

export interface VehicleTripDetails {
  vehicleId: string;
  tripDetails: TripDetails;
}

export type CountClass =
  | "adult"
  | "child"
  | "pram"
  | "bike"
  | "wheelchair"
  | "other";

export interface DoorClassCount {
  doorNumber: number;
  countClass: CountClass;
  in: number;
  out: number;
}

export interface DoorClassCountTop {
  countingVendorName: string;
  doorClassCounts: DoorClassCount[];
}

export interface ApcVendorEvent {
  countingSystemId: string;
  counts: DoorClassCountTop;
}

export type AugmentedApcEvent = TripDetails & DoorClassCountTop;

/**
 * Transform date string from YYYYMMDD to YYYY-MM-DD.
 */
const hyphenateDateString = (s: string): string =>
  `${s.substring(0, 4)}-${s.substring(4, 6)}-${s.substring(6, 8)}`;

const createMapper = (
  logger: pino.Logger,
  { feedPublisherId, timezoneName, countingSystemToVehicleMap }: MapperConfig
) => {
  const recentTripDetails = new Map<string, TripDetails>();
  const matchableCountingSystems = new Set(countingSystemToVehicleMap.keys());
  const matchableVehicles = new Set(countingSystemToVehicleMap.values());

  const getVehicleTripDetails = (
    gtfsrtMessage: Pulsar.Message
  ): VehicleTripDetails[] => {
    const buffer = gtfsrtMessage.getData();
    const feedMessage = root.transit_realtime.FeedMessage.decode(buffer);
    const arr = (feedMessage?.entity ?? [])
      .map((entity): VehicleTripDetails | undefined => {
        const vehiclePosition = entity?.vehicle;
        const vehicleId = vehiclePosition?.vehicle?.id;
        if (vehicleId == null || !matchableVehicles.has(vehicleId)) {
          return undefined;
        }
        const trip = vehiclePosition?.trip;
        const startDateRaw = trip?.startDate;
        const startDate =
          startDateRaw == null ? undefined : hyphenateDateString(startDateRaw);
        const tripDetails = {
          feedPublisherId,
          tripId: trip?.tripId,
          startDate,
          startTime: trip?.startTime,
          routeId: trip?.routeId,
          directionId: trip?.directionId,
          timezoneName,
          stopId: vehiclePosition?.stopId,
          stopSequence: vehiclePosition?.currentStopSequence,
        };
        if (Object.values(tripDetails).some((value) => value == null)) {
          return undefined;
        }
        return {
          vehicleId,
          // values() check ensured that tripDetails cannot contain null or
          // undefined values.
          tripDetails: tripDetails as TripDetails,
        };
      })
      .filter((vtd) => vtd !== undefined);
    // filter() removed undefined elements.
    return arr as VehicleTripDetails[];
  };

  const getCountingVendorName = (
    apcMessage: Pulsar.Message
  ): string | undefined => {
    const properties = apcMessage.getProperties();
    const mqttTopic = properties?.["mqttTopic"];
    const topicParts = mqttTopic?.split("/");
    if (
      topicParts === undefined ||
      topicParts.length < 6 ||
      topicParts.length > 7
    ) {
      logger.error(
        { message: apcMessage },
        "APC message does not have property 'mqttTopic' of the expected form"
      );
      return undefined;
    }
    // connection-status messages have length 7.
    if (topicParts.length > 6) {
      return undefined;
    }
    const countingVendorName = topicParts[4];
    if (countingVendorName === undefined) {
      logger.error(
        { message: apcMessage },
        "APC message does not have property 'mqttTopic' of the expected form"
      );
      return undefined;
    }
    return countingVendorName;
  };

  const getApcVendorEvent = (
    apcMessage: Pulsar.Message
  ): ApcVendorEvent | undefined => {
    const countingVendorName = getCountingVendorName(apcMessage);
    if (countingVendorName === undefined) {
      return undefined;
    }
    const buffer = apcMessage.getData();
    const decoded = apc.Convert.toApcMessage(buffer.toString("utf8"));
    const { countingSystemId } = decoded.APC;
    if (
      countingSystemId === undefined ||
      !matchableCountingSystems.has(countingSystemId)
    ) {
      return undefined;
    }
    const doorClassCounts = decoded.APC.vehiclecounts?.doorcounts?.flatMap(
      (doorCount): DoorClassCount[] => {
        const doorNumber = parseInt(doorCount.door.substring(3), 10);
        return (
          doorCount.count
            .map((count): DoorClassCount | undefined => {
              const countClass = count.class;
              if (countClass === undefined) {
                logger.error({ message: apcMessage }, "Count class is missing");
                return undefined;
              }
              return {
                doorNumber,
                countClass,
                in: count.in,
                out: count.out,
              };
            })
            // filter() ensures there are no undefined elements.
            .filter((dcc) => dcc !== undefined) as DoorClassCount[]
        );
      }
    );
    if (doorClassCounts === undefined) {
      logger.error(
        { message: apcMessage },
        "Cannot build doorClassCounts from apcMessage"
      );
      return undefined;
    }
    return {
      countingSystemId,
      counts: {
        countingVendorName,
        doorClassCounts,
      },
    };
  };

  const updateTripDetails = (gtfsrtMessage: Pulsar.Message): void => {
    getVehicleTripDetails(gtfsrtMessage).forEach(
      ({ vehicleId, tripDetails }) => {
        recentTripDetails.set(vehicleId, tripDetails);
      }
    );
  };

  const augmentWithTripDetails = (
    apcMessage: Pulsar.Message
  ): AugmentedApcEvent | undefined => {
    const apcVendorEvent = getApcVendorEvent(apcMessage);
    if (apcVendorEvent === undefined) {
      return undefined;
    }
    const tripDetails = recentTripDetails.get(apcVendorEvent.countingSystemId);
    // The counting system is installed for another feed publisher.
    if (tripDetails === undefined) {
      return undefined;
    }
    return { ...tripDetails, ...apcVendorEvent.counts };
  };

  return { updateTripDetails, augmentWithTripDetails };
};

export default createMapper;
