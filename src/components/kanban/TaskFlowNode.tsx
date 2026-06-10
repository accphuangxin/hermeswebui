import { Handle, Position, NodeResizer } from "reactflow";

interface TaskNodeData {
  label: string;
  title: string;
  body?: string;
  assignee?: string;
  priority?: number;
}

interface TaskFlowNodeProps {
  data: TaskNodeData;
  selected: boolean;
}

export function TaskFlowNode({ data, selected }: TaskFlowNodeProps) {
  return (
    <div className="group relative w-full h-full">
      <NodeResizer
        isVisible={selected}
        minWidth={160}
        minHeight={60}
        lineStyle={{ borderColor: "#3b82f6" }}
        handleStyle={{ width: 8, height: 8, borderRadius: 2, background: "#3b82f6", border: "none" }}
      />

      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className={`!w-3 !h-3 !bg-blue-500 !border-2 !border-white !transition-opacity ${selected ? "!opacity-0" : "!opacity-0 group-hover:!opacity-100"}`}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className={`!w-3 !h-3 !bg-blue-500 !border-2 !border-white !transition-opacity ${selected ? "!opacity-0" : "!opacity-0 group-hover:!opacity-100"}`}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className={`!w-3 !h-3 !bg-blue-500 !border-2 !border-white !transition-opacity ${selected ? "!opacity-0" : "!opacity-0 group-hover:!opacity-100"}`}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className={`!w-3 !h-3 !bg-blue-500 !border-2 !border-white !transition-opacity ${selected ? "!opacity-0" : "!opacity-0 group-hover:!opacity-100"}`}
      />

      <div className="w-full h-full px-4 py-3 bg-white rounded-lg border-2 border-gray-300 shadow-md overflow-hidden flex flex-col items-center justify-center gap-2 select-none">
        <div className="font-semibold text-lg truncate w-full text-center">
          {data.title}
        </div>
        {data.assignee && (
          <div className="text-base text-gray-600 truncate w-full text-center">
            👤 {data.assignee}
          </div>
        )}
      </div>
    </div>
  );
}
