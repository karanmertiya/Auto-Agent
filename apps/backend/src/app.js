import cors from "cors";
import express from "express";

import { env } from "./config/env.js";
import { logError } from "./lib/logger.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { workflowsRouter } from "./routes/workflows.js";

export const app = express();
const allowedOrigins = env.FRONTEND_ORIGIN.split(",").map((origin) => origin.trim());

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin not allowed by CORS"));
    }
  })
);
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/workflows", workflowsRouter);
app.use("/api/webhooks", webhooksRouter);

app.use((error, _req, res, _next) => {
  logError("Unhandled API error", error);
  res.status(500).json({
    error: error instanceof Error ? error.message : "Internal server error"
  });
});
