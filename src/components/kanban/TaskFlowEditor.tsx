import { useCallback, useState, useMemo } from "react";
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Node,
  Connection,
  BackgroundVariant,
  NodeTypes,
  ConnectionMode,
} from "reactflow";
import "reactflow/dist/style.css";
import { TaskFlowNode } from "./TaskFlowNode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Save, Trash2 } from "lucide-react";
import { useCreateTask, useLinkTasks } from "@/hooks/useKanban";
import { useHermesAgents } from "@/hooks/useHermesChat";
import { toast } from "sonner";

interface TaskFlowEditorProps {
  open: boolean;
  boardSlug: string;
  onClose: () => void;
}

interface TaskNodeData {
  label: string;
  title: string;
  body?: string;
  assignee?: string;
  priority?: number;
}

export function TaskFlowEditor({
  open,
  boardSlug,
  onClose,
}: TaskFlowEditorProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<TaskNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node<TaskNodeData> | null>(
    null,
  );
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [assignee, setAssignee] = useState("");
  const [priority, setPriority] = useState("");

  const createMutation = useCreateTask(boardSlug);
  const linkMutation = useLinkTasks(boardSlug);
  const { data: agents = [] } = useHermesAgents();

  const nodeTypes: NodeTypes = useMemo(
    () => ({
      taskNode: TaskFlowNode,
    }),
    [],
  );

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  const addNewNode = () => {
    const newNode: Node<TaskNodeData> = {
      id: `node-${Date.now()}`,
      type: "taskNode",
      position: {
        x: 250 + (nodes.length % 3) * 250,
        y: Math.floor(nodes.length / 3) * 120 + 50,
      },
      data: {
        label: "新任务",
        title: "新任务",
      },
      style: { width: 140, height: 60 },
    };
    setNodes((nds) => [...nds, newNode]);
  };

  const handleNodeDoubleClick = (
    _event: React.MouseEvent,
    node: Node<TaskNodeData>,
  ) => {
    setSelectedNode(node);
    setTitle(node.data.title);
    setBody(node.data.body || "");
    setAssignee(node.data.assignee || "");
    setPriority(node.data.priority?.toString() || "");
    setEditDialogOpen(true);
  };

  const handleSaveNode = () => {
    if (!selectedNode) return;

    setNodes((nds) =>
      nds.map((node) =>
        node.id === selectedNode.id
          ? {
              ...node,
              data: {
                label: title,
                title,
                body: body || undefined,
                assignee: assignee || undefined,
                priority: priority ? parseInt(priority) : undefined,
              },
            }
          : node,
      ),
    );

    setEditDialogOpen(false);
    setSelectedNode(null);
  };

  const handleDeleteNode = () => {
    if (!selectedNode) return;

    // 检查是否有连接到此节点的边
    const connectedEdges = edges.filter(
      (edge) =>
        edge.source === selectedNode.id || edge.target === selectedNode.id,
    );

    const confirmMessage =
      connectedEdges.length > 0
        ? `确定要删除节点 "${selectedNode.data.title}" 吗？\n这将同时删除 ${connectedEdges.length} 条相关连线。`
        : `确定要删除节点 "${selectedNode.data.title}" 吗？`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setNodes((nds) => nds.filter((node) => node.id !== selectedNode.id));
    setEdges((eds) =>
      eds.filter(
        (edge) =>
          edge.source !== selectedNode.id && edge.target !== selectedNode.id,
      ),
    );
    setEditDialogOpen(false);
    setSelectedNode(null);
    toast.success("节点已删除");
  };

  const handleGenerateTasks = async () => {
    if (nodes.length === 0) {
      toast.error("请先添加任务节点");
      return;
    }

    // 确认对话框
    const confirmMessage = `即将创建 ${nodes.length} 个任务和 ${edges.length} 条依赖关系，确定要生成吗？`;
    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      // 创建任务的映射表
      const taskMap = new Map<string, string>();

      // 先创建所有任务
      toast.info(`正在创建 ${nodes.length} 个任务...`);
      for (const node of nodes) {
        const task = await createMutation.mutateAsync({
          title: node.data.title,
          body: node.data.body,
          assignee: node.data.assignee,
          priority: node.data.priority,
        });
        const taskId = task.id || task.task_id;
        if (taskId) {
          taskMap.set(node.id, taskId);
        }
      }

      // 创建依赖关系
      if (edges.length > 0) {
        toast.info(`正在建立 ${edges.length} 条依赖关系...`);
        for (const edge of edges) {
          const parentId = taskMap.get(edge.source);
          const childId = taskMap.get(edge.target);
          if (parentId && childId) {
            await linkMutation.mutateAsync({ parentId, childId });
          }
        }
      }

      toast.success(
        `成功创建 ${nodes.length} 个任务和 ${edges.length} 条依赖关系`,
      );
      onClose();
    } catch (error) {
      console.error("生成任务失败:", error);
      toast.error("生成任务失败");
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-6xl h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>任务流程图编辑器</span>
              <span className="text-xs font-normal text-muted-foreground">
                双击节点编辑 • 拖拽蓝点连线
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 border rounded-lg overflow-hidden select-none">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeDoubleClick={handleNodeDoubleClick}
              nodeTypes={nodeTypes}
              defaultViewport={{ x: 0, y: 0, zoom: 0.75 }}
              minZoom={0.2}
              maxZoom={2}
              selectNodesOnDrag={false}
              selectionOnDrag={false}
              panOnDrag={[1, 2]}
              selectionKeyCode={null}
              multiSelectionKeyCode={null}
              nodesFocusable={false}
              connectionMode={ConnectionMode.Loose}
              defaultEdgeOptions={{
                type: "smoothstep",
                animated: true,
                style: { stroke: "#3b82f6", strokeWidth: 2 },
              }}
            >
              <Controls />
              <MiniMap nodeColor="#3b82f6" />
              <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
            </ReactFlow>
          </div>

          <div className="flex items-center justify-between pt-4 border-t">
            <div className="flex gap-2">
              <Button onClick={addNewNode} size="sm">
                <Plus className="h-4 w-4 mr-1" />
                添加任务节点
              </Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                取消
              </Button>
              <Button
                onClick={handleGenerateTasks}
                disabled={nodes.length === 0}
              >
                <Save className="h-4 w-4 mr-1" />
                生成任务
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 编辑节点对话框 */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>编辑任务节点</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="node-title">任务标题 *</Label>
              <Input
                id="node-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="输入任务标题"
              />
            </div>

            <div>
              <Label htmlFor="node-body">任务描述</Label>
              <Textarea
                id="node-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="输入任务描述"
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="node-assignee">分配给 Agent</Label>
              <Input
                id="node-assignee"
                list="agents-list-flow"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                placeholder="选择或输入 Agent"
              />
              <datalist id="agents-list-flow">
                {agents.map((agent) => (
                  <option key={agent.name} value={agent.name} />
                ))}
              </datalist>
            </div>

            <div>
              <Label htmlFor="node-priority">优先级 (0-10)</Label>
              <Input
                id="node-priority"
                type="number"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                placeholder="0-10"
                min="0"
                max="10"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="destructive" onClick={handleDeleteNode} size="sm">
              <Trash2 className="h-4 w-4 mr-1" />
              删除
            </Button>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSaveNode} disabled={!title}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
