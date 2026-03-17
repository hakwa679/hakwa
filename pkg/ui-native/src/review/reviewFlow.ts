export type ReviewStep = "stars" | "tags" | "comment";

export interface ReviewFlowState {
  step: ReviewStep;
  rating: number;
  tagKeys: string[];
  comment: string;
}

export function initialReviewFlowState(): ReviewFlowState {
  return {
    step: "stars",
    rating: 0,
    tagKeys: [],
    comment: "",
  };
}

export function calculateReviewPreview(input: {
  tagCount: number;
  hasComment: boolean;
}): { base: number; tagBonus: number; commentBonus: number; total: number } {
  const base = 10;
  const tagBonus = input.tagCount >= 2 ? 5 : 0;
  const commentBonus = input.hasComment ? 10 : 0;
  return {
    base,
    tagBonus,
    commentBonus,
    total: base + tagBonus + commentBonus,
  };
}

export function nextStep(step: ReviewStep): ReviewStep {
  if (step === "stars") return "tags";
  if (step === "tags") return "comment";
  return "comment";
}

export function isCommentValid(comment: string): boolean {
  return comment.trim().length <= 280;
}
