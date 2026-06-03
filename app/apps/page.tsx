import type { Metadata } from "next";

import AppsManager from "../../components/apps/AppsManager";

export const metadata: Metadata = {
  title: "metafill · Apps",
};

export default function AppsManagerPage() {
  return <AppsManager />;
}
