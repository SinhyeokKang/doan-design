# buzz-ds — design

부모 [`buzz-restyle`](../buzz-restyle/design.md)의 레퍼런스, Buzz clone 참조 규칙, 출처 표기와 라이선스, CSS를 싣는 방법, 디자인 언어 표, 가져오지 않는 Buzz 동작, 공통 함정을 따른다. 이 문서는 표에서 담당이 `buzz-ds`인 행과 공유 요소의 설계만 적는다.

## 영향받는 구성 요소

- **앱 렌더러**:
  - `tokens.css`, `styles.css`의 공용 규칙(`@theme inline`, 기본 타입, `.btn`, `.kbd`, `.chip`, 포커스, disabled, 스크롤바, 모달 scrim, 오렌지를 쓰는 모든 규칙), `settings.css`의 공용 부분, `connectionRows.css`
  - `components/ui/tooltip.tsx`
  - 공유 요소: `ProjectSetupDialog.tsx`, `AddProjectsDialog.tsx`, `FirstPrompt.tsx`, `ConnectionRows.tsx`, `ErrorDetails.tsx`, `Toast.tsx`, `.ob-dialog`, 스피너
  - 새 공용 컴포넌트 `Panel`, `IconButton`
  - 화면 배치 규칙과 동작 코드는 바꾸지 않는다.
- **앱 main**: 두 창의 `backgroundColor`를 라이트 셸 색으로.
- **패키징**: `LICENSE`·`NOTICE.md`를 앱에 넣는 방법(질문 2).
- **`design/` 초안**: 기존 12개는 고치지 않지만 `doan check`가 정의되지 않은 변수 오류를 내면 안 된다(질문 1과 연결). 새 초안 `design/buzz-ds.html`(공용 컴포넌트와 공유 요소 시트)을 `/design-draft`로 그린다.
- CLI, `doan mcp`, 스킬, 포맷: 영향 없음.

## 파일 구성

- `app/src/renderer/buzz/`: Buzz에서 복사한 CSS. `tokens.css`의 라이트 블록·의미 역할·citrus family, `materials.css`, `typography.css`, `overlays.css`, `scrollbars.css`, `forms.css`, 필요한 `components.css` 조각. 수정 내용: 다크 블록과 다른 액센트 family 제거, Inter → 시스템 스택, `doan-`·`data-ui-` 이름 변경, Base UI 상태 속성 → Radix `data-state`/`<dialog>[open]`, 키보드 게이트 → `:focus-visible`.
- `styles.css`가 이 파일들을 CSS `@import`로 싣는다(부모 design 'CSS를 싣는 방법'). 대체하는 doan 규칙은 지우거나 같은 layer로 옮긴다.
- `app/src/renderer/tokens.css`: 캔버스에 그대로 서빙되고 `doan check`가 읽는 파일이라 Tailwind 지시어나 `@import`를 넣을 수 없다(파일 머리 주석). 그래서 Buzz 파일을 import하지 않고, 렌더러와 초안이 쓰는 doan 변수에 Buzz 라이트 값을 리터럴로 적는다. 변수 이름 규칙은 질문 1.
- `styles.css`의 `@theme inline`: shadcn 색 이름을 Buzz 역할에 다시 연결한다. `primary`는 무채색 prominent, `accent`는 citrus 쌍.

## 오렌지 → Buzz 역할 대응표 (부모 공통 결정 2)

A5에서 지금 오렌지를 쓰는 규칙(`styles.css`, `settings.css`의 `--accent`, `--accent-line`, `--accent-soft`, `--accent-ink`)을 하나씩 아래 역할로 옮긴다. 화면 배치는 그대로 두고 색만 바꾼다.

| 지금 오렌지 표시 | 옮길 역할 |
|---|---|
| 코멘트 카드 배경 | citrus 연한 채움(`bubble` 계열, Chillin') |
| 코멘트 제출 버튼(Add/Save) | citrus 진한 채움 + `text-on-accent` (Buzz `accentButtonStyle`) |
| 사이드바 트리의 열린 캔버스 행, 행 hover | `surface-sidebar-selected`/`text-sidebar-selected`, `affordance-sidebar-hover` |
| 코멘트 핀 | citrus 진한 채움 + halo |
| 주요 버튼(`.btn.primary` 등) | 무채색 prominent |
| 캔버스 선택·hover 테두리, 치수 라벨, 프레임 점프 하이라이트, 카드 flash | 무채색(`border-focus` 계열 또는 prominent)과 halo |
| 링크 | Buzz 링크 역할(무채색) |
| 탭·세그먼트 선택, 메뉴 하이라이트 | `surface-navigation-selected`, `affordance-floating-hover` |
| Open 태그, 열린 코멘트 수, 현재 위치(`aria-current`) | 텍스트 강조 3단계와 굵기 |
| 스피너, 진행, 온보딩 현재 단계, 드롭 영역, `.canvas-notice` | 무채색 역할 |
| 체크박스 `accent-color` | 무채색 prominent |

화면 자식은 이 대응을 바꾸지 않고 배치만 Buzz로 옮긴다. 대응을 바꿔야 하면 부모 공통 결정 13을 따른다.

## 순수 함수로 분리할 부분 (`/tdd` 대상)

1. `contrastRatio(fg, bg)`와 쌍 목록 검사: 텍스트 역할 × 표면 역할 쌍과 citrus 쌍(연한 채움 위 글자, 진한 채움 위 `text-on-accent`)이 Buzz 대비 기준(`scripts/design-system/check-contrast.mjs`의 기준)을 넘는지. 반투명 배경은 실제 뒤 배경과 합성해서 계산한다.
2. `cssVarUsage(cssText)` → `{defined, used}`: 렌더러 CSS 전체에서 쓰는 `var(--*)`가 모두 정의되어 있는지.
3. `tokenAliasDrift(doanTokens, buzzTokens, map)`: doan `tokens.css`에 리터럴로 적은 값이 Buzz 토큰을 끝까지 해석한 값과 같은지.
4. `nestedRadius(outer, inset, border)` = `max(0, outer − inset − border)`: 측정값과 대조할 기대값.

## 포맷 변경

없다. JSON Schema, 픽스처, 포맷 버전 `v` 모두 그대로다.

## 컨벤션 영향

ARCHITECTURE §1 컨벤션과 `doan check` 규칙은 바뀌지 않는다. `.doan/config.json`의 `tokenCss`도 같은 파일을 가리킨다. 렌더러의 데이터 속성은 `data-doan-*`(캔버스 컨벤션)를 쓰지 않고 `data-ui-*`를 쓴다.

## 결정 영향

- PRODUCT §7 2026-10-22 "Theme: dark only, one orange accent, one system sans font (no monospace)"와 Sorcerer 레퍼런스를 대체한다.
- PRODUCT §7 2026-10-25 공유 툴팁 패딩 12/6px 결정을 Buzz 툴팁으로 대체한다.
- 유지하는 결정: Radix(shadcn) + Tailwind 스택(2026-10-22), Radix ScrollArea 금지와 두 CSP 불변(2026-10-22). `backdrop-filter`, CSS `@import`, 시스템 폰트는 CSP를 바꿀 필요가 없다.
- 캔버스 iframe은 영향 없다. sandbox, 주입 스크립트, 서빙 범위, 오버레이 좌표 계산은 그대로다. 오버레이 표시는 색과 모서리만 바뀐다.
- `color-scheme`이 dark에서 light로 바뀐다(`styles.css`, `settings.css`, `.cl`). 캔버스 iframe의 미디어 선호와 바탕 처리를 따로 확인한다(부모 design 공통 함정).
- DESIGN.md의 기존 색 실측값은 무효가 된다. 맨 앞에 디자인 시스템 절을 새로 두고, 화면별 절의 색 값에는 "buzz-ds 이전" 표시를 단다.

## PoC 의존

없다. `backdrop-filter`는 Chromium 156에서 지원한다. 다만 캔버스 iframe 위에 뜬 플로팅 표면의 블러가 iframe 내용을 실제로 흐리게 하는지는 런타임에서 확인한다(tasks A6).

## 남은 질문

1. doan 토큰 변수 이름: 기존 이름(`--bg`, `--panel`, `--text-2` …)을 유지하고 값만 Buzz 라이트로 바꿀지, Buzz 역할 이름으로 바꿀지. 바꾸면 기존 초안 12개가 정의되지 않은 변수 오류를 내므로, 초안을 고치지 않는다는 부모 결정 11과 부딪힌다.
2. 패키징된 앱에 `LICENSE`·`NOTICE.md`를 넣는 방법: electron-builder `extraResources`에 추가하는 빌드 설정 변경이 필요하다.
