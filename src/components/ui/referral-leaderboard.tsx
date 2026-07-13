"use client";

import { useState, useEffect } from "react";
import { Trophy, Users, Share2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NyuchiLeaderboardRow } from "@/components/ui/nyuchi-leaderboard-row";
import { type ReferralLeaderboardEntry } from "@/lib/api";
import { getEventReferralLeaderboardAction } from "@/app/actions/engagement";

interface Referrer {
  id: string;
  name: string;
  initials: string;
  referrals: number;
  rank: number;
}

interface ReferralLeaderboardProps {
  eventId: string;
  userReferralCode?: string;
  userReferrals?: number;
  className?: string;
}

export function ReferralLeaderboard({
  eventId,
  userReferralCode,
  userReferrals = 0,
  className = "",
}: ReferralLeaderboardProps) {
  const [loading, setLoading] = useState(true);
  const [leaderboard, setLeaderboard] = useState<ReferralLeaderboardEntry[]>([]);

  useEffect(() => {
    async function fetchLeaderboard() {
      try {
        const data = await getEventReferralLeaderboardAction(eventId);
        setLeaderboard(data);
      } catch (error) {
        console.error("Failed to fetch referral leaderboard:", error);
      } finally {
        setLoading(false);
      }
    }
    if (eventId) {
      fetchLeaderboard();
    } else {
      setLoading(false);
    }
  }, [eventId]);

  // Transform API data to component format
  const referrers: Referrer[] = leaderboard.map((entry) => ({
    id: entry.userId,
    name: entry.userName,
    initials: entry.userInitials,
    referrals: entry.conversionCount,
    rank: entry.rank,
  }));

  const totalReferrals = referrers.reduce((sum, r) => sum + r.referrals, 0);
  const handleCopyReferralLink = () => {
    const link = `${window.location.origin}/events/${eventId}?ref=${userReferralCode}`;
    navigator.clipboard.writeText(link);
  };

  if (loading) {
    return (
      <div className={`bg-surface rounded-2xl p-6 ${className}`}>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  // Don't render the component if there's no data and no user referral code
  if (referrers.length === 0 && !userReferralCode) {
    return null;
  }

  return (
    <div className={`bg-surface rounded-2xl p-6 ${className}`}>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-accent" />
          <h3 className="font-bold text-lg">Community Builders</h3>
        </div>
        {totalReferrals > 0 && (
          <div className="flex items-center gap-1 text-sm text-text-secondary">
            <Users className="w-4 h-4" />
            <span>{totalReferrals} referrals</span>
          </div>
        )}
      </div>

      {/* Leaderboard — branded ranked rows (podium colouring for the top 3). */}
      {referrers.length > 0 ? (
        <div className="mb-6 rounded-xl bg-elevated/40 py-1" role="list">
          {referrers.slice(0, 5).map((referrer) => (
            <NyuchiLeaderboardRow
              key={referrer.id}
              position={referrer.rank}
              name={referrer.name}
              score={referrer.referrals}
              scoreLabel="invites"
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-6 mb-6">
          <p className="text-sm text-text-secondary">
            Be the first to invite friends!
          </p>
        </div>
      )}

      {/* User's Referral Section */}
      {userReferralCode && (
        <div className="border-t border-elevated pt-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-text-secondary">Your referrals</span>
            <span className="font-bold">{userReferrals}</span>
          </div>
          <Button onClick={handleCopyReferralLink} className="w-full">
            <Share2 className="w-4 h-4" />
            Share Your Link
          </Button>
          <p className="text-xs text-text-tertiary text-center mt-2">
            Help build the community! Share with friends and climb the leaderboard.
          </p>
        </div>
      )}

      {/* Philosophy Note */}
      <div className="mt-4 p-3 bg-elevated rounded-xl">
        <p className="text-xs text-text-secondary text-center">
          <span className="text-primary font-medium">Open data</span> - We believe in transparency.
          See who&apos;s helping grow the community.
        </p>
      </div>
    </div>
  );
}

// Compact version for event cards
export function ReferralBadge({
  referrals,
  className = "",
}: {
  referrals: number;
  className?: string;
}) {
  if (referrals === 0) return null;

  return (
    <div
      className={`flex items-center gap-1 px-2 py-1 bg-primary/15 text-primary rounded-full ${className}`}
    >
      <Share2 className="w-3 h-3" />
      <span className="text-xs font-medium">{referrals} referrals</span>
    </div>
  );
}
