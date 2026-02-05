#!/usr/bin/env node
/**
 * Decode GTFS Realtime (Vehicle Position) binary protobuf from stdin or a file
 * and print JSON to stdout.
 *
 * Usage:
 *   curl -s "https://data.waltti.fi/jyvaskyla/api/gtfsrealtime/v1.0/feed/vehicleposition" | node dist/scripts/decode-gtfsrt.js
 *   node dist/scripts/decode-gtfsrt.js path/to/feed.bin
 *
 * Build first: npm run build
 */

import { readFileSync } from "fs";
import { stdin } from "process";
import { transit_realtime } from "../protobuf/gtfsRealtime";

function readStdin(): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stdin.on("data", (chunk: Buffer | string) => {
      chunks.push(
        typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk
      );
    });
    stdin.on("end", () => resolve(Buffer.concat(chunks)));
    stdin.on("error", reject);
  });
}

async function main(): Promise<void> {
  let buffer: Buffer;
  const fileArg = process.argv[2];

  if (fileArg) {
    buffer = readFileSync(fileArg);
  } else {
    buffer = await readStdin();
  }

  if (buffer.length === 0) {
    process.stderr.write("No data (empty stdin or file)\n");
    process.exit(1);
  }

  try {
    const feed = transit_realtime.FeedMessage.decode(new Uint8Array(buffer));
    const json = feed.toJSON();
    process.stdout.write(JSON.stringify(json, null, 2));
  } catch (err: unknown) {
    process.stderr.write(`Decode failed: ${String(err)}\n`);
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
