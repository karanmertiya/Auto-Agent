import { env } from "../config/env.js";
import { mockFetchData, mockSendEmail } from "../jobs/actions.js";
import { IntegrationRegistry } from "./registry.js";

export const integrationRegistry = new IntegrationRegistry();

integrationRegistry.registerProvider("mock", {
  name: "Mock Provider",
  apiKey: "local-dev"
});

integrationRegistry.registerProvider("slack", {
  name: "Slack",
  apiKey: env.SLACK_BOT_TOKEN
});

integrationRegistry.registerProvider("github", {
  name: "GitHub",
  apiKey: env.GITHUB_TOKEN
});

integrationRegistry.registerAction("fetch_data", mockFetchData);
integrationRegistry.registerAction("send_email", mockSendEmail);

