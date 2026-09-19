import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { AppShell } from "@/components/layout/app-shell";
import { QueryProvider } from "@/components/providers/query-provider";
import { RolePreviewProvider } from "@/components/providers/role-preview-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "aiinsclaim",
  description: "AI-native insurance claims processing — learning project",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans">
        <QueryProvider>
          <ThemeProvider>
            <RolePreviewProvider>
              <AppShell>{children}</AppShell>
            </RolePreviewProvider>
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
