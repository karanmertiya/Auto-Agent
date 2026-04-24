import { z } from "zod";

import { supabase } from "../lib/supabase.js";
import { validateWorkflowGraph } from "../utils/workflowGraph.js";

const createWorkflowSchema = z.object({
  userEmail: z.string().email().default("demo@workflow.local"),
  workflowJson: z.object({
    nodes: z.array(z.record(z.any())),
    edges: z.array(z.record(z.any()))
  }),
  status: z.string().default("draft")
});

async function ensureUser(userEmail) {
  const { data, error } = await supabase
    .from("users")
    .upsert({ email: userEmail }, { onConflict: "email" })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function createWorkflow(payload) {
  const parsed = createWorkflowSchema.parse(payload);
  validateWorkflowGraph(parsed.workflowJson);
  const user = await ensureUser(parsed.userEmail);

  const { data, error } = await supabase
    .from("workflows")
    .insert({
      user_id: user.id,
      workflow_json: parsed.workflowJson,
      status: parsed.status
    })
    .select("id, user_id, workflow_json, status, created_at, updated_at")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function getWorkflowById(workflowId) {
  const { data, error } = await supabase
    .from("workflows")
    .select("id, user_id, workflow_json, status, created_at, updated_at")
    .eq("id", workflowId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateWorkflowStatus(workflowId, status) {
  const { data, error } = await supabase
    .from("workflows")
    .update({ status })
    .eq("id", workflowId)
    .select("id, status, updated_at")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

