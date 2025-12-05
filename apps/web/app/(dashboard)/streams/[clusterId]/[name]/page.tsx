'use client';

import { useState, Suspense } from 'react';
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
} from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
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
import { formatBytes, formatNumber, formatDuration } from '@nats-console/shared';

const tabs: Tab[] = [
  { id: 'overview', label: 'Overview', icon: Database },
  { id: 'messages', label: 'Messages', icon: MessageSquare },
  { id: 'consumers', label: 'Consumers', icon: Users },
  { id: 'config', label: 'Configuration', icon: Settings },
  { id: 'metrics', label: 'Metrics', icon: BarChart3 },
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
  const [copiedMessageId, setCopiedMessageId] = useState<number | null>(null);
  const [expandedMessages, setExpandedMessages] = useState<Set<number>>(new Set());

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

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
    queryKey: ['messages', clusterId, streamName, currentPage, pageSize],
    queryFn: () => {
      const firstSeq = streamData?.stream?.state?.first_seq || 1;
      const startSeq = String(firstSeq + (currentPage - 1) * pageSize);
      return api.streams.messages(clusterId, streamName, { start_seq: startSeq, limit: String(pageSize) });
    },
    enabled: activeTab === 'messages' && !!streamData?.stream,
  });

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
          <Button variant="outline" size="sm">
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
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Message Browser</CardTitle>
                <CardDescription>
                  {totalMessages > 0 ? `${formatNumber(totalMessages)} messages total` : 'Browse messages in this stream'}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
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
                      <tr key={consumer.name} className="border-t hover:bg-muted/30">
                        <td className="p-3 font-medium">{consumer.name}</td>
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

      {/* Metrics Tab */}
      {activeTab === 'metrics' && (
        <Card>
          <CardHeader>
            <CardTitle>Stream Metrics</CardTitle>
            <CardDescription>Performance metrics and trends</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Chart visualization coming soon</p>
                <p className="text-sm">Integrate with your preferred charting library</p>
              </div>
            </div>
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
