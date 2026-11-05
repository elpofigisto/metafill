import type { Metadata } from "next";

import CustomerReviewsView from "../../components/reviews/CustomerReviewsView";

export const metadata: Metadata = {
  title: "metafill · Ratings & reviews",
};

export default function CustomerReviewsPage() {
  return <CustomerReviewsView />;
}
