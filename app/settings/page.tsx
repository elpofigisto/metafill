import type { Metadata } from "next";

import SettingsManager from "../../components/settings/SettingsManager";

export const metadata: Metadata = {
  title: "metafill · Settings",
};

export default function SettingsPage() {
  return <SettingsManager />;
}
