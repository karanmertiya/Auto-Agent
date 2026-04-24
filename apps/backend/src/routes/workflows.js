import { Router } from "express";

import { createWorkflow, getWorkflowById } from "../services/workflowService.js";

export const workflowsRouter = Router();

workflowsRouter.post("/", async (req, res, next) => {
  try {
    const workflow = await createWorkflow(req.body);
    res.status(201).json({ workflow });
  } catch (error) {
    next(error);
  }
});

workflowsRouter.get("/:id", async (req, res, next) => {
  try {
    const workflow = await getWorkflowById(req.params.id);

    if (!workflow) {
      return res.status(404).json({ error: "Workflow not found." });
    }

    return res.json({ workflow });
  } catch (error) {
    return next(error);
  }
});

