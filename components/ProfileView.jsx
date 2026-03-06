'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  User, Mail, Shield, Calendar, Camera, Save, Loader2, KeyRound,
  Sun, Moon, Monitor, Check, Eye, EyeOff, LogOut, AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import GuideCard from '@/components/GuideCard';

export default function ProfileView() {
  const { data: session, update: updateSession } = useSession();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editName, setEditName] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Password change state
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);

  // Theme state
  const [themePreference, setThemePreference] = useState('system');

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/profile');
      const data = await res.json();
      if (data && !data.error) {
        setProfile(data);
        setEditName(data.name || '');
        setThemePreference(data.themePreference || 'system');
      }
    } catch (err) {
      console.error('Failed to load profile:', err);
      toast.error('Failed to load profile');
    }
    setLoading(false);
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName, themePreference }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
      } else {
        setProfile(data);
        toast.success('Profile updated successfully!');
        // Update the session so the name reflects in the header
        await updateSession({ name: editName });
        // Apply theme
        applyTheme(themePreference);
      }
    } catch (err) {
      toast.error('Failed to save profile');
    }
    setSaving(false);
  };

  const applyTheme = (pref) => {
    if (pref === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (pref === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
    }
  };

  const handleAvatarUpload = async (file) => {
    if (!file) return;
    if (file.size > 300 * 1024) {
      toast.error('Avatar must be under 300KB');
      return;
    }
    setAvatarUploading(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const res = await fetch('/api/profile/avatar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageData: ev.target.result }),
        });
        const data = await res.json();
        if (data.error) {
          toast.error(data.error);
        } else {
          setProfile(prev => ({ ...prev, avatar: data.avatar }));
          toast.success('Avatar updated!');
        }
      } catch (err) {
        toast.error('Failed to upload avatar');
      }
      setAvatarUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAvatar = async () => {
    try {
      const res = await fetch('/api/profile/avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageData: '' }),
      });
      const data = await res.json();
      if (!data.error) {
        setProfile(prev => ({ ...prev, avatar: '' }));
        toast.success('Avatar removed');
      }
    } catch (err) {
      toast.error('Failed to remove avatar');
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      toast.error('New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setChangingPassword(true);
    try {
      const res = await fetch('/api/profile/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
      } else {
        toast.success('Password changed successfully!');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setShowPasswordForm(false);
      }
    } catch (err) {
      toast.error('Failed to change password');
    }
    setChangingPassword(false);
  };

  const getRoleLabel = (role) => {
    switch (role) {
      case 'master_admin': return 'Master Admin';
      case 'admin': return 'Admin';
      case 'employee': return 'Employee';
      default: return role;
    }
  };

  const getRoleBadgeVariant = (role) => {
    switch (role) {
      case 'master_admin': return 'default';
      case 'admin': return 'secondary';
      default: return 'outline';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isGoogleUser = !!profile?.googleId;
  const memberSince = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric', day: 'numeric' })
    : 'Unknown';

  return (
    <div className="space-y-6 max-w-[700px] mx-auto">
      <GuideCard storageKey="guide_profile" icon={User} title="👤 Your Profile">
        <p>• 📸 <strong>Avatar</strong> — Hover over your photo to change it (max 300KB)</p>
        <p>• ✏️ <strong>Display Name</strong> — Update your name shown across the app</p>
        <p>• 🎨 <strong>Theme</strong> — Choose Light, Dark, or System to match your preference</p>
        <p>• 🔐 <strong>Password</strong> — Change your password if using email login (Google users managed via Google)</p>
        <p>• 💾 Click <strong>Save Changes</strong> to persist your name and theme updates</p>
      </GuideCard>

      <div>
        <h2 className="text-lg font-semibold">My Profile</h2>
        <p className="text-sm text-muted-foreground">Manage your account settings and preferences</p>
      </div>

      {/* Avatar & Basic Info Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            {/* Avatar Section */}
            <div className="relative group">
              <Avatar className="h-24 w-24 border-2 border-border">
                <AvatarImage src={profile?.avatar || session?.user?.image} alt={profile?.name} />
                <AvatarFallback className="text-2xl font-bold bg-primary/10 text-primary">
                  {(profile?.name || profile?.email || 'U')[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarUploading}
                className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                {avatarUploading ? (
                  <Loader2 className="w-5 h-5 text-white animate-spin" />
                ) : (
                  <Camera className="w-5 h-5 text-white" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  handleAvatarUpload(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </div>

            {/* Info */}
            <div className="flex-1 text-center sm:text-left space-y-2">
              <h3 className="text-xl font-semibold">{profile?.name || 'Unnamed'}</h3>
              <div className="flex flex-col sm:flex-row items-center gap-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5" />
                  {profile?.email}
                </div>
                <span className="hidden sm:inline">·</span>
                <Badge variant={getRoleBadgeVariant(profile?.role)} className="text-xs">
                  <Shield className="w-3 h-3 mr-1" />
                  {getRoleLabel(profile?.role)}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 text-xs text-muted-foreground pt-1">
                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Member since {memberSince}
                </div>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {isGoogleUser ? '🔗 Google Account' : '📧 Email Account'}
                </Badge>
              </div>
              {/* Avatar actions */}
              <div className="flex items-center justify-center sm:justify-start gap-2 pt-2">
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => fileInputRef.current?.click()} disabled={avatarUploading}>
                  <Camera className="w-3 h-3 mr-1.5" /> Change Photo
                </Button>
                {profile?.avatar && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={handleRemoveAvatar}>
                    Remove
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit Name */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <User className="w-4 h-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Personal Information</CardTitle>
              <CardDescription>Update your display name</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Display Name</Label>
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Your name"
              className="mt-1 max-w-sm"
            />
          </div>
          <div>
            <Label className="text-muted-foreground">Email</Label>
            <Input
              value={profile?.email || ''}
              disabled
              className="mt-1 max-w-sm bg-muted"
            />
            <p className="text-[11px] text-muted-foreground mt-1">Email cannot be changed</p>
          </div>
        </CardContent>
      </Card>

      {/* Theme Preference */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30">
              <Sun className="w-4 h-4 text-violet-700 dark:text-violet-300" />
            </div>
            <div>
              <CardTitle className="text-base">Appearance</CardTitle>
              <CardDescription>Choose your preferred theme</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 max-w-md">
            {[
              { value: 'light', label: 'Light', icon: Sun, desc: 'Always light' },
              { value: 'dark', label: 'Dark', icon: Moon, desc: 'Always dark' },
              { value: 'system', label: 'System', icon: Monitor, desc: 'Match OS' },
            ].map(t => {
              const Icon = t.icon;
              const isActive = themePreference === t.value;
              return (
                <button
                  key={t.value}
                  onClick={() => {
                    setThemePreference(t.value);
                    applyTheme(t.value);
                  }}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all ${
                    isActive
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-border hover:border-primary/50 hover:bg-muted/50'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span className={`text-sm font-medium ${isActive ? 'text-primary' : 'text-foreground'}`}>{t.label}</span>
                  <span className="text-[10px] text-muted-foreground">{t.desc}</span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Password Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
              <KeyRound className="w-4 h-4 text-amber-700 dark:text-amber-300" />
            </div>
            <div>
              <CardTitle className="text-base">Security</CardTitle>
              <CardDescription>Manage your password and account security</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isGoogleUser ? (
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
              <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900/30">
                <svg viewBox="0 0 24 24" className="w-4 h-4" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium">Signed in with Google</p>
                <p className="text-xs text-muted-foreground">Your password is managed by your Google account</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {!showPasswordForm ? (
                <Button variant="outline" onClick={() => setShowPasswordForm(true)}>
                  <KeyRound className="w-4 h-4 mr-2" /> Change Password
                </Button>
              ) : (
                <div className="space-y-3 max-w-sm">
                  {/* Current Password */}
                  <div>
                    <Label>Current Password</Label>
                    <div className="relative mt-1">
                      <Input
                        type={showCurrentPw ? 'text' : 'password'}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Enter current password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPw(!showCurrentPw)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* New Password */}
                  <div>
                    <Label>New Password</Label>
                    <div className="relative mt-1">
                      <Input
                        type={showNewPw ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Min 6 characters"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPw(!showNewPw)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {newPassword && newPassword.length < 6 && (
                      <p className="text-[11px] text-destructive mt-1">Password must be at least 6 characters</p>
                    )}
                  </div>

                  {/* Confirm Password */}
                  <div>
                    <Label>Confirm New Password</Label>
                    <Input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter new password"
                      className="mt-1"
                    />
                    {confirmPassword && newPassword !== confirmPassword && (
                      <p className="text-[11px] text-destructive mt-1">Passwords do not match</p>
                    )}
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Button
                      onClick={handleChangePassword}
                      disabled={changingPassword || !currentPassword || newPassword.length < 6 || newPassword !== confirmPassword}
                      size="sm"
                    >
                      {changingPassword && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                      Update Password
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => {
                      setShowPasswordForm(false);
                      setCurrentPassword('');
                      setNewPassword('');
                      setConfirmPassword('');
                    }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSaveProfile} disabled={saving} className="min-w-[140px]">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>

      {/* Account Actions */}
      <Card className="border-red-200 dark:border-red-900/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <div>
              <CardTitle className="text-base text-red-600 dark:text-red-400">Account Actions</CardTitle>
              <CardDescription>Sign out of your account</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            onClick={() => signOut({ callbackUrl: '/login' })}
          >
            <LogOut className="w-4 h-4 mr-2" /> Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
