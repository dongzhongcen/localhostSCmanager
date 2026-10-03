import { useState } from "react";
import { trpc } from "@/providers/trpc";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Play,
  Square,
  RotateCw,
  Plus,
  Pencil,
  Trash2,
  Terminal,
  Eraser,
  Server,
  Database,
  HardDrive,
  Globe,
  Loader2,
} from "lucide-react";
import { useServiceStatuses } from "@/hooks/useServiceStatus";
import { toast } from "sonner";

const serviceTypeIcons = {
  mysql: Database,
  redis: HardDrive,
  nginx: Globe,
  custom: Server,
};

const serviceTypeLabels = {
  mysql: "MySQL",
  redis: "Redis",
  nginx: "Nginx",
  custom: "自定义",
};

const statusConfig = {
  running: {
    label: "运行中",
    className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/20",
    dot: "bg-emerald-500",
  },
  stopped: {
    label: "已停止",
    className: "bg-slate-500/15 text-slate-400 border-slate-500/20",
    dot: "bg-slate-400",
  },
  error: {
    label: "错误",
    className: "bg-red-500/15 text-red-500 border-red-500/20",
    dot: "bg-red-500",
  },
};

interface ServiceFormData {
  name: string;
  description: string;
  type: "mysql" | "redis" | "nginx" | "custom";
  command: string;
  cwd: string;
  envVars: string;
  autoStart: boolean;
  requireAdmin: boolean;
}

const defaultFormData: ServiceFormData = {
  name: "",
  description: "",
  type: "custom",
  command: "",
  cwd: "",
  envVars: "",
  autoStart: false,
  requireAdmin: false,
};

export default function Home() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [logsDialogOpen, setLogsDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<number | null>(null);
  const [formData, setFormData] = useState<ServiceFormData>(defaultFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState<Record<number, boolean>>({});

  const utils = trpc.useUtils();
  const { data: services, isLoading } = trpc.service.list.useQuery();
  const statuses = useServiceStatuses();

  const createMutation = trpc.service.create.useMutation({
    onSuccess: () => {
      utils.service.list.invalidate();
      toast.success("服务添加成功");
      setDialogOpen(false);
      setFormData(defaultFormData);
    },
    onError: (error) => {
      toast.error("添加失败", { description: error.message });
    },
  });

  const updateMutation = trpc.service.update.useMutation({
    onSuccess: () => {
      utils.service.list.invalidate();
      toast.success("服务更新成功");
      setDialogOpen(false);
      setSelectedService(null);
      setFormData(defaultFormData);
    },
    onError: (error) => {
      toast.error("更新失败", { description: error.message });
    },
  });

  const deleteMutation = trpc.service.delete.useMutation({
    onSuccess: () => {
      utils.service.list.invalidate();
      toast.success("服务已删除");
      setDeleteDialogOpen(false);
      setSelectedService(null);
    },
    onError: (error) => {
      toast.error("删除失败", { description: error.message });
    },
  });

  const startMutation = trpc.service.start.useMutation({
    onSuccess: (result) => {
      utils.service.list.invalidate();
      utils.service.statuses.invalidate();
      toast.success(result.message);
    },
    onError: (error) => {
      toast.error("启动失败", { description: error.message });
    },
  });

  const stopMutation = trpc.service.stop.useMutation({
    onSuccess: (result) => {
      utils.service.list.invalidate();
      utils.service.statuses.invalidate();
      toast.success(result.message);
    },
    onError: (error) => {
      toast.error("停止失败", { description: error.message });
    },
  });

  const clearLogsMutation = trpc.service.clearLogs.useMutation({
    onSuccess: () => {
      utils.service.logs.invalidate();
      toast.success("日志已清除");
    },
    onError: (error) => {
      toast.error("清除日志失败", { description: error.message });
    },
  });

  const restartMutation = trpc.service.restart.useMutation({
    onSuccess: (result) => {
      utils.service.list.invalidate();
      utils.service.statuses.invalidate();
      toast.success(result.message);
    },
    onError: (error) => {
      toast.error("重启失败", { description: error.message });
    },
  });

  const { data: logs } = trpc.service.logs.useQuery(
    { id: selectedService ?? 0, lines: 200 },
    { enabled: logsDialogOpen && selectedService !== null, refetchInterval: logsDialogOpen ? 2000 : false }
  );

  const handleOpenDialog = (service?: NonNullable<typeof services>[number]) => {
    if (service) {
      setSelectedService(service.id);
      setFormData({
        name: service.name,
        description: service.description || "",
        type: service.type as ServiceFormData["type"],
        command: service.command,
        cwd: service.cwd || "",
        envVars: service.envVars || "",
        autoStart: service.autoStart,
        requireAdmin: service.requireAdmin,
      });
    } else {
      setSelectedService(null);
      setFormData(defaultFormData);
    }
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (selectedService !== null) {
        await updateMutation.mutateAsync({
          id: selectedService,
          ...formData,
          envVars: formData.envVars || undefined,
          cwd: formData.cwd || undefined,
          description: formData.description || undefined,
        });
      } else {
        await createMutation.mutateAsync({
          ...formData,
          envVars: formData.envVars || undefined,
          cwd: formData.cwd || undefined,
          description: formData.description || undefined,
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStart = async (id: number) => {
    setIsActionLoading((prev) => ({ ...prev, [id]: true }));
    try {
      await startMutation.mutateAsync({ id });
    } finally {
      setTimeout(() => {
        setIsActionLoading((prev) => ({ ...prev, [id]: false }));
      }, 500);
    }
  };

  const handleStop = async (id: number) => {
    setIsActionLoading((prev) => ({ ...prev, [id]: true }));
    try {
      await stopMutation.mutateAsync({ id });
    } finally {
      setTimeout(() => {
        setIsActionLoading((prev) => ({ ...prev, [id]: false }));
      }, 500);
    }
  };

  const handleRestart = async (id: number) => {
    setIsActionLoading((prev) => ({ ...prev, [id]: true }));
    try {
      await restartMutation.mutateAsync({ id });
    } finally {
      setTimeout(() => {
        setIsActionLoading((prev) => ({ ...prev, [id]: false }));
      }, 500);
    }
  };

  const handleDelete = async () => {
    if (selectedService === null) return;
    await deleteMutation.mutateAsync({ id: selectedService });
  };

  const handleOpenLogs = (id: number) => {
    setSelectedService(id);
    setLogsDialogOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
              <Server className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-white">Service Manager</h1>
              <p className="text-xs text-slate-400">本地服务管理工具</p>
            </div>
          </div>
          <Button
            onClick={() => handleOpenDialog()}
            className="bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 text-white border-0"
          >
            <Plus className="w-4 h-4 mr-2" />
            添加服务
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
          </div>
        ) : !services || services.length === 0 ? (
          <div className="text-center py-20">
            <Server className="w-16 h-16 mx-auto text-slate-700 mb-4" />
            <h3 className="text-lg font-medium text-slate-300 mb-2">暂无服务</h3>
            <p className="text-sm text-slate-500 mb-6">点击右上角添加服务来开始管理</p>
            <Button
              onClick={() => handleOpenDialog()}
              variant="outline"
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              <Plus className="w-4 h-4 mr-2" />
              添加第一个服务
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {services.map((service) => {
              const statusInfo = statuses[service.id] || { status: service.status, pid: service.pid };
              const status = statusInfo.status as keyof typeof statusConfig;
              const config = statusConfig[status] || statusConfig.stopped;
              const Icon = serviceTypeIcons[service.type as keyof typeof serviceTypeIcons] || Server;
              const isLoadingAction = isActionLoading[service.id] || false;

              return (
                <Card
                  key={service.id}
                  className="bg-slate-900/60 border-slate-800 hover:border-slate-700 transition-colors"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center">
                          <Icon className="w-5 h-5 text-indigo-400" />
                        </div>
                        <div>
                          <CardTitle className="text-base font-medium text-slate-100">
                            {service.name}
                          </CardTitle>
                          <CardDescription className="text-xs text-slate-500">
                            {serviceTypeLabels[service.type as keyof typeof serviceTypeLabels] || service.type}
                          </CardDescription>
                        </div>
                      </div>
                      <Badge variant="outline" className={`text-xs ${config.className}`}>
                        <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${config.dot}`} />
                        {config.label}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {service.description && (
                      <p className="text-sm text-slate-500 mb-3 line-clamp-2">{service.description}</p>
                    )}
                    <div className="bg-slate-950 rounded-md p-2.5 mb-3 border border-slate-800/80">
                      <code className="text-xs text-slate-400 font-mono block truncate" title={service.command}>
                        {service.command}
                      </code>
                    </div>
                    {statusInfo.pid && (
                      <p className="text-xs text-slate-600 mb-3">PID: {statusInfo.pid}</p>
                    )}
                    <div className="flex items-center gap-2">
                      {status === "running" ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-red-900/50 text-red-400 hover:bg-red-950/50 hover:text-red-300 h-8"
                            onClick={() => handleStop(service.id)}
                            disabled={isLoadingAction}
                          >
                            {isLoadingAction ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Square className="w-3.5 h-3.5" />
                            )}
                            停止
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-indigo-900/50 text-indigo-400 hover:bg-indigo-950/50 hover:text-indigo-300 h-8"
                            onClick={() => handleRestart(service.id)}
                            disabled={isLoadingAction}
                          >
                            {isLoadingAction ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <RotateCw className="w-3.5 h-3.5" />
                            )}
                            重启
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-emerald-900/50 text-emerald-400 hover:bg-emerald-950/50 hover:text-emerald-300 h-8"
                          onClick={() => handleStart(service.id)}
                          disabled={isLoadingAction}
                        >
                          {isLoadingAction ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Play className="w-3.5 h-3.5" />
                          )}
                          启动
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-slate-500 hover:text-slate-300 hover:bg-slate-800 h-8"
                        onClick={() => handleOpenLogs(service.id)}
                      >
                        <Terminal className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-slate-500 hover:text-amber-400 hover:bg-amber-950/30 h-8"
                        onClick={() => clearLogsMutation.mutate({ id: service.id })}
                        disabled={clearLogsMutation.isPending}
                      >
                        <Eraser className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-slate-500 hover:text-slate-300 hover:bg-slate-800 h-8"
                        onClick={() => handleOpenDialog(service)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-slate-500 hover:text-red-400 hover:bg-red-950/30 h-8"
                        onClick={() => {
                          setSelectedService(service.id);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      {/* Service Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">
              {selectedService !== null ? "编辑服务" : "添加服务"}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              配置服务的启动命令和相关参数
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-slate-300">
                  服务名称
                </Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="例如: MySQL 5.7"
                  className="bg-slate-950 border-slate-800 text-slate-100 placeholder:text-slate-600"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="type" className="text-slate-300">
                  服务类型
                </Label>
                <Select
                  value={formData.type}
                  onValueChange={(v) =>
                    setFormData({ ...formData, type: v as ServiceFormData["type"] })
                  }
                >
                  <SelectTrigger className="bg-slate-950 border-slate-800 text-slate-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800">
                    <SelectItem value="mysql">MySQL</SelectItem>
                    <SelectItem value="redis">Redis</SelectItem>
                    <SelectItem value="nginx">Nginx</SelectItem>
                    <SelectItem value="custom">自定义</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="command" className="text-slate-300">
                  启动命令
                </Label>
                <Textarea
                  id="command"
                  value={formData.command}
                  onChange={(e) => setFormData({ ...formData, command: e.target.value })}
                  placeholder='mysqld --defaults-file="C:\ProgramData\MySQL\MySQL Server 5.7\my.ini" --console'
                  className="bg-slate-950 border-slate-800 text-slate-100 placeholder:text-slate-600 font-mono text-sm min-h-[80px]"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cwd" className="text-slate-300">
                  工作目录（可选）
                </Label>
                <Input
                  id="cwd"
                  value={formData.cwd}
                  onChange={(e) => setFormData({ ...formData, cwd: e.target.value })}
                  placeholder="C:\\services\\mysql"
                  className="bg-slate-950 border-slate-800 text-slate-100 placeholder:text-slate-600"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="envVars" className="text-slate-300">
                  环境变量（可选，JSON格式）
                </Label>
                <Textarea
                  id="envVars"
                  value={formData.envVars}
                  onChange={(e) => setFormData({ ...formData, envVars: e.target.value })}
                  placeholder='{"PORT": "3306", "LOG_LEVEL": "debug"}'
                  className="bg-slate-950 border-slate-800 text-slate-100 placeholder:text-slate-600 font-mono text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description" className="text-slate-300">
                  描述（可选）
                </Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="服务的简要说明..."
                  className="bg-slate-950 border-slate-800 text-slate-100 placeholder:text-slate-600"
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="autoStart" className="text-slate-300 cursor-pointer">
                  开机自动启动
                </Label>
                <Switch
                  id="autoStart"
                  checked={formData.autoStart}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, autoStart: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="requireAdmin" className="text-slate-300 cursor-pointer">
                    需要管理员权限
                  </Label>
                  <p className="text-xs text-slate-500">Windows 上启动时会请求 UAC 提升</p>
                </div>
                <Switch
                  id="requireAdmin"
                  checked={formData.requireAdmin}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, requireAdmin: checked })
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                className="border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                取消
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 text-white border-0"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : selectedService !== null ? (
                  "保存"
                ) : (
                  "添加"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Logs Dialog */}
      <Dialog open={logsDialogOpen} onOpenChange={setLogsDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="text-white">服务日志</DialogTitle>
            <DialogDescription className="text-slate-400">
              实时查看服务输出日志
            </DialogDescription>
          </DialogHeader>
          <div className="bg-slate-950 rounded-md p-4 border border-slate-800 overflow-auto max-h-[50vh]">
            {logs && logs.length > 0 ? (
              <div className="space-y-1">
                {logs.map((log, i) => (
                  <div key={i} className="text-xs font-mono text-slate-400 break-all">
                    {log}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-600 text-center py-8">暂无日志</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (selectedService !== null) {
                  utils.client.service.clearLogs.mutate({ id: selectedService });
                  utils.service.logs.invalidate({ id: selectedService, lines: 200 });
                  toast.success("日志已清空");
                }
              }}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              清空日志
            </Button>
            <Button
              onClick={() => setLogsDialogOpen(false)}
              className="bg-slate-800 hover:bg-slate-700 text-white"
            >
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white">确认删除</DialogTitle>
            <DialogDescription className="text-slate-400">
              此操作将永久删除该服务配置，无法撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              取消
            </Button>
            <Button
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "删除"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
