import { ConditionalSiteChrome } from "@/components/site/conditional-site-chrome";

export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ConditionalSiteChrome>{children}</ConditionalSiteChrome>;
}
