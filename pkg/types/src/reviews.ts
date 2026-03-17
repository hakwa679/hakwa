export type ReviewDirection = "passenger_to_driver" | "driver_to_passenger";

export type ReviewTagDirection =
  | "both"
  | "passenger_to_driver"
  | "driver_to_passenger";

export interface ReviewTagItem {
  key: string;
  label: string;
  icon: string | null;
  direction: ReviewTagDirection;
  sortOrder: number;
}

export interface SubmitReviewRequest {
  tripId: string;
  rating: number;
  tagKeys?: string[];
  comment?: string;
}

export interface ReviewPointsBreakdown {
  base: number;
  tagBonus: number;
  commentBonus: number;
  total: number;
}

export interface SubmitReviewResponse {
  review: {
    id: string;
    tripId: string;
    direction: ReviewDirection;
    rating: number;
    tagKeys: string[];
    comment: string | null;
    pointsAwarded: number;
    submittedAt: string;
  };
  pointsBreakdown: ReviewPointsBreakdown;
  badgesAwarded: Array<{
    key: string;
    name: string;
    iconUrl: string | null;
  }>;
  newTotalPoints: number;
  missionProgress: {
    weeklyReviewMission: {
      target: number;
      completed: number;
      bonusPoints: number;
      missionComplete: boolean;
    };
  } | null;
}

export interface TripReviewReadItem {
  id: string;
  direction: ReviewDirection;
  rating: number;
  tagKeys: string[];
  comment: string | null;
  submittedAt: string;
  isOwnReview: boolean;
}

export interface TripReviewsResponse {
  tripId: string;
  reviews: TripReviewReadItem[];
  pendingDirections: ReviewDirection[];
  reviewWindowExpiresAt: {
    passenger_to_driver: string;
    driver_to_passenger: string;
  };
}

export interface ReputationSummaryResponse {
  userId: string;
  role: string;
  displayName?: string;
  reputation: {
    averageRating: number | null;
    totalReviewsReceived: number;
    ratingBreakdown: Record<"1" | "2" | "3" | "4" | "5", number>;
    topTags: Array<{
      key: string;
      label: string;
      icon: string | null;
      frequency: number;
    }>;
    recentComments: Array<{
      comment: string;
      rating: number;
      submittedAt: string;
    }>;
    badges: Array<{
      key: string;
      name: string | null;
      awardedAt: string;
    }>;
  };
  reviewerStats?: {
    totalReviewsSubmitted: number;
    taggedReviewsSubmitted: number;
    reviewsThisWeek: number;
  };
}

export interface ReputationSignalResponse {
  userId: string;
  averageRating: number | null;
  totalReviewsReceived: number;
  label: string;
}
