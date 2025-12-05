'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Copy, Check } from 'lucide-react';
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

interface InviteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InviteUserDialog({ open, onOpenChange }: InviteUserDialogProps) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'member' | 'viewer'>('member');
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const createMutation = useMutation({
    mutationFn: (data: { email: string; role: 'admin' | 'member' | 'viewer' }) =>
      api.invites.create(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['invites'] });
      setInviteLink(data.invite.inviteLink);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({ email, role });
  };

  const handleCopy = async () => {
    if (inviteLink) {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClose = () => {
    setEmail('');
    setRole('member');
    setInviteLink(null);
    setCopied(false);
    createMutation.reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Invite Team Member
          </DialogTitle>
          <DialogDescription>
            Send an invitation to join your organization
          </DialogDescription>
        </DialogHeader>

        {inviteLink ? (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-sm text-green-800 font-medium mb-2">
                Invitation sent to {email}
              </p>
              <p className="text-xs text-green-600">
                Share this link with them to join:
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={inviteLink}
                className="font-mono text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleCopy}
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>

            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium">Email Address</label>
              <Input
                type="email"
                placeholder="colleague@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Role</label>
              <select
                className="w-full mt-1 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={role}
                onChange={(e) => setRole(e.target.value as typeof role)}
              >
                <option value="admin">Admin - Full access</option>
                <option value="member">Member - Standard access</option>
                <option value="viewer">Viewer - Read-only access</option>
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                {role === 'admin' && 'Can manage clusters, invite users, and configure settings'}
                {role === 'member' && 'Can view and manage clusters and streams'}
                {role === 'viewer' && 'Can only view dashboards and metrics'}
              </p>
            </div>

            {createMutation.error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-600">
                  {(createMutation.error as any).message || 'Failed to send invitation'}
                </p>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Sending...' : 'Send Invitation'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
