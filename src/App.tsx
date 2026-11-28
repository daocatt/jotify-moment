import * as React from "react";
import { Routes, Route, useParams, useLocation } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

// Page Client Components
import { HomeClient } from "@/app/home-client";
import { UserHomeClient } from "@/app/u/[slug]/user-home-client";
import { UserPinnedClient } from "@/app/u/[slug]/pinned/user-pinned-client";
import { MoClient } from "@/app/mo/[id]/mo-client";
import { FriendsClient } from "@/app/friends/friends-client";
import { PinnedClient } from "@/app/pinned/pinned-client";
import { TagClient } from "@/app/tag/[tag]/tag-client";
import { SettingsClient } from "@/app/settings/settings-client";
import { AdminConsoleClient } from "@/app/admin/admin-console-client";
import InitPage from "@/app/init/page";
import { ResetPasswordClient } from "@/app/reset-password/reset-password-client";
import { GuestProfileClient } from "@/app/guest-profile/guest-profile-client";
import { AuthPageClient } from "@/app/auth/auth-page-client";

interface AppProps {
  initialData?: Record<string, unknown>;
  initialPath?: string;
}

interface CustomDomainInfo {
  isCustomDomain: boolean;
  slug: string;
  mainHost?: string;
}

export function App({ initialData }: AppProps) {
  const location = useLocation();

  const customDomainInfo = React.useMemo<CustomDomainInfo | null>(() => {
    const source =
      typeof window !== "undefined"
        ? (window as unknown as { __INITIAL_DATA__?: Record<string, unknown> }).__INITIAL_DATA__
        : initialData;
    if (source?.isCustomDomain) {
      return {
        isCustomDomain: true,
        slug: ((source.customDomainSlug || source.slug) as string) || "",
        mainHost: (source.mainHost as string) || undefined,
      };
    }
    return null;
  }, [initialData]);

  // Helper to extract initialData only if we are on the initial route matching path
  const getInitialProps = (matchPath: string): Record<string, unknown> => {
    if (typeof window !== "undefined") {
      const winData = (window as unknown as { __INITIAL_DATA__?: Record<string, unknown> }).__INITIAL_DATA__;
      const initialRoute = (window as unknown as { __INITIAL_ROUTE__?: string }).__INITIAL_ROUTE__;
      if (initialRoute === matchPath && winData) {
        return winData;
      }
      return {};
    }
    return initialData || {};
  };

  return (
    <ThemeProvider defaultTheme="system" storageKey="theme">
      <Routes>
        <Route
          path="/"
          element={
            <HomeWrapper
              initialData={getInitialProps(location.pathname)}
              customDomainInfo={customDomainInfo}
            />
          }
        />
        <Route
          path="/u/:slug"
          element={
            <UserHomeWrapper
              initialData={getInitialProps(location.pathname)}
              customDomainInfo={customDomainInfo}
            />
          }
        />
        <Route
          path="/u/:slug/pinned"
          element={
            <UserPinnedWrapper
              initialData={getInitialProps(location.pathname)}
              customDomainInfo={customDomainInfo}
            />
          }
        />
        <Route
          path="/mo/:id"
          element={
            <MoWrapper
              initialData={getInitialProps(location.pathname)}
              customDomainInfo={customDomainInfo}
            />
          }
        />
        <Route
          path="/friends"
          element={<FriendsWrapper initialData={getInitialProps(location.pathname)} />}
        />
        <Route
          path="/pinned"
          element={
            <PinnedWrapper
              initialData={getInitialProps(location.pathname)}
              customDomainInfo={customDomainInfo}
            />
          }
        />
        <Route
          path="/tag/:tag"
          element={<TagWrapper initialData={getInitialProps(location.pathname)} />}
        />
        <Route
          path="/settings"
          element={<SettingsWrapper initialData={getInitialProps(location.pathname)} />}
        />
        <Route
          path="/admin"
          element={<AdminWrapper initialData={getInitialProps(location.pathname)} />}
        />
        <Route path="/init" element={<InitPage />} />
        <Route path="/reset-password" element={<ResetPasswordClient />} />
        <Route path="/guest-profile" element={<GuestProfileClient />} />
        <Route path="/login" element={<AuthPageClient initialMode="login" />} />
        <Route path="/register" element={<AuthPageClient initialMode="register" />} />
      </Routes>
      <Toaster position="top-center" richColors closeButton />
    </ThemeProvider>
  );
}

// Route wrappers that inject params and SSR props
function HomeWrapper({
  initialData,
  customDomainInfo,
}: {
  initialData: Record<string, unknown>;
  customDomainInfo: CustomDomainInfo | null;
}) {
  if (customDomainInfo?.isCustomDomain && customDomainInfo.slug) {
    return (
      <UserHomeClient
        slug={customDomainInfo.slug}
        isCustomDomain={true}
        mainHost={customDomainInfo.mainHost}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {...(initialData as any)}
      />
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <HomeClient {...(initialData as any)} />;
}

function UserHomeWrapper({
  initialData,
  customDomainInfo,
}: {
  initialData: Record<string, unknown>;
  customDomainInfo: CustomDomainInfo | null;
}) {
  const { slug = "" } = useParams();
  return (
    <UserHomeClient
      isCustomDomain={customDomainInfo?.isCustomDomain ?? false}
      mainHost={customDomainInfo?.mainHost}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {...(initialData as any)}
      slug={slug}
    />
  );
}

function UserPinnedWrapper({
  initialData,
  customDomainInfo,
}: {
  initialData: Record<string, unknown>;
  customDomainInfo: CustomDomainInfo | null;
}) {
  const { slug = "" } = useParams();
  return (
    <UserPinnedClient
      isCustomDomain={customDomainInfo?.isCustomDomain ?? false}
      mainHost={customDomainInfo?.mainHost}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {...(initialData as any)}
      slug={slug}
    />
  );
}

function MoWrapper({
  initialData,
  customDomainInfo,
}: {
  initialData: Record<string, unknown>;
  customDomainInfo: CustomDomainInfo | null;
}) {
  const { id = "" } = useParams();
  return (
    <MoClient
      isCustomDomain={customDomainInfo?.isCustomDomain ?? false}
      mainHost={customDomainInfo?.mainHost}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {...(initialData as any)}
      id={id}
    />
  );
}

function FriendsWrapper({ initialData }: { initialData: Record<string, unknown> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <FriendsClient {...(initialData as any)} />;
}

function PinnedWrapper({
  initialData,
  customDomainInfo,
}: {
  initialData: Record<string, unknown>;
  customDomainInfo: CustomDomainInfo | null;
}) {
  if (customDomainInfo?.isCustomDomain && customDomainInfo.slug) {
    return (
      <UserPinnedClient
        slug={customDomainInfo.slug}
        isCustomDomain={true}
        mainHost={customDomainInfo.mainHost}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {...(initialData as any)}
      />
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <PinnedClient {...(initialData as any)} />;
}

function TagWrapper({ initialData }: { initialData: Record<string, unknown> }) {
  const { tag = "" } = useParams();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <TagClient tag={tag} {...(initialData as any)} />;
}

function SettingsWrapper({ initialData }: { initialData: Record<string, unknown> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <SettingsClient user={initialData.currentUser as any} />;
}

function AdminWrapper({ initialData }: { initialData: Record<string, unknown> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <AdminConsoleClient currentUser={initialData.currentUser as any} />;
}
