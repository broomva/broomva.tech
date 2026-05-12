import { McpDetailsPage } from "@/components/settings/mcp-details-page";
import {
  SettingsPage,
  SettingsPageHeader,
} from "@/components/settings/settings-page";
import { getQueryClient, HydrateClient, trpc } from "@/trpc/server";

export default async function ConnectorDetailsPage({
  params,
}: {
  params: { connectorId: string };
}) {
  const { connectorId } = await params;
  const queryClient = getQueryClient();
  await queryClient.prefetchQuery(trpc.mcp.list.queryOptions());
  return (
    <HydrateClient>
      <SettingsPage>
        <SettingsPageHeader>
          <h2 className="font-semibold text-lg">Connector details</h2>
          <p className="text-muted-foreground text-sm">
            Tools, resources, and authorization status.
          </p>
        </SettingsPageHeader>
        <McpDetailsPage connectorId={connectorId} />
      </SettingsPage>
    </HydrateClient>
  );
}
