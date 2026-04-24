const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

export function getWebhookUrl(workflowId) {
  return `${API_BASE_URL}/api/webhooks/${workflowId}`;
}

export async function saveWorkflow({ userEmail, workflowJson }) {
  const response = await fetch(`${API_BASE_URL}/api/workflows`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      userEmail,
      workflowJson,
      status: "draft"
    })
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error ?? "Failed to save workflow.");
  }

  return payload.workflow;
}

