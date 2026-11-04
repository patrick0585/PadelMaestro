import { LegalPage } from "@/components/legal-page";
import Content, { title, updatedAt } from "@/content/legal/impressum";

export const metadata = { title: `${title} – Padelmaestro` };

export default function Page() {
  return (
    <LegalPage title={title} updatedAt={updatedAt}>
      <Content />
    </LegalPage>
  );
}
