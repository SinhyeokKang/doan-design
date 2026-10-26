# buzz-ds — design

부모 [`buzz-restyle`](../buzz-restyle/design.md)의 레퍼런스, 출처 표기, Buzz clone 참조 규칙, 디자인 언어 표, 공통 함정을 따른다. 이 문서는 표에서 담당이 `buzz-ds`인 행의 설계만 적는다.

## 영향받는 구성 요소

- **앱 렌더러**: `tokens.css`, `styles.css`의 공용 규칙(`@theme inline`, 기본 타입, `.btn`, `.kbd`, `.chip`, 포커스, disabled, 스크롤바, 오버레이 표시 색), `settings.css`·`connectionRows.css`의 공용 부분, `components/ui/tooltip.tsx`, 다이얼로그·토스트에 공용 클래스를 붙이는 TSX. 새 공용 컴포넌트 `Panel`, `IconButton`. 화면 배치 규칙과 동작 코드는 바꾸지 않는다.
- **앱 main**: 두 창의 `backgroundColor`를 라이트 셸 색으로. 창 크기·`titleBarStyle`·신호등 위치는 `buzz-shell`.
- **화면 겉모습**: 토큰이 바뀌므로 모든 화면이 라이트가 된다. 자식 feature가 오기 전까지 배치는 다크 시절 그대로라 어색할 수 있고, 이 feature는 대비·가독성이 깨지는 곳만 막는다.
- **`design/` 초안 캔버스**: 10개 초안이 `app/src/renderer/tokens.css`를 링크한다(`app-shell`, `projects-home`, `onboard`, `project-feedback`, `comments-ui`, `revision-continuity`, `comments-readability`, `design-nav`, `agent-handoff`, `app-setup`). 초안은 각 화면의 첫 구현이 main에 들어간 뒤로 정본이 아니므로(AGENTS.md `/design-sync`) 겉모습이 바뀌어도 되지만, `doan check`가 정의되지 않은 변수 오류를 내면 안 된다.
- CLI, `doan mcp`, 스킬, 포맷: 영향 없음.

## 파일 구성

- `app/src/renderer/buzz/`: Buzz에서 복사한 CSS. `tokens.css`의 라이트 블록과 의미 역할, `materials.css`, `typography.css`, 필요한 `components.css` 조각. 각 파일 머리에 출처 리포·커밋·원본 경로·Apache-2.0·수정 내용(다크 블록 제거, Inter → SF Pro, 액센트 고정 등)을 영어로 적고, 같은 디렉터리에 Apache-2.0 `LICENSE` 사본과 원본 `NOTICE.md` 사본을 둔다.
- `app/src/renderer/tokens.css`: 캔버스에 그대로 서빙되고 `doan check`가 읽는 파일이라 Tailwind 지시어나 `@import`를 넣을 수 없다(파일 머리 주석). 그래서 Buzz 파일을 import하지 않고, 렌더러와 초안이 쓰는 doan 변수에 Buzz 라이트 값을 리터럴로 적는다. 변수 이름을 유지할지 Buzz 이름으로 바꿀지는 질문 1.
- `styles.css`의 `@theme inline`: shadcn 색 이름(`primary`, `accent`, `popover` 등)을 Buzz 역할에 다시 연결한다. `primary`는 무채색 prominent, `accent`는 오렌지 쌍.
- 스타일시트는 지금처럼 HTML `<link>`로 싣는다. JS에서 CSS를 import하지 않는다(POSTMORTEM 2026-10-25, 아래).

## 순수 함수로 분리할 부분 (`/tdd` 대상)

1. `contrastRatio(fg, bg)`와 쌍 목록 검사: 텍스트 역할 × 표면 역할 쌍이 Buzz 대비 기준(`scripts/design-system/check-contrast.mjs`의 기준)을 넘는지. 반투명 배경은 실제 뒤 배경과 합성해서 계산한다.
2. `cssVarUsage(cssText)` → `{defined, used}`: 렌더러 CSS 전체에서 쓰는 `var(--*)`가 모두 정의되어 있는지. 토큰 이름을 바꾼 뒤 빠진 변수가 조용히 기본값으로 떨어지는 것을 막는다.
3. `tokenAliasDrift(doanTokens, buzzTokens, map)`: doan `tokens.css`에 리터럴로 적은 값이 Buzz 토큰을 끝까지 해석한 값과 같은지. 두 파일이 따로 수정되어 어긋나는 것을 막는다.
4. `nestedRadius(outer, inset, border)` = `max(0, outer − inset − border)`: CSS `calc`로 구현하지만, 테스트에서 측정값과 대조할 기대값을 계산하는 데 쓴다.

## 포맷 변경

없다. JSON Schema, 픽스처, 포맷 버전 `v` 모두 그대로다.

## 컨벤션 영향

ARCHITECTURE §1 컨벤션과 `doan check` 규칙은 바뀌지 않는다. `.doan/config.json`의 `tokenCss`도 같은 파일을 가리킨다.

## 결정 영향

- PRODUCT §7 2026-10-22 "Theme: dark only, one orange accent, one system sans font (no monospace)"와 Sorcerer 레퍼런스를 대체한다.
- 유지하는 결정: Radix(shadcn) + Tailwind 스택(2026-10-22), Radix ScrollArea 금지와 두 CSP 불변(2026-10-22), 공유 툴팁 패딩을 툴팁에만 적용(2026-10-25 ux-audit). `backdrop-filter`와 시스템 폰트는 CSP를 바꿀 필요가 없다.
- 캔버스 iframe은 영향 없다. sandbox, 주입 스크립트, 서빙 범위, 오버레이 좌표 계산은 그대로다. 오버레이 표시(`.mark`, `.dims`)는 색과 모서리만 바뀐다.
- DESIGN.md의 기존 색 실측값은 무효가 된다. 이 feature는 맨 앞에 디자인 시스템 절을 새로 두고 공용 컴포넌트 실측값을 적으며, 화면별 절의 색 값에는 "buzz-ds 이전" 표시를 단다. 화면별 수치는 각 자식 feature가 교체한다.

## PoC 의존

없다. `backdrop-filter`는 Chromium 156에서 지원한다. 다만 캔버스 iframe 위에 뜬 플로팅 표면의 블러가 iframe 내용을 실제로 흐리게 하는지는 런타임에서 확인한다(tasks A6).

## 남은 질문

1. doan 토큰 변수 이름: 기존 이름(`--bg`, `--panel`, `--text-2` …)을 유지하고 값만 Buzz 라이트로 바꿀지, Buzz 역할 이름으로 바꾸고 10개 초안을 함께 고칠지.
2. 대조 기준: Buzz 화면을 직접 측정할지, doan 화면별 Buzz 스타일 초안을 `/design-draft`로 먼저 그리고 `/design-sync`로 맞출지.
