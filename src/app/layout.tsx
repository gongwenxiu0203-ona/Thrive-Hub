import type { Metadata } from "next";
import "./globals.css";
import { IcpFooter } from "@/components/IcpFooter";

export const metadata: Metadata = {
  title: "联盟营销管理系统",
  description: "跨境电商品牌客户的联盟推广全链路管理系统",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
        <IcpFooter />
      </body>
    </html>
  );
}
