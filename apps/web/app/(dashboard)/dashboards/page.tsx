'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Plus,
  Settings,
  Trash2,
  Copy,
  Share2,
  Loader2,
  MoreHorizontal,
  Clock,
  User,
  Globe,
  Lock,
  Users,
  Edit,
  Activity,
  BarChart3,
  Gauge,
  TrendingUp,
  Database,
  Zap,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Dashboard Templates
interface DashboardTemplate {
  id: string;
  name: string;
  description: string;
  icon: any;
  category: 'overview' | 'streams' | 'consumers' | 'performance';
  config: {
    name: string;
    description: string;
    config: {
      layout: string;
      widgets: Array<{
        id: string;
        type: string;
        title: string;
        config: Record<string, any>;
        position: { x: number; y: number; w: number; h: number };
      }>;
    };
  };
}

const dashboardTemplates: DashboardTemplate[] = [
  // Overview Dashboards
  {
    id: 'cluster-overview',
    name: 'Cluster Overview',
    description: 'High-level view of cluster health, streams, and consumers',
    icon: LayoutDashboard,
    category: 'overview',
    config: {
      name: 'Cluster Overview',
      description: 'High-level view of cluster health, streams, and consumers',
      config: {
        layout: 'grid',
        widgets: [
          { id: 'w1', type: 'stat', title: 'Total Streams', config: { metric: 'streams_count' }, position: { x: 0, y: 0, w: 3, h: 2 } },
          { id: 'w2', type: 'stat', title: 'Total Consumers', config: { metric: 'consumers_count' }, position: { x: 3, y: 0, w: 3, h: 2 } },
          { id: 'w3', type: 'stat', title: 'Messages/sec', config: { metric: 'message_rate' }, position: { x: 6, y: 0, w: 3, h: 2 } },
          { id: 'w4', type: 'stat', title: 'Total Storage', config: { metric: 'total_bytes' }, position: { x: 9, y: 0, w: 3, h: 2 } },
          { id: 'w5', type: 'line-chart', title: 'Message Throughput', config: { metric: 'throughput' }, position: { x: 0, y: 2, w: 6, h: 4 } },
          { id: 'w6', type: 'bar-chart', title: 'Consumer Lag', config: { metric: 'consumer_lag' }, position: { x: 6, y: 2, w: 6, h: 4 } },
        ],
      },
    },
  },
  {
    id: 'executive-summary',
    name: 'Executive Summary',
    description: 'Key metrics and trends for stakeholders',
    icon: TrendingUp,
    category: 'overview',
    config: {
      name: 'Executive Summary',
      description: 'Key metrics and trends for stakeholders',
      config: {
        layout: 'grid',
        widgets: [
          { id: 'w1', type: 'stat', title: 'Uptime', config: { metric: 'uptime' }, position: { x: 0, y: 0, w: 4, h: 2 } },
          { id: 'w2', type: 'stat', title: 'Total Messages', config: { metric: 'total_messages' }, position: { x: 4, y: 0, w: 4, h: 2 } },
          { id: 'w3', type: 'stat', title: 'Avg Latency', config: { metric: 'avg_latency' }, position: { x: 8, y: 0, w: 4, h: 2 } },
          { id: 'w4', type: 'line-chart', title: 'Weekly Trends', config: { metric: 'weekly_trends' }, position: { x: 0, y: 2, w: 12, h: 4 } },
        ],
      },
    },
  },
  // Stream Dashboards
  {
    id: 'stream-health',
    name: 'Stream Health Monitor',
    description: 'Monitor stream performance and storage utilization',
    icon: Database,
    category: 'streams',
    config: {
      name: 'Stream Health Monitor',
      description: 'Monitor stream performance and storage utilization',
      config: {
        layout: 'grid',
        widgets: [
          { id: 'w1', type: 'table', title: 'Stream Status', config: { dataSource: 'streams' }, position: { x: 0, y: 0, w: 12, h: 4 } },
          { id: 'w2', type: 'bar-chart', title: 'Stream Sizes', config: { metric: 'stream_sizes' }, position: { x: 0, y: 4, w: 6, h: 4 } },
          { id: 'w3', type: 'pie-chart', title: 'Message Distribution', config: { metric: 'message_distribution' }, position: { x: 6, y: 4, w: 6, h: 4 } },
        ],
      },
    },
  },
  {
    id: 'stream-throughput',
    name: 'Stream Throughput Analysis',
    description: 'Detailed throughput metrics per stream',
    icon: Activity,
    category: 'streams',
    config: {
      name: 'Stream Throughput Analysis',
      description: 'Detailed throughput metrics per stream',
      config: {
        layout: 'grid',
        widgets: [
          { id: 'w1', type: 'line-chart', title: 'Throughput by Stream', config: { metric: 'stream_throughput' }, position: { x: 0, y: 0, w: 12, h: 5 } },
          { id: 'w2', type: 'stat', title: 'Peak Rate', config: { metric: 'peak_rate' }, position: { x: 0, y: 5, w: 4, h: 2 } },
          { id: 'w3', type: 'stat', title: 'Avg Rate', config: { metric: 'avg_rate' }, position: { x: 4, y: 5, w: 4, h: 2 } },
          { id: 'w4', type: 'stat', title: 'Total Today', config: { metric: 'total_today' }, position: { x: 8, y: 5, w: 4, h: 2 } },
        ],
      },
    },
  },
  // Consumer Dashboards
  {
    id: 'consumer-performance',
    name: 'Consumer Performance',
    description: 'Track consumer lag and processing rates',
    icon: Gauge,
    category: 'consumers',
    config: {
      name: 'Consumer Performance',
      description: 'Track consumer lag and processing rates',
      config: {
        layout: 'grid',
        widgets: [
          { id: 'w1', type: 'stat', title: 'Total Pending', config: { metric: 'total_pending' }, position: { x: 0, y: 0, w: 3, h: 2 } },
          { id: 'w2', type: 'stat', title: 'Avg Lag', config: { metric: 'avg_lag' }, position: { x: 3, y: 0, w: 3, h: 2 } },
          { id: 'w3', type: 'stat', title: 'Processing Rate', config: { metric: 'processing_rate' }, position: { x: 6, y: 0, w: 3, h: 2 } },
          { id: 'w4', type: 'stat', title: 'Redelivery Rate', config: { metric: 'redelivery_rate' }, position: { x: 9, y: 0, w: 3, h: 2 } },
          { id: 'w5', type: 'line-chart', title: 'Consumer Lag Over Time', config: { metric: 'lag_history' }, position: { x: 0, y: 2, w: 12, h: 4 } },
          { id: 'w6', type: 'table', title: 'Top Lagging Consumers', config: { dataSource: 'lagging_consumers' }, position: { x: 0, y: 6, w: 12, h: 3 } },
        ],
      },
    },
  },
  {
    id: 'consumer-health',
    name: 'Consumer Health Check',
    description: 'Monitor consumer status and identify issues',
    icon: Zap,
    category: 'consumers',
    config: {
      name: 'Consumer Health Check',
      description: 'Monitor consumer status and identify issues',
      config: {
        layout: 'grid',
        widgets: [
          { id: 'w1', type: 'table', title: 'Consumer Status', config: { dataSource: 'consumers' }, position: { x: 0, y: 0, w: 12, h: 5 } },
          { id: 'w2', type: 'line-chart', title: 'Ack Rate', config: { metric: 'ack_rate' }, position: { x: 0, y: 5, w: 6, h: 4 } },
          { id: 'w3', type: 'bar-chart', title: 'Pending by Consumer', config: { metric: 'pending_by_consumer' }, position: { x: 6, y: 5, w: 6, h: 4 } },
        ],
      },
    },
  },
  // Performance Dashboards
  {
    id: 'latency-analysis',
    name: 'Latency Analysis',
    description: 'Deep dive into message latency patterns',
    icon: BarChart3,
    category: 'performance',
    config: {
      name: 'Latency Analysis',
      description: 'Deep dive into message latency patterns',
      config: {
        layout: 'grid',
        widgets: [
          { id: 'w1', type: 'stat', title: 'P50 Latency', config: { metric: 'p50_latency' }, position: { x: 0, y: 0, w: 3, h: 2 } },
          { id: 'w2', type: 'stat', title: 'P95 Latency', config: { metric: 'p95_latency' }, position: { x: 3, y: 0, w: 3, h: 2 } },
          { id: 'w3', type: 'stat', title: 'P99 Latency', config: { metric: 'p99_latency' }, position: { x: 6, y: 0, w: 3, h: 2 } },
          { id: 'w4', type: 'stat', title: 'Max Latency', config: { metric: 'max_latency' }, position: { x: 9, y: 0, w: 3, h: 2 } },
          { id: 'w5', type: 'bar-chart', title: 'Latency Distribution', config: { metric: 'latency_dist' }, position: { x: 0, y: 2, w: 6, h: 4 } },
          { id: 'w6', type: 'line-chart', title: 'Latency Over Time', config: { metric: 'latency_history' }, position: { x: 6, y: 2, w: 6, h: 4 } },
        ],
      },
    },
  },
  {
    id: 'resource-utilization',
    name: 'Resource Utilization',
    description: 'Monitor storage and memory usage',
    icon: Activity,
    category: 'performance',
    config: {
      name: 'Resource Utilization',
      description: 'Monitor storage and memory usage',
      config: {
        layout: 'grid',
        widgets: [
          { id: 'w1', type: 'gauge', title: 'Storage Used', config: { metric: 'storage_percent' }, position: { x: 0, y: 0, w: 4, h: 3 } },
          { id: 'w2', type: 'gauge', title: 'Memory Used', config: { metric: 'memory_percent' }, position: { x: 4, y: 0, w: 4, h: 3 } },
          { id: 'w3', type: 'gauge', title: 'Connection Pool', config: { metric: 'connections_percent' }, position: { x: 8, y: 0, w: 4, h: 3 } },
          { id: 'w4', type: 'line-chart', title: 'Resource Trends', config: { metric: 'resource_trends' }, position: { x: 0, y: 3, w: 12, h: 4 } },
        ],
      },
    },
  },
];

const templateCategories = [
  { id: 'overview', name: 'Overview', description: 'High-level cluster monitoring' },
  { id: 'streams', name: 'Streams', description: 'Stream-focused dashboards' },
  { id: 'consumers', name: 'Consumers', description: 'Consumer monitoring' },
  { id: 'performance', name: 'Performance', description: 'Performance analysis' },
];

interface ShareDashboard {
  id: string;
  name: string;
  isShared: boolean;
}

interface EditDashboard {
  id: string;
  name: string;
  description: string;
}

export default function DashboardsPage() {
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newDashboardName, setNewDashboardName] = useState('');
  const [newDashboardDescription, setNewDashboardDescription] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<DashboardTemplate | null>(null);
  const [selectedClusterId, setSelectedClusterId] = useState<string>('');
  const [deleteDashboardId, setDeleteDashboardId] = useState<string | null>(null);
  const [shareDashboard, setShareDashboard] = useState<ShareDashboard | null>(null);
  const [editDashboard, setEditDashboard] = useState<EditDashboard | null>(null);

  const { data: dashboardsData, isLoading } = useQuery({
    queryKey: ['dashboards'],
    queryFn: () => api.dashboards.list(),
  });

  const { data: clustersData } = useQuery({
    queryKey: ['clusters'],
    queryFn: () => api.clusters.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description?: string; config?: any }) => api.dashboards.create(data),
    onSuccess: () => {
      resetCreateDialog();
      queryClient.invalidateQueries({ queryKey: ['dashboards'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.dashboards.delete(id),
    onSuccess: () => {
      setDeleteDashboardId(null);
      queryClient.invalidateQueries({ queryKey: ['dashboards'] });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (id: string) => {
      const original = await api.dashboards.get(id);
      return api.dashboards.create({
        name: `${original.dashboard.name} (Copy)`,
        description: original.dashboard.description,
        config: original.dashboard.config,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboards'] });
    },
  });

  const shareMutation = useMutation({
    mutationFn: ({ id, isShared }: { id: string; isShared: boolean }) =>
      api.dashboards.update(id, { isShared }),
    onSuccess: () => {
      setShareDashboard(null);
      queryClient.invalidateQueries({ queryKey: ['dashboards'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, name, description }: { id: string; name: string; description: string }) =>
      api.dashboards.update(id, { name, description }),
    onSuccess: () => {
      setEditDashboard(null);
      queryClient.invalidateQueries({ queryKey: ['dashboards'] });
    },
  });

  const handleCreate = () => {
    if (!newDashboardName.trim()) return;

    // If using a template, inject clusterId into each widget's config
    let widgets;
    if (selectedTemplate && selectedClusterId) {
      widgets = selectedTemplate.config.config.widgets.map((widget: any) => ({
        ...widget,
        config: {
          ...widget.config,
          clusterId: selectedClusterId,
        },
      }));
    } else if (selectedTemplate) {
      widgets = selectedTemplate.config.config.widgets;
    }

    createMutation.mutate({
      name: newDashboardName,
      description: newDashboardDescription || undefined,
      ...(widgets ? { widgets } : {}),
    });
  };

  const handleSelectTemplate = (template: DashboardTemplate) => {
    setSelectedTemplate(template);
    setNewDashboardName(template.config.name);
    setNewDashboardDescription(template.config.description);
  };

  const resetCreateDialog = () => {
    setShowCreateDialog(false);
    setNewDashboardName('');
    setNewDashboardDescription('');
    setSelectedTemplate(null);
    setSelectedClusterId('');
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboards</h1>
          <p className="text-muted-foreground">Create custom dashboards to visualize your NATS metrics</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4" />
          New Dashboard
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && (!dashboardsData?.dashboards || dashboardsData.dashboards.length === 0) && (
        <Card>
          <CardContent className="py-12 text-center">
            <LayoutDashboard className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No dashboards yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first custom dashboard to visualize NATS metrics
            </p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4" />
              Create Dashboard
            </Button>
          </CardContent>
        </Card>
      )}

      {dashboardsData?.dashboards && dashboardsData.dashboards.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {dashboardsData.dashboards.map((dashboard: any) => (
            <Card key={dashboard.id} className="group relative hover:border-primary/50 transition-colors">
              <Link href={`/dashboards/${dashboard.id}`}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <LayoutDashboard className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{dashboard.name}</CardTitle>
                        <CardDescription className="mt-1 line-clamp-2">
                          {dashboard.description || 'No description'}
                        </CardDescription>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      <span>Updated {formatDate(dashboard.updatedAt)}</span>
                    </div>
                    {dashboard.isShared ? (
                      <Badge variant="secondary" className="gap-1">
                        <Globe className="h-3 w-3" />
                        Shared
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1">
                        <Lock className="h-3 w-3" />
                        Private
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Link>
              <div className="absolute top-4 right-4">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => e.preventDefault()}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href={`/dashboards/${dashboard.id}`}>
                        <Settings className="h-4 w-4 mr-2" />
                        Edit Widgets
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.preventDefault();
                        setEditDashboard({
                          id: dashboard.id,
                          name: dashboard.name,
                          description: dashboard.description || '',
                        });
                      }}
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Edit Name
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.preventDefault();
                        duplicateMutation.mutate(dashboard.id);
                      }}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.preventDefault();
                        setShareDashboard({
                          id: dashboard.id,
                          name: dashboard.name,
                          isShared: dashboard.isShared,
                        });
                      }}
                    >
                      <Share2 className="h-4 w-4 mr-2" />
                      Share
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={(e) => {
                        e.preventDefault();
                        setDeleteDashboardId(dashboard.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dashboard Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={resetCreateDialog}>
        <DialogContent size="2xl">
          <DialogHeader>
            <DialogTitle>Create New Dashboard</DialogTitle>
            <DialogDescription>
              Select a template or create a blank dashboard to visualize your NATS metrics
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Template Selection */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Start from a Template</label>
                {selectedTemplate && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedTemplate(null);
                      setNewDashboardName('');
                      setNewDashboardDescription('');
                    }}
                  >
                    Clear Selection
                  </Button>
                )}
              </div>
              <div className="space-y-4">
                {templateCategories.map((category) => {
                  const categoryTemplates = dashboardTemplates.filter(
                    (t) => t.category === category.id
                  );
                  return (
                    <div key={category.id} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-muted-foreground">
                          {category.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          — {category.description}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {categoryTemplates.map((template) => {
                          const IconComponent = template.icon;
                          const isSelected = selectedTemplate?.id === template.id;
                          return (
                            <button
                              key={template.id}
                              type="button"
                              onClick={() => handleSelectTemplate(template)}
                              className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
                                isSelected
                                  ? 'border-primary bg-primary/5'
                                  : 'border-border hover:border-primary/50 hover:bg-muted/50'
                              }`}
                            >
                              <div
                                className={`p-2 rounded-lg ${
                                  isSelected ? 'bg-primary/10' : 'bg-muted'
                                }`}
                              >
                                <IconComponent
                                  className={`h-4 w-4 ${
                                    isSelected ? 'text-primary' : 'text-muted-foreground'
                                  }`}
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p
                                  className={`text-sm font-medium ${
                                    isSelected ? 'text-primary' : ''
                                  }`}
                                >
                                  {template.name}
                                </p>
                                <p className="text-xs text-muted-foreground line-clamp-2">
                                  {template.description}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="border-t pt-4 space-y-4">
              {/* Cluster selector - only show when template is selected */}
              {selectedTemplate && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Cluster *</label>
                  <Select value={selectedClusterId} onValueChange={setSelectedClusterId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a cluster for widgets" />
                    </SelectTrigger>
                    <SelectContent>
                      {clustersData?.clusters?.map((cluster: any) => (
                        <SelectItem key={cluster.id} value={cluster.id}>
                          {cluster.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    All widgets will fetch data from this cluster
                  </p>
                </div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium">Name *</label>
                <Input
                  placeholder="e.g., Production Metrics"
                  value={newDashboardName}
                  onChange={(e) => setNewDashboardName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Description</label>
                <Input
                  placeholder="Optional description..."
                  value={newDashboardDescription}
                  onChange={(e) => setNewDashboardDescription(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetCreateDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={
                !newDashboardName.trim() ||
                createMutation.isPending ||
                !!(selectedTemplate && !selectedClusterId)
              }
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {selectedTemplate ? 'Create from Template' : 'Create Blank Dashboard'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteDashboardId} onOpenChange={() => setDeleteDashboardId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Dashboard?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the dashboard and all its widgets.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteDashboardId && deleteMutation.mutate(deleteDashboardId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Share Dashboard Dialog */}
      <Dialog open={!!shareDashboard} onOpenChange={() => setShareDashboard(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share Dashboard</DialogTitle>
            <DialogDescription>
              Control who can view &quot;{shareDashboard?.name}&quot; in your organization
            </DialogDescription>
          </DialogHeader>
          <div className="py-6">
            <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-background">
                  {shareDashboard?.isShared ? (
                    <Globe className="h-5 w-5 text-primary" />
                  ) : (
                    <Lock className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <Label htmlFor="share-toggle" className="text-base font-medium">
                    Share with organization
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {shareDashboard?.isShared
                      ? 'Everyone in your organization can view this dashboard'
                      : 'Only you can view this dashboard'}
                  </p>
                </div>
              </div>
              <Switch
                id="share-toggle"
                checked={shareDashboard?.isShared ?? false}
                onCheckedChange={(checked) => {
                  if (shareDashboard) {
                    setShareDashboard({ ...shareDashboard, isShared: checked });
                  }
                }}
              />
            </div>

            {shareDashboard?.isShared && (
              <div className="mt-4 p-4 rounded-lg border border-primary/20 bg-primary/5">
                <div className="flex items-start gap-3">
                  <Users className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Organization Access</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      All team members will be able to view this dashboard. They cannot modify
                      or delete it unless they have admin permissions.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShareDashboard(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (shareDashboard) {
                  shareMutation.mutate({
                    id: shareDashboard.id,
                    isShared: shareDashboard.isShared,
                  });
                }
              }}
              disabled={shareMutation.isPending}
            >
              {shareMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : shareDashboard?.isShared ? (
                <Globe className="h-4 w-4 mr-2" />
              ) : (
                <Lock className="h-4 w-4 mr-2" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dashboard Dialog */}
      <Dialog open={!!editDashboard} onOpenChange={() => setEditDashboard(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Dashboard</DialogTitle>
            <DialogDescription>
              Update the name and description of your dashboard
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name *</label>
              <Input
                placeholder="e.g., Production Metrics"
                value={editDashboard?.name || ''}
                onChange={(e) =>
                  editDashboard && setEditDashboard({ ...editDashboard, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Input
                placeholder="Optional description..."
                value={editDashboard?.description || ''}
                onChange={(e) =>
                  editDashboard &&
                  setEditDashboard({ ...editDashboard, description: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDashboard(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (editDashboard) {
                  updateMutation.mutate({
                    id: editDashboard.id,
                    name: editDashboard.name,
                    description: editDashboard.description,
                  });
                }
              }}
              disabled={!editDashboard?.name.trim() || updateMutation.isPending}
            >
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Edit className="h-4 w-4" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
