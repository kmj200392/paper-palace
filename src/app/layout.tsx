import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  metadataBase: new URL("https://paperpalace.minjaek.im"),
  title: {
    default: "Paper Palace — Read. Connect. Remember.",
    template: "%s · Paper Palace",
  },
  description:
    "읽은 논문을 연결해, 나만의 연구 지도로 기억하는 공간. arXiv 논문 읽기, 근거와 연결되는 AI 요약, 개인 지식 그래프.",
  openGraph: {
    title: "Paper Palace",
    description: "읽은 논문이, 쌓이는 지식이 되도록.",
    type: "website",
    locale: "ko_KR",
  },
  icons: { icon: "/brand/paper-palace.png" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <a className="skip-link" href="#main">
          본문으로 건너뛰기
        </a>
        {children}
      </body>
    </html>
  );
}
