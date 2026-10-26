# buzz-restyle — design (부모)

모든 자식 feature가 기대는 레퍼런스, 디자인 언어, 진행 규칙, 자식별 조사 메모다. 자식의 `design.md`는 이 문서를 인용하고 자기 범위의 세부만 적는다.

## 레퍼런스

- `block/buzz-app` (Apache-2.0), 로컬 clone `~/code/buzz-app`, 기준 커밋 `c40dfdf4c81aabe759f3a4329c3e77f854746a59` (2026-10-26 확인). Buzz 1.0 베타이며, 0.X는 `block/buzz`에 있다(README).
- 규칙: `src/shared/design-system/DESIGN.md`, `docs/shell-design.md`, `docs/design-system.md`.
- 값: `src/shared/design-system/styles/`의 `tokens.css`, `materials.css`, `typography.css`, `components.css`, `overlays.css`(다이얼로그, 툴팁, 모션), `scrollbars.css`, `forms.css`. 셸 규칙은 `src/shared/styles/globals.css`의 `shell-*`이고, 이 파일이 위 파일들을 CSS `@import`로 하나의 Tailwind 루트에 묶는다(1~16행).
- 아래 수치는 그 파일에서 읽은 값이다. 실제 렌더링 측정은 각 자식이 한다.

## Buzz clone 참조 규칙 (모든 자식 공통, 2026-10-26 user)

작업하는 머신에는 사용자가 `block/buzz-app`을 로컬에 clone해 둔다. 모든 자식 feature의 `/feature`·`/design-draft`·`/tdd`·`/implement`·`/refactor`·`/code-review`·`/design-sync`는 이 clone을 정본으로 참조한다.

1. **위치**: `~/code/buzz-app`. 그 경로에 없으면 추측하거나 새로 clone하지 말고 사용자에게 경로를 묻는다.
2. **시작 전 확인**: `git -C ~/code/buzz-app rev-parse HEAD`로 커밋을 확인한다. 이 명령과 3의 `show`는 부모 tasks H3에서 AGENTS.md 'Commands'에 추가한다.
3. **기준 커밋 고정**: HEAD가 기준 커밋과 다르면 작업 트리를 바꾸지 말고 `git -C ~/code/buzz-app show c40dfdf4:<경로>`로 기준 커밋의 파일을 읽는다. 새 upstream을 따라가려면 사용자에게 확인한 뒤 이 문서의 기준 커밋과 출처 주석을 함께 바꾼다.
4. **기억이나 웹으로 대신하지 않는다**: 값, 클래스 이름, 마크업 골격, 규칙 문장은 clone의 파일을 열어 확인한 것만 쓴다. 이 문서의 수치도 요약이므로, 구현할 때는 원본 파일에서 다시 읽는다.
5. **clone은 읽기 전용**이다. 설치(`pnpm install`), 빌드, 실행, 수정을 하지 않는다.
6. **출처 기록**: 참고한 값과 규칙의 원본 경로와 기준 커밋은 자식 feature 문서와 DESIGN.md에 남긴다. 코드에는 남기지 않는다('레퍼런스로 쓰는 방법').

## 레퍼런스로 쓰는 방법 (모든 자식 공통, 2026-10-26 user)

- Buzz 파일은 옮기지 않는다. clone에서 값(색, 크기, 시간)과 규칙(구성, 상태, 위계)을 읽고 doan CSS와 TSX를 새로 쓴다. 값이 같아지는 것은 목표이고, 코드 구조와 문장까지 베끼지는 않는다.
- 코드에는 Buzz 출처 주석, 라이선스 사본, `buzz` 이름을 두지 않는다. 그래서 패키징 변경도 없다.
- Buzz를 참고했다는 사실과 기준 커밋은 AGENTS.md 레퍼런스 규칙에 따라 PRODUCT §7과 DESIGN.md에 적는다.
- 브랜드 자산(공통 결정 7)은 레퍼런스로도 쓰지 않는다.

## CSS를 싣는 방법 (모든 자식 공통)

- 디자인 시스템 CSS는 `app/src/renderer/ds/`에 평범한 CSS로 쓴다(`@apply`·`@utility`를 쓰지 않아 Tailwind 루트가 필요 없다). 진입 스타일시트(`styles.css`, `settings.css`)가 CSS `@import`로 싣는다(지금 `@import "./tokens.css"`와 같은 방식).
- 금지는 JS에서 CSS를 import하는 것이다(POSTMORTEM 2026-10-25, 개발 렌더러에서 CSP에 막힘). 진입 스타일시트는 지금처럼 HTML `<link>`로 싣는다.
- 새 규칙으로 대체한 기존 규칙은 지운다. 같은 대상을 겨누는 옛 규칙이 남으면 새 규칙을 조용히 이긴다.

## 디자인 언어와 담당

각 항목은 Buzz의 해당 값과 규칙을 따르도록 doan이 새로 쓴다(공통 결정 5). 다르게 가는 곳은 '조정' 열에만 적는다.

| 영역 | Buzz 규칙 (출처) | 조정 | 담당 |
|---|---|---|---|
| 색 | `color / purpose / emphasis / state` 역할 이름. 텍스트는 기본·보조·메타 3단계. 주요 버튼은 무채색 prominent. 액센트는 메시지 버블·Send·사이드바 행 상태에만(DESIGN.md "Accent color") | 액센트는 doan 고유 violet 램프(9단계 `#973be1`, 2026-10-26 user). 레퍼런스 family 값이 아니므로 doan 조정이다. 자리는 spec 공통 결정 2의 대응표대로. 상태색(ok/warn/err)은 Buzz 상태 역할 | buzz-ds (역할), 각 화면 자식 (적용) |
| 타입 | 역할 단위(크기+행간+자간+굵기). Regular 400은 읽기·폼 라벨, Medium 500은 동작·구조. caption 12/16, body 14/20, label 16/24(500), body-lg 20/28, 제목류 행간 1.1 | 글꼴은 시스템 스택 하나. 고정폭 역할은 가져오지 않는다. 지금의 13px 기본과 10.5~12.5px 소형 텍스트는 Buzz 역할로 옮긴다 | buzz-ds |
| 모서리 | 12/16/20/24/28px(`chip/row/control/container/panel`), 원·캡슐·알약은 별도. 중첩 모서리는 `max(0, 바깥 radius − inset)`, inset에 패딩과 바깥 테두리 포함, 단계로 반올림하지 않는다 | 없음 | buzz-ds |
| 포커스 | Buzz 포커스 링 레시피 (DESIGN.md "Focus appearance") | Buzz는 JS 훅(`useKeyboardFocusVisibility.ts`)이 붙이는 `html[data-keyboard-navigation]` 아래에서만 링을 그린다. doan은 `:focus-visible`로 쓰고 훅은 만들지 않는다. 핀 링 등 doan 기존 링은 밝은 배경에 맞춰 다시 정한다 | buzz-ds |
| 상태 | pressed는 위치 대신 채움만 바꾼다, 선택은 hover와 별개로 남는다, disabled는 강조 단계로 쓰지 않는다 | 지금 `button:disabled { opacity: .4 }`를 Buzz disabled 역할로 교체 | buzz-ds |
| 모션 | fast 120ms, state 150ms, panel-enter 180ms, settle 220ms. 정보 없는 애니메이션은 넣지 않는다. 오버레이·다이얼로그 모션은 Base UI의 `data-starting-style`/`data-ending-style`과 `@starting-style`에 건다(overlays.css:78-117) | doan은 Radix `data-state="open|closed"`(퇴장은 keyframes, `animationend`)와 네이티브 `<dialog>[open]`(`transition-behavior: allow-discrete`)에 건다. `prefers-reduced-motion`이면 이동을 없앤다(doan 기존 규칙 유지) | buzz-ds |
| 밀도 | 패널 패딩 24px, 컨트롤 inset 16px, 그룹 간격 32px. 얇은 네이티브 스크롤바 `scrollbar-width: thin` + `scrollbar-thumb-quiet`(scrollbars.css) | doan의 `.native-scroll` 유지(Radix ScrollArea 금지 결정과 일치) | buzz-ds (토큰), 각 화면 자식 (적용) |
| 툴팁 | 거의 검정인 prominent 캡슐: `text-caption`, 패딩 4/8px, `--affordance-prominent` 채움, 블러 등장 모션 (overlays.css:393-410, DESIGN.md:1269-1272) | 2026-10-25 공유 툴팁 패딩 12/6px 결정을 대체한다(PRODUCT §7 기록) | buzz-ds |
| 플로팅 표면 | `floating-surface`: Menu·Select·Popover·PreviewCard 전용. 90% 불투명 배경, 블러, 24px 모서리, 투명 1px 테두리, 라이트는 윤곽+접촉+주변 그림자. 목록 inset 4px, 행 패딩 8/12px, 안쪽 모서리는 파생값. 짧은 액션 메뉴는 compact(16px 모서리, inset 2px) (materials.css:67, DESIGN.md:558) | Radix DropdownMenu·Popover와 doan 메뉴들에 적용 | buzz-ds |
| 다이얼로그 | compact 25rem / standard 40 / wide 55 / expanded 72rem, 안쪽 패딩 2rem(뷰포트 30rem 이하 1rem), 상단 8rem, 불투명 `surface-popover`, 28px 모서리. 제목+설명이 헤더, Close는 옆, 액션은 Cancel → 완료 순서. 등장 0.75rem 상승·220ms·`easing-enter`, 퇴장 0.25rem·120ms (overlays.css) | 공용 틀은 buzz-ds, 화면 하나만 여는 다이얼로그 내용은 그 화면 자식. 포커스·닫기 동작은 그대로. 모달 scrim은 지금 `--board-bg`를 재사용하므로 buzz-ds가 scrim 값을 따로 정한다 | buzz-ds, 각 화면 자식 |
| 패널 | 사이드바 `Panel`과 메인 `Panel joined`가 `space-panel-gap`(8px)으로 떨어져 떠 있다. 불투명 `surface-panel`, 모서리 `radius-container`(24px), `shadow-panel`(1px 윤곽 6% + 작은 그림자 두 겹). companion 패널은 메인 `Panel joined` 안에 도킹한 열이고 `border-inline-start: 1px solid var(--border-standard)`로만 나뉜다(AppShell.tsx:477-478, `features/panels/Panels.module.css` `.dock`) | `Panel` 컴포넌트는 buzz-ds, 배치는 buzz-shell. 오른쪽 패널(대화·인스펙터 탭, 평소 숨김)도 Buzz대로 도킹 | buzz-ds, buzz-shell |
| 셸 배경 | `bg-app` 단색 + 24px 간격 `texture-dots` 점 격자. 점 색은 `bg-app`에서 파생(라이트는 94% + 검정). 셸 패널과 내비게이션에는 glass를 쓰지 않는다 (DESIGN.md "Surface and depth") | 없음 | buzz-ds (토큰), buzz-shell |
| 앱 헤더 | 헤더 높이 `--size-topbar` 3.5rem = 56px(globals.css:195), macOS 신호등 (24, 30)(src-tauri/tauri.conf.json:21-24), 빈 헤더 배경만 드래그. 아이콘 버튼은 32px 상자·16px 아이콘·10px 모서리의 고스트, hover는 반투명 채움, pressed는 조금 더 진하게 (shell-design.md "Desktop chrome") | Electron `titleBarStyle: "hiddenInset"` + `trafficLightPosition`으로 같은 위치를 만들고 실측한다. 2026-10-22 Window 결정을 대체한다(PRODUCT §7 기록) | buzz-ds (`IconButton`), buzz-shell |
| 사이드바 | `SidebarNavigation`: `text-navigation` 라벨, body-sm Regular, 28px 행, 블록 패딩 2px, 앞 8px/뒤 6px, 아이콘 간격 6px, 행 간격 2px, 그룹 간격 16px, 섹션 제목·접기 화살표는 `text-subtle`, 선택은 `surface-sidebar-selected` + `text-sidebar-selected`, hover는 `affordance-sidebar-hover` | 선택 채움은 현재 위치 행(`aria-current="location"`)에, hover는 트리 행에 citrus. 트리 들여쓰기·twisty·카운트는 doan 정보 구조 유지 | buzz-ds (토큰), buzz-project |
| 온보딩 표면 | 아래 '온보딩' 메모 | Buzz 워드마크와 그라디언트 이미지 대신 doan 것 | buzz-onboarding |

## 가져오지 않는 Buzz 동작 (공통 결정 6)

Buzz 문서에 있지만 doan 동작을 바꾸므로 가져오지 않는다.

- 타이틀바 클릭으로 다이얼로그 닫기, 4px 드래그 임계값(shell-design.md:186-194)
- 타이틀바 더블클릭이 시스템 설정을 따르는 동작
- Settings를 작업 공간 위 모달로 여는 구성(shell-design.md:14, 73). doan Settings는 별도 창으로 유지한다
- 키보드 모달리티 속성(`data-keyboard-navigation`)과 그 훅
- hover로만 드러나는 행 액션(DESIGN.md:873)
- 헤더 캡슐 탭의 화살표 키 이동
- 사용자 액센트·Vibe 선택(Chillin'/Buzzin')

## 드래그 영역 (모든 자식 공통)

Electron의 `-webkit-app-region`은 DOM 쌓임 순서와 따로 hit-test된다. 그래서 헤더 띠 위에 그려지는 모든 상호작용 요소(헤더 버튼, Radix 메뉴·툴팁·팝오버, 헤더와 겹치는 `<dialog>`와 backdrop, 온보딩 titlebar의 Close)에 `no-drag`를 건다. 지금은 `.top button`에만 있다(styles.css:40). `buzz-shell`은 메뉴와 다이얼로그를 연 상태에서 헤더 띠 위 클릭이 동작하는지 런타임으로 확인한다.

## 자식 진행 규칙

1. **시작**: clone 확인(규칙 2·3) → 이전 자식이 main에 머지됐으면 부모 [tasks.md](./tasks.md)의 그 줄을 체크하고 `docs(feature): buzz-restyle check <slug>`로 따로 커밋 → `/feature <slug>` → 아래 조사 메모 중 해당 메모를 자식 `design.md`로 **옮기고**(부모에서는 지운다), 그 이동도 같은 체크 커밋에 넣는다.
2. **초안**: 화면 자식은 `/design-draft`로 그 화면의 Buzz 스타일 초안을 새 파일(`design/buzz-<화면>.html`)로 그린다. 기존 초안은 고치지 않는다.
3. **구현과 대조**: 구현 뒤 `/design-sync`로 새 초안과 맞춘다. 지금 하네스는 "초안은 그 화면의 첫 구현까지만 정본"이라서, 리디자인 초안을 그 자식이 머지될 때까지 정본으로 인정하도록 AGENTS.md와 `/design-sync`를 넓혀야 한다(부모 tasks의 하네스 task).
4. **값 동기화**: 자식은 자기 변경이 움직이는 모든 e2e 고정값과 DESIGN.md 값을 다른 화면 것까지 함께 갱신한다(`buzz-shell`은 특히 모든 화면에 영향). 자기 담당 DESIGN.md 절의 "buzz-ds 이전" 표시를 지우고 다시 측정한다.
5. **끝**: `node .agents/skills/verify/scripts/verify.mjs --runtime` 통과, 결론 승격, 자식 디렉터리 삭제, PR. 부모 디렉터리는 건드리지 않는다.
   - 예외(2026-10-26 user): comments-ui `08-hidden-quit-close`(`app/e2e/comments-ui.ts:566`, `window.isFocused()` 대기)의 시간 초과는 main에서도 재현되는 기존 실패다. 모든 자식이 끝날 때까지 미뤄 두고 Z0에서 고친다. 자식은 이 지점에서만 멈춘 `--runtime` 결과를 미충족으로 PR에 적고, comments-ui 뒤 suite를 하나씩 돌린 결과를 함께 남긴다.

## DESIGN.md 절과 담당

"buzz-ds 이전" 표시는 아래 담당 자식이 지운다. 한 절을 두 자식이 나누면 나중 자식이 지운다.

| DESIGN.md 절 | 담당 |
|---|---|
| App shell — initial app-ui implementation (2026-10-22) | buzz-shell |
| Select and inspect (2026-10-23) | 캔버스 부분 buzz-canvas, 인스펙터 부분 buzz-inspector, 표시 삭제 buzz-inspector |
| Comments (2026-10-23) + comments-readability update | buzz-conversation (코멘트 UI를 걷어낼 때 절을 정리한다) |
| Onboarding (2026-10-24) + app-setup update | buzz-onboarding |
| Projects home (2026-10-25) + Cfix review round | buzz-home |
| Design navigation (2026-10-25) + Final review follow-up | 트리·Overview buzz-project, Quick Open buzz-search, 표시 삭제 buzz-project |
| Settings and Home setup (2026-10-25) | Settings buzz-settings, Home 설정 부분 buzz-home, 표시 삭제 buzz-settings |
| UX audit recovery update (2026-10-25) | buzz-ds (툴팁·포커스 등 공용 수정) |
| Revision continuity (2026-10-26) | buzz-canvas |
| Comments Review (2026-10-26) | buzz-conversation (같음) |
| Hand off dialog (2026-10-26) | buzz-conversation (같음) |
| Feedback panel (2026-10-26) | buzz-conversation (같음) |

## 자식 feature 조사 메모

자식을 시작할 때 해당 메모를 자식 `design.md`로 옮기고 여기서 지운다.

### 조사 메모: AppShell (`buzz-shell`용)

사용자 요청: "AppShell 자체를 복붙" (2026-10-26).

Buzz `src/app/shell/AppShell.tsx`(514줄)의 마크업 골격과 `src/shared/styles/globals.css`의 `shell-*` 규칙을 레퍼런스로 삼아 같은 구성을 새로 쓴다(클래스는 `doan-` 접두어).

- 골격: `shell-background`(전체 창, 점 격자) → `shell-header`(macOS면 `shell-header-mac`, 신호등 자리) → `shell-workspace` → `shell-body` → `shell-content` 안에 `shell-navigation`(사이드바, `navigation` 내용을 담는다. 기본값은 `shell-sidebar-default`의 `Panel as="aside"`, AppShell.tsx:144-145, 451-470)과 `<main>`(메인 `Panel joined` 안에 `PanelFrame`과 도킹된 companion 열, AppShell.tsx:477-478).
- 헤더 자리: 왼쪽 `shell-history`(뒤로/앞으로 기록), 가운데 `shell-center-capsule`(`chrome-navigation` 탭 트랙, 선택 알약), 오른쪽 `shell-actions`. doan 기존 top bar 항목(← Go Home, 브레드크럼 `.crumbs`, 액션 버튼들)을 어느 자리에 둘지는 `buzz-shell`에서 사용자에게 확인한다. 두 자리 모두 doan에 없는 동작(기록 이동, 탭 선택)을 암시하기 때문이다(공통 결정 6).
- Buzz `Panel`은 "둥근 표면만 소유한다: 채움, 테두리, 그림자, 클리핑"(`Panel.tsx` 주석)이라 동작이 없다. `IconButton`처럼 동작이 있는 컴포넌트는 기존 `<button>`/Radix에 클래스만 입힌다.
- Home(`.home-shell`, 지금 절대 위치 오버레이에 자체 40px 헤더, styles.css:429)이 셸 골격 안에 들어가는지 밖에 남는지 정한다. 헤더 띠는 어느 쪽이든 `buzz-shell`이 맞춘다.
- 가져오지 않는 것: Tauri API(`isTauri`, `macTitleBarDragHandlers`, `WindowControls`), Buzz 서비스 타입, 라우팅·검색·커뮤니티 로직.
- 확인할 것: macOS 전체 화면에서 신호등이 사라져 자리만 남는 경우.

### 조사 메모: 온보딩 (`buzz-onboarding`용)

사용자 요청: "Buzz 온보딩 스타일을 우리 온보딩에" (2026-10-26).

Buzz의 첫 실행 화면은 `src/features/identity/OnboardingScreen.tsx` + `IdentitySetup.module.css`다.

- 구성: 셸 대신 창 전체를 덮는 `landing`(배경 `#e7f0ef` + 그라디언트 이미지) → 3.5rem 높이 드래그 전용 `titlebar` → 최대 40rem `content` 안에 가운데 정렬 `brand`(워드마크 최대 23rem + `text-body-lg` 태그라인)와 아래쪽 최대 27.5rem `actions` 열. 설정 단계 폼은 최대 32rem `setup` 열에 `space-4` 간격.
- doan 온보딩 위저드(PRODUCT §5, 1~4단계, `Onboarding.tsx`)에 이 표면과 열 폭을 입힌다. 위저드는 기존 창을 덮는 모달 `<dialog>`이고 Close·Escape를 유지한다. titlebar 띠는 신호등 자리를 비워 둔다. 단계 구성, 문구, 동작, 포커스 규칙은 바꾸지 않는다.
- 그라디언트 이미지(`public/shell-gradient.png`)와 Buzz 워드마크(WebGL 셰이더, `OnboardingWordmark.tsx`, `wordmark.frag`)는 쓰지 않는다(공통 결정 7). 대신할 doan 워드마크와 배경은 `buzz-onboarding`에서 묻는다. 참고로 원본의 `url("/shell-gradient.png")`는 `file://`에서 파일 시스템 루트를 가리킨다.

### 조사 메모: 캔버스 영역 (`buzz-canvas`용)

- Buzz는 점 격자를 셸 바닥에만 두고, 읽기 패널은 불투명하게 둔다. doan의 캔버스 보드(`.area`, 지금 `--board-bg` + 16px 점)를 메인 `Panel` 안 불투명 보드로 둘지, 셸 점 격자가 비치는 영역으로 둘지는 `buzz-canvas`에서 묻는다.
- 선택·hover 표시는 무채색이 된다. 에이전트가 그린 캔버스는 어떤 색이든 될 수 있으므로, 선택 표시와 요소 피커의 선택 모드 표시는 무채색·액센트와 별개로 바깥 halo나 외곽선을 갖추고, 어두운·밝은·violet이 많은 픽스처 캔버스 위에서 확인한다.
- `color-scheme`을 dark에서 light로 바꾸면 다른 `color-scheme`을 가진 캔버스 iframe의 바탕 처리가 달라질 수 있다(POSTMORTEM 2026-10-25 예방 항목). iframe 미디어 선호와 computed `color-scheme`을 따로 확인한다.

## 금지 표현 (모든 자식 공통, 2026-10-26 user)

- 왼쪽(시작 쪽) 테두리에 색을 칠하거나 두껍게 그어 메시지·안내·카드·행을 강조하지 않는다. 오류는 아이콘과 `text-danger` 글자 또는 상태 블록으로, 안내는 `surface-inset` 채움으로 나타낸다(buzz-ds design '오류와 안내 표현'). 패널 사이 1px 무채색 구분선은 해당하지 않는다.

## 공통 함정 (POSTMORTEM)

- **2026-10-25 — Production CSS extraction concealed missing development styles**: JS CSS import는 개발 렌더러에서 CSP에 막히고 프로덕션 번들에서는 가려졌다. 개발과 프로덕션 모두에서 대표 자식 요소의 computed style을 확인한다. 같은 항목의 예방 문장: 렌더러 외형을 바꿀 때는 iframe 미디어 선호를 computed `color-scheme`과 따로 확인한다.
- **projects-home checklist** (`overflow: hidden` + `max-height`): 정적 초안의 overflow를 그대로 복사해 네이티브 스크롤을 덮었다. Buzz를 보고 CSS를 쓸 때도 bounded 목록은 넘칠 만큼의 데이터와 실제 입력으로 스크롤 도달을 확인한다.
- **2026-10-24 — 모달 뒤 포커스**: 다이얼로그 마크업을 감싸는 래퍼를 바꿀 때 `showModal`·포커스 복귀 순서를 건드리지 않는다.
- **cascade layer**: 대체한 doan 규칙이 layer 밖에 남아 있으면 Buzz 규칙을 조용히 이긴다('CSS를 싣는 방법').
