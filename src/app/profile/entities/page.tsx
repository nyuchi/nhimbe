"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  Check,
  Home,
  Loader2,
  Pencil,
  Plus,
  Star,
  Users,
  X,
} from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { NyuchiVerifiedBadge } from "@/components/ui/verified-badge";
import { useToast } from "@/hooks/use-toast";
import {
  createMyCommunityEntity,
  getMyEntityManagement,
  renameMyHostEntity,
  setMyDefaultHostEntity,
  type EntityManagement,
  type ManagedHostEntity,
} from "@/app/actions/entities";

function roleLabel(role: ManagedHostEntity["role"]): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function entityTypeLabel(entityType: ManagedHostEntity["entityType"]): string {
  if (entityType === "family") return "Personal";
  if (entityType === "community") return "Community";
  return "Organisation";
}


function EntityRow({
  entity,
  onRename,
  onSetDefault,
  busy,
}: {
  entity: ManagedHostEntity;
  onRename: (id: string, name: string) => Promise<void>;
  onSetDefault: (id: string) => Promise<void>;
  busy: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entity.name);
  const [saving, setSaving] = useState(false);

  const Icon =
    entity.entityType === "family" ? Home : entity.entityType === "community" ? Users : Building2;
  const inputId = `entity-name-${entity.id}`;

  const startEdit = () => {
    setDraft(entity.name);
    setEditing(true);
  };

  const save = async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === entity.name) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onRename(entity.id, trimmed);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-surface rounded-xl p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-elevated text-text-secondary">
          <Icon className="size-5" aria-hidden="true" />
        </span>

        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="space-y-2">
              <Label htmlFor={inputId} className="text-xs text-text-secondary">
                Entity name
              </Label>
              <Input
                id={inputId}
                value={draft}
                autoFocus
                maxLength={120}
                disabled={saving}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") save();
                  if (e.key === "Escape") setEditing(false);
                }}
                aria-label="Entity name"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={save}
                  disabled={saving}
                  className="min-h-11 gap-1"
                >
                  {saving ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Check className="size-4" aria-hidden="true" />
                  )}
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditing(false)}
                  disabled={saving}
                  className="min-h-11 gap-1"
                >
                  <X className="size-4" aria-hidden="true" />
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <h3 className="truncate font-medium text-foreground">{entity.name}</h3>
                {entity.verified && (
                  <NyuchiVerifiedBadge tier="otp" size="sm" aria-label="Verified entity" />
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-text-secondary">
                <span>{entityTypeLabel(entity.entityType)}</span>
                <span aria-hidden="true">·</span>
                <span>{roleLabel(entity.role)}</span>
                {entity.entityType !== "family" && entity.memberCount != null && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>
                      {entity.memberCount} member{entity.memberCount === 1 ? "" : "s"}
                    </span>
                  </>
                )}
                {entity.isDefault && (
                  <Badge variant="default" className="gap-1">
                    <Star className="size-3" aria-hidden="true" />
                    Default
                  </Badge>
                )}
              </div>
            </>
          )}
        </div>

        {!editing && (
          <div className="flex shrink-0 flex-col items-end gap-2">
            {entity.editable && (
              <Button
                size="sm"
                variant="ghost"
                onClick={startEdit}
                disabled={busy}
                className="min-h-11 gap-1"
                aria-label={`Rename ${entity.name}`}
              >
                <Pencil className="size-4" aria-hidden="true" />
                Rename
              </Button>
            )}
            {!entity.isDefault && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onSetDefault(entity.id)}
                disabled={busy}
                className="min-h-11 gap-1"
                aria-label={`Make ${entity.name} your default host`}
              >
                <Star className="size-4" aria-hidden="true" />
                Set default
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CreateCommunityForm({
  onCreate,
  onDone,
}: {
  onCreate: (name: string, description: string) => Promise<void>;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const submit = async () => {
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      await onCreate(name.trim(), description.trim());
      onDone();
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="bg-surface rounded-xl p-4 space-y-3">
      <div>
        <Label htmlFor="new-community-name" className="text-xs text-text-secondary">
          Community name
        </Label>
        <Input
          id="new-community-name"
          value={name}
          autoFocus
          maxLength={120}
          disabled={creating}
          placeholder="e.g., Harare Runners Club"
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="new-community-description" className="text-xs text-text-secondary">
          Description (optional)
        </Label>
        <Textarea
          id="new-community-description"
          value={description}
          maxLength={500}
          disabled={creating}
          placeholder="What brings this group together?"
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={creating || !name.trim()} className="min-h-11 gap-1">
          {creating ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Check className="size-4" aria-hidden="true" />
          )}
          Create
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone} disabled={creating} className="min-h-11 gap-1">
          <X className="size-4" aria-hidden="true" />
          Cancel
        </Button>
      </div>
    </div>
  );
}

function EntitiesContent() {
  const { toast } = useToast();
  const [data, setData] = useState<EntityManagement | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showCreateCommunity, setShowCreateCommunity] = useState(false);

  useEffect(() => {
    getMyEntityManagement()
      .then(setData)
      .catch((err) => {
        console.error("[mukoko] load entities failed:", err);
        setData({ entities: [], defaultEntityId: null });
      })
      .finally(() => setLoading(false));
  }, []);

  const handleRename = useCallback(
    async (id: string, name: string) => {
      setBusy(true);
      try {
        const next = await renameMyHostEntity(id, name);
        setData(next);
        toast.success("Entity renamed");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not rename entity");
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );

  const handleSetDefault = useCallback(
    async (id: string) => {
      setBusy(true);
      try {
        const next = await setMyDefaultHostEntity(id);
        setData(next);
        toast.success("Default host entity updated");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not set default");
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );

  const handleCreateCommunity = useCallback(
    async (name: string, description: string) => {
      try {
        const next = await createMyCommunityEntity({ name, description: description || null });
        setData(next);
        toast.success("Community created");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not create that community");
        throw err;
      }
    },
    [toast],
  );

  return (
    <div className="mx-auto max-w-150 px-6 py-8">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/profile"
          className="flex size-11 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-elevated focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          aria-label="Back to profile"
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
        </Link>
        <h1 className="text-2xl font-bold text-foreground">Host entities</h1>
      </div>

      <p className="mb-6 text-sm text-text-secondary">
        These are the entities you host gatherings through. Rename your personal
        entity, choose which one is used by default, or create a community for a
        club or social enterprise you run. Organisations mirrored from your
        Mukoko ID are managed there and read-only here.
      </p>

      <div className="mb-6">
        {showCreateCommunity ? (
          <CreateCommunityForm
            onCreate={handleCreateCommunity}
            onDone={() => setShowCreateCommunity(false)}
          />
        ) : (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowCreateCommunity(true)}
            className="min-h-11 gap-1"
          >
            <Plus className="size-4" aria-hidden="true" />
            Create a community
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex min-h-40 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-primary" aria-hidden="true" />
          <span className="sr-only">Loading your entities</span>
        </div>
      ) : data && data.entities.length > 0 ? (
        <div className="space-y-3" aria-busy={busy}>
          {data.entities.map((entity) => (
            <EntityRow
              key={entity.id}
              entity={entity}
              onRename={handleRename}
              onSetDefault={handleSetDefault}
              busy={busy}
            />
          ))}
        </div>
      ) : (
        <div className="bg-surface rounded-xl p-8 text-center text-text-secondary">
          <p className="font-medium text-foreground">No host entities yet</p>
          <p className="mt-1 text-sm">
            Your personal host entity is created the first time you host a gathering.
          </p>
        </div>
      )}
    </div>
  );
}

export default function EntitiesPage() {
  return (
    <AuthGuard>
      <EntitiesContent />
    </AuthGuard>
  );
}
