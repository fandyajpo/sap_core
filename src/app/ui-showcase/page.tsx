import { UiShowcaseHeader } from "@/components/ui-showcase/ui-showcase-header";
import { UiShowcaseView } from "@/components/ui-showcase/ui-showcase-view";
import { requireCurrentSession } from "@/lib/auth-session";

export default async function UiShowcasePage() {
  await requireCurrentSession();

  return (
    <main className="app-page">
      <UiShowcaseHeader />
      <UiShowcaseView organizationId="showcase" />
    </main>
  );
}
