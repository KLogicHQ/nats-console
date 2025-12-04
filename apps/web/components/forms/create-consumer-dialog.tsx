'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface CreateConsumerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clusterId: string;
  streamName: string;
}

export function CreateConsumerDialog({
  open,
  onOpenChange,
  clusterId,
  streamName,
}: CreateConsumerDialogProps) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: '',
    durableName: '',
    filterSubject: '',
    deliverPolicy: 'all',
    ackPolicy: 'explicit',
    replayPolicy: 'instant',
    ackWait: '30000000000', // 30 seconds in nanoseconds
    maxDeliver: '-1',
    maxAckPending: '1000',
    maxWaiting: '512',
  });
  const [error, setError] = useState('');

  const createMutation = useMutation({
    mutationFn: (data: any) => api.consumers.create(clusterId, streamName, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consumers', clusterId, streamName] });
      onOpenChange(false);
      resetForm();
    },
    onError: (err: any) => {
      setError(err.message || 'Failed to create consumer');
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      durableName: '',
      filterSubject: '',
      deliverPolicy: 'all',
      ackPolicy: 'explicit',
      replayPolicy: 'instant',
      ackWait: '30000000000',
      maxDeliver: '-1',
      maxAckPending: '1000',
      maxWaiting: '512',
    });
    setError('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.name) {
      setError('Consumer name is required');
      return;
    }

    createMutation.mutate({
      name: formData.name,
      durable_name: formData.durableName || undefined,
      filter_subject: formData.filterSubject || undefined,
      deliver_policy: formData.deliverPolicy,
      ack_policy: formData.ackPolicy,
      replay_policy: formData.replayPolicy,
      ack_wait: parseInt(formData.ackWait),
      max_deliver: parseInt(formData.maxDeliver),
      max_ack_pending: parseInt(formData.maxAckPending),
      max_waiting: parseInt(formData.maxWaiting),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Consumer</DialogTitle>
          <DialogDescription>
            Create a new consumer for stream: {streamName}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          {error && (
            <div className="p-3 mb-4 text-sm text-destructive bg-destructive/10 rounded-md">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Consumer Name *</label>
                <Input
                  placeholder="my-consumer"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Durable Name</label>
                <Input
                  placeholder="my-durable-consumer"
                  value={formData.durableName}
                  onChange={(e) => setFormData({ ...formData, durableName: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">Leave empty for ephemeral</p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Filter Subject</label>
              <Input
                placeholder="orders.created"
                value={formData.filterSubject}
                onChange={(e) => setFormData({ ...formData, filterSubject: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Filter to specific subject pattern
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Deliver Policy</label>
                <select
                  className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData.deliverPolicy}
                  onChange={(e) => setFormData({ ...formData, deliverPolicy: e.target.value })}
                >
                  <option value="all">All</option>
                  <option value="last">Last</option>
                  <option value="new">New</option>
                  <option value="by_start_sequence">By Start Sequence</option>
                  <option value="by_start_time">By Start Time</option>
                  <option value="last_per_subject">Last Per Subject</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Ack Policy</label>
                <select
                  className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData.ackPolicy}
                  onChange={(e) => setFormData({ ...formData, ackPolicy: e.target.value })}
                >
                  <option value="explicit">Explicit</option>
                  <option value="none">None</option>
                  <option value="all">All</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Replay Policy</label>
                <select
                  className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData.replayPolicy}
                  onChange={(e) => setFormData({ ...formData, replayPolicy: e.target.value })}
                >
                  <option value="instant">Instant</option>
                  <option value="original">Original</option>
                </select>
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-3">Delivery Settings</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Ack Wait (ns)</label>
                  <Input
                    type="number"
                    value={formData.ackWait}
                    onChange={(e) => setFormData({ ...formData, ackWait: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">30000000000 = 30 seconds</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Max Deliver</label>
                  <Input
                    type="number"
                    value={formData.maxDeliver}
                    onChange={(e) => setFormData({ ...formData, maxDeliver: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">-1 = unlimited</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Max Ack Pending</label>
                  <Input
                    type="number"
                    value={formData.maxAckPending}
                    onChange={(e) => setFormData({ ...formData, maxAckPending: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Max Waiting</label>
                  <Input
                    type="number"
                    value={formData.maxWaiting}
                    onChange={(e) => setFormData({ ...formData, maxWaiting: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create Consumer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
