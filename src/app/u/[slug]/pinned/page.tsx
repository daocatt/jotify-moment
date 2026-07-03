import { headers } from "next/headers";
import { UserPinnedClient } from "./user-pinned-client";

export default async function UserPinnedPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const headersList = await headers();
  const isCustomDomain = headersList.get("x-custom-domain") === "true";
  const mainHost = process.env.MAIN_HOST?.split(",")[0] || "localhost:3000";

  return <UserPinnedClient slug={slug} isCustomDomain={isCustomDomain} mainHost={mainHost} />;
}
