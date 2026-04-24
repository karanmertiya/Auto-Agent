import { workflowQueue } from "../lib/queue.js";
import { logInfo } from "../lib/logger.js";
import { integrationRegistry } from "../integrations/index.js";
import { getWorkflowById, updateWorkflowStatus } from "./workflowService.js";
import { getOrderedWorkflowNodes, validateWorkflowGraph } from "../utils/workflowGraph.js";

export async function enqueueWorkflowStart({ workflowId, triggerPayload, workflowJson }) {
  const { orderedNodes } = validateWorkflowGraph(workflowJson);
  const job = await workflowQueue.add("start_workflow", {
    workflowId,
    triggerPayload,
    workflowJson,
    orderedNodeIds: orderedNodes.map((node) => node.id)
  });

  return job;
}

export async function runWorkflowJob({ workflowId, triggerPayload, workflowJson, orderedNodeIds }) {
  const workflow = workflowJson ? { id: workflowId, workflow_json: workflowJson } : await getWorkflowById(workflowId);

  if (!workflow) {
    throw new Error(`Workflow ${workflowId} was not found.`);
  }

  try {
    await updateWorkflowStatus(workflowId, "running");

    const orderedNodes = orderedNodeIds?.length
      ? orderedNodeIds
          .map((nodeId) => workflow.workflow_json.nodes.find((node) => node.id === nodeId))
          .filter(Boolean)
      : getOrderedWorkflowNodes(workflow.workflow_json);

    const state = {
      triggerPayload,
      results: []
    };

    for (const node of orderedNodes) {
      if (node.type !== "action") {
        continue;
      }

      const actionName = node.data?.actionType;
      const providerName = node.data?.provider ?? "mock";
      const provider = integrationRegistry.getProvider(providerName);

      logInfo("Executing workflow node", {
        workflowId,
        nodeId: node.id,
        actionName,
        providerName
      });

      const result = await integrationRegistry.executeAction(actionName, {
        workflowId,
        node,
        provider,
        triggerPayload,
        previousResult: state.results.at(-1) ?? null,
        state
      });

      state.results.push({
        nodeId: node.id,
        actionName,
        providerName,
        result
      });
    }

    await updateWorkflowStatus(workflowId, "completed");
    return state;
  } catch (error) {
    await updateWorkflowStatus(workflowId, "failed");
    throw error;
  }
}
