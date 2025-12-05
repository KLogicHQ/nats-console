'use client';

import { useState, useEffect } from 'react';
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

interface Consumer {
  name: string;
  config?: {
    durable_name?: string;
    filter_subject?: string;
    deliver_policy?: string;
    ack_policy?: string;
    replay_policy?: string;
    ack_wait?: number;
    max_deliver?: number;
    max_ack_pending?: number;
    max_waiting?: number;
    description?: string;
  };
}

interface CreateConsumerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clusterId: string;
  streamName: string;
  consumer?: Consumer;
  mode?: 'create' | 'edit';
}

export function CreateConsumerDialog({
  open,
  onOpenChange,
  clusterId,
  streamName,
  consumer,
  mode = 'create',
}: CreateConsumerDialogProps) {
  const queryClient = useQueryClient();
  const isEditMode = mode === 'edit' && consumer;

  const getInitialFormData = () => ({
    name: consumer?.name || '',
    durableName: consumer?.config?.durable_name || '',
    filterSubject: consumer?.config?.filter_subject || '',
    deliverPolicy: consumer?.config?.deliver_policy || 'all',
    ackPolicy: consumer?.config?.ack_policy || 'explicit',
    replayPolicy: consumer?.config?.replay_policy || 'instant',
    ackWait: String(consumer?.config?.ack_wait || '30000000000'),
    maxDeliver: String(consumer?.config?.max_deliver ?? '-1'),
    maxAckPending: String(consumer?.config?.max_ack_pending || '1000'),
    maxWaiting: String(consumer?.config?.max_waiting || '512'),
    description: consumer?.config?.description || '',
  });

  const [formData, setFormData] = useState(getInitialFormData);
  const [error, setError] = useState('');

  // Reset form when consumer changes or dialog opens
  useEffect(() => {
    if (open) {
      setFormData(getInitialFormData());
      setError('');
    }
  }, [open, consumer?.name]);

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

  const updateMutation = useMutation({
    mutationFn: (data: any) => api.consumers.update(clusterId, streamName, consumer!.name, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consumers', clusterId, streamName] });
      queryClient.invalidateQueries({ queryKey: ['consumer', clusterId, streamName, consumer!.name] });
      onOpenChange(false);
    },
    onError: (err: any) => {
      setError(err.message || 'Failed to update consumer');
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
      description: '',
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

    const payload = {
      name: formData.name,
      durableName: formData.durableName || undefined,
      filterSubject: formData.filterSubject || undefined,
      deliverPolicy: formData.deliverPolicy,
      ackPolicy: formData.ackPolicy,
      replayPolicy: formData.replayPolicy,
      ackWait: parseInt(formData.ackWait),
      maxDeliver: parseInt(formData.maxDeliver),
      maxAckPending: parseInt(formData.maxAckPending),
      maxWaiting: parseInt(formData.maxWaiting),
      description: formData.description || undefined,
    };

    if (isEditMode) {
      // Only update editable fields for existing consumers
      updateMutation.mutate({
        description: formData.description || undefined,
        ackWait: parseInt(formData.ackWait),
        maxDeliver: parseInt(formData.maxDeliver),
        maxAckPending: parseInt(formData.maxAckPending),
        maxWaiting: parseInt(formData.maxWaiting),
      });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Edit Consumer' : 'Create Consumer'}</DialogTitle>
          <DialogDescription>
            {isEditMode
              ? `Update settings for consumer: ${consumer?.name}`
              : `Create a new consumer for stream: ${streamName}`}
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
                  disabled={isEditMode}
                />
                {isEditMode && (
                  <p className="text-xs text-muted-foreground">Consumer name cannot be changed</p>
                )}
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
            <Button type="submit" disabled={isPending}>
              {isPending
                ? (isEditMode ? 'Saving...' : 'Creating...')
                : (isEditMode ? 'Save Changes' : 'Create Consumer')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
