import "@/styles/globals.css";
import { Inter } from "next/font/google";
import { RouteProvider } from "@/components/shell/route-provider";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={inter.variable}>
      <body>
        <RouteProvider>{children}</RouteProvider>
      </body>
    </html>
  );
}
