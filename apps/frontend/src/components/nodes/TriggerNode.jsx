import { Handle, Position } from "reactflow";

export default function TriggerNode({ id, data }) {
  const onChange = (field) => (event) => {
    data.onChange?.(id, { [field]: event.target.value });
  };

  return (
    <div className="min-w-[260px] rounded-3xl border-2 border-leaf bg-white/90 p-4 shadow-float">
      <div className="mb-3 flex items-center justify-between">
        <span className="rounded-full bg-leaf/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-leaf">
          Trigger
        </span>
        <span className="text-xs text-slate-500">Webhook</span>
      </div>

      <div className="space-y-3">
        <label className="block text-sm font-medium text-slate-700">
          Label
          <input
            className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-leaf"
            value={data.label ?? ""}
            onChange={onChange("label")}
            placeholder="Incoming app event"
          />
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Webhook URL
          <input
            className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-leaf"
            value={data.webhookUrl ?? ""}
            onChange={onChange("webhookUrl")}
            placeholder="Generated after save"
          />
        </label>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-3 !w-3 !border-2 !border-white !bg-leaf"
      />
    </div>
  );
}

