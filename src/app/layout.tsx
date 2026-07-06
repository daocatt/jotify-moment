import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet" />
        {/* SAFE: hardcoded theme-switching script, no user input */}
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem("active-theme");if(t)document.documentElement.setAttribute("data-theme",t)}catch(e){}` }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground relative">
        {/* Frosted/Matte Noise Overlay */}
        <div 
          className="pointer-events-none fixed inset-0 z-50 opacity-[0.045] dark:opacity-[0.025]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`
          }}
        />
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
