import { useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  Panel,
  addEdge,
  useEdgesState,
  useNodesState
} from "reactflow";

import ActionNode from "./components/nodes/ActionNode.jsx";
import TriggerNode from "./components/nodes/TriggerNode.jsx";
import { getWebhookUrl, saveWorkflow } from "./lib/api.js";

const nodeTypes = {
  trigger: TriggerNode,
  action: ActionNode
};

function createId(prefix) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function createTriggerNode(position = { x: 80, y: 180 }) {
  return {
    id: createId("trigger"),
    type: "trigger",
    position,
    data: {
      label: "Incoming Webhook",
      webhookUrl: ""
    }
  };
}

function createActionNode(position = { x: 420, y: 180 }, actionType = "fetch_data") {
  return {
    id: createId("action"),
    type: "action",
    position,
    data: {
      label: actionType === "send_email" ? "Send Email" : "Fetch Data",
      actionType,
      provider: "mock"
    }
  };
}

function makeSerializableNodes(nodes) {
  return nodes.map((node) => ({
    id: node.id,
    type: node.type,
    position: node.position,
    data: Object.fromEntries(
      Object.entries(node.data ?? {}).filter(([, value]) => typeof value !== "function")
    )
  }));
}

function makeFlowEdge(edge) {
  return {
    ...edge,
    markerEnd: {
      type: MarkerType.ArrowClosed
    },
    animated: true
  };
}

export default function App() {
  const [userEmail, setUserEmail] = useState("demo@workflow.local");
  const [saveState, setSaveState] = useState({ status: "idle", message: "" });
  const [lastWorkflowId, setLastWorkflowId] = useState("");

  const [nodes, setNodes, onNodesChange] = useNodesState([
    createTriggerNode(),
    createActionNode(),
    createActionNode({ x: 760, y: 180 }, "send_email")
  ]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  function updateNodeData(nodeId, patch) {
    setNodes((currentNodes) =>
      currentNodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                ...patch,
                onChange: node.data.onChange
              }
            }
          : node
      )
    );
  }

  const hydratedNodes = nodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      onChange: updateNodeData
    }
  }));

  async function handleSaveWorkflow() {
    setSaveState({ status: "saving", message: "Saving workflow..." });

    try {
      const workflow = await saveWorkflow({
        userEmail,
        workflowJson: {
          version: 1,
          nodes: makeSerializableNodes(hydratedNodes),
          edges
        }
      });

      setLastWorkflowId(workflow.id);
      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.type === "trigger"
            ? {
                ...node,
                data: {
                  ...node.data,
                  webhookUrl: getWebhookUrl(workflow.id)
                }
              }
            : node
        )
      );
      setSaveState({ status: "saved", message: "Workflow saved successfully." });
    } catch (error) {
      setSaveState({
        status: "error",
        message: error instanceof Error ? error.message : "Failed to save workflow."
      });
    }
  }

  function handleConnect(connection) {
    setEdges((currentEdges) => addEdge(makeFlowEdge(connection), currentEdges));
  }

  function handleAddTrigger() {
    setNodes((currentNodes) => [
      ...currentNodes,
      createTriggerNode({ x: 80, y: 160 + currentNodes.length * 110 })
    ]);
  }

  function handleAddAction() {
    setNodes((currentNodes) => [
      ...currentNodes,
      createActionNode({ x: 360 + currentNodes.length * 80, y: 180 + currentNodes.length * 24 })
    ]);
  }

  return (
    <main className="h-screen overflow-hidden p-4 text-ink">
      <section className="glass-panel relative flex h-full flex-col overflow-hidden rounded-[32px] border border-white/50 shadow-float">
        <header className="z-10 flex flex-col gap-4 border-b border-slate-200/80 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-[0.25em] text-ember">
              Workflow Studio
            </p>
            <h1 className="m-0 text-3xl font-bold tracking-tight">Drag, connect, and ship automation DAGs.</h1>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              className="min-w-[260px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-ocean"
              value={userEmail}
              onChange={(event) => setUserEmail(event.target.value)}
              placeholder="User email"
            />
            <button
              className="rounded-2xl bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              onClick={handleSaveWorkflow}
            >
              Save Workflow
            </button>
          </div>
        </header>

        <div className="grid flex-1 gap-4 lg:grid-cols-[300px_1fr]">
          <aside className="border-r border-slate-200/70 px-6 py-5">
            <div className="rounded-[28px] bg-white/80 p-5 shadow-sm">
              <h2 className="mt-0 text-lg font-bold">Builder Panel</h2>
              <p className="text-sm leading-6 text-slate-600">
                Use the buttons below, drag nodes around the canvas, and connect handles to shape the
                execution order.
              </p>

              <div className="mt-4 flex flex-col gap-3">
                <button
                  className="rounded-2xl border border-leaf/20 bg-leaf/10 px-4 py-3 text-left text-sm font-semibold text-leaf"
                  onClick={handleAddTrigger}
                >
                  Add Trigger Node
                </button>
                <button
                  className="rounded-2xl border border-ocean/20 bg-ocean/10 px-4 py-3 text-left text-sm font-semibold text-ocean"
                  onClick={handleAddAction}
                >
                  Add Action Node
                </button>
              </div>

              <div className="mt-6 rounded-3xl bg-slate-900 px-4 py-4 text-sm text-slate-100">
                <p className="m-0 font-semibold">Save Status</p>
                <p className="mb-0 mt-2 text-slate-300">
                  {saveState.message || "The current graph has not been saved yet."}
                </p>
                {lastWorkflowId ? (
                  <p className="mb-0 mt-3 break-all text-xs text-slate-400">Workflow ID: {lastWorkflowId}</p>
                ) : null}
              </div>
            </div>
          </aside>

          <div className="relative">
            <ReactFlow
              fitView
              nodes={hydratedNodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={handleConnect}
              defaultEdgeOptions={makeFlowEdge({})}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={24} color="#d6d3d1" />
              <MiniMap
                pannable
                zoomable
                nodeStrokeColor={(node) => (node.type === "trigger" ? "#1f8c5c" : "#2563eb")}
                nodeColor={(node) => (node.type === "trigger" ? "#dcfce7" : "#dbeafe")}
              />
              <Controls />
              <Panel position="bottom-left">
                <div className="rounded-2xl bg-white/90 px-4 py-3 text-xs text-slate-600 shadow-lg">
                  Connect your trigger to one or more action nodes. The worker will execute them in DAG order.
                </div>
              </Panel>
            </ReactFlow>
          </div>
        </div>
      </section>
    </main>
  );
}

