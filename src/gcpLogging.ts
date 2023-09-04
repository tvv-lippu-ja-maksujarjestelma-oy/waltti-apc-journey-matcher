import pino from "pino";

/**
 * If https://github.com/googleapis/nodejs-logging/issues/875 is solved
 * satisfactorily, this module can be simplified or removed.
 *
 * More context in
 * https://github.com/tvv-lippu-ja-maksujarjestelma-oy/waltti-apc/issues/344 .
 */

/**
 * Copied from
 * https://cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry#logseverity
 * on 2023-08-31.
 *
 * DEFAULT (0) The log entry has no assigned severity level.
 * DEBUG (100) Debug or trace information.
 * INFO (200) Routine information, such as ongoing status or performance.
 * NOTICE (300) Normal but significant events, such as start up, shut down, or a configuration change.
 * WARNING (400) Warning events might cause problems.
 * ERROR (500) Error events are likely to cause problems.
 * CRITICAL (600) Critical events cause more severe problems or outages.
 * ALERT (700) A person must take an action immediately.
 * EMERGENCY (800) One or more systems are unusable.
 */
export type GcpLogSeverity =
  | "DEFAULT"
  | "DEBUG"
  | "INFO"
  | "NOTICE"
  | "WARNING"
  | "ERROR"
  | "CRITICAL"
  | "ALERT"
  | "EMERGENCY";

export const changePinoLevelToGcpLogSeverity = (
  level: pino.LevelWithSilent
): GcpLogSeverity => {
  switch (level) {
    case "trace":
      return "DEBUG";
    case "debug":
      return "DEBUG";
    case "info":
      return "INFO";
    case "warn":
      return "WARNING";
    case "error":
      return "ERROR";
    case "fatal":
      return "CRITICAL";
    case "silent":
      return "DEFAULT";
    default:
      return "DEFAULT";
  }
};

/**
 * Modified from
 * https://github.com/googleapis/nodejs-logging/issues/875#issuecomment-690556487
 * on 2023-09-02.
 *
 * Use
 * https://cloud.google.com/error-reporting/docs/formatting-error-messages#json_representation
 * as reference.
 */
export const createLogger = <Options extends pino.LoggerOptions>(
  options: Options & { name: string },
  stream?: pino.DestinationStream
): pino.Logger<Options> =>
  pino(
    {
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: { paths: ["pid"], remove: true },
      // As logger is started before config is created, read the level from env.
      level: options.level ?? process.env["PINO_LOG_LEVEL"] ?? "info",
      // Specific to GCP.
      base: { serviceContext: { service: options.name } },
      // Specific to GCP.
      messageKey: "message",
      // Specific to GCP.
      formatters: {
        level(label: pino.Level): object {
          // `@type` property tells Error Reporting to track even if there is no
          // `stack_trace`
          const typeProperty =
            label === "error" || label === "fatal"
              ? {
                  "@type":
                    "type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent",
                }
              : {};
          return {
            level: label,
            severity: changePinoLevelToGcpLogSeverity(label),
            ...typeProperty,
          };
        },
        log(
          object: Record<string, unknown> & { err?: Error }
        ): Record<string, unknown> {
          const stackTrace = object.err?.stack;
          const stackProperty = stackTrace ? { stack_trace: stackTrace } : {};
          return {
            ...object,
            ...stackProperty,
          };
        },
      },
      // options must include name according to our type signature so no need to
      // add it separately.
      ...options,
    },
    stream ?? pino.destination({ sync: true })
  );
