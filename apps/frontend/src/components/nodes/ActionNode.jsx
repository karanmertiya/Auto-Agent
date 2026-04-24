import { Handle, Position } from "reactflow";

const options = [
  { label: "Fetch Data", value: "fetch_data" },
  { label: "Send Email", value: "send_email" }
];

export default function ActionNode({ id, data }) {
  const onChange = (field) => (event) => {
    data.onChange?.(id, { [field]: event.target.value });
  };

  return (
    <div className="min-w-[250px] rounded-3xl border-2 border-ocean bg-white/90 p-4 shadow-float">
      <div className="mb-3 flex items-center justify-between">
        <span className="rounded-full bg-ocean/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-ocean">
          Action
        </span>
        <span className="text-xs text-slate-500">Worker Step</span>
      </div>

      <div className="space-y-3">
        <label className="block text-sm font-medium text-slate-700">
          Label
          <input
            className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-ocean"
            value={data.label ?? ""}
            onChange={onChange("label")}
            placeholder="Run action"
          />
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Action Type
          <select
            className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-ocean"
            value={data.actionType ?? "fetch_data"}
            onChange={onChange("actionType")}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !border-2 !border-white !bg-ocean"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-3 !w-3 !border-2 !border-white !bg-ocean"
      />
    </div>
  );
}

