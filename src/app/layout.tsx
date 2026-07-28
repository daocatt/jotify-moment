import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans_SC } from "next/font/google";
import "./globals.css";
import "@/lib/theme-css.gen";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { GoogleAnalytics } from "@/components/google-analytics";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const notoSansSC = Noto_Sans_SC({
  variable: "--font-noto-sans-sc",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${notoSansSC.variable} h-full antialiased`}
    >
      <head>
        {/* SECURITY: hardcoded theme-switching script only — no user input ever interpolated. Do NOT add dynamic values here. */}
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem("active-theme");if(t)document.documentElement.setAttribute("data-theme",t)}catch(e){}` }} />
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
          <GoogleAnalytics />
        </ThemeProvider>
      </body>
    </html>
  );
}
