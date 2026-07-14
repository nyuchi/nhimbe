"use client";

/**
 * Settings form — edits the `system.platformSettings` singleton. The initial
 * values arrive SSR'd from the server page (no fetch-on-mount); saves go
 * through the super_admin-gated server action.
 */

import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Save,
  Loader2,
  Mail,
  Bell,
  Shield,
  Globe,
  Database,
  AlertTriangle,
  Check,
} from "lucide-react";
import {
  savePlatformSettingsAction,
  type PlatformSettings as Settings,
} from "@admin/app/actions/settings";

export interface SettingsClientProps {
  initialSettings: Settings;
  /** True when the SSR read failed and defaults are shown. */
  loadError?: boolean;
}

export default function SettingsClient({ initialSettings, loadError }: SettingsClientProps) {
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "idle" | "saved" | "error"; message: string }>(
    loadError
      ? { kind: "error", message: "Couldn't load saved settings — showing defaults." }
      : { kind: "idle", message: "" },
  );
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState("");
  const [settings, setSettings] = useState<Settings>(initialSettings);

  async function handleSave() {
    setSaving(true);
    setStatus({ kind: "idle", message: "" });
    try {
      const saved = await savePlatformSettingsAction(settings);
      setSettings(saved);
      setStatus({ kind: "saved", message: "Settings saved." });
    } catch (error) {
      console.error("[mukoko] admin/settings: save failed", error);
      setStatus({
        kind: "error",
        message: "Couldn't save settings. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Configure platform settings and preferences</p>
        </div>
        <div className="flex items-center gap-3">
          <p
            role="status"
            aria-live="polite"
            className={
              status.kind === "error"
                ? "text-sm text-error"
                : status.kind === "saved"
                  ? "text-sm text-success flex items-center gap-1"
                  : "sr-only"
            }
          >
            {status.kind === "saved" && <Check className="w-4 h-4" aria-hidden="true" />}
            {status.message}
          </p>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Changes
          </Button>
        </div>
      </div>

      {/* General Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Globe className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle>General</CardTitle>
              <CardDescription>Basic platform configuration</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium mb-2" htmlFor="settings-site-name">
                Site Name
              </label>
              <Input
                id="settings-site-name"
                value={settings.siteName}
                onChange={(e) => setSettings({ ...settings, siteName: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2" htmlFor="settings-support-email">
                Support Email
              </label>
              <Input
                id="settings-support-email"
                type="email"
                value={settings.supportEmail}
                onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Event Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center">
              <Database className="w-5 h-5 text-secondary" />
            </div>
            <div>
              <CardTitle>Events</CardTitle>
              <CardDescription>Event creation and limits</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium mb-2" htmlFor="settings-max-events">
                Max Events Per User
              </label>
              <Input
                id="settings-max-events"
                type="number"
                value={settings.maxEventsPerUser}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    maxEventsPerUser: parseInt(e.target.value) || 0,
                  })
                }
              />
              <p className="text-xs text-muted-foreground mt-1">
                Maximum number of events a user can create
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2" htmlFor="settings-max-attendees">
                Default Max Attendees
              </label>
              <Input
                id="settings-max-attendees"
                type="number"
                value={settings.maxAttendeesDefault}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    maxAttendeesDefault: parseInt(e.target.value) || 0,
                  })
                }
              />
              <p className="text-xs text-muted-foreground mt-1">Default capacity for new events</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Feature Toggles */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
              <Bell className="w-5 h-5 text-accent" />
            </div>
            <div>
              <CardTitle>Features</CardTitle>
              <CardDescription>Enable or disable platform features</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Event Registrations</div>
              <div className="text-sm text-muted-foreground">Allow users to RSVP for events</div>
              <div className="text-xs text-muted-foreground mt-1">
                When disabled, new registrations will be paused across all events
              </div>
            </div>
            <Switch
              checked={settings.enableRegistrations}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, enableRegistrations: checked })
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Event Reviews</div>
              <div className="text-sm text-muted-foreground">
                Allow users to leave reviews on past events
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                When disabled, users will not be able to submit or view reviews
              </div>
            </div>
            <Switch
              checked={settings.enableReviews}
              onCheckedChange={(checked) => setSettings({ ...settings, enableReviews: checked })}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Referral Program</div>
              <div className="text-sm text-muted-foreground">
                Enable referral tracking and leaderboards
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                When disabled, referral codes and leaderboards will be hidden
              </div>
            </div>
            <Switch
              checked={settings.enableReferrals}
              onCheckedChange={(checked) => setSettings({ ...settings, enableReferrals: checked })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Security Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
              <Shield className="w-5 h-5 text-success" />
            </div>
            <div>
              <CardTitle>Security</CardTitle>
              <CardDescription>Authentication and access control</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Require Email Verification</div>
              <div className="text-sm text-muted-foreground">
                Users must verify their email before accessing features
              </div>
            </div>
            <Switch
              checked={settings.requireEmailVerification}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, requireEmailVerification: checked })
              }
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2" htmlFor="settings-allowed-domains">
              Allowed Email Domains
            </label>
            <Input
              id="settings-allowed-domains"
              placeholder="e.g., company.com, organization.org"
              value={settings.allowedDomains}
              onChange={(e) => setSettings({ ...settings, allowedDomains: e.target.value })}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Leave empty to allow all domains. Comma-separated list.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-error/20">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-error/10 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-error" />
            </div>
            <div>
              <CardTitle className="text-error">Danger Zone</CardTitle>
              <CardDescription>Actions that affect the entire platform</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-error/5 rounded-xl border border-error/20">
            <div>
              <div className="font-medium">Maintenance Mode</div>
              <div className="text-sm text-muted-foreground">
                Only admins can access the site when enabled
              </div>
            </div>
            <Switch
              checked={settings.maintenanceMode}
              onCheckedChange={(checked) => setSettings({ ...settings, maintenanceMode: checked })}
            />
          </div>

          <div className="p-4 bg-error/5 rounded-xl border border-error/20">
            <div className="font-medium mb-2">Clear All Data</div>
            <p className="text-sm text-muted-foreground mb-4">
              Permanently delete all events, users, and data. This action cannot be undone.
            </p>
            <Button
              variant="ghost"
              className="text-error border border-error/20 hover:bg-error/10"
              onClick={() => {
                setShowClearConfirm(true);
                setClearConfirmText("");
              }}
            >
              <AlertTriangle className="w-4 h-4" />
              Clear All Data
            </Button>
          </div>

          {/* Clear All Data confirmation modal (intentionally not wired to a
              destructive action — the platform owns the data; this surface
              stays a guarded placeholder, exactly as before the extraction) */}
          {showClearConfirm && (
            <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
              <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full">
                <h3 className="text-xl font-bold mb-2 text-error">Confirm Data Deletion</h3>
                <p className="text-muted-foreground mb-4">
                  This will permanently delete <strong>all events, users, and data</strong>. This
                  action cannot be undone.
                </p>
                <p className="text-sm text-muted-foreground mb-3">
                  Type <strong>DELETE</strong> to confirm:
                </p>
                <Input
                  type="text"
                  value={clearConfirmText}
                  onChange={(e) => setClearConfirmText(e.target.value)}
                  placeholder="Type DELETE"
                  className="w-full mb-4"
                  autoFocus
                />
                <div className="flex gap-3">
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={() => setShowClearConfirm(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    disabled={clearConfirmText !== "DELETE"}
                    className="flex-1 bg-error text-white hover:bg-error/90 disabled:opacity-30"
                  >
                    Clear All Data
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Email Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-info/10 flex items-center justify-center">
              <Mail className="w-5 h-5 text-info" />
            </div>
            <div>
              <CardTitle>Email Notifications</CardTitle>
              <CardDescription>Configure email templates and notifications</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            Transactional email runs on the nhimbe app via Resend
            (events@notify.mukoko.com) — templates live in src/lib/email/.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
