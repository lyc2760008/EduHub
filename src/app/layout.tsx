// Root layout wiring global fonts + next-intl provider (cookie-based locale).
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";
import fallbackEnMessages from "../../messages/en.json";
import fallbackZhMessages from "../../messages/zh-CN.json";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EduHub",
  description: "Education SaaS for after-school tutoring",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Pull locale + messages from src/i18n/request.ts for request-scoped i18n.
  let locale = "en";
  let messages: Record<string, unknown> = fallbackEnMessages;

  try {
    locale = await getLocale();
    messages = (await getMessages()) as Record<string, unknown>;
  } catch (error) {
    // Fallback prevents missing-intl-provider crashes when request i18n fails.
    console.error("RootLayout i18n fallback", error);
    locale = "en";
    messages = fallbackEnMessages;
  }

  if (locale === "zh-CN") {
    messages = fallbackZhMessages;
  }

  return (
    <html lang={locale}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* Provide translations to all client components below. */}
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
