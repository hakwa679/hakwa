import { sendNotification } from "@hakwa/notifications";

/**
 * Gamification processor — dispatches notifications for in-app achievement
 * events. T034: badge_earned, level_up, streak_milestone, referral_conversion.
 *
 * Gamification business logic (XP calculation, badge unlocking) lives in
 * feature 007. This file is the notification integration layer.
 */

/** T034a — notify a user when they unlock a badge. */
export async function onBadgeEarned(
  userId: string,
  badgeName: string,
  badgeId: string,
): Promise<void> {
  await sendNotification(
    userId,
    "badge_earned",
    {
      channel: "push",
      title: "Badge unlocked!",
      body: `You've earned the "${badgeName}" badge. Keep it up!`,
      data: { screen: "Achievements", badgeId },
    },
    `badge_earned:${userId}:${badgeId}`,
  );
  await sendNotification(
    userId,
    "badge_earned",
    {
      channel: "in_app",
      title: "New badge: " + badgeName,
      body: `Congratulations! You've unlocked the "${badgeName}" badge.`,
      data: { screen: "Achievements", badgeId },
    },
    `badge_earned:${userId}:${badgeId}:in_app`,
  );
}

/** T034b — notify a user when they advance to a new XP level. */
export async function onLevelUp(
  userId: string,
  newLevel: number,
  levelName: string,
): Promise<void> {
  await sendNotification(
    userId,
    "level_up",
    {
      channel: "push",
      title: `Level up! You're now ${levelName}`,
      body: `You've reached level ${newLevel}. New rewards are waiting!`,
      data: { screen: "Profile", level: newLevel },
    },
    `level_up:${userId}:${newLevel}`,
  );
  await sendNotification(
    userId,
    "level_up",
    {
      channel: "in_app",
      title: `Level ${newLevel}: ${levelName}`,
      body: "You've levelled up! Check your new perks.",
      data: { screen: "Profile", level: newLevel },
    },
    `level_up:${userId}:${newLevel}:in_app`,
  );
}

/** T034c — notify a user when they hit a login/activity streak milestone. */
export async function onStreakMilestone(
  userId: string,
  streakDays: number,
): Promise<void> {
  await sendNotification(
    userId,
    "streak_milestone",
    {
      channel: "push",
      title: `${streakDays}-day streak!`,
      body: `Amazing! You've been active for ${streakDays} days in a row.`,
      data: { screen: "Achievements", streakDays },
    },
    `streak_milestone:${userId}:${streakDays}`,
  );
  await sendNotification(
    userId,
    "streak_milestone",
    {
      channel: "in_app",
      title: `${streakDays}-day streak`,
      body: `You're on a roll! Keep the streak going.`,
      data: { screen: "Achievements", streakDays },
    },
    `streak_milestone:${userId}:${streakDays}:in_app`,
  );
}

/** T034d — notify the referrer when one of their referred users converts. */
export async function onReferralConversion(
  referrerId: string,
  referredUserId: string,
  rewardDisplay: string,
): Promise<void> {
  await sendNotification(
    referrerId,
    "referral_conversion",
    {
      channel: "push",
      title: "Referral bonus earned!",
      body: `Your referral joined and you've earned ${rewardDisplay}.`,
      data: { screen: "Referrals", referredUserId },
    },
    `referral_conversion:${referrerId}:${referredUserId}`,
  );
  await sendNotification(
    referrerId,
    "referral_conversion",
    {
      channel: "in_app",
      title: "Referral converted",
      body: `Your friend joined Hakwa! You've earned ${rewardDisplay}.`,
      data: { screen: "Referrals", referredUserId },
    },
    `referral_conversion:${referrerId}:${referredUserId}:in_app`,
  );
}
