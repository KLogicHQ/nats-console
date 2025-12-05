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

interface Cluster {
  id: string;
  name: string;
  description?: string;
  url: string;
  environment: string;
  authType?: string;
}

interface CreateClusterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cluster?: Cluster;
  mode?: 'create' | 'edit';
}

export function CreateClusterDialog({
  open,
  onOpenChange,
  cluster,
  mode = 'create',
}: CreateClusterDialogProps) {
  const queryClient = useQueryClient();
  const isEditMode = mode === 'edit' && cluster;

  const getInitialFormData = () => ({
    name: cluster?.name || '',
    description: cluster?.description || '',
    url: cluster?.url || 'nats://localhost:4222',
    environment: cluster?.environment || 'development',
    authType: cluster?.authType || 'none',
    username: '',
    password: '',
    token: '',
    credsFile: '',
  });

  const [formData, setFormData] = useState(getInitialFormData);
  const [error, setError] = useState('');

  // Reset form when cluster changes or dialog opens
  useEffect(() => {
    if (open) {
      setFormData(getInitialFormData());
      setError('');
    }
  }, [open, cluster?.id]);

  const createMutation = useMutation({
    mutationFn: (data: any) => api.clusters.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clusters'] });
      onOpenChange(false);
      resetForm();
    },
    onError: (err: any) => {
      setError(err.message || 'Failed to create cluster');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => api.clusters.update(cluster!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clusters'] });
      queryClient.invalidateQueries({ queryKey: ['cluster', cluster!.id] });
      onOpenChange(false);
    },
    onError: (err: any) => {
      setError(err.message || 'Failed to update cluster');
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      url: 'nats://localhost:4222',
      environment: 'development',
      authType: 'none',
      username: '',
      password: '',
      token: '',
      credsFile: '',
    });
    setError('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.name) {
      setError('Cluster name is required');
      return;
    }

    if (!formData.url) {
      setError('Cluster URL is required');
      return;
    }

    // Build credentials object based on auth type
    let credentials: Record<string, string> | undefined;
    if (formData.authType === 'userpass' && (formData.username || formData.password)) {
      credentials = {
        username: formData.username,
        password: formData.password,
      };
    } else if (formData.authType === 'token' && formData.token) {
      credentials = { token: formData.token };
    } else if (formData.authType === 'creds' && formData.credsFile) {
      credentials = { credsFile: formData.credsFile };
    }

    const payload = {
      name: formData.name,
      description: formData.description || undefined,
      serverUrl: formData.url,
      environment: formData.environment,
      credentials,
    };

    if (isEditMode) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Edit Cluster' : 'Add Cluster'}</DialogTitle>
          <DialogDescription>
            {isEditMode ? 'Update cluster connection settings' : 'Connect to a NATS JetStream cluster'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          {error && (
            <div className="p-3 mb-4 text-sm text-destructive bg-destructive/10 rounded-md">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Cluster Name *</label>
              <Input
                placeholder="Production Cluster"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Input
                placeholder="Main production NATS cluster"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">URL *</label>
              <Input
                placeholder="nats://localhost:4222"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Use comma for multiple URLs: nats://host1:4222,nats://host2:4222
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Environment</label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={formData.environment}
                onChange={(e) => setFormData({ ...formData, environment: e.target.value })}
              >
                <option value="development">Development</option>
                <option value="staging">Staging</option>
                <option value="production">Production</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Authentication</label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={formData.authType}
                onChange={(e) => setFormData({ ...formData, authType: e.target.value })}
              >
                <option value="none">None</option>
                <option value="userpass">Username/Password</option>
                <option value="token">Token</option>
                <option value="creds">Credentials File</option>
                <option value="nkey">NKey</option>
              </select>
            </div>

            {formData.authType === 'userpass' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Username</label>
                  <Input
                    placeholder="username"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Password</label>
                  <Input
                    type="password"
                    placeholder="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  />
                </div>
              </div>
            )}

            {formData.authType === 'token' && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Token</label>
                <Input
                  type="password"
                  placeholder="auth-token"
                  value={formData.token}
                  onChange={(e) => setFormData({ ...formData, token: e.target.value })}
                />
              </div>
            )}

            {formData.authType === 'creds' && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Credentials File Path</label>
                <Input
                  placeholder="/path/to/creds.creds"
                  value={formData.credsFile}
                  onChange={(e) => setFormData({ ...formData, credsFile: e.target.value })}
                />
              </div>
            )}
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
                ? (isEditMode ? 'Saving...' : 'Connecting...')
                : (isEditMode ? 'Save Changes' : 'Add Cluster')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
