'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';

export default function AcceptInvitePage() {
  const router = useRouter();
  const params = useParams();
  const token = params.token as string;

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');

  const { data: inviteData, isLoading: isLoadingInvite, error: inviteError } = useQuery({
    queryKey: ['invite', token],
    queryFn: () => api.invites.getByToken(token),
    enabled: !!token,
  });

  const acceptMutation = useMutation({
    mutationFn: (data: { firstName: string; lastName: string; password: string }) =>
      api.invites.accept(token, data),
    onSuccess: () => {
      router.push('/login?invited=true');
    },
    onError: (err: any) => {
      setError(err.message || 'Failed to accept invitation');
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    acceptMutation.mutate({
      firstName: formData.firstName,
      lastName: formData.lastName,
      password: formData.password,
    });
  };

  if (isLoadingInvite) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (inviteError || !inviteData?.invite?.valid) {
    const reason = inviteData?.invite?.reason || 'This invitation is no longer valid';
    return (
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <XCircle className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle className="text-2xl font-bold">Invalid Invitation</CardTitle>
          <CardDescription>{reason}</CardDescription>
        </CardHeader>
        <CardFooter className="flex justify-center">
          <Link href="/login">
            <Button variant="outline">Go to Login</Button>
          </Link>
        </CardFooter>
      </Card>
    );
  }

  const invite = inviteData.invite;

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">Join {invite.organization?.name}</CardTitle>
        <CardDescription>
          You've been invited by {invite.inviter?.firstName} {invite.inviter?.lastName} to join as a{' '}
          <span className="font-medium capitalize">{invite.role}</span>
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>
          )}
          <div className="p-3 bg-muted rounded-md">
            <p className="text-sm text-muted-foreground">
              Email: <span className="font-medium text-foreground">{invite.email}</span>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="firstName" className="text-sm font-medium">
                First name
              </label>
              <Input
                id="firstName"
                placeholder="John"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="lastName" className="text-sm font-medium">
                Last name
              </label>
              <Input
                id="lastName"
                placeholder="Doe"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <Input
              id="password"
              type="password"
              placeholder="Create a password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="confirmPassword" className="text-sm font-medium">
              Confirm password
            </label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="Confirm your password"
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              required
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <Button type="submit" className="w-full" disabled={acceptMutation.isPending}>
            {acceptMutation.isPending ? 'Joining...' : 'Accept Invitation'}
          </Button>
          <p className="text-sm text-center text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
