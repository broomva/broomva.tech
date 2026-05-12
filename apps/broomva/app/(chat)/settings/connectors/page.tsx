import { ConnectorsSettings } from "@/components/settings/connectors-settings";
import {
  SettingsPage,
  SettingsPageHeader,
} from "@/components/settings/settings-page";
import { getQueryClient, HydrateClient, trpc } from "@/trpc/server";

export default async function ConnectorsSettingsPage() {
  const queryClient = getQueryClient();
  await queryClient.prefetchQuery(trpc.mcp.list.queryOptions());

  return (
    <HydrateClient>
      <SettingsPage>
        <SettingsPageHeader>
          <h2 className="font-semibold text-lg">Connectors & MCP</h2>
          <p className="text-muted-foreground text-sm">
            Connect to Model Context Protocol servers to extend AI capabilities
            with external tools.
          </p>
        </SettingsPageHeader>
        <ConnectorsSettings />
      </SettingsPage>
    </HydrateClient>
  );
}
