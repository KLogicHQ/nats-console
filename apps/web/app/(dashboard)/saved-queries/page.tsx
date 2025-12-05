'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  Plus,
  Settings,
  Trash2,
  Copy,
  Share2,
  Loader2,
  MoreHorizontal,
  Clock,
  User,
  Globe,
  Lock,
  Play,
  FileCode,
  Users,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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

interface SavedQuery {
  id: string;
  name: string;
  query: string;
  description: string | null;
  isShared: boolean;
  createdAt: string;
  updatedAt: string;
  user: { firstName: string; lastName: string; email: string };
}

interface ShareQuery {
  id: string;
  name: string;
  isShared: boolean;
}

export default function SavedQueriesPage() {
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editQuery, setEditQuery] = useState<SavedQuery | null>(null);
  const [deleteQueryId, setDeleteQueryId] = useState<string | null>(null);
  const [shareQuery, setShareQuery] = useState<ShareQuery | null>(null);
  const [newQuery, setNewQuery] = useState({
    name: '',
    query: '',
    description: '',
  });

  const { data: queriesData, isLoading } = useQuery({
    queryKey: ['saved-queries'],
    queryFn: () => api.savedQueries.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; query: string; description?: string }) =>
      api.savedQueries.create(data),
    onSuccess: () => {
      setShowCreateDialog(false);
      setNewQuery({ name: '', query: '', description: '' });
      queryClient.invalidateQueries({ queryKey: ['saved-queries'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      api.savedQueries.update(id, data),
    onSuccess: () => {
      setEditQuery(null);
      queryClient.invalidateQueries({ queryKey: ['saved-queries'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.savedQueries.delete(id),
    onSuccess: () => {
      setDeleteQueryId(null);
      queryClient.invalidateQueries({ queryKey: ['saved-queries'] });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: string) => api.savedQueries.clone(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-queries'] });
    },
  });

  const shareMutation = useMutation({
    mutationFn: ({ id, isShared }: { id: string; isShared: boolean }) =>
      api.savedQueries.update(id, { isShared }),
    onSuccess: () => {
      setShareQuery(null);
      queryClient.invalidateQueries({ queryKey: ['saved-queries'] });
    },
  });

  const handleCreate = () => {
    if (!newQuery.name.trim() || !newQuery.query.trim()) return;
    createMutation.mutate({
      name: newQuery.name,
      query: newQuery.query,
      description: newQuery.description || undefined,
    });
  };

  const handleUpdate = () => {
    if (!editQuery || !editQuery.name.trim() || !editQuery.query.trim()) return;
    updateMutation.mutate({
      id: editQuery.id,
      data: {
        name: editQuery.name,
        query: editQuery.query,
        description: editQuery.description,
      },
    });
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const truncateQuery = (query: string, maxLength = 100) => {
    if (query.length <= maxLength) return query;
    return query.slice(0, maxLength) + '...';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Saved Queries</h1>
          <p className="text-muted-foreground">
            Save and reuse your analytics queries
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4" />
          New Query
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && (!queriesData?.savedQueries || queriesData.savedQueries.length === 0) && (
        <Card>
          <CardContent className="py-12 text-center">
            <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No saved queries yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first saved query to store and reuse analytics queries
            </p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4" />
              Create Query
            </Button>
          </CardContent>
        </Card>
      )}

      {queriesData?.savedQueries && queriesData.savedQueries.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {queriesData.savedQueries.map((query: SavedQuery) => (
            <Card key={query.id} className="group relative hover:border-primary/50 transition-colors">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <FileCode className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{query.name}</CardTitle>
                      <CardDescription className="mt-1 line-clamp-2">
                        {query.description || 'No description'}
                      </CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-3 p-2 rounded bg-muted font-mono text-xs text-muted-foreground overflow-hidden">
                  {truncateQuery(query.query)}
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    <span>Updated {formatDate(query.updatedAt)}</span>
                  </div>
                  {query.isShared ? (
                    <Badge variant="secondary" className="gap-1">
                      <Globe className="h-3 w-3" />
                      Shared
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1">
                      <Lock className="h-3 w-3" />
                      Private
                    </Badge>
                  )}
                </div>
              </CardContent>
              <div className="absolute top-4 right-4">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setEditQuery(query)}>
                      <Settings className="h-4 w-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => duplicateMutation.mutate(query.id)}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        setShareQuery({
                          id: query.id,
                          name: query.name,
                          isShared: query.isShared,
                        })
                      }
                    >
                      <Share2 className="h-4 w-4 mr-2" />
                      Share
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => setDeleteQueryId(query.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create Query Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Create New Query</DialogTitle>
            <DialogDescription>
              Save a query for later use in dashboards and analytics
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                placeholder="e.g., Daily Message Rate"
                value={newQuery.name}
                onChange={(e) => setNewQuery({ ...newQuery, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Query *</Label>
              <Textarea
                placeholder="Enter your query configuration (JSON format)..."
                className="font-mono text-sm min-h-[150px]"
                value={newQuery.query}
                onChange={(e) => setNewQuery({ ...newQuery, query: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                placeholder="Optional description..."
                value={newQuery.description}
                onChange={(e) => setNewQuery({ ...newQuery, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!newQuery.name.trim() || !newQuery.query.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Create Query
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Query Dialog */}
      <Dialog open={!!editQuery} onOpenChange={() => setEditQuery(null)}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Edit Query</DialogTitle>
            <DialogDescription>
              Update your saved query configuration
            </DialogDescription>
          </DialogHeader>
          {editQuery && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input
                  placeholder="e.g., Daily Message Rate"
                  value={editQuery.name}
                  onChange={(e) => setEditQuery({ ...editQuery, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Query *</Label>
                <Textarea
                  placeholder="Enter your query configuration (JSON format)..."
                  className="font-mono text-sm min-h-[150px]"
                  value={editQuery.query}
                  onChange={(e) => setEditQuery({ ...editQuery, query: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  placeholder="Optional description..."
                  value={editQuery.description || ''}
                  onChange={(e) => setEditQuery({ ...editQuery, description: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditQuery(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={!editQuery?.name.trim() || !editQuery?.query.trim() || updateMutation.isPending}
            >
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Settings className="h-4 w-4" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteQueryId} onOpenChange={() => setDeleteQueryId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Query?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the saved query.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteQueryId && deleteMutation.mutate(deleteQueryId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Share Query Dialog */}
      <Dialog open={!!shareQuery} onOpenChange={() => setShareQuery(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share Query</DialogTitle>
            <DialogDescription>
              Control who can view &quot;{shareQuery?.name}&quot; in your organization
            </DialogDescription>
          </DialogHeader>
          <div className="py-6">
            <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-background">
                  {shareQuery?.isShared ? (
                    <Globe className="h-5 w-5 text-primary" />
                  ) : (
                    <Lock className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <Label htmlFor="share-toggle" className="text-base font-medium">
                    Share with organization
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {shareQuery?.isShared
                      ? 'Everyone in your organization can use this query'
                      : 'Only you can use this query'}
                  </p>
                </div>
              </div>
              <Switch
                id="share-toggle"
                checked={shareQuery?.isShared ?? false}
                onCheckedChange={(checked) => {
                  if (shareQuery) {
                    setShareQuery({ ...shareQuery, isShared: checked });
                  }
                }}
              />
            </div>

            {shareQuery?.isShared && (
              <div className="mt-4 p-4 rounded-lg border border-primary/20 bg-primary/5">
                <div className="flex items-start gap-3">
                  <Users className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Organization Access</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      All team members will be able to use this query in their dashboards.
                      They cannot modify or delete it unless they have admin permissions.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShareQuery(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (shareQuery) {
                  shareMutation.mutate({
                    id: shareQuery.id,
                    isShared: shareQuery.isShared,
                  });
                }
              }}
              disabled={shareMutation.isPending}
            >
              {shareMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : shareQuery?.isShared ? (
                <Globe className="h-4 w-4 mr-2" />
              ) : (
                <Lock className="h-4 w-4 mr-2" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
