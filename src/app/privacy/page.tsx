import { Brand } from "@/components/brand";
export const metadata = { title: "개인정보 안내" };
export default function Privacy() {
  return (
    <>
      <header className="site-header">
        <Brand />
        <a href="/app/">연구 공간으로 →</a>
      </header>
      <main id="main" className="legal section-shell">
        <p className="eyebrow">YOUR KNOWLEDGE, YOUR CONTROL</p>
        <h1>개인정보와 데이터 안내</h1>
        <p>최종 업데이트: 2026년 10월 29일</p>
        <h2>어떤 정보를 처리하나요?</h2>
        <p>
          GitHub 로그인 시 사용자 ID, 이름, 로그인명과 접근 토큰을 사용합니다.
          토큰은 암호화된 HttpOnly 쿠키로 최대 8시간 유지합니다. 중앙 사용자
          데이터베이스는 운영하지 않습니다.
        </p>
        <h2>논문과 메모는 어디에 저장되나요?</h2>
        <p>
          논문 목록, 요약, 메모, 그래프는 브라우저의 IndexedDB에 저장합니다.
          동기화하면 본인이 선택한 비공개 GitHub 저장소의
          paper-palace/library.json에 기록합니다. GitHub 커밋 기록에 이전 내용이
          남을 수 있습니다. 원문 추출 데이터는 브라우저에만 캐시하며 저장소로
          동기화하지 않습니다.
        </p>
        <h2>AI 키와 분석 요청</h2>
        <p>
          API 키는 현재 탭의 메모리에만 보관하며 새로고침하거나 키 연결을
          해제하면 지워집니다. 분석 요청 시 HTTPS로 Paper Palace의 Cloudflare
          Worker를 거쳐 선택한 OpenAI 또는 Anthropic API에 전달합니다. API 키를
          서버 데이터베이스·로그·GitHub에 저장하지 않습니다. 논문 제목과 추출한
          본문이 선택한 AI 제공자에게 전달되며, 해당 제공자의 데이터 보관 정책이
          적용됩니다. OpenAI 요청에는 store:false를 설정합니다.
        </p>
        <h2>삭제 및 내보내기</h2>
        <p>
          설정에서 JSON으로 자료를 내보낼 수 있습니다. 논문을 삭제한 뒤 GitHub와
          동기화하면 현재 라이브러리에서도 삭제됩니다. GitHub 커밋 기록과
          브라우저 캐시까지 제거하려면 해당 서비스의 삭제 기능과 브라우저 사이트
          데이터 삭제를 사용하세요. GitHub 설정에서 앱 권한을 철회할 수
          있습니다.
        </p>
        <h2>호스팅과 외부 서비스</h2>
        <p>
          Cloudflare가 사이트와 요청을 전달하며, arXiv에서 공개 논문을
          불러옵니다. 서비스 자체의 광고·행동 분석 추적기는 사용하지 않습니다.
          인프라 제공자는 보안과 서비스 운영에 필요한 요청 정보를 처리할 수
          있습니다.
        </p>
        <h2>문의</h2>
        <p>
          운영자: Minjae Kim · <a href="https://minjaek.im/">minjaek.im</a>
          <br />
          <a href="https://github.com/kmj200392/paper-palace/issues">
            GitHub 이슈
          </a>
          에 비밀키나 비공개 논문 메모를 게시하지 마세요.
        </p>
      </main>
    </>
  );
}
