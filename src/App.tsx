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

interface AppProps {
  initialData?: Record<string, unknown>;
  initialPath?: string;
}

export function App({ initialData }: AppProps) {
  const location = useLocation();

  // Helper to extract initialData only if we are on the initial route matching path
  const getInitialProps = (matchPath: string): Record<string, unknown> => {
    if (typeof window !== "undefined") {
      const winData = (window as unknown as { __INITIAL_DATA__?: Record<string, unknown> }).__INITIAL_DATA__;
      const initialRoute = (window as unknown as { __INITIAL_ROUTE__?: string }).__INITIAL_ROUTE__;
      if (initialRoute === matchPath && winData) {
        return winData;
      }
    }
    return initialData || {};
  };

  return (
    <ThemeProvider defaultTheme="system" storageKey="theme">
      <Routes>
        <Route
          path="/"
          element={<HomeWrapper initialData={getInitialProps(location.pathname)} />}
        />
        <Route
          path="/u/:slug"
          element={<UserHomeWrapper initialData={getInitialProps(location.pathname)} />}
        />
        <Route
          path="/u/:slug/pinned"
          element={<UserPinnedWrapper initialData={getInitialProps(location.pathname)} />}
        />
        <Route
          path="/mo/:id"
          element={<MoWrapper initialData={getInitialProps(location.pathname)} />}
        />
        <Route
          path="/friends"
          element={<FriendsWrapper initialData={getInitialProps(location.pathname)} />}
        />
        <Route
          path="/pinned"
          element={<PinnedWrapper initialData={getInitialProps(location.pathname)} />}
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
      </Routes>
      <Toaster position="top-center" richColors closeButton />
    </ThemeProvider>
  );
}

// Route wrappers that inject params and SSR props
function HomeWrapper({ initialData }: { initialData: Record<string, unknown> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <HomeClient {...(initialData as any)} />;
}

function UserHomeWrapper({ initialData }: { initialData: Record<string, unknown> }) {
  const { slug = "" } = useParams();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <UserHomeClient slug={slug} {...(initialData as any)} />;
}

function UserPinnedWrapper({ initialData }: { initialData: Record<string, unknown> }) {
  const { slug = "" } = useParams();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <UserPinnedClient slug={slug} {...(initialData as any)} />;
}

function MoWrapper({ initialData }: { initialData: Record<string, unknown> }) {
  const { id = "" } = useParams();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <MoClient id={id} {...(initialData as any)} />;
}

function FriendsWrapper({ initialData }: { initialData: Record<string, unknown> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <FriendsClient {...(initialData as any)} />;
}

function PinnedWrapper({ initialData }: { initialData: Record<string, unknown> }) {
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
