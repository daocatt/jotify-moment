import type { Metadata } from "next";
import { headers } from "next/headers";
import localFont from "next/font/local";
import "./globals.css";
import "@/lib/theme-css.gen";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { GoogleAnalytics } from "@/components/google-analytics";

// Self-hosted fonts — no build-time network download (offline, deterministic builds).
const geistSans = localFont({
  src: "./fonts/Geist.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
  display: "swap",
});

const geistMono = localFont({
  src: "./fonts/GeistMono.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
});

function getMetadataBase(): URL {
  const betterAuthUrl = process.env.BETTER_AUTH_URL;
  if (betterAuthUrl && !betterAuthUrl.includes("localhost")) {
    return new URL(betterAuthUrl);
  }
  const mainHost = process.env.MAIN_HOST?.split(",")[0]?.trim();
  if (mainHost && !mainHost.includes("localhost") && !mainHost.includes("127.0.0.1")) {
    return new URL(`https://${mainHost}`);
  }
  return new URL(betterAuthUrl || "http://localhost:3000");
}

export const metadata: Metadata = {
  metadataBase: getMetadataBase(),
  title: {
    default: "Jotify Moment",
    template: "%s · Jotify Moment",
  },
  description: "记录生活，分享此刻。",
  icons: {
    icon: "/api/favicon",
    shortcut: "/api/favicon",
    apple: "/api/favicon",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // CSP nonce set by src/proxy.ts — passed to the inline theme script and GA.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="zh"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* SECURITY: hardcoded theme-switching script only — no user input ever interpolated. Do NOT add dynamic values here. */}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem("active-theme");if(t)document.documentElement.setAttribute("data-theme",t)}catch(e){}` }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground relative">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster position="top-center" richColors />
          <GoogleAnalytics nonce={nonce} />
        </ThemeProvider>
      </body>
    </html>
  );
}
