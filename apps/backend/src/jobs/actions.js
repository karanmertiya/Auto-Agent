function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function mockFetchData(context) {
  await sleep(250);
  return {
    action: "mock_fetch_data",
    message: "Fetched mock data successfully.",
    input: context.triggerPayload,
    nodeId: context.node.id
  };
}

export async function mockSendEmail(context) {
  await sleep(150);
  return {
    action: "mock_send_email",
    message: "Pretended to send a mock email.",
    previous: context.previousResult ?? null,
    nodeId: context.node.id
  };
}

