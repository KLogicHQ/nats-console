'use client';

import { Suspense, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Save,
  User,
  Bell,
  Shield,
  Key,
  Palette,
  Users,
  UserPlus,
  Trash2,
  Mail,
  Loader2,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Plus,
  Clock,
} from 'lucide-react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InviteUserDialog } from '@/components/forms/invite-user-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

const tabs = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'api-keys', label: 'API Keys', icon: Key },
  { id: 'appearance', label: 'Appearance', icon: Palette },
];

function SettingsPageContent() {
  const { user, setUser } = useAuthStore();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Tab persistence via URL
  const activeTab = searchParams.get('tab') || 'profile';
  const setActiveTab = (tab: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const [profileForm, setProfileForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
  });

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const [notificationSettings, setNotificationSettings] = useState({
    emailAlerts: true,
    webhookAlerts: false,
    slackAlerts: false,
    alertDigest: 'daily',
  });

  const [appearanceSettings, setAppearanceSettings] = useState({
    theme: 'system',
    dateFormat: 'relative',
  });

  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [showCreateApiKeyDialog, setShowCreateApiKeyDialog] = useState(false);
  const [newApiKeyName, setNewApiKeyName] = useState('');
  const [newApiKeyExpiry, setNewApiKeyExpiry] = useState('never');
  const [createdApiKey, setCreatedApiKey] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [deleteApiKeyId, setDeleteApiKeyId] = useState<string | null>(null);

  // 2FA state
  const [show2faDialog, setShow2faDialog] = useState(false);
  const [mfaSetupData, setMfaSetupData] = useState<{ secret: string; qrCode: string } | null>(null);
  const [mfaVerifyCode, setMfaVerifyCode] = useState('');
  const [mfaError, setMfaError] = useState('');
  const [showDisable2faDialog, setShowDisable2faDialog] = useState(false);

  // Initialize form with user data
  useEffect(() => {
    if (user) {
      setProfileForm({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email || '',
      });
    }
  }, [user]);

  // Fetch pending invites
  const { data: invitesData } = useQuery({
    queryKey: ['invites'],
    queryFn: () => api.invites.list(),
  });

  // Fetch API keys
  const { data: apiKeysData, isLoading: apiKeysLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => api.settings.listApiKeys(),
  });

  // Profile update mutation
  const profileMutation = useMutation({
    mutationFn: (data: { firstName?: string; lastName?: string; email?: string }) =>
      api.auth.updateProfile(data),
    onSuccess: (data) => {
      setUser(data.user);
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
  });

  // Change password mutation
  const changePasswordMutation = useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) =>
      api.auth.changePassword(data),
    onSuccess: () => {
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordError('');
      setPasswordSuccess(true);
      setTimeout(() => setPasswordSuccess(false), 3000);
    },
    onError: (err: any) => {
      setPasswordError(err.message || 'Failed to change password');
      setPasswordSuccess(false);
    },
  });

  // Notification preferences mutation
  const notificationMutation = useMutation({
    mutationFn: (data: typeof notificationSettings) => api.settings.updatePreferences(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  // Appearance preferences mutation
  const appearanceMutation = useMutation({
    mutationFn: (data: typeof appearanceSettings) => api.settings.updatePreferences(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  // API key mutations
  const createApiKeyMutation = useMutation({
    mutationFn: (data: { name: string; expiresIn?: string }) => api.settings.createApiKey(data),
    onSuccess: (data) => {
      setCreatedApiKey(data.apiKey.key);
      setNewApiKeyName('');
      setNewApiKeyExpiry('never');
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  const deleteApiKeyMutation = useMutation({
    mutationFn: (id: string) => api.settings.deleteApiKey(id),
    onSuccess: () => {
      setDeleteApiKeyId(null);
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.invites.revoke(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invites'] });
    },
  });

  // 2FA mutations
  const enable2faMutation = useMutation({
    mutationFn: () => api.mfa.enable(),
    onSuccess: (data) => {
      setMfaSetupData(data);
      setShow2faDialog(true);
    },
    onError: (err: any) => {
      setMfaError(err.message || 'Failed to enable 2FA');
    },
  });

  const verify2faMutation = useMutation({
    mutationFn: (code: string) => api.mfa.verify(code),
    onSuccess: (data) => {
      if (data.valid) {
        setShow2faDialog(false);
        setMfaSetupData(null);
        setMfaVerifyCode('');
        setMfaError('');
        // Refresh user data to get updated mfaEnabled status
        queryClient.invalidateQueries({ queryKey: ['user'] });
        // Update local user state
        if (user) {
          setUser({ ...user, mfaEnabled: true });
        }
      } else {
        setMfaError('Invalid verification code. Please try again.');
      }
    },
    onError: (err: any) => {
      setMfaError(err.message || 'Failed to verify code');
    },
  });

  const disable2faMutation = useMutation({
    mutationFn: () => api.mfa.disable(),
    onSuccess: () => {
      setShowDisable2faDialog(false);
      queryClient.invalidateQueries({ queryKey: ['user'] });
      // Update local user state
      if (user) {
        setUser({ ...user, mfaEnabled: false });
      }
    },
    onError: (err: any) => {
      setMfaError(err.message || 'Failed to disable 2FA');
    },
  });

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    profileMutation.mutate(profileForm);
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return;
    }

    changePasswordMutation.mutate({
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword,
    });
  };

  const handleNotificationSave = () => {
    notificationMutation.mutate(notificationSettings);
  };

  const handleAppearanceSave = () => {
    appearanceMutation.mutate(appearanceSettings);
  };

  const handleCreateApiKey = () => {
    if (!newApiKeyName.trim()) return;
    createApiKeyMutation.mutate({
      name: newApiKeyName,
      expiresIn: newApiKeyExpiry !== 'never' ? newApiKeyExpiry : undefined,
    });
  };

  const copyApiKey = () => {
    if (createdApiKey) {
      navigator.clipboard.writeText(createdApiKey);
    }
  };

  const formatDate = (date: string | null) => {
    if (!date) return 'Never';
    return new Date(date).toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your account and preferences</p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-48 space-y-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  activeTab === tab.id
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1">
          {activeTab === 'profile' && (
            <Card>
              <CardHeader>
                <CardTitle>Profile Settings</CardTitle>
                <CardDescription>Update your personal information</CardDescription>
              </CardHeader>
              <form onSubmit={handleProfileSubmit}>
                <CardContent className="space-y-4">
                  {profileMutation.isSuccess && (
                    <div className="p-3 text-sm text-green-600 bg-green-50 rounded-md flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" />
                      Profile updated successfully
                    </div>
                  )}
                  {profileMutation.error && (
                    <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                      {(profileMutation.error as any).message || 'Failed to update profile'}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">First Name</label>
                      <Input
                        value={profileForm.firstName}
                        onChange={(e) =>
                          setProfileForm({ ...profileForm, firstName: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Last Name</label>
                      <Input
                        value={profileForm.lastName}
                        onChange={(e) =>
                          setProfileForm({ ...profileForm, lastName: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Email</label>
                    <Input
                      type="email"
                      value={profileForm.email}
                      onChange={(e) =>
                        setProfileForm({ ...profileForm, email: e.target.value })
                      }
                    />
                  </div>
                  <Button type="submit" disabled={profileMutation.isPending}>
                    {profileMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Save Changes
                  </Button>
                </CardContent>
              </form>
            </Card>
          )}

          {activeTab === 'team' && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Team Members</CardTitle>
                      <CardDescription>Manage your organization's team members</CardDescription>
                    </div>
                    <Button onClick={() => setShowInviteDialog(true)}>
                      <UserPlus className="h-4 w-4" />
                      Invite Member
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {/* Current user */}
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{user?.firstName} {user?.lastName}</p>
                          <p className="text-sm text-muted-foreground">{user?.email}</p>
                        </div>
                      </div>
                      <span className="px-2 py-1 text-xs bg-primary/10 text-primary rounded-full">
                        Owner
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Pending Invites</CardTitle>
                  <CardDescription>Invitations waiting to be accepted</CardDescription>
                </CardHeader>
                <CardContent>
                  {invitesData?.invites && invitesData.invites.length > 0 ? (
                    <div className="space-y-3">
                      {invitesData.invites.map((invite: any) => (
                        <div key={invite.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                              <Mail className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <div>
                              <p className="font-medium">{invite.email}</p>
                              <p className="text-sm text-muted-foreground">
                                Invited {new Date(invite.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-700 rounded-full capitalize">
                              {invite.role}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => revokeMutation.mutate(invite.id)}
                              disabled={revokeMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="border rounded-lg p-8 text-center text-muted-foreground">
                      <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No pending invites</p>
                      <p className="text-sm">Invite team members to collaborate</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <InviteUserDialog
                open={showInviteDialog}
                onOpenChange={setShowInviteDialog}
              />
            </div>
          )}

          {activeTab === 'notifications' && (
            <Card>
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
                <CardDescription>Configure how you receive alerts and updates</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {notificationMutation.isSuccess && (
                  <div className="p-3 text-sm text-green-600 bg-green-50 rounded-md flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    Preferences saved successfully
                  </div>
                )}
                <div className="space-y-4">
                  <h4 className="text-sm font-medium">Alert Channels</h4>
                  <div className="space-y-3">
                    <label className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Email Alerts</p>
                        <p className="text-sm text-muted-foreground">
                          Receive alerts via email
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={notificationSettings.emailAlerts}
                        onChange={(e) =>
                          setNotificationSettings({
                            ...notificationSettings,
                            emailAlerts: e.target.checked,
                          })
                        }
                        className="h-4 w-4"
                      />
                    </label>
                    <label className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Webhook Alerts</p>
                        <p className="text-sm text-muted-foreground">
                          Send alerts to a webhook URL
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={notificationSettings.webhookAlerts}
                        onChange={(e) =>
                          setNotificationSettings({
                            ...notificationSettings,
                            webhookAlerts: e.target.checked,
                          })
                        }
                        className="h-4 w-4"
                      />
                    </label>
                    <label className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Slack Integration</p>
                        <p className="text-sm text-muted-foreground">
                          Send alerts to Slack
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={notificationSettings.slackAlerts}
                        onChange={(e) =>
                          setNotificationSettings({
                            ...notificationSettings,
                            slackAlerts: e.target.checked,
                          })
                        }
                        className="h-4 w-4"
                      />
                    </label>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Alert Digest</label>
                  <Select
                    value={notificationSettings.alertDigest}
                    onValueChange={(v) =>
                      setNotificationSettings({
                        ...notificationSettings,
                        alertDigest: v,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="realtime">Real-time</SelectItem>
                      <SelectItem value="hourly">Hourly digest</SelectItem>
                      <SelectItem value="daily">Daily digest</SelectItem>
                      <SelectItem value="weekly">Weekly digest</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button onClick={handleNotificationSave} disabled={notificationMutation.isPending}>
                  {notificationMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save Preferences
                </Button>
              </CardContent>
            </Card>
          )}

          {activeTab === 'security' && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Change Password</CardTitle>
                  <CardDescription>Update your password regularly for security</CardDescription>
                </CardHeader>
                <form onSubmit={handlePasswordSubmit}>
                  <CardContent className="space-y-4">
                    {passwordSuccess && (
                      <div className="p-3 text-sm text-green-600 bg-green-50 rounded-md flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4" />
                        Password changed successfully
                      </div>
                    )}
                    {passwordError && (
                      <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                        {passwordError}
                      </div>
                    )}
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Current Password</label>
                      <Input
                        type="password"
                        placeholder="Enter current password"
                        value={passwordForm.currentPassword}
                        onChange={(e) =>
                          setPasswordForm({ ...passwordForm, currentPassword: e.target.value })
                        }
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">New Password</label>
                      <Input
                        type="password"
                        placeholder="Enter new password"
                        value={passwordForm.newPassword}
                        onChange={(e) =>
                          setPasswordForm({ ...passwordForm, newPassword: e.target.value })
                        }
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Confirm New Password</label>
                      <Input
                        type="password"
                        placeholder="Confirm new password"
                        value={passwordForm.confirmPassword}
                        onChange={(e) =>
                          setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })
                        }
                        required
                      />
                    </div>
                    <Button type="submit" disabled={changePasswordMutation.isPending}>
                      {changePasswordMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : null}
                      Update Password
                    </Button>
                  </CardContent>
                </form>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Two-Factor Authentication</CardTitle>
                  <CardDescription>Add an extra layer of security to your account</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">2FA Status</p>
                      <p className="text-sm text-muted-foreground">
                        {user?.mfaEnabled
                          ? 'Two-factor authentication is enabled'
                          : 'Two-factor authentication is not enabled'}
                      </p>
                    </div>
                    {user?.mfaEnabled ? (
                      <Button
                        variant="destructive"
                        onClick={() => setShowDisable2faDialog(true)}
                        disabled={disable2faMutation.isPending}
                      >
                        {disable2faMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : null}
                        Disable 2FA
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        onClick={() => enable2faMutation.mutate()}
                        disabled={enable2faMutation.isPending}
                      >
                        {enable2faMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Shield className="h-4 w-4" />
                        )}
                        Enable 2FA
                      </Button>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-4">
                    Use an authenticator app like Google Authenticator, Authy, or 1Password to generate verification codes.
                  </p>
                </CardContent>
              </Card>

              {/* 2FA Setup Dialog */}
              <Dialog open={show2faDialog} onOpenChange={setShow2faDialog}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Set Up Two-Factor Authentication</DialogTitle>
                    <DialogDescription>
                      Scan the QR code with your authenticator app, then enter the verification code.
                    </DialogDescription>
                  </DialogHeader>
                  {mfaSetupData && (
                    <div className="space-y-4">
                      <div className="flex justify-center p-4 bg-white rounded-lg">
                        <img src={mfaSetupData.qrCode} alt="QR Code" className="w-48 h-48" />
                      </div>
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground mb-1">Or enter this secret manually:</p>
                        <code className="px-3 py-1 bg-muted rounded text-sm font-mono">
                          {mfaSetupData.secret}
                        </code>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Verification Code</label>
                        <Input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={6}
                          placeholder="Enter 6-digit code"
                          value={mfaVerifyCode}
                          onChange={(e) => {
                            setMfaVerifyCode(e.target.value.replace(/\D/g, ''));
                            setMfaError('');
                          }}
                          className="text-center text-lg tracking-widest"
                        />
                      </div>
                      {mfaError && (
                        <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                          {mfaError}
                        </div>
                      )}
                    </div>
                  )}
                  <DialogFooter>
                    <Button variant="outline" onClick={() => {
                      setShow2faDialog(false);
                      setMfaSetupData(null);
                      setMfaVerifyCode('');
                      setMfaError('');
                    }}>
                      Cancel
                    </Button>
                    <Button
                      onClick={() => verify2faMutation.mutate(mfaVerifyCode)}
                      disabled={mfaVerifyCode.length !== 6 || verify2faMutation.isPending}
                    >
                      {verify2faMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      Verify & Enable
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Disable 2FA Confirmation Dialog */}
              <AlertDialog open={showDisable2faDialog} onOpenChange={setShowDisable2faDialog}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Disable Two-Factor Authentication?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove the extra layer of security from your account. You can re-enable it at any time.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => disable2faMutation.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {disable2faMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : null}
                      Disable 2FA
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <Card>
                <CardHeader>
                  <CardTitle>Active Sessions</CardTitle>
                  <CardDescription>Manage your active login sessions</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium">Current Session</p>
                        <p className="text-sm text-muted-foreground">
                          Chrome on macOS - Last active now
                        </p>
                      </div>
                      <span className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded-full">
                        Active
                      </span>
                    </div>
                  </div>
                  <Button variant="outline" className="mt-4">
                    Sign out all other sessions
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'api-keys' && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>API Keys</CardTitle>
                    <CardDescription>Manage your API keys for programmatic access</CardDescription>
                  </div>
                  <Button onClick={() => setShowCreateApiKeyDialog(true)}>
                    <Plus className="h-4 w-4" />
                    Generate New API Key
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {apiKeysLoading && (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                )}

                {!apiKeysLoading && (!apiKeysData?.apiKeys || apiKeysData.apiKeys.length === 0) && (
                  <div className="border rounded-lg p-8 text-center text-muted-foreground">
                    <Key className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No API keys yet</p>
                    <p className="text-sm">Generate your first API key to get started</p>
                  </div>
                )}

                {apiKeysData?.apiKeys && apiKeysData.apiKeys.length > 0 && (
                  <div className="space-y-3">
                    {apiKeysData.apiKeys.map((key: any) => (
                      <div key={key.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center gap-4">
                          <Key className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{key.name}</p>
                            <p className="text-sm text-muted-foreground font-mono">
                              nats_{key.prefix}...
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right text-sm text-muted-foreground">
                            <p>Created {formatDate(key.createdAt)}</p>
                            {key.expiresAt && (
                              <p className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Expires {formatDate(key.expiresAt)}
                              </p>
                            )}
                            {key.lastUsedAt && (
                              <p>Last used {formatDate(key.lastUsedAt)}</p>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteApiKeyId(key.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === 'appearance' && (
            <Card>
              <CardHeader>
                <CardTitle>Appearance</CardTitle>
                <CardDescription>Customize the look and feel</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {appearanceMutation.isSuccess && (
                  <div className="p-3 text-sm text-green-600 bg-green-50 rounded-md flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    Preferences saved successfully
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Theme</label>
                  <div className="flex gap-3">
                    {[
                      { id: 'light', label: 'Light', color: 'bg-white' },
                      { id: 'dark', label: 'Dark', color: 'bg-gray-900' },
                      { id: 'system', label: 'System', color: 'bg-gradient-to-r from-white to-gray-900' },
                    ].map((theme) => (
                      <button
                        key={theme.id}
                        onClick={() => setAppearanceSettings({ ...appearanceSettings, theme: theme.id })}
                        className={`flex-1 p-4 border rounded-lg hover:border-primary transition-colors ${
                          appearanceSettings.theme === theme.id ? 'border-primary' : ''
                        }`}
                      >
                        <div className={`w-full h-12 ${theme.color} border rounded mb-2`}></div>
                        <p className="text-sm font-medium">{theme.label}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Date Format</label>
                  <Select
                    value={appearanceSettings.dateFormat}
                    onValueChange={(v) =>
                      setAppearanceSettings({ ...appearanceSettings, dateFormat: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="relative">Relative (2 hours ago)</SelectItem>
                      <SelectItem value="absolute">Absolute (Dec 4, 2025 10:30 AM)</SelectItem>
                      <SelectItem value="iso">ISO 8601 (2025-12-04T10:30:00Z)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button onClick={handleAppearanceSave} disabled={appearanceMutation.isPending}>
                  {appearanceMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save Preferences
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Create API Key Dialog */}
      <Dialog open={showCreateApiKeyDialog} onOpenChange={(open) => {
        if (!open) {
          setShowCreateApiKeyDialog(false);
          setCreatedApiKey(null);
          setNewApiKeyName('');
          setNewApiKeyExpiry('never');
        }
      }}>
        <DialogContent size="lg" onClose={() => {
          setShowCreateApiKeyDialog(false);
          setCreatedApiKey(null);
        }}>
          <DialogHeader>
            <DialogTitle>
              {createdApiKey ? 'API Key Created' : 'Generate New API Key'}
            </DialogTitle>
            <DialogDescription>
              {createdApiKey
                ? 'Copy your API key now. You won\'t be able to see it again!'
                : 'Create a new API key for programmatic access'}
            </DialogDescription>
          </DialogHeader>

          {createdApiKey ? (
            <div className="space-y-4 py-4">
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800 font-medium mb-2">
                  Make sure to copy your API key now. You won't be able to see it again!
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type={showApiKey ? 'text' : 'password'}
                  value={createdApiKey}
                  readOnly
                  className="font-mono"
                />
                <Button variant="outline" size="icon" onClick={() => setShowApiKey(!showApiKey)}>
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button variant="outline" size="icon" onClick={copyApiKey}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Key Name</label>
                <Input
                  placeholder="e.g., Production API Key"
                  value={newApiKeyName}
                  onChange={(e) => setNewApiKeyName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Expiration</label>
                <Select value={newApiKeyExpiry} onValueChange={setNewApiKeyExpiry}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="never">Never expires</SelectItem>
                    <SelectItem value="30d">30 days</SelectItem>
                    <SelectItem value="90d">90 days</SelectItem>
                    <SelectItem value="1y">1 year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter>
            {createdApiKey ? (
              <Button onClick={() => {
                setShowCreateApiKeyDialog(false);
                setCreatedApiKey(null);
              }}>
                Done
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setShowCreateApiKeyDialog(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateApiKey}
                  disabled={!newApiKeyName.trim() || createApiKeyMutation.isPending}
                >
                  {createApiKeyMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Key className="h-4 w-4" />
                  )}
                  Generate Key
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete API Key Dialog */}
      <AlertDialog open={!!deleteApiKeyId} onOpenChange={(open) => !open && setDeleteApiKeyId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete API Key</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this API key? Any applications using this key will no longer be able to authenticate.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteApiKeyId && deleteApiKeyMutation.mutate(deleteApiKeyId)}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteApiKeyMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>}>
      <SettingsPageContent />
    </Suspense>
  );
}
