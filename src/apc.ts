/**
 * Generated manually with https://app.quicktype.io/ on 2022-04-21 using
 * https://github.com/tvv-lippu-ja-maksujarjestelma-oy/waltti-apc-pilot-spec/blob/a5d2af5c1c92018540e4fc7bf39912d3ce6bd018/apc-from-vehicle.schema.json
 */

// To parse this data:
//
//   import { Convert, ApcMessage } from "./file";
//
//   const apcMessage = Convert.toApcMessage(json);
//
// These functions will throw an error if the JSON doesn't
// match the expected interface, even if the JSON is valid.

/**
 * A single message of automatic passenger counting (APC) data sent from a vehicle to a
 * centralized server. Inspired by the Helsinki Regional Transport Authority (HSL) APC
 * interface and the ITxPT APC specification.
 */
export interface ApcMessage {
  /**
   * A wrapper object for the APC message
   */
  APC: Apc;
}

/**
 * A wrapper object for the APC message
 */
export interface Apc {
  /**
   * An ID for the onboard APC system in one vehicle. Used to differentiate between different
   * sensor systems from different vendors in different vehicles. E.g.
   * 'vendor1-client2-apc-device3' or possibly a UUIDv4 string. Needs to be universally unique.
   */
  countingSystemId?: string;
  /**
   * UUIDv4 for each unique message
   */
  messageId?: string;
  /**
   * The SchemaVer version number of this JSON schema that this message follows. It must match
   * a published SchemaVer version number from the '$id' key of this JSON schema. A valid
   * value is for example '1-0-0' or '1-1-0'.
   */
  schemaVersion?: string;
  /**
   * A timestamp for when the data was generated. An ISO 8601 UTC timestamp in the strftime
   * format '%Y-%m-%dT%H:%M:%S.%fZ' where '%f' means milliseconds zero-padded on the left. A
   * valid value would be e.g. '2021-11-22T10:57:08.647Z'. Use 24-hour linear smear from noon
   * to noon UTC for leap seconds, like Google: https://developers.google.com/time/smear .
   */
  tst: Date;
  /**
   * A JSON version of combining ITxPT PassengerDoorCount with PassengerVehicleCount. The
   * format originates from HSL.
   */
  vehiclecounts?: Vehiclecounts;
}

/**
 * A JSON version of combining ITxPT PassengerDoorCount with PassengerVehicleCount. The
 * format originates from HSL.
 */
export interface Vehiclecounts {
  /**
   * Information on the quality of counting
   */
  countquality?: Countquality;
  /**
   * JSON version of ITxPT PassengerDoorCount
   */
  doorcounts?: Doorcount[];
  /**
   * Number of passengers on-board. Matches ITxPT VehicleOccupancy.
   */
  vehicleload?: number;
}

/**
 * Information on the quality of counting
 */
export enum Countquality {
  Defect = "defect",
  Other = "other",
  Regular = "regular",
}

export interface Doorcount {
  /**
   * JSON version of ITxPT PassengerCounting
   */
  count: Count[];
  /**
   * Identification of the door. The door closest to the front of the vehicle is 'door1'. The
   * next door is 'door2' etc.
   */
  door: string;
}

export interface Count {
  /**
   * Information on the passenger type
   */
  class?: Class;
  /**
   * Number of passengers having boarded
   */
  in: number;
  /**
   * Number of passengers having alighted
   */
  out: number;
}

/**
 * Information on the passenger type
 */
export enum Class {
  Adult = "adult",
  Bike = "bike",
  Child = "child",
  Other = "other",
  Pram = "pram",
  Wheelchair = "wheelchair",
}

// Converts JSON strings to/from your types
// and asserts the results of JSON.parse at runtime
export class Convert {
  public static toApcMessage(json: string): ApcMessage {
    return cast(JSON.parse(json), r("ApcMessage"));
  }

  public static apcMessageToJson(value: ApcMessage): string {
    return JSON.stringify(uncast(value, r("ApcMessage")), null, 2);
  }
}

function invalidValue(typ: any, val: any, key: any = ""): never {
  if (key) {
    throw Error(
      `Invalid value for key "${key}". Expected type ${JSON.stringify(
        typ
      )} but got ${JSON.stringify(val)}`
    );
  }
  throw Error(
    `Invalid value ${JSON.stringify(val)} for type ${JSON.stringify(typ)}`
  );
}

function jsonToJSProps(typ: any): any {
  if (typ.jsonToJS === undefined) {
    const map: any = {};
    typ.props.forEach((p: any) => (map[p.json] = { key: p.js, typ: p.typ }));
    typ.jsonToJS = map;
  }
  return typ.jsonToJS;
}

function jsToJSONProps(typ: any): any {
  if (typ.jsToJSON === undefined) {
    const map: any = {};
    typ.props.forEach((p: any) => (map[p.js] = { key: p.json, typ: p.typ }));
    typ.jsToJSON = map;
  }
  return typ.jsToJSON;
}

function transform(val: any, typ: any, getProps: any, key: any = ""): any {
  function transformPrimitive(typ: string, val: any): any {
    if (typeof typ === typeof val) return val;
    return invalidValue(typ, val, key);
  }

  function transformUnion(typs: any[], val: any): any {
    // val must validate against one typ in typs
    const l = typs.length;
    for (let i = 0; i < l; i++) {
      const typ = typs[i];
      try {
        return transform(val, typ, getProps);
      } catch (_) {}
    }
    return invalidValue(typs, val);
  }

  function transformEnum(cases: string[], val: any): any {
    if (cases.indexOf(val) !== -1) return val;
    return invalidValue(cases, val);
  }

  function transformArray(typ: any, val: any): any {
    // val must be an array with no invalid elements
    if (!Array.isArray(val)) return invalidValue("array", val);
    return val.map((el) => transform(el, typ, getProps));
  }

  function transformDate(val: any): any {
    if (val === null) {
      return null;
    }
    const d = new Date(val);
    if (isNaN(d.valueOf())) {
      return invalidValue("Date", val);
    }
    return d;
  }

  function transformObject(
    props: { [k: string]: any },
    additional: any,
    val: any
  ): any {
    if (val === null || typeof val !== "object" || Array.isArray(val)) {
      return invalidValue("object", val);
    }
    const result: any = {};
    Object.getOwnPropertyNames(props).forEach((key) => {
      const prop = props[key];
      const v = Object.prototype.hasOwnProperty.call(val, key)
        ? val[key]
        : undefined;
      result[prop.key] = transform(v, prop.typ, getProps, prop.key);
    });
    Object.getOwnPropertyNames(val).forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(props, key)) {
        result[key] = transform(val[key], additional, getProps, key);
      }
    });
    return result;
  }

  if (typ === "any") return val;
  if (typ === null) {
    if (val === null) return val;
    return invalidValue(typ, val);
  }
  if (typ === false) return invalidValue(typ, val);
  while (typeof typ === "object" && typ.ref !== undefined) {
    typ = typeMap[typ.ref];
  }
  if (Array.isArray(typ)) return transformEnum(typ, val);
  if (typeof typ === "object") {
    return typ.hasOwnProperty("unionMembers")
      ? transformUnion(typ.unionMembers, val)
      : typ.hasOwnProperty("arrayItems")
      ? transformArray(typ.arrayItems, val)
      : typ.hasOwnProperty("props")
      ? transformObject(getProps(typ), typ.additional, val)
      : invalidValue(typ, val);
  }
  // Numbers can be parsed by Date but shouldn't be.
  if (typ === Date && typeof val !== "number") return transformDate(val);
  return transformPrimitive(typ, val);
}

function cast<T>(val: any, typ: any): T {
  return transform(val, typ, jsonToJSProps);
}

function uncast<T>(val: T, typ: any): any {
  return transform(val, typ, jsToJSONProps);
}

function a(typ: any) {
  return { arrayItems: typ };
}

function u(...typs: any[]) {
  return { unionMembers: typs };
}

function o(props: any[], additional: any) {
  return { props, additional };
}

// @ts-ignore
function m(additional: any) {
  return { props: [], additional };
}

function r(name: string) {
  return { ref: name };
}

const typeMap: any = {
  ApcMessage: o([{ json: "APC", js: "APC", typ: r("Apc") }], false),
  Apc: o(
    [
      {
        json: "countingSystemId",
        js: "countingSystemId",
        typ: u(undefined, ""),
      },
      { json: "messageId", js: "messageId", typ: u(undefined, "") },
      { json: "schemaVersion", js: "schemaVersion", typ: u(undefined, "") },
      { json: "tst", js: "tst", typ: Date },
      {
        json: "vehiclecounts",
        js: "vehiclecounts",
        typ: u(undefined, r("Vehiclecounts")),
      },
    ],
    "any"
  ),
  Vehiclecounts: o(
    [
      {
        json: "countquality",
        js: "countquality",
        typ: u(undefined, r("Countquality")),
      },
      {
        json: "doorcounts",
        js: "doorcounts",
        typ: u(undefined, a(r("Doorcount"))),
      },
      { json: "vehicleload", js: "vehicleload", typ: u(undefined, 0) },
    ],
    "any"
  ),
  Doorcount: o(
    [
      { json: "count", js: "count", typ: a(r("Count")) },
      { json: "door", js: "door", typ: "" },
    ],
    "any"
  ),
  Count: o(
    [
      { json: "class", js: "class", typ: u(undefined, r("Class")) },
      { json: "in", js: "in", typ: 0 },
      { json: "out", js: "out", typ: 0 },
    ],
    false
  ),
  Countquality: ["defect", "other", "regular"],
  Class: ["adult", "bike", "child", "other", "pram", "wheelchair"],
};
