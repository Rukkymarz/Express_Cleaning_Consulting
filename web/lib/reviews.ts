export type ApprovedReview = {
  id: string;
  quote: string;
  customerDisplayName: string;
  sourceLabel: string;
  sourceUrl: string;
  published: boolean;
  permissionConfirmed: boolean;
};

// Add a review only after its source and the customer's permission to publish
// have been verified. Template copy, screenshots without provenance, and
// invented names or ratings do not belong here.
export const approvedReviews: ApprovedReview[] = [];

export function publishedReviews() {
  return approvedReviews.filter(review => review.published && review.permissionConfirmed);
}
