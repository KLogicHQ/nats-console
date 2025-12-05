'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Bell,
  BellOff,
  AlertTriangle,
  CheckCircle,
  Clock,
  Trash2,
  Edit,
  Power,
  PowerOff,
  RefreshCw,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface AlertRule {
  id: string;
  name: string;
  clusterId: string | null;
  condition: {
    metric: string;
    operator: string;
    window: number;
    aggregation: string;
  };
  threshold: {
    value: number;
    type: string;
  };
  severity: string;
  channels: Array<{ type: string; config: any }>;
  isEnabled: boolean;
  cooldownMins: number;
  lastTriggeredAt: string | null;
  createdAt: string;
  cluster?: { id: string; name: string } | null;
}

const defaultRule = {
  name: '',
  clusterId: null as string | null,
  condition: {
    metric: 'consumer_lag',
    operator: 'gt',
    window: 300,
    aggregation: 'avg',
  },
  threshold: {
    value: 1000,
    type: 'absolute',
  },
  severity: 'warning',
  channels: [{ type: 'email', config: {} }],
  isEnabled: true,
  cooldownMins: 5,
};

export default function AlertsPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<AlertRule | null>(null);
  const [formData, setFormData] = useState(defaultRule);

  const { data: clustersData } = useQuery({
    queryKey: ['clusters'],
    queryFn: () => api.clusters.list(),
  });

  const { data: rulesData, isLoading, refetch } = useQuery({
    queryKey: ['alert-rules'],
    queryFn: () => api.alerts.listRules(),
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof defaultRule) => api.alerts.createRule(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-rules'] });
      setIsCreateOpen(false);
      setFormData(defaultRule);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<typeof defaultRule> }) =>
      api.alerts.updateRule(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-rules'] });
      setIsEditOpen(false);
      setSelectedRule(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.alerts.deleteRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-rules'] });
      setIsDeleteOpen(false);
      setSelectedRule(null);
    },
  });

  const filteredRules = rulesData?.rules?.filter((rule: AlertRule) => {
    if (filter === 'all') return true;
    if (filter === 'enabled') return rule.isEnabled;
    if (filter === 'disabled') return !rule.isEnabled;
    return true;
  });

  const getSeverityBadge = (severity: string) => {
    const colors: Record<string, string> = {
      critical: 'bg-red-100 text-red-700',
      warning: 'bg-yellow-100 text-yellow-700',
      info: 'bg-blue-100 text-blue-700',
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${colors[severity] || 'bg-gray-100 text-gray-700'}`}>
        {severity}
      </span>
    );
  };

  const formatTimeAgo = (timestamp: string | null) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMins > 0) return `${diffMins}m ago`;
    return 'Just now';
  };

  const handleCreate = () => {
    createMutation.mutate(formData);
  };

  const handleEdit = (rule: AlertRule) => {
    setSelectedRule(rule);
    setFormData({
      name: rule.name,
      clusterId: rule.clusterId,
      condition: rule.condition,
      threshold: rule.threshold,
      severity: rule.severity,
      channels: rule.channels,
      isEnabled: rule.isEnabled,
      cooldownMins: rule.cooldownMins,
    });
    setIsEditOpen(true);
  };

  const handleUpdate = () => {
    if (!selectedRule) return;
    updateMutation.mutate({ id: selectedRule.id, data: formData });
  };

  const handleToggleEnabled = async (rule: AlertRule) => {
    await updateMutation.mutateAsync({
      id: rule.id,
      data: { isEnabled: !rule.isEnabled },
    });
  };

  const handleDelete = (rule: AlertRule) => {
    setSelectedRule(rule);
    setIsDeleteOpen(true);
  };

  const confirmDelete = () => {
    if (selectedRule) {
      deleteMutation.mutate(selectedRule.id);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Alerts</h1>
          <p className="text-muted-foreground">Monitor and manage alert rules</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button onClick={() => {
            setFormData(defaultRule);
            setIsCreateOpen(true);
          }}>
            <Plus className="h-4 w-4" />
            Create Rule
          </Button>
        </div>
      </div>

      <div className="flex gap-4">
        <div className="flex rounded-md border">
          {(['all', 'enabled', 'disabled'] as const).map((f) => (
            <button
              key={f}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                filter === f
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
              } ${f === 'all' ? 'rounded-l-md' : ''} ${f === 'disabled' ? 'rounded-r-md' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      )}

      {!isLoading && (!filteredRules || filteredRules.length === 0) && (
        <Card>
          <CardContent className="py-12 text-center">
            <BellOff className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No alert rules found</h3>
            <p className="text-muted-foreground mb-4">
              {filter !== 'all' ? `No ${filter} rules` : 'Create your first alert rule to get started'}
            </p>
            {filter === 'all' && (
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                Create Alert Rule
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {filteredRules && filteredRules.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Alert Rules</CardTitle>
            <CardDescription>{filteredRules.length} rule{filteredRules.length !== 1 ? 's' : ''} configured</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {filteredRules.map((rule: AlertRule) => (
                <div
                  key={rule.id}
                  className={`flex items-center justify-between p-4 border rounded-lg hover:bg-muted/30 ${
                    !rule.isEnabled ? 'opacity-60' : ''
                  }`}
                >
                  <div className="flex items-center gap-4">
                    {rule.isEnabled ? (
                      <Bell className="h-5 w-5 text-primary" />
                    ) : (
                      <BellOff className="h-5 w-5 text-muted-foreground" />
                    )}
                    <div>
                      <h4 className="font-medium">{rule.name}</h4>
                      <p className="text-sm text-muted-foreground">
                        {rule.condition.metric} {rule.condition.operator} {rule.threshold.value}
                        {rule.cluster && ` • ${rule.cluster.name}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {getSeverityBadge(rule.severity)}
                    <span className="text-sm text-muted-foreground min-w-[80px]">
                      {formatTimeAgo(rule.lastTriggeredAt)}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleToggleEnabled(rule)}
                        title={rule.isEnabled ? 'Disable' : 'Enable'}
                      >
                        {rule.isEnabled ? (
                          <Power className="h-4 w-4 text-green-500" />
                        ) : (
                          <PowerOff className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(rule)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(rule)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Alert Rule Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create Alert Rule</DialogTitle>
            <DialogDescription>
              Configure a new alert rule to monitor your NATS streams
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input
                placeholder="e.g., High consumer lag alert"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Cluster (optional)</label>
              <Select
                value={formData.clusterId || 'all'}
                onValueChange={(v) => setFormData({ ...formData, clusterId: v === 'all' ? null : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All clusters" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All clusters</SelectItem>
                  {clustersData?.clusters?.map((cluster: any) => (
                    <SelectItem key={cluster.id} value={cluster.id}>
                      {cluster.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Metric</label>
                <Select
                  value={formData.condition.metric}
                  onValueChange={(v) =>
                    setFormData({
                      ...formData,
                      condition: { ...formData.condition, metric: v },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="consumer_lag">Consumer Lag</SelectItem>
                    <SelectItem value="message_rate">Message Rate</SelectItem>
                    <SelectItem value="stream_size">Stream Size</SelectItem>
                    <SelectItem value="pending_count">Pending Count</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Operator</label>
                <Select
                  value={formData.condition.operator}
                  onValueChange={(v) =>
                    setFormData({
                      ...formData,
                      condition: { ...formData.condition, operator: v },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gt">Greater than</SelectItem>
                    <SelectItem value="lt">Less than</SelectItem>
                    <SelectItem value="gte">Greater or equal</SelectItem>
                    <SelectItem value="lte">Less or equal</SelectItem>
                    <SelectItem value="eq">Equals</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Threshold</label>
                <Input
                  type="number"
                  value={formData.threshold.value}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      threshold: { ...formData.threshold, value: Number(e.target.value) },
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Severity</label>
                <Select
                  value={formData.severity}
                  onValueChange={(v) => setFormData({ ...formData, severity: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="info">Info</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Cooldown (minutes)</label>
              <Input
                type="number"
                value={formData.cooldownMins}
                onChange={(e) => setFormData({ ...formData, cooldownMins: Number(e.target.value) })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!formData.name || createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create Rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Alert Rule Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Alert Rule</DialogTitle>
            <DialogDescription>
              Update the alert rule configuration
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Cluster (optional)</label>
              <Select
                value={formData.clusterId || 'all'}
                onValueChange={(v) => setFormData({ ...formData, clusterId: v === 'all' ? null : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All clusters" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All clusters</SelectItem>
                  {clustersData?.clusters?.map((cluster: any) => (
                    <SelectItem key={cluster.id} value={cluster.id}>
                      {cluster.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Metric</label>
                <Select
                  value={formData.condition.metric}
                  onValueChange={(v) =>
                    setFormData({
                      ...formData,
                      condition: { ...formData.condition, metric: v },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="consumer_lag">Consumer Lag</SelectItem>
                    <SelectItem value="message_rate">Message Rate</SelectItem>
                    <SelectItem value="stream_size">Stream Size</SelectItem>
                    <SelectItem value="pending_count">Pending Count</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Operator</label>
                <Select
                  value={formData.condition.operator}
                  onValueChange={(v) =>
                    setFormData({
                      ...formData,
                      condition: { ...formData.condition, operator: v },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gt">Greater than</SelectItem>
                    <SelectItem value="lt">Less than</SelectItem>
                    <SelectItem value="gte">Greater or equal</SelectItem>
                    <SelectItem value="lte">Less or equal</SelectItem>
                    <SelectItem value="eq">Equals</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Threshold</label>
                <Input
                  type="number"
                  value={formData.threshold.value}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      threshold: { ...formData.threshold, value: Number(e.target.value) },
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Severity</label>
                <Select
                  value={formData.severity}
                  onValueChange={(v) => setFormData({ ...formData, severity: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="info">Info</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Cooldown (minutes)</label>
              <Input
                type="number"
                value={formData.cooldownMins}
                onChange={(e) => setFormData({ ...formData, cooldownMins: Number(e.target.value) })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={!formData.name || updateMutation.isPending}>
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Alert Rule</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{selectedRule?.name}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
