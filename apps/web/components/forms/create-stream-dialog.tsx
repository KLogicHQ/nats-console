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

interface CreateStreamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clusterId: string;
}

export function CreateStreamDialog({
  open,
  onOpenChange,
  clusterId,
}: CreateStreamDialogProps) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: '',
    subjects: '',
    description: '',
    storage: 'file',
    retention: 'limits',
    maxMsgs: '-1',
    maxBytes: '-1',
    maxAge: '0',
    maxMsgSize: '-1',
    replicas: '1',
    discard: 'old',
  });
  const [error, setError] = useState('');

  const createMutation = useMutation({
    mutationFn: (data: any) => api.streams.create(clusterId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['streams', clusterId] });
      onOpenChange(false);
      resetForm();
    },
    onError: (err: any) => {
      setError(err.message || 'Failed to create stream');
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      subjects: '',
      description: '',
      storage: 'file',
      retention: 'limits',
      maxMsgs: '-1',
      maxBytes: '-1',
      maxAge: '0',
      maxMsgSize: '-1',
      replicas: '1',
      discard: 'old',
    });
    setError('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.name) {
      setError('Stream name is required');
      return;
    }

    if (!formData.subjects) {
      setError('At least one subject is required');
      return;
    }

    const subjects = formData.subjects.split(',').map((s) => s.trim()).filter(Boolean);

    createMutation.mutate({
      name: formData.name,
      subjects,
      description: formData.description || undefined,
      storage: formData.storage,
      retention: formData.retention,
      max_msgs: parseInt(formData.maxMsgs),
      max_bytes: parseInt(formData.maxBytes),
      max_age: parseInt(formData.maxAge),
      max_msg_size: parseInt(formData.maxMsgSize),
      num_replicas: parseInt(formData.replicas),
      discard: formData.discard,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Stream</DialogTitle>
          <DialogDescription>
            Create a new JetStream stream on this cluster
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
                <label className="text-sm font-medium">Stream Name *</label>
                <Input
                  placeholder="ORDERS"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value.toUpperCase() })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Subjects *</label>
                <Input
                  placeholder="orders.>, orders.created"
                  value={formData.subjects}
                  onChange={(e) => setFormData({ ...formData, subjects: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">Comma-separated list</p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Input
                placeholder="Stream description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Storage Type</label>
                <select
                  className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData.storage}
                  onChange={(e) => setFormData({ ...formData, storage: e.target.value })}
                >
                  <option value="file">File</option>
                  <option value="memory">Memory</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Retention Policy</label>
                <select
                  className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData.retention}
                  onChange={(e) => setFormData({ ...formData, retention: e.target.value })}
                >
                  <option value="limits">Limits</option>
                  <option value="interest">Interest</option>
                  <option value="workqueue">Work Queue</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Discard Policy</label>
                <select
                  className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData.discard}
                  onChange={(e) => setFormData({ ...formData, discard: e.target.value })}
                >
                  <option value="old">Old</option>
                  <option value="new">New</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Replicas</label>
                <Input
                  type="number"
                  min="1"
                  max="5"
                  value={formData.replicas}
                  onChange={(e) => setFormData({ ...formData, replicas: e.target.value })}
                />
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-3">Limits (use -1 for unlimited)</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Max Messages</label>
                  <Input
                    type="number"
                    value={formData.maxMsgs}
                    onChange={(e) => setFormData({ ...formData, maxMsgs: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Max Bytes</label>
                  <Input
                    type="number"
                    value={formData.maxBytes}
                    onChange={(e) => setFormData({ ...formData, maxBytes: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Max Age (ns)</label>
                  <Input
                    type="number"
                    value={formData.maxAge}
                    onChange={(e) => setFormData({ ...formData, maxAge: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">0 = unlimited</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Max Message Size</label>
                  <Input
                    type="number"
                    value={formData.maxMsgSize}
                    onChange={(e) => setFormData({ ...formData, maxMsgSize: e.target.value })}
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
              {createMutation.isPending ? 'Creating...' : 'Create Stream'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
