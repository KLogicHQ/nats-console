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

interface CreateStreamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clusterId: string;
  stream?: any;
  mode?: 'create' | 'edit';
}

export function CreateStreamDialog({
  open,
  onOpenChange,
  clusterId,
  stream,
  mode = 'create',
}: CreateStreamDialogProps) {
  const queryClient = useQueryClient();
  const isEditing = mode === 'edit' && stream;

  const getInitialFormData = () => ({
    name: stream?.config?.name || '',
    subjects: stream?.config?.subjects?.join(', ') || '',
    description: stream?.config?.description || '',
    storage: stream?.config?.storage || 'file',
    retention: stream?.config?.retention || 'limits',
    maxMsgs: String(stream?.config?.max_msgs ?? -1),
    maxBytes: String(stream?.config?.max_bytes ?? -1),
    maxAge: String(stream?.config?.max_age ?? 0),
    maxMsgSize: String(stream?.config?.max_msg_size ?? -1),
    replicas: String(stream?.config?.num_replicas ?? 1),
    discard: stream?.config?.discard || 'old',
  });

  const [formData, setFormData] = useState(getInitialFormData());
  const [error, setError] = useState('');

  // Reset form when stream changes or dialog opens
  useEffect(() => {
    if (open) {
      setFormData(getInitialFormData());
      setError('');
    }
  }, [open, stream]);

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

  const updateMutation = useMutation({
    mutationFn: (data: any) => api.streams.update(clusterId, stream?.config?.name, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['streams', clusterId] });
      queryClient.invalidateQueries({ queryKey: ['stream', clusterId, stream?.config?.name] });
      onOpenChange(false);
    },
    onError: (err: any) => {
      setError(err.message || 'Failed to update stream');
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

    const subjects = formData.subjects.split(',').map((s: string) => s.trim()).filter(Boolean);

    const data = {
      name: formData.name,
      subjects,
      storage: formData.storage,
      retention: formData.retention,
      maxMsgs: parseInt(formData.maxMsgs),
      maxBytes: parseInt(formData.maxBytes),
      maxAge: parseInt(formData.maxAge),
      maxMsgSize: parseInt(formData.maxMsgSize),
      replicas: parseInt(formData.replicas),
      discard: formData.discard,
    };

    if (isEditing) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Stream' : 'Create Stream'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? `Update configuration for stream "${stream?.config?.name}"`
              : 'Create a new JetStream stream on this cluster'}
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
                  disabled={isEditing}
                />
                {isEditing && (
                  <p className="text-xs text-muted-foreground">Stream name cannot be changed</p>
                )}
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
                if (!isEditing) resetForm();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending
                ? isEditing ? 'Updating...' : 'Creating...'
                : isEditing ? 'Update Stream' : 'Create Stream'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
