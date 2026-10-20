import { WhatsappWizard } from "@/components/settings/whatsapp-wizard";
import { WhatsappProviders } from "@/components/settings/whatsapp-providers";
import { evolutionEnabled } from "@/server/evolution/flag";
export const dynamic = "force-dynamic";
export default function WhatsappSettingsPage() {
  return evolutionEnabled() ? <WhatsappProviders /> : <WhatsappWizard />;
}
