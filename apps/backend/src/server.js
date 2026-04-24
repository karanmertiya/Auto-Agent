import { app } from "./app.js";
import { env } from "./config/env.js";
import { logInfo } from "./lib/logger.js";

app.listen(env.PORT, () => {
  logInfo("API server listening", { port: env.PORT });
});

