import { Worker } from "bullmq";

import { createRedisConnection } from "./lib/queue.js";
import { logError, logInfo } from "./lib/logger.js";
import { runWorkflowJob } from "./services/executionService.js";

const worker = new Worker(
  "workflow-jobs",
  async (job) => {
    if (job.name !== "start_workflow") {
      throw new Error(`Unsupported job type "${job.name}".`);
    }

    return runWorkflowJob(job.data);
  },
  {
    connection: createRedisConnection(),
    concurrency: 2
  }
);

worker.on("completed", (job) => {
  logInfo("Workflow job completed", {
    jobId: job.id,
    workflowId: job.data.workflowId
  });
});

worker.on("failed", (job, error) => {
  logError("Workflow job failed", error, {
    jobId: job?.id,
    workflowId: job?.data?.workflowId
  });
});

logInfo("Workflow worker started");

