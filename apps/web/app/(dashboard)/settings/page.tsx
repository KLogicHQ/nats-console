'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, User, Bell, Shield, Key, Palette, Users, UserPlus, Trash2, Mail } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InviteUserDialog } from '@/components/forms/invite-user-dialog';

export default function SettingsPage() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('profile');
  const queryClient = useQueryClient();

  const [profileForm, setProfileForm] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.email || '',
  });

  const [notificationSettings, setNotificationSettings] = useState({
    emailAlerts: true,
    webhookAlerts: false,
    slackAlerts: false,
    alertDigest: 'daily',
  });

  const [showInviteDialog, setShowInviteDialog] = useState(false);

  // Fetch team members
  const { data: membersData } = useQuery({
    queryKey: ['organization-members'],
    queryFn: () => api.auth.me().then(() => []), // TODO: Add members endpoint
  });

  // Fetch pending invites
  const { data: invitesData, refetch: refetchInvites } = useQuery({
    queryKey: ['invites'],
    queryFn: () => api.invites.list(),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.invites.revoke(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invites'] });
    },
  });

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'team', label: 'Team', icon: Users },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'api-keys', label: 'API Keys', icon: Key },
    { id: 'appearance', label: 'Appearance', icon: Palette },
  ];

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
              <CardContent className="space-y-4">
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
                <Button>
                  <Save className="h-4 w-4" />
                  Save Changes
                </Button>
              </CardContent>
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
                  <select
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={notificationSettings.alertDigest}
                    onChange={(e) =>
                      setNotificationSettings({
                        ...notificationSettings,
                        alertDigest: e.target.value,
                      })
                    }
                  >
                    <option value="realtime">Real-time</option>
                    <option value="hourly">Hourly digest</option>
                    <option value="daily">Daily digest</option>
                    <option value="weekly">Weekly digest</option>
                  </select>
                </div>

                <Button>
                  <Save className="h-4 w-4" />
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
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Current Password</label>
                    <Input type="password" placeholder="Enter current password" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">New Password</label>
                    <Input type="password" placeholder="Enter new password" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Confirm New Password</label>
                    <Input type="password" placeholder="Confirm new password" />
                  </div>
                  <Button>Update Password</Button>
                </CardContent>
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
                        Two-factor authentication is not enabled
                      </p>
                    </div>
                    <Button variant="outline">Enable 2FA</Button>
                  </div>
                </CardContent>
              </Card>

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
                <CardTitle>API Keys</CardTitle>
                <CardDescription>Manage your API keys for programmatic access</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button>
                  <Key className="h-4 w-4" />
                  Generate New API Key
                </Button>
                <div className="border rounded-lg p-8 text-center text-muted-foreground">
                  <Key className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No API keys yet</p>
                  <p className="text-sm">Generate your first API key to get started</p>
                </div>
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
                <div className="space-y-2">
                  <label className="text-sm font-medium">Theme</label>
                  <div className="flex gap-3">
                    <button className="flex-1 p-4 border rounded-lg hover:border-primary transition-colors">
                      <div className="w-full h-12 bg-white border rounded mb-2"></div>
                      <p className="text-sm font-medium">Light</p>
                    </button>
                    <button className="flex-1 p-4 border rounded-lg hover:border-primary transition-colors">
                      <div className="w-full h-12 bg-gray-900 rounded mb-2"></div>
                      <p className="text-sm font-medium">Dark</p>
                    </button>
                    <button className="flex-1 p-4 border rounded-lg hover:border-primary transition-colors border-primary">
                      <div className="w-full h-12 bg-gradient-to-r from-white to-gray-900 rounded mb-2"></div>
                      <p className="text-sm font-medium">System</p>
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Sidebar Position</label>
                  <select className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="left">Left</option>
                    <option value="right">Right</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Date Format</label>
                  <select className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="relative">Relative (2 hours ago)</option>
                    <option value="absolute">Absolute (Dec 4, 2025 10:30 AM)</option>
                    <option value="iso">ISO 8601 (2025-12-04T10:30:00Z)</option>
                  </select>
                </div>

                <Button>
                  <Save className="h-4 w-4" />
                  Save Preferences
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
