import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { ConsoleHeader } from "@/components/console/console-header";
import { ConsoleNav } from "@/components/console/console-nav";
import { getSafeSession } from "@/lib/auth";

export default async function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="flex h-dvh bg-bg-deep text-text-primary">
      <ConsoleNav />
      <div className="flex flex-1 flex-col overflow-hidden">
        <ConsoleHeader />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
