import type { Metadata } from "next";

import InAppPurchasesEditor from "../../components/iap/InAppPurchasesEditor";

export const metadata: Metadata = {
  title: "metafill · In-app purchases",
};

export default function InAppPurchasesPage() {
  return <InAppPurchasesEditor />;
}
