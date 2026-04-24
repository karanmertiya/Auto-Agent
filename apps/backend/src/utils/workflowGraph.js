function buildNodeMap(nodes) {
  return new Map(nodes.map((node) => [node.id, node]));
}

function buildAdjacency(edges) {
  const adjacency = new Map();
  const indegree = new Map();

  for (const edge of edges) {
    adjacency.set(edge.source, [...(adjacency.get(edge.source) ?? []), edge.target]);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    if (!indegree.has(edge.source)) {
      indegree.set(edge.source, indegree.get(edge.source) ?? 0);
    }
  }

  return { adjacency, indegree };
}

function collectReachableNodes(nodes, edges) {
  const nodeMap = buildNodeMap(nodes);
  const { adjacency } = buildAdjacency(edges);
  const startNodes = nodes.filter((node) => node.type === "trigger" || !edges.some((edge) => edge.target === node.id));
  const visited = new Set();
  const queue = [...startNodes];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current.id)) {
      continue;
    }

    visited.add(current.id);

    for (const targetId of adjacency.get(current.id) ?? []) {
      const targetNode = nodeMap.get(targetId);
      if (targetNode && !visited.has(targetNode.id)) {
        queue.push(targetNode);
      }
    }
  }

  return visited;
}

export function validateWorkflowGraph(workflowJson) {
  const nodes = Array.isArray(workflowJson?.nodes) ? workflowJson.nodes : [];
  const edges = Array.isArray(workflowJson?.edges) ? workflowJson.edges : [];

  if (!nodes.length) {
    throw new Error("Workflow must contain at least one node.");
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      throw new Error("Workflow contains an edge that references a missing node.");
    }
  }

  const orderedNodes = getOrderedWorkflowNodes(workflowJson);
  return { nodes, edges, orderedNodes };
}

export function getOrderedWorkflowNodes(workflowJson) {
  const nodes = Array.isArray(workflowJson?.nodes) ? workflowJson.nodes : [];
  const edges = Array.isArray(workflowJson?.edges) ? workflowJson.edges : [];
  const reachable = collectReachableNodes(nodes, edges);
  const filteredNodes = nodes.filter((node) => reachable.has(node.id));
  const filteredEdges = edges.filter(
    (edge) => reachable.has(edge.source) && reachable.has(edge.target)
  );
  const nodeMap = buildNodeMap(filteredNodes);
  const { adjacency, indegree } = buildAdjacency(filteredEdges);

  for (const node of filteredNodes) {
    indegree.set(node.id, indegree.get(node.id) ?? 0);
  }

  const queue = filteredNodes
    .filter((node) => (indegree.get(node.id) ?? 0) === 0)
    .sort(
      (a, b) =>
        (a.position?.y ?? 0) - (b.position?.y ?? 0) ||
        (a.position?.x ?? 0) - (b.position?.x ?? 0)
    );

  const ordered = [];

  while (queue.length > 0) {
    const current = queue.shift();
    ordered.push(current);

    for (const targetId of adjacency.get(current.id) ?? []) {
      indegree.set(targetId, (indegree.get(targetId) ?? 0) - 1);
      if ((indegree.get(targetId) ?? 0) === 0) {
        queue.push(nodeMap.get(targetId));
      }
    }
  }

  if (ordered.length !== filteredNodes.length) {
    throw new Error("Workflow must be a directed acyclic graph.");
  }

  return ordered;
}
