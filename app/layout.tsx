import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "Aegis — Agent Governance Control Plane",
  description: "Real-time authorization, spend controls, revocation, and auditability for autonomous financial agents.",
  openGraph: {
    title: "AEGIS-Gov",
    description: "Govern every action before it executes.",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "AEGIS-Gov",
    description: "Policy, budgets, revocation, and audit for autonomous financial agents.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
