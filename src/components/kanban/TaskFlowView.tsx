import { useCallback, useState, useMemo, useEffect } from "react";
import ReactFlow, {
  Controls,
  Background,
  Panel,
  useNodesState,
  useEdgesState,
  addEdge,
  Node,
  Edge,
  Connection,
  BackgroundVariant,
  NodeTypes,
  EdgeTypes,
  ConnectionMode,
  MarkerType,
} from "reactflow";
import "reactflow/dist/style.css";
import { TaskFlowNode } from "./TaskFlowNode";
import { CustomEdge } from "./CustomEdge";
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
import { Plus, Save, Trash2, LayoutGrid } from "lucide-react";
import {
  useCreateTask,
  useLinkTasks,
  useUnlinkTasks,
  useUpdateTask,
} from "@/hooks/useKanban";
import { useHermesAgents } from "@/hooks/useHermesChat";
import { toast } from "sonner";
import type { KanbanTask } from "@/types";

interface TaskFlowViewProps {
  boardSlug: string;
  tasks: KanbanTask[];
  onSelectTask: (taskId: string) => void;
}

interface TaskNodeData {
  label: string;
  title: string;
  body?: string;
  assignee?: string;
  priority?: number;
}

export function TaskFlowView({ boardSlug, tasks }: TaskFlowViewProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<TaskNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node<TaskNodeData> | null>(
    null,
  );
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [savedEdges, setSavedEdges] = useState<Set<string>>(new Set());

  // Form state
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [assignee, setAssignee] = useState("");
  const [priority, setPriority] = useState("");

  const createMutation = useCreateTask(boardSlug);
  const updateMutation = useUpdateTask(boardSlug);
  const linkMutation = useLinkTasks(boardSlug);
  const unlinkMutation = useUnlinkTasks(boardSlug);
  const { data: agents = [] } = useHermesAgents();

  const handleDeleteEdge = useCallback(
    async (edgeId: string, parentId: string, childId: string) => {
      if (!window.confirm("确定要删除这条连线吗？")) {
        return;
      }

      // 先从 UI 移除
      setEdges((eds) => eds.filter((e) => e.id !== edgeId));

      // 未保存到后端的边直接移除，不需要调用 API
      setSavedEdges((prev) => {
        if (!prev.has(edgeId)) return prev;
        const next = new Set(prev);
        next.delete(edgeId);
        return next;
      });

      // 只有已保存到后端的边才调用删除 API
      if (!savedEdges.has(edgeId)) return;

      try {
        await unlinkMutation.mutateAsync({ parentId, childId });
      } catch (error) {
        console.error("删除依赖关系失败:", parentId, "->", childId, error);
        const msg = error instanceof Error ? error.message : (typeof error === "string" ? error : "未知错误");
        toast.error(`删除失败: ${msg}`);
      }
    },
    [unlinkMutation, savedEdges],
  );

  // 纯函数：根据节点和边计算分层布局位置
  const computeAutoLayout = (
    inputNodes: Node<TaskNodeData>[],
    inputEdges: Edge[],
  ): Node<TaskNodeData>[] => {
    const levels = new Map<string, number>();
    const visited = new Set<string>();

    const calcLevel = (nodeId: string, level: number) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      levels.set(nodeId, Math.max(levels.get(nodeId) || 0, level));
      inputEdges.forEach((e) => {
        if (e.source === nodeId) calcLevel(e.target, level + 1);
      });
    };

    const childSet = new Set(inputEdges.map((e) => e.target));
    inputNodes.forEach((n) => {
      if (!childSet.has(n.id)) calcLevel(n.id, 0);
    });

    const levelGroups = new Map<number, string[]>();
    inputNodes.forEach((n) => {
      const lv = levels.get(n.id) || 0;
      if (!levelGroups.has(lv)) levelGroups.set(lv, []);
      levelGroups.get(lv)!.push(n.id);
    });

    const NODE_W = 280;
    const NODE_H = 100;
    const H_GAP = 80;
    const V_GAP = 60;

    return inputNodes.map((node) => {
      const lv = levels.get(node.id) || 0;
      const group = levelGroups.get(lv) || [];
      const idx = group.indexOf(node.id);
      const totalH = group.length * NODE_H + (group.length - 1) * V_GAP;
      return {
        ...node,
        position: {
          x: lv * (NODE_W + H_GAP) + 60,
          y: idx * (NODE_H + V_GAP) + (400 - totalH) / 2,
        },
      };
    });
  };

  const nodeTypes: NodeTypes = useMemo(
    () => ({
      taskNode: TaskFlowNode,
    }),
    [],
  );

  const edgeTypes: EdgeTypes = useMemo(
    () => ({
      custom: CustomEdge,
    }),
    [],
  );

  const pendingNodesCount = useMemo(
    () => nodes.filter((n) => n.id.startsWith("node-")).length,
    [nodes],
  );

  // source 只能用 right/bottom，target 只能用 left/top
  const getOptimalHandles = (
    sourcePos: { x: number; y: number },
    targetPos: { x: number; y: number },
  ) => {
    const dx = targetPos.x - sourcePos.x;
    const dy = targetPos.y - sourcePos.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
      return { sourceHandle: "right", targetHandle: "left" };
    } else {
      return { sourceHandle: "bottom", targetHandle: "top" };
    }
  };

  // 当 boardSlug 变化时重置初始化状态并清空画布
  useEffect(() => {
    setNodes([]);
    setEdges([]);
    setIsInitialized(false);
    setSavedEdges(new Set());
  }, [boardSlug, setNodes, setEdges]);

  // 从现有任务生成流程图（每个看板初始化一次）
  useEffect(() => {
    if (tasks.length === 0 || isInitialized) return;

    const newNodes: Node<TaskNodeData>[] = tasks.map((task, index) => ({
      id: task.id || task.task_id || `task-${index}`,
      type: "taskNode",
      position: {
        x: 250 + (index % 3) * 350,
        y: Math.floor(index / 3) * 180 + 50,
      },
      data: {
        label: task.title,
        title: task.title,
        body: task.body,
        assignee: task.assignee,
        priority: task.priority,
      },
      style: { width: 280, height: 100 },
    }));

    const nodePositions = new Map<string, { x: number; y: number }>();
    newNodes.forEach((node) => {
      nodePositions.set(node.id, {
        x: node.position.x + 140,
        y: node.position.y + 50,
      });
    });

    const newEdges: Edge[] = [];
    const edgeSet = new Set<string>();

    tasks.forEach((task) => {
      const childId = task.id || task.task_id;
      if (!childId || !task.parents?.length) return;

      task.parents.forEach((parent) => {
        const parentId = parent.id;
        const edgeId = `${parentId}__${childId}`;
        if (edgeSet.has(edgeId)) return;
        edgeSet.add(edgeId);

        const sourcePos = nodePositions.get(parentId);
        const targetPos = nodePositions.get(childId);
        const handles =
          sourcePos && targetPos
            ? getOptimalHandles(sourcePos, targetPos)
            : { sourceHandle: "right", targetHandle: "left" };

        newEdges.push({
          id: edgeId,
          source: parentId,
          target: childId,
          sourceHandle: handles.sourceHandle,
          targetHandle: handles.targetHandle,
          type: "custom",
          animated: true,
          style: { stroke: "#3b82f6", strokeWidth: 2 },
          data: {
            onDelete: (id: string) => handleDeleteEdge(id, parentId, childId),
          },
        });
      });
    });

    const layoutedNodes = computeAutoLayout(newNodes, newEdges);
    setNodes(layoutedNodes);
    setEdges(newEdges);
    setIsInitialized(true);
    setSavedEdges(new Set(newEdges.map((e) => e.id)));
  }, [tasks, isInitialized, setNodes, setEdges, handleDeleteEdge]);

  const onConnect = useCallback(
    async (params: Connection) => {
      const parentId = params.source!;
      const childId = params.target!;
      const edgeId = `${parentId}__${childId}`;

      setEdges((eds) =>
        addEdge(
          {
            ...params,
            id: edgeId,
            type: "custom",
            animated: true,
            style: { stroke: "#3b82f6", strokeWidth: 2 },
            data: {
              onDelete: (id: string) =>
                handleDeleteEdge(id, parentId, childId),
            },
          },
          eds,
        ),
      );

      setHasChanges(true);

      if (params.source?.startsWith("node-") || params.target?.startsWith("node-")) {
        toast.info('请点击"保存流程"按钮保存改动');
        return;
      }

      toast.info('请点击"保存流程"按钮保存改动');
    },
    [setEdges, handleDeleteEdge],
  );

  const [isConnecting, setIsConnecting] = useState(false);

  const onConnectStart = useCallback(() => {
    setIsConnecting(true);

    const handleMouseMove = (e: MouseEvent) => {
      // 清除所有节点的 show-handles
      document.querySelectorAll(".react-flow__node.show-handles").forEach((el) => {
        el.classList.remove("show-handles");
      });
      // 给鼠标下的节点加 show-handles
      const el = (e.target as Element)?.closest(".react-flow__node");
      if (el) el.classList.add("show-handles");
    };

    const cleanup = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", cleanup);
      document.querySelectorAll(".react-flow__node.show-handles").forEach((el) => {
        el.classList.remove("show-handles");
      });
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", cleanup);
  }, []);

  const onConnectEnd = useCallback(() => {
    setIsConnecting(false);
    document.querySelectorAll(".react-flow__node.show-handles").forEach((el) => {
      el.classList.remove("show-handles");
    });
  }, []);

  const onEdgesDelete = useCallback(
    (edgesToDelete: Edge[]) => {
      if (edgesToDelete.length === 0) return;
      // Deletion is handled by CustomEdge's X button via handleDeleteEdge
      // This callback fires when pressing Delete key — just remove from UI
      setEdges((eds) =>
        eds.filter((e) => !edgesToDelete.some((d) => d.id === e.id)),
      );
      setHasChanges(true);
    },
    [setEdges],
  );

  const addNewNode = () => {
    const newNode: Node<TaskNodeData> = {
      id: `node-${Date.now()}`,
      type: "taskNode",
      position: {
        x: 250 + (nodes.length % 3) * 350,
        y: Math.floor(nodes.length / 3) * 180 + 50,
      },
      data: {
        label: "新任务",
        title: "新任务",
      },
      style: { width: 280, height: 100 },
    };
    setNodes((nds) => [...nds, newNode]);
    setHasChanges(true);
  };

  const handleNodeDoubleClick = (
    _event: React.MouseEvent,
    node: Node<TaskNodeData>,
  ) => {
    const task = tasks.find((t) => (t.id || t.task_id) === node.id);
    setSelectedNode(node);
    setTitle(task?.title || node.data.title);
    setBody(task?.body || node.data.body || "");
    setAssignee(task?.assignee || node.data.assignee || "");
    setPriority(
      task?.priority?.toString() || node.data.priority?.toString() || "",
    );
    setEditDialogOpen(true);
  };

  const handleGenerateAll = async () => {
    const pendingNodes = nodes.filter((n) => n.id.startsWith("node-"));
    if (pendingNodes.length === 0) {
      toast.error("没有待创建的任务节点");
      return;
    }

    if (!window.confirm(`即将批量创建 ${pendingNodes.length} 个任务，确定要生成吗？`)) {
      return;
    }

    try {
      const taskMap = new Map<string, string>();
      toast.info(`正在创建 ${pendingNodes.length} 个任务...`);

      for (const node of pendingNodes) {
        const newTask = await createMutation.mutateAsync({
          title: node.data.title,
          body: node.data.body,
          assignee: node.data.assignee,
          priority: node.data.priority,
        });
        const taskId = newTask.id || newTask.task_id;
        if (taskId) taskMap.set(node.id, taskId);
      }

      setNodes((nds) =>
        nds.map((node) => {
          const newId = taskMap.get(node.id);
          return newId ? { ...node, id: newId } : node;
        }),
      );

      const pendingEdges = edges.filter(
        (e) => e.source.startsWith("node-") || e.target.startsWith("node-"),
      );

      if (pendingEdges.length > 0) {
        toast.info(`正在建立 ${pendingEdges.length} 条依赖关系...`);
        for (const edge of pendingEdges) {
          const parentId = taskMap.get(edge.source) || edge.source;
          const childId = taskMap.get(edge.target) || edge.target;
          if (parentId && childId) {
            await linkMutation.mutateAsync({ parentId, childId });
          }
        }

        setEdges((eds) =>
          eds.map((edge) => {
            const newSource = taskMap.get(edge.source) || edge.source;
            const newTarget = taskMap.get(edge.target) || edge.target;
            return {
              ...edge,
              id: `${newSource}__${newTarget}`,
              source: newSource,
              target: newTarget,
              data: {
                onDelete: (id: string) =>
                  handleDeleteEdge(id, newSource, newTarget),
              },
            };
          }),
        );
      }

      toast.success(`成功创建 ${pendingNodes.length} 个任务`);
      setHasChanges(false);
    } catch (error) {
      console.error("批量创建失败:", error);
      toast.error("批量创建失败");
    }
  };

  const handleAutoLayout = () => {
    setNodes(computeAutoLayout(nodes, edges));
    toast.success("布局已整理");
  };

  const handleSaveFlow = async () => {
    const existingTaskEdges = edges.filter(
      (e) => !e.source.startsWith("node-") && !e.target.startsWith("node-"),
    );
    const unsavedEdges = existingTaskEdges.filter((e) => !savedEdges.has(e.id));

    if (unsavedEdges.length === 0) {
      toast.info("所有依赖关系已保存");
      setHasChanges(false);
      return;
    }

    try {
      toast.info(`正在保存 ${unsavedEdges.length} 条依赖关系...`);
      let successCount = 0;
      let failCount = 0;
      const newlySaved = new Set<string>();

      for (const edge of unsavedEdges) {
        try {
          await linkMutation.mutateAsync({
            parentId: edge.source,
            childId: edge.target,
          });
          successCount++;
          newlySaved.add(edge.id);
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          if (msg.includes("cycle") || msg.includes("循环")) {
            setEdges((eds) => eds.filter((e) => e.id !== edge.id));
            toast.error(`连线 ${edge.source} → ${edge.target} 会导致循环依赖，已移除`);
          } else {
            failCount++;
          }
        }
      }

      if (newlySaved.size > 0) {
        setSavedEdges((prev) => new Set([...prev, ...newlySaved]));
      }
      if (successCount > 0) toast.success(`成功保存 ${successCount} 条依赖关系`);
      if (failCount > 0) toast.error(`${failCount} 条依赖关系保存失败，请重试`);
      setHasChanges(failCount > 0);
    } catch (error) {
      console.error("保存流程失败:", error);
      toast.error("保存流程失败");
    }
  };

  const handleSaveNode = async () => {
    if (!selectedNode) return;

    if (selectedNode.id.startsWith("node-")) {
      try {
        const newTask = await createMutation.mutateAsync({
          title,
          body: body || undefined,
          assignee: assignee || undefined,
          priority: priority ? parseInt(priority) : undefined,
        });
        const taskId = newTask.id || newTask.task_id;
        if (taskId) {
          setNodes((nds) =>
            nds.map((node) =>
              node.id === selectedNode.id
                ? {
                    ...node,
                    id: taskId,
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
          setEdges((eds) =>
            eds.map((edge) => ({
              ...edge,
              source: edge.source === selectedNode.id ? taskId : edge.source,
              target: edge.target === selectedNode.id ? taskId : edge.target,
            })),
          );
        }
      } catch (error) {
        console.error("创建任务失败:", error);
        return;
      }
    } else {
      try {
        await updateMutation.mutateAsync({
          taskId: selectedNode.id,
          input: {
            title,
            body: body || undefined,
            assignee: assignee || undefined,
            priority: priority ? parseInt(priority) : undefined,
          },
        });
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
      } catch (error) {
        console.error("更新任务失败:", error);
        return;
      }
    }

    setEditDialogOpen(false);
    setSelectedNode(null);
  };

  const handleDeleteNode = () => {
    if (!selectedNode) return;

    const connectedEdges = edges.filter(
      (edge) =>
        edge.source === selectedNode.id || edge.target === selectedNode.id,
    );
    const msg =
      connectedEdges.length > 0
        ? `确定要删除节点 "${selectedNode.data.title}" 吗？\n这将同时删除 ${connectedEdges.length} 条相关连线。`
        : `确定要删除节点 "${selectedNode.data.title}" 吗？`;

    if (!window.confirm(msg)) return;

    setNodes((nds) => nds.filter((node) => node.id !== selectedNode.id));
    setEdges((eds) =>
      eds.filter(
        (edge) =>
          edge.source !== selectedNode.id && edge.target !== selectedNode.id,
      ),
    );
    setEditDialogOpen(false);
    setSelectedNode(null);
    setHasChanges(true);
    toast.success("节点已删除");
  };

  return (
    <>
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="h-12 border-b flex items-center justify-between px-4 shrink-0 bg-muted/30">
          <div className="text-sm text-muted-foreground">
            双击节点编辑 • 拖拽蓝点连线 • 点击连线上的 × 删除
          </div>
          <Button onClick={handleAutoLayout} size="sm" variant="outline">
            <LayoutGrid className="h-4 w-4 mr-1" />
            自动整理布局
          </Button>
        </div>

        <div className={`flex-1 bg-gray-50 relative select-none${isConnecting ? " is-connecting" : ""}`}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd}
            onNodeDoubleClick={handleNodeDoubleClick}
            onEdgesDelete={onEdgesDelete}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            connectionMode={ConnectionMode.Loose}
            connectionRadius={80}
            defaultViewport={{ x: 0, y: 0, zoom: 0.75 }}
            minZoom={0.2}
            maxZoom={2}
            selectNodesOnDrag={false}
            selectionOnDrag={false}
            panOnDrag={[1, 2]}
            selectionKeyCode={null}
            multiSelectionKeyCode={null}
            nodesFocusable={false}
            defaultEdgeOptions={{
              type: "custom",
              animated: true,
              style: { stroke: "#3b82f6", strokeWidth: 2 },
              markerEnd: { type: MarkerType.ArrowClosed, color: "#3b82f6" },
            }}
          >
            <Controls
              showZoom={false}
              showFitView={false}
              showInteractive={false}
            />
            <Background variant={BackgroundVariant.Dots} gap={12} size={1} />

            <Panel position="bottom-right" className="mb-4 mr-4">
              <div className="flex gap-2">
                <Button onClick={addNewNode} size="lg" className="shadow-lg">
                  <Plus className="h-5 w-5 mr-2" />
                  添加任务节点
                </Button>
                {pendingNodesCount > 0 && (
                  <Button
                    onClick={handleGenerateAll}
                    size="lg"
                    className="shadow-lg"
                  >
                    <Save className="h-5 w-5 mr-2" />
                    生成任务 ({pendingNodesCount})
                  </Button>
                )}
                {hasChanges && pendingNodesCount === 0 && (
                  <Button
                    onClick={handleSaveFlow}
                    size="lg"
                    className="shadow-lg"
                  >
                    <Save className="h-5 w-5 mr-2" />
                    保存流程
                  </Button>
                )}
              </div>
            </Panel>
          </ReactFlow>
        </div>
      </div>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl p-8">
          <DialogHeader className="pb-6">
            <DialogTitle className="text-xl">
              {selectedNode?.id.startsWith("node-") ? "新建任务节点" : "编辑任务"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="node-title">任务标题 *</Label>
              <Input
                id="node-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="输入任务标题"
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="node-body">任务描述</Label>
              <Textarea
                id="node-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="输入任务描述"
                rows={4}
                className="resize-none"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="node-assignee">分配给 Agent</Label>
              <Input
                id="node-assignee"
                list="agents-list-flow"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                placeholder="选择或输入 Agent"
                className="h-10"
              />
              <datalist id="agents-list-flow">
                {agents.map((agent) => (
                  <option key={agent.name} value={agent.name} />
                ))}
              </datalist>
            </div>
            <div className="space-y-2">
              <Label htmlFor="node-priority">优先级 (0-10)</Label>
              <Input
                id="node-priority"
                type="number"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                placeholder="0-10"
                min="0"
                max="10"
                className="h-10"
              />
            </div>
          </div>

          <DialogFooter className="pt-8 gap-3">
            <Button variant="destructive" onClick={handleDeleteNode} size="sm">
              <Trash2 className="h-4 w-4 mr-1" />
              删除
            </Button>
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
            >
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
