import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppProviders } from "./providers";

export const metadata: Metadata = {
  title: "SAP Core",
  description: "Secure sign-in for the SAP Core workspace.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
