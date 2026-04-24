import IORedis from "ioredis";
import { Queue } from "bullmq";

import { env } from "../config/env.js";

function buildRedisOptions(redisUrl) {
  const url = new URL(redisUrl);
  return {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    tls: url.protocol === "rediss:" ? {} : undefined
  };
}

export function createRedisConnection() {
  return new IORedis(env.REDIS_URL, buildRedisOptions(env.REDIS_URL));
}

export const workflowQueue = new Queue("workflow-jobs", {
  connection: createRedisConnection(),
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 500
  }
});

