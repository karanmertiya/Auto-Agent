export function logInfo(message, meta = {}) {
  console.log(
    JSON.stringify({
      level: "info",
      message,
      ...meta,
      timestamp: new Date().toISOString()
    })
  );
}

export function logError(message, error, meta = {}) {
  console.error(
    JSON.stringify({
      level: "error",
      message,
      error: error instanceof Error ? error.message : error,
      ...meta,
      timestamp: new Date().toISOString()
    })
  );
}

