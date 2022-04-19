const transformUnknownToError = (x: unknown) =>
  x instanceof Error ? x : new Error(String(x));

export default transformUnknownToError;
