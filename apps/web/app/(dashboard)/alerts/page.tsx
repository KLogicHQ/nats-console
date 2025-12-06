'use client';

import { Suspense, useState } from 'react';
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
  Send,
  Mail,
  MessageSquare,
  Webhook,
  AlertCircle,
  XCircle,
  Eye,
  Play,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { TabsList, useTabs, Tab } from '@/components/ui/tabs';
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

// Types
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
  isEnabled: boolean;
  cooldownMins: number;
  createdAt: string;
  cluster?: { id: string; name: string } | null;
  notificationChannels?: Array<{ channel: NotificationChannel }>;
}

interface NotificationChannel {
  id: string;
  name: string;
  type: 'slack' | 'email' | 'teams' | 'pagerduty' | 'google_chat' | 'webhook';
  config: Record<string, any>;
  isEnabled: boolean;
  createdAt: string;
}

interface Incident {
  id: string;
  ruleId: string;
  status: 'open' | 'acknowledged' | 'resolved' | 'closed';
  triggeredAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  metadata: Record<string, any>;
  rule: {
    id: string;
    name: string;
    severity: string;
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
    clusterId: string | null;
    cluster: { id: string; name: string } | null;
  };
}

// Tab configuration
const tabs: Tab[] = [
  { id: 'incidents', label: 'Incidents', icon: AlertCircle },
  { id: 'rules', label: 'Alert Rules', icon: Bell },
  { id: 'channels', label: 'Notification Channels', icon: Send },
];

// Alert Rule Templates (Golden Signals)
interface AlertRuleTemplate {
  id: string;
  name: string;
  description: string;
  category: 'latency' | 'traffic' | 'errors' | 'saturation';
  config: {
    name: string;
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
    cooldownMins: number;
  };
}

const alertRuleTemplates: AlertRuleTemplate[] = [
  // Latency (Consumer Lag)
  {
    id: 'consumer-lag-critical',
    name: 'Consumer Lag - Critical',
    description: 'Alert when consumer lag exceeds 10,000 messages',
    category: 'latency',
    config: {
      name: 'Consumer Lag Critical',
      condition: { metric: 'consumer_lag', operator: 'gt', window: 300, aggregation: 'avg' },
      threshold: { value: 10000, type: 'absolute' },
      severity: 'critical',
      cooldownMins: 5,
    },
  },
  {
    id: 'consumer-lag-warning',
    name: 'Consumer Lag - Warning',
    description: 'Alert when consumer lag exceeds 1,000 messages',
    category: 'latency',
    config: {
      name: 'Consumer Lag Warning',
      condition: { metric: 'consumer_lag', operator: 'gt', window: 300, aggregation: 'avg' },
      threshold: { value: 1000, type: 'absolute' },
      severity: 'warning',
      cooldownMins: 10,
    },
  },
  // Traffic (Message Rate)
  {
    id: 'message-rate-spike',
    name: 'Message Rate Spike',
    description: 'Alert when message rate exceeds 10,000 msg/s',
    category: 'traffic',
    config: {
      name: 'High Message Rate',
      condition: { metric: 'message_rate', operator: 'gt', window: 60, aggregation: 'avg' },
      threshold: { value: 10000, type: 'absolute' },
      severity: 'warning',
      cooldownMins: 15,
    },
  },
  {
    id: 'message-rate-drop',
    name: 'Message Rate Drop',
    description: 'Alert when message rate drops below 10 msg/s',
    category: 'traffic',
    config: {
      name: 'Low Message Rate',
      condition: { metric: 'message_rate', operator: 'lt', window: 300, aggregation: 'avg' },
      threshold: { value: 10, type: 'absolute' },
      severity: 'warning',
      cooldownMins: 10,
    },
  },
  {
    id: 'no-messages',
    name: 'No Messages (Dead Stream)',
    description: 'Alert when no messages received for 5 minutes',
    category: 'traffic',
    config: {
      name: 'Dead Stream - No Messages',
      condition: { metric: 'message_rate', operator: 'eq', window: 300, aggregation: 'avg' },
      threshold: { value: 0, type: 'absolute' },
      severity: 'critical',
      cooldownMins: 5,
    },
  },
  // Errors (Pending/Redelivery)
  {
    id: 'pending-high',
    name: 'High Pending Messages',
    description: 'Alert when pending messages exceed 5,000',
    category: 'errors',
    config: {
      name: 'High Pending Count',
      condition: { metric: 'pending_count', operator: 'gt', window: 300, aggregation: 'avg' },
      threshold: { value: 5000, type: 'absolute' },
      severity: 'warning',
      cooldownMins: 10,
    },
  },
  {
    id: 'pending-critical',
    name: 'Critical Pending Messages',
    description: 'Alert when pending messages exceed 50,000',
    category: 'errors',
    config: {
      name: 'Critical Pending Count',
      condition: { metric: 'pending_count', operator: 'gt', window: 300, aggregation: 'avg' },
      threshold: { value: 50000, type: 'absolute' },
      severity: 'critical',
      cooldownMins: 5,
    },
  },
  // Saturation (Stream Size)
  {
    id: 'stream-size-warning',
    name: 'Stream Size Warning',
    description: 'Alert when stream size exceeds 1GB',
    category: 'saturation',
    config: {
      name: 'Stream Size Warning',
      condition: { metric: 'stream_size', operator: 'gt', window: 300, aggregation: 'max' },
      threshold: { value: 1073741824, type: 'absolute' }, // 1GB in bytes
      severity: 'warning',
      cooldownMins: 30,
    },
  },
  {
    id: 'stream-size-critical',
    name: 'Stream Size Critical',
    description: 'Alert when stream size exceeds 10GB',
    category: 'saturation',
    config: {
      name: 'Stream Size Critical',
      condition: { metric: 'stream_size', operator: 'gt', window: 300, aggregation: 'max' },
      threshold: { value: 10737418240, type: 'absolute' }, // 10GB in bytes
      severity: 'critical',
      cooldownMins: 15,
    },
  },
];

const templateCategories = [
  { id: 'latency', name: 'Latency', description: 'Consumer lag monitoring' },
  { id: 'traffic', name: 'Traffic', description: 'Message rate monitoring' },
  { id: 'errors', name: 'Errors', description: 'Pending & failed messages' },
  { id: 'saturation', name: 'Saturation', description: 'Resource utilization' },
];

// Default form data
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
  channelIds: [] as string[],
  isEnabled: true,
  cooldownMins: 5,
};

type ChannelType = 'email' | 'slack' | 'pagerduty' | 'webhook' | 'teams' | 'google_chat';

const defaultChannel: {
  name: string;
  type: ChannelType;
  config: Record<string, any>;
  isEnabled: boolean;
} = {
  name: '',
  type: 'slack',
  config: {},
  isEnabled: true,
};

// Helper functions
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

const getStatusBadge = (status: string) => {
  const config: Record<string, { color: string; icon: any }> = {
    open: { color: 'bg-red-100 text-red-700', icon: AlertCircle },
    acknowledged: { color: 'bg-yellow-100 text-yellow-700', icon: Eye },
    resolved: { color: 'bg-green-100 text-green-700', icon: CheckCircle },
    closed: { color: 'bg-gray-100 text-gray-700', icon: XCircle },
  };
  const { color, icon: Icon } = config[status] || config.open;
  return (
    <span className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${color}`}>
      <Icon className="h-3 w-3" />
      {status}
    </span>
  );
};

const getChannelIcon = (type: string) => {
  const icons: Record<string, any> = {
    slack: MessageSquare,
    email: Mail,
    teams: MessageSquare,
    pagerduty: AlertTriangle,
    google_chat: MessageSquare,
    webhook: Webhook,
  };
  return icons[type] || Send;
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

const formatOperator = (op: string): string => {
  const operators: Record<string, string> = {
    gt: '>',
    lt: '<',
    gte: '>=',
    lte: '<=',
    eq: '=',
    neq: '!=',
  };
  return operators[op] || op;
};

const formatWindow = (seconds: number): string => {
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h`;
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m`;
  return `${seconds}s`;
};

// Parse metric name to extract stream/consumer info
// Formats: "stream.STREAM_NAME.metric" or "consumer.STREAM.CONSUMER.metric"
const parseMetricName = (metric: string): { stream?: string; consumer?: string; metricName: string } => {
  const parts = metric.split('.');
  if (parts[0] === 'stream' && parts.length >= 3) {
    return { stream: parts[1], metricName: parts.slice(2).join('.') };
  }
  if (parts[0] === 'consumer' && parts.length >= 4) {
    return { stream: parts[1], consumer: parts[2], metricName: parts.slice(3).join('.') };
  }
  return { metricName: metric };
};

const formatMetricLabel = (metric: string): string => {
  const labels: Record<string, string> = {
    consumer_lag: 'Consumer Lag',
    message_rate: 'Message Rate',
    messages_rate: 'Messages/sec',
    bytes_rate: 'Bytes Rate',
    stream_size: 'Stream Size',
    pending_count: 'Pending Count',
    ack_rate: 'Ack Rate',
    redelivered_count: 'Redelivered Count',
    messages_count: 'Message Count',
    lag: 'Lag',
  };
  return labels[metric] || metric.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
};

function AlertsPageContent() {
  const queryClient = useQueryClient();
  const { activeTab, setActiveTab } = useTabs(tabs, 'incidents');

  // Incidents state
  const [incidentFilter, setIncidentFilter] = useState<'all' | 'open' | 'acknowledged' | 'resolved' | 'closed'>('open');
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);

  // Rules state
  const [ruleFilter, setRuleFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [isCreateRuleOpen, setIsCreateRuleOpen] = useState(false);
  const [isEditRuleOpen, setIsEditRuleOpen] = useState(false);
  const [isDeleteRuleOpen, setIsDeleteRuleOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<AlertRule | null>(null);
  const [ruleFormData, setRuleFormData] = useState(defaultRule);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(true);

  // Channels state
  const [isCreateChannelOpen, setIsCreateChannelOpen] = useState(false);
  const [isEditChannelOpen, setIsEditChannelOpen] = useState(false);
  const [isDeleteChannelOpen, setIsDeleteChannelOpen] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<NotificationChannel | null>(null);
  const [channelFormData, setChannelFormData] = useState(defaultChannel);

  // Queries
  const { data: clustersData } = useQuery({
    queryKey: ['clusters'],
    queryFn: () => api.clusters.list(),
  });

  const { data: rulesData, isLoading: rulesLoading, refetch: refetchRules } = useQuery({
    queryKey: ['alert-rules'],
    queryFn: () => api.alerts.listRules(),
  });

  const { data: channelsData, isLoading: channelsLoading, refetch: refetchChannels } = useQuery({
    queryKey: ['notification-channels'],
    queryFn: () => api.alerts.listChannels(),
  });

  const { data: incidentsData, isLoading: incidentsLoading, refetch: refetchIncidents } = useQuery({
    queryKey: ['incidents', incidentFilter],
    queryFn: () => api.alerts.listIncidents(incidentFilter !== 'all' ? { status: incidentFilter } : undefined),
  });

  // Rule mutations
  const createRuleMutation = useMutation({
    mutationFn: (data: typeof defaultRule) => api.alerts.createRule(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-rules'] });
      setIsCreateRuleOpen(false);
      setRuleFormData(defaultRule);
    },
  });

  const updateRuleMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<typeof defaultRule> }) =>
      api.alerts.updateRule(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-rules'] });
      setIsEditRuleOpen(false);
      setSelectedRule(null);
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (id: string) => api.alerts.deleteRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-rules'] });
      setIsDeleteRuleOpen(false);
      setSelectedRule(null);
    },
  });

  // Channel mutations
  const createChannelMutation = useMutation({
    mutationFn: (data: typeof defaultChannel) => api.alerts.createChannel(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-channels'] });
      setIsCreateChannelOpen(false);
      setChannelFormData(defaultChannel);
    },
  });

  const updateChannelMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<typeof defaultChannel> }) =>
      api.alerts.updateChannel(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-channels'] });
      setIsEditChannelOpen(false);
      setSelectedChannel(null);
    },
  });

  const deleteChannelMutation = useMutation({
    mutationFn: (id: string) => api.alerts.deleteChannel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-channels'] });
      setIsDeleteChannelOpen(false);
      setSelectedChannel(null);
    },
  });

  const testChannelMutation = useMutation({
    mutationFn: (id: string) => api.alerts.testChannel(id),
  });

  // Incident mutations
  const acknowledgeIncidentMutation = useMutation({
    mutationFn: (id: string) => api.alerts.acknowledgeIncident(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['incidents'] }),
  });

  const resolveIncidentMutation = useMutation({
    mutationFn: (id: string) => api.alerts.resolveIncident(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['incidents'] }),
  });

  const closeIncidentMutation = useMutation({
    mutationFn: (id: string) => api.alerts.closeIncident(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['incidents'] }),
  });

  // Filter data
  const filteredRules = rulesData?.rules?.filter((rule: AlertRule) => {
    if (ruleFilter === 'all') return true;
    if (ruleFilter === 'enabled') return rule.isEnabled;
    if (ruleFilter === 'disabled') return !rule.isEnabled;
    return true;
  });

  // Handlers
  const handleEditRule = (rule: AlertRule) => {
    setSelectedRule(rule);
    setRuleFormData({
      name: rule.name,
      clusterId: rule.clusterId,
      condition: rule.condition,
      threshold: rule.threshold,
      severity: rule.severity,
      channelIds: rule.notificationChannels?.map(nc => nc.channel.id) || [],
      isEnabled: rule.isEnabled,
      cooldownMins: rule.cooldownMins,
    });
    setIsEditRuleOpen(true);
  };

  const handleToggleRuleEnabled = async (rule: AlertRule) => {
    await updateRuleMutation.mutateAsync({
      id: rule.id,
      data: { isEnabled: !rule.isEnabled },
    });
  };

  const handleEditChannel = (channel: NotificationChannel) => {
    setSelectedChannel(channel);
    setChannelFormData({
      name: channel.name,
      type: channel.type,
      config: channel.config,
      isEnabled: channel.isEnabled,
    });
    setIsEditChannelOpen(true);
  };

  const handleToggleChannelEnabled = async (channel: NotificationChannel) => {
    await updateChannelMutation.mutateAsync({
      id: channel.id,
      data: { isEnabled: !channel.isEnabled },
    });
  };

  const getChannelConfigFields = (type: string) => {
    switch (type) {
      case 'slack':
        return [{ key: 'webhookUrl', label: 'Webhook URL', placeholder: 'https://hooks.slack.com/...' }];
      case 'email':
        return [
          { key: 'recipients', label: 'Recipients (comma-separated)', placeholder: 'alerts@company.com' },
          { key: 'fromAddress', label: 'From Address (optional)', placeholder: 'noreply@company.com' },
        ];
      case 'teams':
        return [{ key: 'webhookUrl', label: 'Webhook URL', placeholder: 'https://outlook.office.com/...' }];
      case 'pagerduty':
        return [
          { key: 'routingKey', label: 'Routing Key', placeholder: 'Your integration key' },
          { key: 'serviceId', label: 'Service ID (optional)', placeholder: 'P123ABC' },
        ];
      case 'google_chat':
        return [{ key: 'webhookUrl', label: 'Webhook URL', placeholder: 'https://chat.googleapis.com/...' }];
      case 'webhook':
        return [
          { key: 'url', label: 'URL', placeholder: 'https://your-api.com/webhook' },
          { key: 'secret', label: 'Secret (optional)', placeholder: 'For signing payloads' },
        ];
      default:
        return [];
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Alerts</h1>
          <p className="text-muted-foreground">Manage incidents, alert rules, and notification channels</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              refetchIncidents();
              refetchRules();
              refetchChannels();
            }}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          {activeTab === 'rules' && (
            <Button onClick={() => {
              setRuleFormData(defaultRule);
              setSelectedTemplate(null);
              setShowTemplates(true);
              setIsCreateRuleOpen(true);
            }}>
              <Plus className="h-4 w-4" />
              Create Rule
            </Button>
          )}
          {activeTab === 'channels' && (
            <Button onClick={() => {
              setChannelFormData(defaultChannel);
              setIsCreateChannelOpen(true);
            }}>
              <Plus className="h-4 w-4" />
              Add Channel
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <TabsList tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Incidents Tab */}
      {activeTab === 'incidents' && (
        <div className="space-y-4">
          <div className="flex gap-4">
            <div className="flex rounded-md border">
              {(['all', 'open', 'acknowledged', 'resolved', 'closed'] as const).map((f, i, arr) => (
                <button
                  key={f}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    incidentFilter === f
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                  } ${i === 0 ? 'rounded-l-md' : ''} ${i === arr.length - 1 ? 'rounded-r-md' : ''}`}
                  onClick={() => setIncidentFilter(f)}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {incidentsLoading && (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          )}

          {!incidentsLoading && (!incidentsData?.incidents || incidentsData.incidents.length === 0) && (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-4" />
                <h3 className="text-lg font-semibold mb-2">No incidents</h3>
                <p className="text-muted-foreground">
                  {incidentFilter !== 'all' ? `No ${incidentFilter} incidents` : 'All systems are operating normally'}
                </p>
              </CardContent>
            </Card>
          )}

          {incidentsData?.incidents && incidentsData.incidents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Incidents</CardTitle>
                <CardDescription>{incidentsData.total} incident{incidentsData.total !== 1 ? 's' : ''}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {incidentsData.incidents.map((incident: Incident) => {
                    const parsedMetric = parseMetricName(incident.rule.condition.metric);
                    return (
                    <div
                      key={incident.id}
                      className={`border rounded-lg hover:bg-muted/30 cursor-pointer ${
                        selectedIncident?.id === incident.id ? 'ring-2 ring-primary' : ''
                      }`}
                      onClick={() => setSelectedIncident(selectedIncident?.id === incident.id ? null : incident)}
                    >
                      <div className="flex items-center justify-between p-4">
                        <div className="flex items-center gap-4">
                          <AlertCircle className={`h-5 w-5 ${
                            incident.status === 'open' ? 'text-red-500' :
                            incident.status === 'acknowledged' ? 'text-yellow-500' :
                            'text-muted-foreground'
                          }`} />
                          <div>
                            <h4 className="font-medium hover:text-blue-600 transition-colors">{incident.rule.name}</h4>
                            <p className="text-sm text-muted-foreground">
                              Triggered {formatTimeAgo(incident.triggeredAt)}
                              {incident.acknowledgedAt && ` • Acknowledged ${formatTimeAgo(incident.acknowledgedAt)}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          {getSeverityBadge(incident.rule.severity)}
                          {getStatusBadge(incident.status)}
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            {incident.status === 'open' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => acknowledgeIncidentMutation.mutate(incident.id)}
                                disabled={acknowledgeIncidentMutation.isPending}
                              >
                                Acknowledge
                              </Button>
                            )}
                            {(incident.status === 'open' || incident.status === 'acknowledged') && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => resolveIncidentMutation.mutate(incident.id)}
                                disabled={resolveIncidentMutation.isPending}
                              >
                                Resolve
                              </Button>
                            )}
                            {incident.status !== 'closed' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => closeIncidentMutation.mutate(incident.id)}
                                disabled={closeIncidentMutation.isPending}
                              >
                                Close
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                      {/* Incident Details - Show when selected */}
                      {selectedIncident?.id === incident.id && (
                        <div className="px-4 pb-4 pt-0 border-t mt-0">
                          <div className="grid grid-cols-3 gap-4 pt-4">
                            {/* Resource Info */}
                            <div>
                              <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Resource</h5>
                              <dl className="space-y-1 text-sm">
                                <div className="flex justify-between">
                                  <dt className="text-muted-foreground">Cluster:</dt>
                                  <dd className="font-medium">{incident.rule.cluster?.name || 'All Clusters'}</dd>
                                </div>
                                {parsedMetric.stream && (
                                  <div className="flex justify-between">
                                    <dt className="text-muted-foreground">Stream:</dt>
                                    <dd className="font-medium font-mono text-xs">{parsedMetric.stream}</dd>
                                  </div>
                                )}
                                {parsedMetric.consumer && (
                                  <div className="flex justify-between">
                                    <dt className="text-muted-foreground">Consumer:</dt>
                                    <dd className="font-medium font-mono text-xs">{parsedMetric.consumer}</dd>
                                  </div>
                                )}
                                <div className="flex justify-between">
                                  <dt className="text-muted-foreground">Metric:</dt>
                                  <dd className="font-medium">{formatMetricLabel(parsedMetric.metricName)}</dd>
                                </div>
                              </dl>
                            </div>

                            {/* Rule Condition */}
                            <div>
                              <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Rule Condition</h5>
                              <div className="bg-muted rounded-md p-3">
                                <p className="text-sm font-mono">
                                  {incident.rule.condition.aggregation.toUpperCase()}({formatMetricLabel(parsedMetric.metricName)})
                                </p>
                                <p className="text-sm font-mono mt-1">
                                  over {formatWindow(incident.rule.condition.window)} window
                                </p>
                                <p className="text-sm font-medium mt-2">
                                  Threshold: {formatOperator(incident.rule.condition.operator)} {incident.rule.threshold.value.toLocaleString()}
                                </p>
                              </div>
                            </div>

                            {/* Violation Details */}
                            <div>
                              <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Violation</h5>
                              {incident.metadata && (incident.metadata.metricValue !== undefined || incident.metadata.message) ? (
                                <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-md p-3">
                                  {incident.metadata.metricValue !== undefined && (
                                    <p className="text-sm">
                                      <span className="text-muted-foreground">Actual Value: </span>
                                      <span className="font-bold text-red-600 dark:text-red-400">
                                        {Number(incident.metadata.metricValue).toLocaleString()}
                                      </span>
                                    </p>
                                  )}
                                  {incident.metadata.metricValue !== undefined && incident.rule.threshold && (
                                    <p className="text-sm mt-1">
                                      <span className="text-muted-foreground">Expected: </span>
                                      <span className="font-medium">
                                        {formatOperator(incident.rule.condition.operator)} {incident.rule.threshold.value.toLocaleString()}
                                      </span>
                                    </p>
                                  )}
                                  {incident.metadata.message && (
                                    <p className="text-xs mt-2 text-muted-foreground">{String(incident.metadata.message)}</p>
                                  )}
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground">No violation details available</p>
                              )}
                            </div>
                          </div>

                          {/* Timeline */}
                          <div className="mt-4 pt-3 border-t">
                            <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Timeline</h5>
                            <div className="flex gap-6 text-sm">
                              <div>
                                <span className="text-muted-foreground">Triggered:</span>{' '}
                                <span className="font-medium">{new Date(incident.triggeredAt).toLocaleString()}</span>
                              </div>
                              {incident.acknowledgedAt && (
                                <div>
                                  <span className="text-muted-foreground">Acknowledged:</span>{' '}
                                  <span className="font-medium">{new Date(incident.acknowledgedAt).toLocaleString()}</span>
                                </div>
                              )}
                              {incident.resolvedAt && (
                                <div>
                                  <span className="text-muted-foreground">Resolved:</span>{' '}
                                  <span className="font-medium">{new Date(incident.resolvedAt).toLocaleString()}</span>
                                </div>
                              )}
                              {incident.closedAt && (
                                <div>
                                  <span className="text-muted-foreground">Closed:</span>{' '}
                                  <span className="font-medium">{new Date(incident.closedAt).toLocaleString()}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="mt-3 pt-3 border-t">
                            <p className="text-xs text-muted-foreground">
                              Incident ID: <span className="font-mono">{incident.id}</span>
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Rules Tab */}
      {activeTab === 'rules' && (
        <div className="space-y-4">
          <div className="flex gap-4">
            <div className="flex rounded-md border">
              {(['all', 'enabled', 'disabled'] as const).map((f, i, arr) => (
                <button
                  key={f}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    ruleFilter === f
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                  } ${i === 0 ? 'rounded-l-md' : ''} ${i === arr.length - 1 ? 'rounded-r-md' : ''}`}
                  onClick={() => setRuleFilter(f)}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {rulesLoading && (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          )}

          {!rulesLoading && (!filteredRules || filteredRules.length === 0) && (
            <Card>
              <CardContent className="py-12 text-center">
                <BellOff className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No alert rules found</h3>
                <p className="text-muted-foreground mb-4">
                  {ruleFilter !== 'all' ? `No ${ruleFilter} rules` : 'Create your first alert rule to get started'}
                </p>
                {ruleFilter === 'all' && (
                  <Button onClick={() => setIsCreateRuleOpen(true)}>
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
                        {rule.notificationChannels && rule.notificationChannels.length > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {rule.notificationChannels.length} channel{rule.notificationChannels.length !== 1 ? 's' : ''}
                          </span>
                        )}
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleToggleRuleEnabled(rule)}
                            title={rule.isEnabled ? 'Disable' : 'Enable'}
                          >
                            {rule.isEnabled ? (
                              <Power className="h-4 w-4 text-green-500" />
                            ) : (
                              <PowerOff className="h-4 w-4 text-muted-foreground" />
                            )}
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleEditRule(rule)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedRule(rule);
                              setIsDeleteRuleOpen(true);
                            }}
                          >
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
        </div>
      )}

      {/* Channels Tab */}
      {activeTab === 'channels' && (
        <div className="space-y-4">
          {channelsLoading && (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          )}

          {!channelsLoading && (!channelsData?.channels || channelsData.channels.length === 0) && (
            <Card>
              <CardContent className="py-12 text-center">
                <Send className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No notification channels</h3>
                <p className="text-muted-foreground mb-4">
                  Add a notification channel to receive alert notifications
                </p>
                <Button onClick={() => setIsCreateChannelOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Add Channel
                </Button>
              </CardContent>
            </Card>
          )}

          {channelsData?.channels && channelsData.channels.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {channelsData.channels.map((channel: NotificationChannel) => {
                const Icon = getChannelIcon(channel.type);
                return (
                  <Card key={channel.id} className={!channel.isEnabled ? 'opacity-60' : ''}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className="h-5 w-5" />
                          <CardTitle className="text-base">{channel.name}</CardTitle>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleToggleChannelEnabled(channel)}
                        >
                          {channel.isEnabled ? (
                            <Power className="h-4 w-4 text-green-500" />
                          ) : (
                            <PowerOff className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                      </div>
                      <CardDescription className="capitalize">{channel.type.replace('_', ' ')}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => testChannelMutation.mutate(channel.id)}
                          disabled={testChannelMutation.isPending}
                        >
                          <Play className="h-3 w-3 mr-1" />
                          Test
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditChannel(channel)}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedChannel(channel);
                            setIsDeleteChannelOpen(true);
                          }}
                        >
                          <Trash2 className="h-3 w-3 text-red-500" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Create/Edit Rule Dialog */}
      <Dialog open={isCreateRuleOpen || isEditRuleOpen} onOpenChange={(open) => {
        if (!open) {
          setIsCreateRuleOpen(false);
          setIsEditRuleOpen(false);
        }
      }}>
        <DialogContent size="4xl" onClose={() => {
          setIsCreateRuleOpen(false);
          setIsEditRuleOpen(false);
        }}>
          <DialogHeader>
            <DialogTitle>{isEditRuleOpen ? 'Edit Alert Rule' : 'Create Alert Rule'}</DialogTitle>
            <DialogDescription>
              {isEditRuleOpen ? 'Update the alert rule configuration' : 'Choose a template or configure a custom alert rule'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Template Selection - Only show for new rules */}
            {isCreateRuleOpen && !isEditRuleOpen && showTemplates && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Choose a Template (Golden Signals)</label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowTemplates(false);
                      setSelectedTemplate(null);
                    }}
                  >
                    Skip - Create Custom
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {templateCategories.map((category) => (
                    <div key={category.id} className="space-y-2">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {category.name}
                      </h4>
                      <div className="space-y-1.5">
                        {alertRuleTemplates
                          .filter((t) => t.category === category.id)
                          .map((template) => (
                            <button
                              key={template.id}
                              type="button"
                              className={`w-full text-left p-2.5 rounded-md border transition-colors ${
                                selectedTemplate === template.id
                                  ? 'border-primary bg-primary/5 ring-1 ring-primary'
                                  : 'border-border hover:border-primary/50 hover:bg-muted/50'
                              }`}
                              onClick={() => {
                                setSelectedTemplate(template.id);
                                setRuleFormData({
                                  ...defaultRule,
                                  ...template.config,
                                });
                              }}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">{template.name}</span>
                                {getSeverityBadge(template.config.severity)}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">{template.description}</p>
                            </button>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
                {selectedTemplate && (
                  <div className="flex justify-end pt-2">
                    <Button
                      onClick={() => setShowTemplates(false)}
                    >
                      Continue with Template
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Rule Configuration Form - Show when not in template selection mode */}
            {(!showTemplates || isEditRuleOpen) && (
              <>
                {isCreateRuleOpen && !isEditRuleOpen && (
                  <div className="flex items-center justify-between pb-2 border-b">
                    <span className="text-sm text-muted-foreground">
                      {selectedTemplate
                        ? `Template: ${alertRuleTemplates.find((t) => t.id === selectedTemplate)?.name}`
                        : 'Custom Rule'}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowTemplates(true);
                      }}
                    >
                      Change Template
                    </Button>
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Name</label>
                  <Input
                    placeholder="e.g., High consumer lag alert"
                    value={ruleFormData.name}
                    onChange={(e) => setRuleFormData({ ...ruleFormData, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Cluster (optional)</label>
                  <Select
                    value={ruleFormData.clusterId || 'all'}
                    onValueChange={(v) => setRuleFormData({ ...ruleFormData, clusterId: v === 'all' ? null : v })}
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
                      value={ruleFormData.condition.metric}
                      onValueChange={(v) =>
                        setRuleFormData({
                          ...ruleFormData,
                          condition: { ...ruleFormData.condition, metric: v },
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
                      value={ruleFormData.condition.operator}
                      onValueChange={(v) =>
                        setRuleFormData({
                          ...ruleFormData,
                          condition: { ...ruleFormData.condition, operator: v },
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
                      value={ruleFormData.threshold.value}
                      onChange={(e) =>
                        setRuleFormData({
                          ...ruleFormData,
                          threshold: { ...ruleFormData.threshold, value: Number(e.target.value) },
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Severity</label>
                    <Select
                      value={ruleFormData.severity}
                      onValueChange={(v) => setRuleFormData({ ...ruleFormData, severity: v })}
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
                  <label className="text-sm font-medium">Notification Channels</label>
                  <Select
                    value={ruleFormData.channelIds.join(',')}
                    onValueChange={(v) => setRuleFormData({ ...ruleFormData, channelIds: v ? v.split(',').filter(Boolean) : [] })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select channels" />
                    </SelectTrigger>
                    <SelectContent>
                      {channelsData?.channels?.map((channel: NotificationChannel) => (
                        <SelectItem key={channel.id} value={channel.id}>
                          {channel.name} ({channel.type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Select a notification channel for alerts</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Cooldown (minutes)</label>
                  <Input
                    type="number"
                    value={ruleFormData.cooldownMins}
                    onChange={(e) => setRuleFormData({ ...ruleFormData, cooldownMins: Number(e.target.value) })}
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsCreateRuleOpen(false);
              setIsEditRuleOpen(false);
            }}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (isEditRuleOpen && selectedRule) {
                  updateRuleMutation.mutate({ id: selectedRule.id, data: ruleFormData });
                } else {
                  createRuleMutation.mutate(ruleFormData);
                }
              }}
              disabled={!ruleFormData.name || createRuleMutation.isPending || updateRuleMutation.isPending}
            >
              {createRuleMutation.isPending || updateRuleMutation.isPending
                ? 'Saving...'
                : isEditRuleOpen ? 'Save Changes' : 'Create Rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Rule Dialog */}
      <AlertDialog open={isDeleteRuleOpen} onOpenChange={setIsDeleteRuleOpen}>
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
              onClick={() => selectedRule && deleteRuleMutation.mutate(selectedRule.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteRuleMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create/Edit Channel Dialog */}
      <Dialog open={isCreateChannelOpen || isEditChannelOpen} onOpenChange={(open) => {
        if (!open) {
          setIsCreateChannelOpen(false);
          setIsEditChannelOpen(false);
        }
      }}>
        <DialogContent size="xl" onClose={() => {
          setIsCreateChannelOpen(false);
          setIsEditChannelOpen(false);
        }}>
          <DialogHeader>
            <DialogTitle>{isEditChannelOpen ? 'Edit Notification Channel' : 'Add Notification Channel'}</DialogTitle>
            <DialogDescription>
              {isEditChannelOpen ? 'Update the channel configuration' : 'Configure a new notification channel'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input
                placeholder="e.g., Engineering Slack"
                value={channelFormData.name}
                onChange={(e) => setChannelFormData({ ...channelFormData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Type</label>
              <Select
                value={channelFormData.type}
                onValueChange={(v: any) => setChannelFormData({ ...channelFormData, type: v, config: {} })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="slack">Slack</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="teams">Microsoft Teams</SelectItem>
                  <SelectItem value="pagerduty">PagerDuty</SelectItem>
                  <SelectItem value="google_chat">Google Chat</SelectItem>
                  <SelectItem value="webhook">Webhook</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {getChannelConfigFields(channelFormData.type).map((field) => (
              <div key={field.key} className="space-y-2">
                <label className="text-sm font-medium">{field.label}</label>
                <Input
                  placeholder={field.placeholder}
                  value={channelFormData.config[field.key] || ''}
                  onChange={(e) =>
                    setChannelFormData({
                      ...channelFormData,
                      config: { ...channelFormData.config, [field.key]: e.target.value },
                    })
                  }
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsCreateChannelOpen(false);
              setIsEditChannelOpen(false);
            }}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (isEditChannelOpen && selectedChannel) {
                  updateChannelMutation.mutate({ id: selectedChannel.id, data: channelFormData });
                } else {
                  createChannelMutation.mutate(channelFormData);
                }
              }}
              disabled={!channelFormData.name || createChannelMutation.isPending || updateChannelMutation.isPending}
            >
              {createChannelMutation.isPending || updateChannelMutation.isPending
                ? 'Saving...'
                : isEditChannelOpen ? 'Save Changes' : 'Add Channel'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Channel Dialog */}
      <AlertDialog open={isDeleteChannelOpen} onOpenChange={setIsDeleteChannelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Notification Channel</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{selectedChannel?.name}&quot;? This will remove it from all alert rules.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedChannel && deleteChannelMutation.mutate(selectedChannel.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteChannelMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function AlertsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>}>
      <AlertsPageContent />
    </Suspense>
  );
}
