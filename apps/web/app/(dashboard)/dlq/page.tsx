'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  RefreshCw,
  Trash2,
  Play,
  ChevronRight,
  ChevronDown,
  Copy,
  Check,
  Search,
  Database,
} from 'lucide-react';
import { dlq, DlqStream, DlqMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function DlqPage() {
  const queryClient = useQueryClient();
  const [expandedStream, setExpandedStream] = useState<string | null>(null);
  const [selectedMessages, setSelectedMessages] = useState<Set<number>>(new Set());
  const [replayDialogOpen, setReplayDialogOpen] = useState(false);
  const [purgeDialogOpen, setPurgeDialogOpen] = useState(false);
  const [selectedStreamForPurge, setSelectedStreamForPurge] = useState<DlqStream | null>(null);
  const [targetSubject, setTargetSubject] = useState('');
  const [copiedSeq, setCopiedSeq] = useState<number | null>(null);

  // Fetch DLQ streams
  const { data: streamsData, isLoading: streamsLoading, error: streamsError } = useQuery({
    queryKey: ['dlq-streams'],
    queryFn: () => dlq.listStreams(),
    refetchInterval: 30000,
  });

  // Fetch messages for expanded stream
  const { data: messagesData, isLoading: messagesLoading } = useQuery({
    queryKey: ['dlq-messages', expandedStream],
    queryFn: () => {
      if (!expandedStream) return null;
      const [clusterId, streamName] = expandedStream.split('::');
      return dlq.getMessages(clusterId!, streamName!, { limit: 100 });
    },
    enabled: !!expandedStream,
    refetchInterval: 10000,
  });

  // Replay mutation
  const replayMutation = useMutation({
    mutationFn: async ({ clusterId, streamName, sequences, targetSubject }: {
      clusterId: string;
      streamName: string;
      sequences: number[];
      targetSubject?: string;
    }) => {
      return dlq.replayBatch(clusterId, streamName, sequences, { targetSubject });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dlq-messages'] });
      queryClient.invalidateQueries({ queryKey: ['dlq-streams'] });
      setSelectedMessages(new Set());
      setReplayDialogOpen(false);
      setTargetSubject('');
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async ({ clusterId, streamName, seq }: {
      clusterId: string;
      streamName: string;
      seq: number;
    }) => {
      return dlq.deleteMessage(clusterId, streamName, seq);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dlq-messages'] });
      queryClient.invalidateQueries({ queryKey: ['dlq-streams'] });
    },
  });

  // Purge mutation
  const purgeMutation = useMutation({
    mutationFn: async ({ clusterId, streamName }: { clusterId: string; streamName: string }) => {
      return dlq.purge(clusterId, streamName);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dlq-streams'] });
      queryClient.invalidateQueries({ queryKey: ['dlq-messages'] });
      setPurgeDialogOpen(false);
      setSelectedStreamForPurge(null);
    },
  });

  const handleToggleExpand = (stream: DlqStream) => {
    const key = `${stream.clusterId}::${stream.streamName}`;
    if (expandedStream === key) {
      setExpandedStream(null);
      setSelectedMessages(new Set());
    } else {
      setExpandedStream(key);
      setSelectedMessages(new Set());
    }
  };

  const handleToggleSelectMessage = (seq: number) => {
    const newSelected = new Set(selectedMessages);
    if (newSelected.has(seq)) {
      newSelected.delete(seq);
    } else {
      newSelected.add(seq);
    }
    setSelectedMessages(newSelected);
  };

  const handleSelectAll = () => {
    if (!messagesData?.messages) return;
    if (selectedMessages.size === messagesData.messages.length) {
      setSelectedMessages(new Set());
    } else {
      setSelectedMessages(new Set(messagesData.messages.map((m) => m.sequence)));
    }
  };

  const handleReplaySelected = () => {
    if (selectedMessages.size === 0 || !expandedStream) return;
    setReplayDialogOpen(true);
  };

  const handleConfirmReplay = () => {
    if (!expandedStream) return;
    const [clusterId, streamName] = expandedStream.split('::');
    replayMutation.mutate({
      clusterId: clusterId!,
      streamName: streamName!,
      sequences: Array.from(selectedMessages),
      targetSubject: targetSubject || undefined,
    });
  };

  const handlePurge = (stream: DlqStream) => {
    setSelectedStreamForPurge(stream);
    setPurgeDialogOpen(true);
  };

  const handleConfirmPurge = () => {
    if (!selectedStreamForPurge) return;
    purgeMutation.mutate({
      clusterId: selectedStreamForPurge.clusterId,
      streamName: selectedStreamForPurge.streamName,
    });
  };

  const handleCopyData = (data: string, seq: number) => {
    navigator.clipboard.writeText(data);
    setCopiedSeq(seq);
    setTimeout(() => setCopiedSeq(null), 2000);
  };

  if (streamsLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dead Letter Queues</h1>
            <p className="text-muted-foreground">Manage failed messages across your clusters</p>
          </div>
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (streamsError) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-lg font-semibold mb-2">Failed to load DLQ streams</h2>
        <p className="text-muted-foreground">
          {streamsError instanceof Error ? streamsError.message : 'An error occurred'}
        </p>
      </div>
    );
  }

  const dlqStreams = streamsData?.dlqStreams || [];
  const totalMessages = dlqStreams.reduce((acc, s) => acc + s.messageCount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dead Letter Queues</h1>
          <p className="text-muted-foreground">Manage failed messages across your clusters</p>
        </div>
        <Button
          variant="outline"
          onClick={() => queryClient.invalidateQueries({ queryKey: ['dlq-streams'] })}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Summary Card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-destructive/10 rounded-lg">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Failed Messages</p>
                <p className="text-2xl font-bold">{totalMessages.toLocaleString()}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Database className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">DLQ Streams</p>
                <p className="text-2xl font-bold">{dlqStreams.length}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="p-2 bg-muted rounded-lg">
                <RefreshCw className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Size</p>
                <p className="text-2xl font-bold">
                  {formatBytes(dlqStreams.reduce((acc, s) => acc + s.bytesTotal, 0))}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* DLQ Streams List */}
      {dlqStreams.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Database className="h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold mb-2">No DLQ Streams Found</h2>
            <p className="text-muted-foreground text-center max-w-md">
              Dead letter queue streams are automatically detected based on naming convention
              (streams ending in _DLQ or _dlq).
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {dlqStreams.map((stream) => {
            const key = `${stream.clusterId}::${stream.streamName}`;
            const isExpanded = expandedStream === key;

            return (
              <Card key={key} className={isExpanded ? 'ring-2 ring-primary' : ''}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div
                      className="flex items-center gap-2 cursor-pointer"
                      onClick={() => handleToggleExpand(stream)}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-5 w-5" />
                      ) : (
                        <ChevronRight className="h-5 w-5" />
                      )}
                      <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                          {stream.streamName}
                          {stream.messageCount > 0 && (
                            <Badge variant="destructive">{stream.messageCount} messages</Badge>
                          )}
                        </CardTitle>
                        <CardDescription>
                          Cluster: {stream.clusterName}
                          {stream.sourceStream && ` | Source: ${stream.sourceStream}`}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        {formatBytes(stream.bytesTotal)}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePurge(stream)}
                        disabled={stream.messageCount === 0}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Purge
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent>
                    {messagesLoading ? (
                      <div className="space-y-2">
                        {[1, 2, 3].map((i) => (
                          <Skeleton key={i} className="h-12 w-full" />
                        ))}
                      </div>
                    ) : messagesData?.messages && messagesData.messages.length > 0 ? (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleSelectAll}
                            >
                              {selectedMessages.size === messagesData.messages.length
                                ? 'Deselect All'
                                : 'Select All'}
                            </Button>
                            {selectedMessages.size > 0 && (
                              <Button
                                size="sm"
                                onClick={handleReplaySelected}
                                disabled={replayMutation.isPending}
                              >
                                <Play className="h-4 w-4 mr-1" />
                                Replay Selected ({selectedMessages.size})
                              </Button>
                            )}
                          </div>
                          <span className="text-sm text-muted-foreground">
                            Showing {messagesData.messages.length} messages
                          </span>
                        </div>

                        <div className="border rounded-lg overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-12"></TableHead>
                                <TableHead className="w-24">Seq</TableHead>
                                <TableHead>Subject</TableHead>
                                <TableHead>Original Subject</TableHead>
                                <TableHead className="w-32">Deliveries</TableHead>
                                <TableHead className="w-40">Time</TableHead>
                                <TableHead className="w-24">Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {messagesData.messages.map((msg) => (
                                <TableRow key={msg.sequence}>
                                  <TableCell>
                                    <input
                                      type="checkbox"
                                      checked={selectedMessages.has(msg.sequence)}
                                      onChange={() => handleToggleSelectMessage(msg.sequence)}
                                      className="h-4 w-4"
                                    />
                                  </TableCell>
                                  <TableCell className="font-mono text-sm">
                                    #{msg.sequence}
                                  </TableCell>
                                  <TableCell className="font-mono text-sm">
                                    {msg.subject}
                                  </TableCell>
                                  <TableCell className="font-mono text-sm">
                                    {msg.originalSubject || '-'}
                                  </TableCell>
                                  <TableCell>
                                    {msg.deliveryCount ? (
                                      <Badge variant="outline">{msg.deliveryCount}x</Badge>
                                    ) : (
                                      '-'
                                    )}
                                  </TableCell>
                                  <TableCell className="text-sm text-muted-foreground">
                                    {formatDistanceToNow(new Date(msg.time), { addSuffix: true })}
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-1">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleCopyData(msg.data, msg.sequence)}
                                      >
                                        {copiedSeq === msg.sequence ? (
                                          <Check className="h-4 w-4 text-green-500" />
                                        ) : (
                                          <Copy className="h-4 w-4" />
                                        )}
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() =>
                                          deleteMutation.mutate({
                                            clusterId: stream.clusterId,
                                            streamName: stream.streamName,
                                            seq: msg.sequence,
                                          })
                                        }
                                        disabled={deleteMutation.isPending}
                                      >
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        No messages in this DLQ stream
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Replay Dialog */}
      <Dialog open={replayDialogOpen} onOpenChange={setReplayDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Replay Messages</DialogTitle>
            <DialogDescription>
              Replay {selectedMessages.size} selected message(s) to their original subjects or a
              custom target.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Target Subject (optional)</label>
              <Input
                placeholder="Leave empty to use original subject from headers"
                value={targetSubject}
                onChange={(e) => setTargetSubject(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                If not specified, messages will be replayed to their original subjects (if stored
                in headers).
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReplayDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmReplay} disabled={replayMutation.isPending}>
              {replayMutation.isPending ? 'Replaying...' : 'Replay Messages'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Purge Dialog */}
      <Dialog open={purgeDialogOpen} onOpenChange={setPurgeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Purge DLQ Stream</DialogTitle>
            <DialogDescription>
              Are you sure you want to purge all messages from{' '}
              <strong>{selectedStreamForPurge?.streamName}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPurgeDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmPurge}
              disabled={purgeMutation.isPending}
            >
              {purgeMutation.isPending ? 'Purging...' : 'Purge All Messages'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
