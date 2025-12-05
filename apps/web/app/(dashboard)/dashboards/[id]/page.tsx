'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Plus,
  Save,
  Settings,
  Trash2,
  LayoutDashboard,
  Loader2,
  GripVertical,
  BarChart3,
  LineChart,
  Activity,
  Gauge,
  List,
  PieChart,
  X,
  CheckCircle2,
  Edit,
  MoreVertical,
} from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DashboardWidget } from '@/components/dashboard/dashboard-widget';

// Widget types
const WIDGET_TYPES = [
  { id: 'line-chart', name: 'Line Chart', icon: LineChart, description: 'Time series data' },
  { id: 'bar-chart', name: 'Bar Chart', icon: BarChart3, description: 'Comparison data' },
  { id: 'gauge', name: 'Gauge', icon: Gauge, description: 'Single metric value' },
  { id: 'stat', name: 'Stat Card', icon: Activity, description: 'Key statistics' },
  { id: 'table', name: 'Table', icon: List, description: 'Tabular data' },
  { id: 'pie-chart', name: 'Pie Chart', icon: PieChart, description: 'Proportional data' },
];

interface Widget {
  id: string;
  type: string;
  title: string;
  config: Record<string, unknown>;
  position: { x: number; y: number; w: number; h: number };
}

export default function DashboardBuilderPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const dashboardId = params.id as string;

  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [dashboardName, setDashboardName] = useState('');
  const [dashboardDescription, setDashboardDescription] = useState('');
  const [showAddWidget, setShowAddWidget] = useState(false);
  const [showWidgetConfig, setShowWidgetConfig] = useState<Widget | null>(null);
  const [selectedWidgetType, setSelectedWidgetType] = useState('');
  const [newWidgetTitle, setNewWidgetTitle] = useState('');
  const [newWidgetCluster, setNewWidgetCluster] = useState('');
  const [newWidgetMetric, setNewWidgetMetric] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isEditingLayout, setIsEditingLayout] = useState(false);
  const [draggedWidget, setDraggedWidget] = useState<string | null>(null);
  const [dragOverWidget, setDragOverWidget] = useState<string | null>(null);

  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ['dashboard', dashboardId],
    queryFn: () => api.dashboards.get(dashboardId),
    enabled: dashboardId !== 'new',
  });

  const { data: clustersData } = useQuery({
    queryKey: ['clusters'],
    queryFn: () => api.clusters.list(),
  });

  // Initialize dashboard data
  useEffect(() => {
    if (dashboardData?.dashboard) {
      setDashboardName(dashboardData.dashboard.name);
      setDashboardDescription(dashboardData.dashboard.description || '');
      setWidgets(dashboardData.dashboard.widgets || []);
    }
  }, [dashboardData]);

  const [saveSuccess, setSaveSuccess] = useState(false);

  const saveMutation = useMutation({
    mutationFn: async (updatedWidgets?: Widget[]) => {
      const widgetsToSave = updatedWidgets ?? widgets;
      if (dashboardId === 'new') {
        return api.dashboards.create({
          name: dashboardName || 'New Dashboard',
          description: dashboardDescription,
          widgets: widgetsToSave,
        });
      }
      return api.dashboards.update(dashboardId, {
        name: dashboardName,
        description: dashboardDescription,
        widgets: widgetsToSave,
      });
    },
    onSuccess: (data) => {
      setHasUnsavedChanges(false);
      setIsEditingLayout(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      // If new dashboard was created, redirect to its page
      if (dashboardId === 'new' && data?.dashboard?.id) {
        router.replace(`/dashboards/${data.dashboard.id}`);
      }
      queryClient.invalidateQueries({ queryKey: ['dashboard', dashboardId] });
      queryClient.invalidateQueries({ queryKey: ['dashboards'] });
    },
  });

  const addWidget = () => {
    if (!selectedWidgetType || !newWidgetTitle) return;

    const newWidget: Widget = {
      id: `widget-${Date.now()}`,
      type: selectedWidgetType,
      title: newWidgetTitle,
      config: {
        clusterId: newWidgetCluster,
        metric: newWidgetMetric,
      },
      position: {
        x: (widgets.length % 2) * 6,
        y: Math.floor(widgets.length / 2) * 4,
        w: 6,
        h: 4,
      },
    };

    const updatedWidgets = [...widgets, newWidget];
    setWidgets(updatedWidgets);
    setShowAddWidget(false);
    setSelectedWidgetType('');
    setNewWidgetTitle('');
    setNewWidgetCluster('');
    setNewWidgetMetric('');

    // Auto-save after adding widget
    saveMutation.mutate(updatedWidgets);
  };

  const removeWidget = (widgetId: string) => {
    setWidgets(widgets.filter((w) => w.id !== widgetId));
    setHasUnsavedChanges(true);
  };

  const updateWidgetConfig = (widgetId: string, config: Record<string, unknown>) => {
    setWidgets(
      widgets.map((w) => (w.id === widgetId ? { ...w, config: { ...w.config, ...config } } : w))
    );
    setHasUnsavedChanges(true);
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, widgetId: string) => {
    if (!isEditingLayout) return;
    setDraggedWidget(widgetId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', widgetId);
  };

  const handleDragOver = (e: React.DragEvent, widgetId: string) => {
    if (!isEditingLayout || !draggedWidget) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (widgetId !== draggedWidget) {
      setDragOverWidget(widgetId);
    }
  };

  const handleDragLeave = () => {
    setDragOverWidget(null);
  };

  const handleDrop = (e: React.DragEvent, targetWidgetId: string) => {
    e.preventDefault();
    if (!draggedWidget || draggedWidget === targetWidgetId) {
      setDraggedWidget(null);
      setDragOverWidget(null);
      return;
    }

    // Reorder widgets by swapping positions
    const draggedIndex = widgets.findIndex((w) => w.id === draggedWidget);
    const targetIndex = widgets.findIndex((w) => w.id === targetWidgetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const newWidgets = [...widgets];
    const [removed] = newWidgets.splice(draggedIndex, 1);
    newWidgets.splice(targetIndex, 0, removed);

    setWidgets(newWidgets);
    setHasUnsavedChanges(true);
    setDraggedWidget(null);
    setDragOverWidget(null);
  };

  const handleDragEnd = () => {
    setDraggedWidget(null);
    setDragOverWidget(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboards">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex-1">
            {isEditingLayout ? (
              <>
                <Input
                  value={dashboardName}
                  onChange={(e) => {
                    setDashboardName(e.target.value);
                    setHasUnsavedChanges(true);
                  }}
                  className="text-2xl font-bold border-none shadow-none px-0 h-auto focus-visible:ring-0"
                  placeholder="Dashboard Name"
                />
                <Input
                  value={dashboardDescription}
                  onChange={(e) => {
                    setDashboardDescription(e.target.value);
                    setHasUnsavedChanges(true);
                  }}
                  className="text-sm text-muted-foreground border-none shadow-none px-0 h-auto focus-visible:ring-0"
                  placeholder="Add a description..."
                />
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold">{dashboardName || 'Untitled Dashboard'}</h1>
                {dashboardDescription && (
                  <p className="text-sm text-muted-foreground">{dashboardDescription}</p>
                )}
              </>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowAddWidget(true)}>
            <Plus className="h-4 w-4" />
            Add Widget
          </Button>
          {isEditingLayout ? (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  // Cancel editing - restore original data
                  if (dashboardData?.dashboard) {
                    setDashboardName(dashboardData.dashboard.name);
                    setDashboardDescription(dashboardData.dashboard.description || '');
                    setWidgets(dashboardData.dashboard.widgets || []);
                  }
                  setHasUnsavedChanges(false);
                  setIsEditingLayout(false);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={!hasUnsavedChanges || saveMutation.isPending}
                className={saveSuccess ? 'bg-green-600 hover:bg-green-600' : ''}
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : saveSuccess ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {saveMutation.isPending ? 'Saving...' : saveSuccess ? 'Saved!' : 'Save Changes'}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => setIsEditingLayout(true)}>
              <Edit className="h-4 w-4" />
              Edit Layout
            </Button>
          )}
        </div>
      </div>

      {/* Dashboard Grid */}
      {widgets.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <LayoutDashboard className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No widgets yet</h3>
            <p className="text-muted-foreground mb-4">
              Add widgets to visualize your NATS metrics
            </p>
            <Button onClick={() => setShowAddWidget(true)}>
              <Plus className="h-4 w-4" />
              Add Your First Widget
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-12 gap-4">
          {widgets.map((widget) => (
            <div
              key={widget.id}
              className={`col-span-6 transition-all duration-200 ${
                draggedWidget === widget.id ? 'opacity-50 scale-95' : ''
              } ${
                dragOverWidget === widget.id ? 'ring-2 ring-primary ring-offset-2' : ''
              }`}
              style={{
                gridColumn: `span ${widget.position.w}`,
              }}
              draggable={isEditingLayout}
              onDragStart={(e) => handleDragStart(e, widget.id)}
              onDragOver={(e) => handleDragOver(e, widget.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, widget.id)}
              onDragEnd={handleDragEnd}
            >
              <Card className={`relative h-full ${isEditingLayout ? 'group ring-2 ring-dashed ring-primary/30 cursor-move' : ''}`}>
                {/* Widget controls - always visible, disabled during edit layout */}
                <div className="absolute top-2 right-2 flex gap-1 z-10">
                  {isEditingLayout && (
                    <div className="flex items-center justify-center h-8 w-8 text-muted-foreground">
                      <GripVertical className="h-5 w-5" />
                    </div>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => !isEditingLayout && setShowWidgetConfig(widget)}
                    disabled={isEditingLayout}
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={isEditingLayout}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setShowWidgetConfig(widget)}>
                        <Settings className="h-4 w-4 mr-2" />
                        Configure
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => removeWidget(widget.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm font-medium">{widget.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <DashboardWidget widget={widget} />
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}

      {/* Add Widget Dialog */}
      <Dialog open={showAddWidget} onOpenChange={setShowAddWidget}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Widget</DialogTitle>
            <DialogDescription>
              Choose a widget type and configure it
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Widget Type Selection */}
            <div className="grid grid-cols-3 gap-3">
              {WIDGET_TYPES.map((type) => {
                const Icon = type.icon;
                return (
                  <button
                    key={type.id}
                    onClick={() => setSelectedWidgetType(type.id)}
                    className={`p-4 border rounded-lg text-left transition-colors ${
                      selectedWidgetType === type.id
                        ? 'border-primary bg-primary/5'
                        : 'hover:border-primary/50'
                    }`}
                  >
                    <Icon className="h-6 w-6 mb-2 text-primary" />
                    <div className="font-medium">{type.name}</div>
                    <div className="text-sm text-muted-foreground">{type.description}</div>
                  </button>
                );
              })}
            </div>

            {selectedWidgetType && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Widget Title *</label>
                  <Input
                    placeholder="e.g., Message Throughput"
                    value={newWidgetTitle}
                    onChange={(e) => setNewWidgetTitle(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Cluster</label>
                  <Select value={newWidgetCluster} onValueChange={setNewWidgetCluster}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a cluster" />
                    </SelectTrigger>
                    <SelectContent>
                      {clustersData?.clusters?.map((cluster: any) => (
                        <SelectItem key={cluster.id} value={cluster.id}>
                          {cluster.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Metric</label>
                  <Select value={newWidgetMetric} onValueChange={setNewWidgetMetric}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a metric" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="messages_rate">Message Rate</SelectItem>
                      <SelectItem value="bytes_rate">Bytes Rate</SelectItem>
                      <SelectItem value="consumer_lag">Consumer Lag</SelectItem>
                      <SelectItem value="connections">Connections</SelectItem>
                      <SelectItem value="cpu_percent">CPU %</SelectItem>
                      <SelectItem value="memory_bytes">Memory</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddWidget(false)}>
              Cancel
            </Button>
            <Button
              onClick={addWidget}
              disabled={!selectedWidgetType || !newWidgetTitle}
            >
              <Plus className="h-4 w-4" />
              Add Widget
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Widget Config Dialog */}
      <Dialog open={!!showWidgetConfig} onOpenChange={() => setShowWidgetConfig(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configure Widget</DialogTitle>
            <DialogDescription>
              Update the widget settings
            </DialogDescription>
          </DialogHeader>
          {showWidgetConfig && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Title</label>
                <Input
                  value={widgets.find((w) => w.id === showWidgetConfig.id)?.title || ''}
                  onChange={(e) => {
                    setWidgets(
                      widgets.map((w) =>
                        w.id === showWidgetConfig.id ? { ...w, title: e.target.value } : w
                      )
                    );
                    setHasUnsavedChanges(true);
                  }}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Cluster</label>
                <Select
                  value={(widgets.find((w) => w.id === showWidgetConfig.id)?.config.clusterId as string) || ''}
                  onValueChange={(v) =>
                    updateWidgetConfig(showWidgetConfig.id, { clusterId: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a cluster" />
                  </SelectTrigger>
                  <SelectContent>
                    {clustersData?.clusters?.map((cluster: any) => (
                      <SelectItem key={cluster.id} value={cluster.id}>
                        {cluster.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Metric</label>
                <Select
                  value={(widgets.find((w) => w.id === showWidgetConfig.id)?.config.metric as string) || ''}
                  onValueChange={(v) =>
                    updateWidgetConfig(showWidgetConfig.id, { metric: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a metric" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="messages_rate">Message Rate</SelectItem>
                    <SelectItem value="bytes_rate">Bytes Rate</SelectItem>
                    <SelectItem value="consumer_lag">Consumer Lag</SelectItem>
                    <SelectItem value="connections">Connections</SelectItem>
                    <SelectItem value="cpu_percent">CPU %</SelectItem>
                    <SelectItem value="memory_bytes">Memory</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWidgetConfig(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                saveMutation.mutate();
                setShowWidgetConfig(null);
              }}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saveMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
