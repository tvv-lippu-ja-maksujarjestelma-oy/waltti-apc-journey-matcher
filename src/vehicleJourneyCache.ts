import type { UniqueVehicleId } from "./config";
import type { transit_realtime } from "./protobuf/gtfsRealtime";

type VehicleJourneyKey = UniqueVehicleId;

export interface VehicleJourney {
  directionId: number;
  feedPublisherId: string;
  routeId: string;
  startDate: Date;
  startTime: string;
  stopId: string;
  stopSequence: number;
  timezoneName: string;
  tripId: string;
}

type VehicleJourneyCache = Map<VehicleJourneyKey, VehicleJourney>;

const parseDate = (dateString: string | null | undefined): Date | undefined => {
  let result;
  if (dateString != null && dateString.length === 8) {
    const timestamp = Date.parse(
      `${dateString.slice(0, 4)}-${dateString.slice(4, 6)}-${dateString.slice(
        6,
        8
      )}T12:00:00.000Z`
    );
    if (!Number.isNaN(timestamp)) {
      result = new Date(timestamp);
    }
  }
  return result;
};

export const formVehicleJourney = (
  entity: transit_realtime.IFeedEntity,
  {
    feedPublisherId,
    timezoneName,
  }: { feedPublisherId: string; timezoneName: string }
): VehicleJourney | undefined => {
  let result;
  const { vehicle } = entity;
  const trip = vehicle?.trip;
  const directionId = trip?.directionId;
  const routeId = trip?.routeId;
  const startDate = parseDate(trip?.startDate);
  const startTime = trip?.startTime;
  const stopId = vehicle?.stopId;
  const stopSequence = vehicle?.currentStopSequence;
  const tripId = trip?.tripId;
  if (
    directionId != null &&
    routeId != null &&
    startDate != null &&
    startTime != null &&
    stopId != null &&
    stopSequence != null &&
    tripId != null
  ) {
    result = {
      directionId,
      feedPublisherId,
      routeId,
      startDate,
      startTime,
      stopId,
      stopSequence,
      timezoneName,
      tripId,
    };
  }
  return result;
};

export const createVehicleJourneyCache = (): VehicleJourneyCache =>
  new Map<VehicleJourneyKey, VehicleJourney>();
