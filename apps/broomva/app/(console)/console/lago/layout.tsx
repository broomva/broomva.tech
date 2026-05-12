import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Lago Console",
  description: "Lago storage engine dashboard",
};

export default function LagoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
