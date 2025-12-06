'use client';

import { useState, Suspense, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Database,
  Settings,
  BarChart3,
  Users,
  MessageSquare,
  RefreshCw,
  Trash2,
  Edit,
  Play,
  AlertTriangle,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  Maximize2,
  Minimize2,
  Search,
  Download,
  RotateCcw,
  Filter,
  X,
  Loader2,
  FileCode,
} from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { SchemaViewer } from '@/components/schema-viewer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { TabsList, useTabs, Tab } from '@/components/ui/tabs';
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
import { formatBytes, formatNumber, formatDuration } from '@nats-console/shared';
import { LineChart } from '@/components/charts';
import { CreateStreamDialog } from '@/components/forms/create-stream-dialog';

const tabs: Tab[] = [
  { id: 'overview', label: 'Overview', icon: Database },
  { id: 'messages', label: 'Messages', icon: MessageSquare },
  { id: 'schema', label: 'Schema', icon: FileCode },
  { id: 'consumers', label: 'Consumers', icon: Users },
  { id: 'config', label: 'Configuration', icon: Settings },
];

function StreamDetailContent() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const clusterId = params.clusterId as string;
  const streamName = params.name as string;

  const { activeTab, setActiveTab } = useTabs(tabs, 'overview');
  const [messageSubject, setMessageSubject] = useState('');
  const [messageData, setMessageData] = useState('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<number | null>(null);
  const [expandedMessages, setExpandedMessages] = useState<Set<number>>(new Set());

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Metrics time range
  const [metricsTimeRange, setMetricsTimeRange] = useState('1h');

  // Search/Filter state
  const [showFilters, setShowFilters] = useState(false);
  const [subjectFilter, setSubjectFilter] = useState('');
  const [activeSubjectFilter, setActiveSubjectFilter] = useState('');

  // Export dialog state
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportFormat, setExportFormat] = useState<'json' | 'csv'>('json');
  const [exportLimit, setExportLimit] = useState('1000');

  // Replay dialog state
  const [showReplayDialog, setShowReplayDialog] = useState(false);
  const [replayTargetSubject, setReplayTargetSubject] = useState('');
  const [replayStartSeq, setReplayStartSeq] = useState('');
  const [replayEndSeq, setReplayEndSeq] = useState('');
  const [replayLimit, setReplayLimit] = useState('100');

  // Helper to format message data - detect JSON and pretty print
  const formatMessageData = (data: unknown): { formatted: string; isJson: boolean } => {
    if (typeof data === 'object' && data !== null) {
      return { formatted: JSON.stringify(data, null, 2), isJson: true };
    }
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        return { formatted: JSON.stringify(parsed, null, 2), isJson: true };
      } catch {
        return { formatted: data, isJson: false };
      }
    }
    return { formatted: String(data), isJson: false };
  };

  // Copy message to clipboard
  const copyMessage = async (msg: any, seq: number) => {
    const { formatted } = formatMessageData(msg.data);
    await navigator.clipboard.writeText(formatted);
    setCopiedMessageId(seq);
    setTimeout(() => setCopiedMessageId(null), 2000);
  };

  // Toggle message expansion (using index for unique identification)
  const toggleMessageExpand = (index: number) => {
    setExpandedMessages(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  // Expand all messages on current page
  const expandAllMessages = () => {
    if (messagesData?.messages) {
      const allIndices = new Set(messagesData.messages.map((_: any, idx: number) => idx));
      setExpandedMessages(allIndices);
    }
  };

  // Collapse all messages
  const collapseAllMessages = () => {
    setExpandedMessages(new Set());
  };

  const { data: streamData, isLoading } = useQuery({
    queryKey: ['stream', clusterId, streamName],
    queryFn: () => api.streams.get(clusterId, streamName),
  });

  const { data: consumersData } = useQuery({
    queryKey: ['consumers', clusterId, streamName],
    queryFn: () => api.consumers.list(clusterId, streamName),
  });

  const { data: messagesData, refetch: refetchMessages, isFetching: isLoadingMessages } = useQuery({
    queryKey: ['messages', clusterId, streamName, currentPage, pageSize, activeSubjectFilter],
    queryFn: () => {
      const firstSeq = streamData?.stream?.state?.first_seq || 1;
      const startSeq = String(firstSeq + (currentPage - 1) * pageSize);
      const params: Record<string, string> = { start_seq: startSeq, limit: String(pageSize) };
      if (activeSubjectFilter) {
        params.subject = activeSubjectFilter;
      }
      return api.streams.messages(clusterId, streamName, params);
    },
    enabled: activeTab === 'messages' && !!streamData?.stream,
  });

  // Replay mutation
  const replayMutation = useMutation({
    mutationFn: (data: { targetSubject: string; startSeq?: number; endSeq?: number; limit?: number }) =>
      api.streams.replayMessages(clusterId, streamName, data),
    onSuccess: () => {
      setShowReplayDialog(false);
      setReplayTargetSubject('');
      setReplayStartSeq('');
      setReplayEndSeq('');
    },
  });

  // Apply subject filter
  const applyFilter = () => {
    setActiveSubjectFilter(subjectFilter);
    setCurrentPage(1);
  };

  // Clear filters
  const clearFilters = () => {
    setSubjectFilter('');
    setActiveSubjectFilter('');
    setCurrentPage(1);
  };

  // Handle export
  const handleExport = () => {
    const url = api.streams.exportMessages(clusterId, streamName, exportFormat, {
      limit: parseInt(exportLimit),
      subject: activeSubjectFilter || undefined,
    });
    window.open(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1'}${url}`, '_blank');
    setShowExportDialog(false);
  };

  // Handle replay
  const handleReplay = () => {
    if (!replayTargetSubject) return;
    replayMutation.mutate({
      targetSubject: replayTargetSubject,
      startSeq: replayStartSeq ? parseInt(replayStartSeq) : undefined,
      endSeq: replayEndSeq ? parseInt(replayEndSeq) : undefined,
      limit: parseInt(replayLimit),
    });
  };

  // Metrics data
  const getTimeRangeParams = () => {
    const now = new Date();
    const ranges: Record<string, number> = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
    };
    const from = new Date(now.getTime() - (ranges[metricsTimeRange] || ranges['1h']));
    return {
      clusterId,
      from: from.toISOString(),
      to: now.toISOString(),
      interval: metricsTimeRange === '7d' ? '1h' : metricsTimeRange === '24h' ? '30m' : '5m',
    };
  };

  const { data: metricsData, isLoading: isLoadingMetrics } = useQuery({
    queryKey: ['stream-metrics', clusterId, streamName, metricsTimeRange],
    queryFn: () => api.analytics.streamThroughput(streamName, getTimeRangeParams()),
    enabled: activeTab === 'overview',
  });

  // Schema data
  const { data: schemaData, isLoading: isLoadingSchema, error: schemaError } = useQuery({
    queryKey: ['stream-schema', clusterId, streamName],
    queryFn: () => api.streams.getSchema(clusterId, streamName),
    enabled: activeTab === 'schema',
  });

  // Transform metrics data for charts
  const chartData = useMemo(() => {
    if (!metricsData?.data?.length) return { messages: [], bytes: [] };
    return {
      messages: metricsData.data.map((d: any) => ({
        name: 'Messages/s',
        value: d.messagesRate || 0,
        time: new Date(d.timestamp).toLocaleTimeString(),
      })),
      bytes: metricsData.data.map((d: any) => ({
        name: 'Bytes/s',
        value: d.bytesRate || 0,
        time: new Date(d.timestamp).toLocaleTimeString(),
      })),
    };
  }, [metricsData]);

  const publishMutation = useMutation({
    mutationFn: (data: { subject: string; data: string }) =>
      api.streams.publish(clusterId, streamName, data),
    onSuccess: () => {
      refetchMessages();
      setMessageData('');
    },
  });

  const purgeMutation = useMutation({
    mutationFn: () => api.streams.purge(clusterId, streamName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stream', clusterId, streamName] });
      refetchMessages();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.streams.delete(clusterId, streamName),
    onSuccess: () => {
      router.push('/streams');
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const stream = streamData?.stream;
  if (!stream) {
    return (
      <div className="text-center py-12">
        <Database className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold">Stream not found</h3>
        <Link href="/streams">
          <Button variant="outline" className="mt-4">
            Back to Streams
          </Button>
        </Link>
      </div>
    );
  }

  // Calculate total pages based on stream state
  const totalMessages = stream?.state?.messages || 0;
  const totalPages = Math.ceil(totalMessages / pageSize);

  const handlePublish = () => {
    if (messageSubject && messageData) {
      publishMutation.mutate({ subject: messageSubject, data: messageData });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/streams">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">{stream.config.name}</h1>
            <p className="text-muted-foreground">
              {stream.config.subjects?.join(', ') || 'No subjects'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowEditDialog(true)}>
            <Edit className="h-4 w-4" />
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => purgeMutation.mutate()}
            disabled={purgeMutation.isPending}
          >
            <RefreshCw className="h-4 w-4" />
            Purge
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowDeleteDialog(true)}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Stream</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete stream &quot;{streamName}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Stream Dialog */}
      <CreateStreamDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        clusterId={clusterId}
        stream={stream}
        mode="edit"
      />

      {/* Export Dialog */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export Messages</DialogTitle>
            <DialogDescription>
              Export messages from this stream in JSON or CSV format
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Format</label>
              <Select value={exportFormat} onValueChange={(v: 'json' | 'csv') => setExportFormat(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="json">JSON</SelectItem>
                  <SelectItem value="csv">CSV</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Max Messages</label>
              <Select value={exportLimit} onValueChange={setExportLimit}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="100">100 messages</SelectItem>
                  <SelectItem value="500">500 messages</SelectItem>
                  <SelectItem value="1000">1,000 messages</SelectItem>
                  <SelectItem value="5000">5,000 messages</SelectItem>
                  <SelectItem value="10000">10,000 messages</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {activeSubjectFilter && (
              <div className="p-3 bg-muted rounded-lg text-sm">
                <span className="text-muted-foreground">Filter applied: </span>
                <span className="font-medium">{activeSubjectFilter}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExportDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleExport}>
              <Download className="h-4 w-4" />
              Export {exportFormat.toUpperCase()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Replay Dialog */}
      <Dialog open={showReplayDialog} onOpenChange={setShowReplayDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Replay Messages</DialogTitle>
            <DialogDescription>
              Replay messages from this stream to another subject
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Target Subject *</label>
              <Input
                placeholder="e.g., orders.replay or orders.reprocess"
                value={replayTargetSubject}
                onChange={(e) => setReplayTargetSubject(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Messages will be published to this subject
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Start Sequence</label>
                <Input
                  type="number"
                  placeholder="From beginning"
                  value={replayStartSeq}
                  onChange={(e) => setReplayStartSeq(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">End Sequence</label>
                <Input
                  type="number"
                  placeholder="To end"
                  value={replayEndSeq}
                  onChange={(e) => setReplayEndSeq(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Max Messages</label>
              <Select value={replayLimit} onValueChange={setReplayLimit}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 messages</SelectItem>
                  <SelectItem value="50">50 messages</SelectItem>
                  <SelectItem value="100">100 messages</SelectItem>
                  <SelectItem value="500">500 messages</SelectItem>
                  <SelectItem value="1000">1,000 messages</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {replayMutation.isSuccess && (
              <div className="p-3 bg-green-50 text-green-700 rounded-lg text-sm">
                Successfully replayed {replayMutation.data?.replayed} of {replayMutation.data?.total} messages
              </div>
            )}
            {replayMutation.isError && (
              <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                Failed to replay messages: {(replayMutation.error as Error).message}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReplayDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleReplay}
              disabled={!replayTargetSubject || replayMutation.isPending}
            >
              {replayMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              Replay Messages
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tabs */}
      <TabsList tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Messages</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatNumber(stream.state?.messages || 0)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Size</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatBytes(stream.state?.bytes || 0)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Consumers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stream.state?.consumer_count || 0}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Storage</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold capitalize">
                {stream.config.storage}
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Stream Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">First Sequence</span>
                <span>{stream.state?.first_seq || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last Sequence</span>
                <span>{stream.state?.last_seq || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">First Time</span>
                <span>{stream.state?.first_ts ? new Date(stream.state.first_ts).toLocaleString() : '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last Time</span>
                <span>{stream.state?.last_ts ? new Date(stream.state.last_ts).toLocaleString() : '-'}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Retention</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Policy</span>
                <span className="capitalize">{stream.config.retention || 'limits'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Max Messages</span>
                <span>{stream.config.max_msgs === -1 ? 'Unlimited' : formatNumber(stream.config.max_msgs)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Max Bytes</span>
                <span>{stream.config.max_bytes === -1 ? 'Unlimited' : formatBytes(stream.config.max_bytes)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Max Age</span>
                <span>{stream.config.max_age === 0 ? 'Unlimited' : formatDuration(stream.config.max_age)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Throughput Charts */}
          <Card className="md:col-span-4">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Message Throughput</CardTitle>
                <CardDescription>Messages per second over time</CardDescription>
              </div>
              <select
                className="h-9 px-3 border rounded-md bg-background text-sm"
                value={metricsTimeRange}
                onChange={(e) => setMetricsTimeRange(e.target.value)}
              >
                <option value="1h">Last 1 hour</option>
                <option value="6h">Last 6 hours</option>
                <option value="24h">Last 24 hours</option>
                <option value="7d">Last 7 days</option>
              </select>
            </CardHeader>
            <CardContent>
              {isLoadingMetrics ? (
                <div className="h-48 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : chartData.messages.length > 0 ? (
                <LineChart
                  data={chartData.messages}
                  title=""
                  yAxisLabel="msg/s"
                  color="#2563eb"
                  height={200}
                />
              ) : (
                <div className="h-48 flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No metrics data available</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="md:col-span-4">
            <CardHeader>
              <CardTitle>Data Throughput</CardTitle>
              <CardDescription>Bytes per second over time</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingMetrics ? (
                <div className="h-48 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : chartData.bytes.length > 0 ? (
                <LineChart
                  data={chartData.bytes}
                  title=""
                  yAxisLabel="bytes/s"
                  color="#16a34a"
                  height={200}
                />
              ) : (
                <div className="h-48 flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No metrics data available</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Messages Tab */}
      {activeTab === 'messages' && (
        <div className="space-y-4">
          {/* Publish Message */}
          <Card>
            <CardHeader>
              <CardTitle>Publish Message</CardTitle>
              <CardDescription>Send a new message to this stream</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="text-sm font-medium">Subject</label>
                  <Input
                    placeholder={stream.config.subjects?.[0] || 'subject'}
                    value={messageSubject}
                    onChange={(e) => setMessageSubject(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Data (JSON)</label>
                <textarea
                  className="w-full h-24 mt-1 p-3 border rounded-md bg-background font-mono text-sm"
                  placeholder='{"key": "value"}'
                  value={messageData}
                  onChange={(e) => setMessageData(e.target.value)}
                />
              </div>
              <Button onClick={handlePublish} disabled={publishMutation.isPending || !messageSubject || !messageData}>
                <Play className="h-4 w-4" />
                Publish
              </Button>
            </CardContent>
          </Card>

          {/* Message Browser */}
          <Card>
            <CardHeader className="space-y-4">
              <div className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Message Browser</CardTitle>
                  <CardDescription>
                    {totalMessages > 0 ? `${formatNumber(totalMessages)} messages total` : 'Browse messages in this stream'}
                    {activeSubjectFilter && (
                      <span className="ml-2 text-primary">
                        (filtered by: {activeSubjectFilter})
                      </span>
                    )}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant={showFilters ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={() => setShowFilters(!showFilters)}
                  >
                    <Filter className="h-4 w-4" />
                    Filter
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowExportDialog(true)}
                    disabled={!messagesData?.messages?.length}
                  >
                    <Download className="h-4 w-4" />
                    Export
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowReplayDialog(true)}
                    disabled={!messagesData?.messages?.length}
                  >
                    <RotateCcw className="h-4 w-4" />
                    Replay
                  </Button>
                  <div className="w-px h-6 bg-border" />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={expandAllMessages}
                    disabled={!messagesData?.messages?.length}
                  >
                    <Maximize2 className="h-3 w-3 mr-1" />
                    Expand All
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={collapseAllMessages}
                    disabled={expandedMessages.size === 0}
                  >
                    <Minimize2 className="h-3 w-3 mr-1" />
                    Collapse All
                  </Button>
                  <div className="w-px h-6 bg-border" />
                  <select
                    className="h-9 px-3 border rounded-md bg-background text-sm"
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                  >
                    <option value={10}>10 / page</option>
                    <option value={20}>20 / page</option>
                    <option value={50}>50 / page</option>
                    <option value={100}>100 / page</option>
                  </select>
                  <Button variant="outline" size="sm" onClick={() => refetchMessages()} disabled={isLoadingMessages}>
                    <RefreshCw className={`h-4 w-4 ${isLoadingMessages ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              </div>

              {/* Filters Panel */}
              {showFilters && (
                <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                  <div className="flex-1">
                    <label className="text-sm font-medium mb-1 block">Subject Filter</label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="e.g., orders.* or orders.created"
                        value={subjectFilter}
                        onChange={(e) => setSubjectFilter(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && applyFilter()}
                      />
                      <Button onClick={applyFilter}>
                        <Search className="h-4 w-4" />
                        Search
                      </Button>
                      {activeSubjectFilter && (
                        <Button variant="ghost" onClick={clearFilters}>
                          <X className="h-4 w-4" />
                          Clear
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {isLoadingMessages && !messagesData?.messages?.length ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                </div>
              ) : messagesData?.messages?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No messages found</p>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    {messagesData?.messages?.map((msg: any, idx: number) => {
                      const { formatted, isJson } = formatMessageData(msg.data);
                      const isExpanded = expandedMessages.has(idx);
                      const lineCount = formatted.split('\n').length;
                      const isLongContent = lineCount > 5 || formatted.length > 300;

                      return (
                        <div key={idx} className="p-3 border rounded-lg">
                          <div className="flex justify-between items-center text-sm mb-2">
                            <div className="flex items-center gap-2">
                              {isLongContent && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleMessageExpand(idx);
                                  }}
                                  className="p-0.5 hover:bg-muted rounded"
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="h-4 w-4" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4" />
                                  )}
                                </button>
                              )}
                              <span className="font-medium">Seq: {msg.seq}</span>
                            </div>
                            <span className="text-muted-foreground truncate max-w-[200px]">{msg.subject}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground text-xs">
                                {new Date(msg.time).toLocaleString()}
                              </span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyMessage(msg, msg.seq);
                                }}
                              >
                                {copiedMessageId === msg.seq ? (
                                  <Check className="h-3 w-3 text-green-500" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </Button>
                            </div>
                          </div>
                          <div className="relative">
                            {isJson && (
                              <span className="absolute top-1 right-1 text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 rounded z-10">
                                JSON
                              </span>
                            )}
                            <pre
                              className={`text-xs bg-muted p-2 rounded overflow-x-auto ${
                                isLongContent && !isExpanded ? 'max-h-24 overflow-y-hidden' : ''
                              }`}
                            >
                              {formatted}
                            </pre>
                            {isLongContent && !isExpanded && (
                              <div
                                className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-muted to-transparent cursor-pointer flex items-end justify-center pb-1"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleMessageExpand(idx);
                                }}
                              >
                                <span className="text-[10px] text-muted-foreground">Click to expand</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t">
                    <div className="text-sm text-muted-foreground">
                      Page {currentPage} of {formatNumber(totalPages)}
                    </div>
                    <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setCurrentPage(1)}
                          disabled={currentPage === 1}
                        >
                          <ChevronsLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Input
                          type="number"
                          min={1}
                          max={totalPages}
                          value={currentPage}
                          onChange={(e) => {
                            const page = parseInt(e.target.value);
                            if (page >= 1 && page <= totalPages) {
                              setCurrentPage(page);
                            }
                          }}
                          className="w-16 h-8 text-center"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setCurrentPage(totalPages)}
                          disabled={currentPage === totalPages}
                        >
                          <ChevronsRight className="h-4 w-4" />
                        </Button>
                    </div>
                  </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Schema Tab */}
      {activeTab === 'schema' && (
        <Card>
          <CardHeader>
            <CardTitle>Message Schema</CardTitle>
            <CardDescription>
              Inferred schema from sampled messages. This shows the detected structure of message payloads.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SchemaViewer
              schema={schemaData?.schema ?? null}
              loading={isLoadingSchema}
              error={schemaError as Error | null}
            />
          </CardContent>
        </Card>
      )}

      {/* Consumers Tab */}
      {activeTab === 'consumers' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Consumers</CardTitle>
              <CardDescription>Consumers attached to this stream</CardDescription>
            </div>
            <Button size="sm">
              <Users className="h-4 w-4" />
              Add Consumer
            </Button>
          </CardHeader>
          <CardContent>
            {consumersData?.consumers?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No consumers</p>
              </div>
            ) : (
              <div className="border rounded-lg">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-3 font-medium">Name</th>
                      <th className="text-left p-3 font-medium">Type</th>
                      <th className="text-right p-3 font-medium">Pending</th>
                      <th className="text-right p-3 font-medium">Ack Pending</th>
                      <th className="text-right p-3 font-medium">Redelivered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {consumersData?.consumers?.map((consumer: any) => (
                      <tr
                        key={consumer.name}
                        className="border-t hover:bg-muted/30 cursor-pointer"
                        onClick={() => router.push(`/consumers/${clusterId}/${streamName}/${consumer.name}`)}
                      >
                        <td className="p-3 font-medium text-primary hover:underline">{consumer.name}</td>
                        <td className="p-3">
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            consumer.config?.durable_name
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}>
                            {consumer.config?.durable_name ? 'Durable' : 'Ephemeral'}
                          </span>
                        </td>
                        <td className="p-3 text-right">{formatNumber(consumer.num_pending || 0)}</td>
                        <td className="p-3 text-right">{formatNumber(consumer.num_ack_pending || 0)}</td>
                        <td className="p-3 text-right">{formatNumber(consumer.num_redelivered || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Configuration Tab */}
      {activeTab === 'config' && (
        <Card>
          <CardHeader>
            <CardTitle>Stream Configuration</CardTitle>
            <CardDescription>Current configuration for this stream</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
              {JSON.stringify(stream.config, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

    </div>
  );
}

export default function StreamDetailPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>}>
      <StreamDetailContent />
    </Suspense>
  );
}
