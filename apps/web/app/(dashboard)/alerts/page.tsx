'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Plus,
  Bell,
  BellOff,
  AlertTriangle,
  CheckCircle,
  Clock,
  MoreVertical,
  Trash2,
  Edit,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function AlertsPage() {
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'resolved'>('all');

  const { data: clustersData } = useQuery({
    queryKey: ['clusters'],
    queryFn: () => api.clusters.list(),
  });

  const { data: alertsData, isLoading } = useQuery({
    queryKey: ['alerts', selectedCluster],
    queryFn: () => (selectedCluster ? api.alerts.list(selectedCluster) : null),
    enabled: !!selectedCluster,
  });

  // Auto-select first cluster
  if (clustersData?.clusters?.length && !selectedCluster) {
    setSelectedCluster(clustersData.clusters[0].id);
  }

  const filteredAlerts = alertsData?.alerts?.filter((alert: any) => {
    if (filter === 'all') return true;
    if (filter === 'active') return alert.status === 'firing' || alert.status === 'pending';
    if (filter === 'resolved') return alert.status === 'resolved';
    return true;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'firing':
        return <AlertTriangle className="h-5 w-5 text-red-500" />;
      case 'pending':
        return <Clock className="h-5 w-5 text-yellow-500" />;
      case 'resolved':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      default:
        return <Bell className="h-5 w-5 text-gray-500" />;
    }
  };

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

  const formatTimeAgo = (timestamp: string) => {
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Alerts</h1>
          <p className="text-muted-foreground">Monitor and manage alert rules</p>
        </div>
        <Button disabled={!selectedCluster}>
          <Plus className="h-4 w-4" />
          Create Alert Rule
        </Button>
      </div>

      <div className="flex gap-4">
        <select
          className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={selectedCluster || ''}
          onChange={(e) => setSelectedCluster(e.target.value)}
        >
          <option value="">Select cluster...</option>
          {clustersData?.clusters?.map((cluster: any) => (
            <option key={cluster.id} value={cluster.id}>
              {cluster.name}
            </option>
          ))}
        </select>
        <div className="flex rounded-md border">
          {(['all', 'active', 'resolved'] as const).map((f) => (
            <button
              key={f}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                filter === f
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
              } ${f === 'all' ? 'rounded-l-md' : ''} ${f === 'resolved' ? 'rounded-r-md' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {!selectedCluster && (
        <Card>
          <CardContent className="py-12 text-center">
            <Bell className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Select a cluster</h3>
            <p className="text-muted-foreground">Choose a cluster to view alerts</p>
          </CardContent>
        </Card>
      )}

      {selectedCluster && isLoading && (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      )}

      {selectedCluster && filteredAlerts && filteredAlerts.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <BellOff className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No alerts found</h3>
            <p className="text-muted-foreground mb-4">
              {filter !== 'all' ? `No ${filter} alerts` : 'Create your first alert rule to get started'}
            </p>
            {filter === 'all' && (
              <Button>
                <Plus className="h-4 w-4" />
                Create Alert Rule
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {filteredAlerts && filteredAlerts.length > 0 && (
        <div className="space-y-4">
          {/* Alert Rules Section */}
          <Card>
            <CardHeader>
              <CardTitle>Alert Rules</CardTitle>
              <CardDescription>Configured alert rules for this cluster</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {filteredAlerts.map((alert: any) => (
                  <div
                    key={alert.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/30"
                  >
                    <div className="flex items-center gap-4">
                      {getStatusIcon(alert.status)}
                      <div>
                        <h4 className="font-medium">{alert.name}</h4>
                        <p className="text-sm text-muted-foreground">
                          {alert.condition} {alert.operator} {alert.threshold}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {getSeverityBadge(alert.severity)}
                      <span className="text-sm text-muted-foreground">
                        {alert.lastTriggered ? formatTimeAgo(alert.lastTriggered) : 'Never triggered'}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Recent Alert Events */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Events</CardTitle>
              <CardDescription>Latest alert activity</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center gap-4 p-3 bg-red-50 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Consumer lag exceeded threshold</p>
                    <p className="text-xs text-muted-foreground">
                      ORDERS stream - lag-alert rule triggered
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">2m ago</span>
                </div>
                <div className="flex items-center gap-4 p-3 bg-green-50 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Alert resolved</p>
                    <p className="text-xs text-muted-foreground">
                      EVENTS stream - throughput-alert back to normal
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">15m ago</span>
                </div>
                <div className="flex items-center gap-4 p-3 bg-yellow-50 rounded-lg">
                  <Clock className="h-5 w-5 text-yellow-500" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Alert pending</p>
                    <p className="text-xs text-muted-foreground">
                      LOGS stream - storage-alert approaching threshold
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">1h ago</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
