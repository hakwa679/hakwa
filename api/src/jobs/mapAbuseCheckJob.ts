import db from "@hakwa/db";
import { mapAbuseFlag } from "@hakwa/db/schema";
import { MAP_VOTING_RING_MUTUAL_THRESHOLD } from "@hakwa/core";

interface VotingRingCandidate {
  userId: string;
  pairedUserId: string;
  mutualConfirmRate: number;
  sampleSize: number;
}

export async function runMapAbuseCheckJob(): Promise<number> {
  const candidates = (await db.execute(`
    WITH confirms AS (
      SELECT
        v.user_id AS voter_id,
        f.contributor_id AS contributor_id,
        COUNT(*)::int AS confirms
      FROM map_verification v
      JOIN map_feature f ON f.id = v.feature_id
      WHERE v.vote = 'confirm'
      GROUP BY v.user_id, f.contributor_id
    ),
    paired AS (
      SELECT
        a.voter_id AS user_id,
        a.contributor_id AS paired_user_id,
        LEAST(a.confirms, COALESCE(b.confirms, 0))::int AS mutual_confirms,
        GREATEST(a.confirms, COALESCE(b.confirms, 0))::int AS max_confirms
      FROM confirms a
      LEFT JOIN confirms b
        ON b.voter_id = a.contributor_id
       AND b.contributor_id = a.voter_id
      WHERE a.voter_id <> a.contributor_id
    )
    SELECT
      user_id,
      paired_user_id,
      CASE
        WHEN max_confirms = 0 THEN 0
        ELSE mutual_confirms::float / max_confirms::float
      END AS mutual_confirm_rate,
      max_confirms AS sample_size
    FROM paired
  `)) as {
    rows: Array<{
      user_id: string;
      paired_user_id: string;
      mutual_confirm_rate: number;
      sample_size: number;
    }>;
  };

  const flagged = candidates.rows.filter(
    (row) =>
      row.sample_size >= 5 &&
      row.mutual_confirm_rate >= MAP_VOTING_RING_MUTUAL_THRESHOLD,
  );

  for (const row of flagged) {
    const candidate: VotingRingCandidate = {
      userId: row.user_id,
      pairedUserId: row.paired_user_id,
      mutualConfirmRate: Number(row.mutual_confirm_rate),
      sampleSize: Number(row.sample_size),
    };

    await db
      .insert(mapAbuseFlag)
      .values({
        userId: candidate.userId,
        pairedUserId: candidate.pairedUserId,
        flagType: "voting_ring",
        occurrenceCount: 1,
        evidenceJson: JSON.stringify({
          mutualConfirmRate: candidate.mutualConfirmRate,
          sampleSize: candidate.sampleSize,
        }),
      })
      .onConflictDoUpdate({
        target: [mapAbuseFlag.userId, mapAbuseFlag.flagType],
        set: {
          pairedUserId: candidate.pairedUserId,
          occurrenceCount: mapAbuseFlag.occurrenceCount,
          evidenceJson: JSON.stringify({
            mutualConfirmRate: candidate.mutualConfirmRate,
            sampleSize: candidate.sampleSize,
          }),
          lastDetectedAt: new Date(),
        },
      });
  }

  return flagged.length;
}
