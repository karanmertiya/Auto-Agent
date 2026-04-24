import { Router } from "express";

import { enqueueWorkflowStart } from "../services/executionService.js";
import { getWorkflowById } from "../services/workflowService.js";

export const webhooksRouter = Router();

webhooksRouter.post("/:workflowId", async (req, res, next) => {
  try {
    const workflow = await getWorkflowById(req.params.workflowId);

    if (!workflow) {
      return res.status(404).json({ error: "Workflow not found." });
    }

    const job = await enqueueWorkflowStart({
      workflowId: workflow.id,
      workflowJson: workflow.workflow_json,
      triggerPayload: {
        body: req.body,
        headers: req.headers,
        query: req.query
      }
    });

    return res.status(202).json({
      accepted: true,
      workflowId: workflow.id,
      jobId: job.id
    });
  } catch (error) {
    return next(error);
  }
});

