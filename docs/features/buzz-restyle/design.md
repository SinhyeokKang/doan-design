# buzz-restyle — design (부모)

2026-10-28 갱신. 모든 자식 feature가 기대는 레퍼런스, 디자인 언어, 진행 규칙, 자식별 조사 메모다. 완료된 자식의 구현 기준은 PRODUCT·ARCHITECTURE·DESIGN이며, 미구현 자식의 승인 사항은 해당 feature 문서를 따른다. 자식의 `design.md`는 이 문서를 인용하고 자기 범위의 세부만 적는다.

## AppShell 승인에 따른 공통 계약 갱신 (2026-10-27)

사용자 승인과 feature-review 일괄 반영에 따라 아래의 이전 조사 수치 중 충돌하는 부분은 이 절과 [승격된 구조 계약](../../ARCHITECTURE.md#7-app-stack-electron--typescript)가 우선한다. Shell 구현·검증 결과는 [DESIGN.md](../../DESIGN.md)의 2026-10-27 완료 기록을 따른다.

- Shell/LNB는 투명·블러, 본문만 흰 Panel이다. LNB의 별도 Panel·점 격자·violet 선택은 사용하지 않는다.
- LNB 프로젝트→캔버스 IA와 프로젝트 메뉴·워크트리 선택은 buzz-shell이 맡는다. buzz-project는 Overview 본문, buzz-home은 프로젝트 선택 전 본문, buzz-conversation은 대화 공용 UI, buzz-canvas-conversation은 대화 전용 도킹 패널의 표시 정책과 캔버스 대화를 맡는다. 인스펙터는 buzz-inspector의 플로팅 패널이다(spec '캔버스 페이지 방향').
- Geist는 앱 전역 공통 폰트로 로컬 제공하며 시스템 스택은 대체 글꼴이다. 공통 칩 기본값은 12px·상하 2px·좌우 6px, 워크트리는 translucent 변형이다.
- 현재 프로젝트는 접을 수 없다. 브랜치 뱃지는 읽기 전용이다. 우측 … 메뉴는 워크트리·Overview·Finder·설정·프로젝트 전체 등록 제거를 제공한다.
- 이전/다음은 실행 중의 캔버스·워크트리·Overview 방문 기록이다. 전환 보호를 통과한 이동만 기록한다.
- 홈 본문·에이전트 인증·Dot 상태 데이터는 이 승인에 포함되지 않는다. Shell의 구현 결론은 PRODUCT·ARCHITECTURE로 승격했다.

## 온보딩 승인과 후속 인계 (2026-10-28)

buzz-onboarding은 2026-10-29 구현·병합됐다. 출하 화면은 루트 `.doan/canvases/buzz-onboarding.html`(상태별 전체 창 프레임 73개), 측정값과 초안과의 차이는 [DESIGN](../../DESIGN.md), 결정은 [PRODUCT](../../PRODUCT.md) §5 항목 0에 있다.

- Welcome → Agent → Project → Home. 한 공급자 ready와 한 프로젝트가 필수다. 단순 Close/Escape로 완료하거나 홈을 우회하는 과거 위저드 동작은 유지하지 않는다. 미완료 앱 재시작은 Welcome이며 저장된 연결/등록 프로젝트는 유지한다.
- GitHub URL은 등록 로컬 리포/사용자 선택 폴더를 재사용하고 없으면 기존 Git/gh 인증으로 clone한다. 자체 GitHub OAuth·토큰 저장·저장소 목록은 없다.
- 앱 설치만 한 사용자도 자기 에이전트에게 setup을 맡길 수 있도록 고정 CLI/MCP 인터페이스를 제공한다. 번들 CLI가 앱을 열고 같은 main 서비스·상태·완료 조건을 사용한다. 실제 계정 승인은 시스템 브라우저에서 사람이 한다.
- Welcome만 accent 타원 그라디언트/alpha grain이다. 나머지는 AppShell 반투명 배경과 공통 프리미티브를 사용한다. lg 버튼 48px, notice 12px/16px·흰 elevation·동색 아이콘·spinner, Back arrow, 말줄임표 없는 문구를 승인했다.
- 프로젝트 썸네일의 이름 해시·8색 규칙은 유지하며 연한 배경·진한 글자를 온보딩과 ShellSidebar에 공통 적용하도록 승인했다. 현재 ShellSidebar의 흰 글자/진한 배경은 아직 바뀌지 않았다.
- 홈의 단일 대화 입력창·프로젝트 선택은 buzz-home 소유다. OAuth/보관은 별도 agent-auth, Canvas 대화 UI는 buzz-canvas-conversation이 맡는다. 새 온보딩의 FirstPrompt/Send 단계는 없다.

위 값은 자식의 **승인된 계획**이며 이미 구현된 공용 DS 값으로 보고하지 않는다. 세부 크기·상태·CLI/MCP 계약을 부모에 다시 복제하지 않는다.

## 레퍼런스

- `block/buzz-app` (Apache-2.0), 로컬 clone `~/code/buzz-app`, 기준 커밋 `c40dfdf4c81aabe759f3a4329c3e77f854746a59` (2026-10-26 확인). Buzz 1.0 베타이며, 0.X는 `block/buzz`에 있다(README).
- 규칙: `src/shared/design-system/DESIGN.md`, `docs/shell-design.md`, `docs/design-system.md`.
- 값: `src/shared/design-system/styles/`의 `tokens.css`, `materials.css`, `typography.css`, `components.css`, `overlays.css`(다이얼로그, 툴팁, 모션), `scrollbars.css`, `forms.css`. 셸 규칙은 `src/shared/styles/globals.css`의 `shell-*`이고, 이 파일이 위 파일들을 CSS `@import`로 하나의 Tailwind 루트에 묶는다(1~16행).
- 아래 수치는 그 파일에서 읽은 값이다. 실제 렌더링 측정은 각 자식이 한다.

## Buzz clone 참조 규칙 (모든 자식 공통, 2026-10-26 user)

작업하는 머신에는 사용자가 `block/buzz-app`을 로컬에 clone해 둔다. 모든 자식 feature의 `/feature`·`/design-draft`·`/tdd`·`/implement`·`/refactor`·`/code-review`·`/design-sync`는 이 clone을 정본으로 참조한다.

1. **위치**: `~/code/buzz-app`. 그 경로에 없으면 추측하거나 새로 clone하지 말고 사용자에게 경로를 묻는다.
2. **시작 전 확인**: `git -C ~/code/buzz-app rev-parse HEAD`로 커밋을 확인한다. 이 명령과 3의 `show`는 AGENTS.md Commands에 등록돼 있다(H3 완료). 2026-10-28 확인한 로컬 HEAD는 `ec1b9acc5ff99fac3bcea106935fb0224bb7b51e`이며 기준 커밋을 바꾸지 않는다.
3. **기준 커밋 고정**: HEAD가 기준 커밋과 다르면 작업 트리를 바꾸지 말고 `git -C ~/code/buzz-app show c40dfdf4:<경로>`로 기준 커밋의 파일을 읽는다. 새 upstream을 따라가려면 사용자에게 확인한 뒤 이 문서의 기준 커밋과 문서의 출처 기록을 함께 바꾼다.
4. **기억이나 웹으로 대신하지 않는다**: 값, 클래스 이름, 마크업 골격, 규칙 문장은 clone의 파일을 열어 확인한 것만 쓴다. 이 문서의 수치도 요약이므로, 구현할 때는 원본 파일에서 다시 읽는다.
5. **clone은 읽기 전용**이다. 설치(`pnpm install`), 빌드, 실행, 수정을 하지 않는다.
6. **출처 기록**: 참고한 값과 규칙의 원본 경로와 기준 커밋은 자식 feature 문서와 DESIGN.md에 남긴다. 코드에는 남기지 않는다('레퍼런스로 쓰는 방법').

## 레퍼런스로 쓰는 방법 (모든 자식 공통, 2026-10-26 user)

- Buzz 파일은 옮기지 않는다. clone에서 값(색, 크기, 시간)과 규칙(구성, 상태, 위계)을 읽고 doan CSS와 TSX를 새로 쓴다. 값이 같아지는 것은 목표이고, 코드 구조와 문장까지 베끼지는 않는다.
- 코드에는 Buzz 출처 주석, 라이선스 사본, `buzz` 이름을 두지 않는다. 그래서 패키징 변경도 없다.
- Buzz를 참고했다는 사실과 기준 커밋은 AGENTS.md 레퍼런스 규칙에 따라 DESIGN.md 'Design system'의 Reference에 적는다.
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
| 타입 | 역할 단위(크기+행간+자간+굵기). Regular 400은 읽기·폼 라벨, Medium 500은 동작·구조. caption 12/16, body 14/20, label 16/24(500), body-lg 20/28, 제목류 행간 1.1 | Geist 로컬 번들과 시스템 대체 스택을 쓴다(buzz-shell 완료). 고정폭 역할은 가져오지 않는다. 구현된 타입 값은 DESIGN을 따른다 | buzz-ds |
| 모서리 | 12/16/20/24/28px(`chip/row/control/container/panel`), 원·캡슐·알약은 별도. 중첩 모서리는 `max(0, 바깥 radius − inset)`, inset에 패딩과 바깥 테두리 포함, 단계로 반올림하지 않는다 | 없음 | buzz-ds |
| 포커스 | Buzz 포커스 링 레시피 (DESIGN.md "Focus appearance") | Buzz는 JS 훅(`useKeyboardFocusVisibility.ts`)이 붙이는 `html[data-keyboard-navigation]` 아래에서만 링을 그린다. doan은 `:focus-visible`로 쓰고 훅은 만들지 않는다. 핀 링 등 doan 기존 링은 밝은 배경에 맞춰 다시 정한다 | buzz-ds |
| 상태 | pressed는 위치 대신 채움만 바꾼다, 선택은 hover와 별개로 남는다, disabled는 강조 단계로 쓰지 않는다 | buzz-ds가 불투명도 일괄 감쇠를 disabled 역할로 교체했다 | buzz-ds |
| 모션 | fast 120ms, state 150ms, panel-enter 180ms, settle 220ms. 정보 없는 애니메이션은 넣지 않는다. 오버레이·다이얼로그 모션은 Base UI의 `data-starting-style`/`data-ending-style`과 `@starting-style`에 건다(overlays.css:78-117) | doan은 Radix `data-state="open|closed"`(퇴장은 keyframes, `animationend`)와 네이티브 `<dialog>[open]`(`transition-behavior: allow-discrete`)에 건다. `prefers-reduced-motion`이면 이동을 없앤다(doan 기존 규칙 유지) | buzz-ds |
| 밀도 | 패널 패딩 24px, 컨트롤 inset 16px, 그룹 간격 32px. 얇은 네이티브 스크롤바 `scrollbar-width: thin` + `scrollbar-thumb-quiet`(scrollbars.css) | 구현된 `.doan-scroll` 사용(Radix ScrollArea 금지 결정과 일치) | buzz-ds (토큰), 각 화면 자식 (적용) |
| 툴팁 | 거의 검정인 prominent 캡슐: `text-caption`, 패딩 4/8px, `--affordance-prominent` 채움, 블러 등장 모션 (overlays.css:393-410, DESIGN.md:1269-1272) | 2026-10-25 공유 툴팁 패딩 12/6px 결정을 대체한다(본문 반영) | buzz-ds |
| 플로팅 표면 | `floating-surface`: Menu·Select·Popover·PreviewCard 전용. 90% 불투명 배경, 블러, 24px 모서리, 투명 1px 테두리, 라이트는 윤곽+접촉+주변 그림자. 목록 inset 4px, 행 패딩 8/12px, 안쪽 모서리는 파생값. 짧은 액션 메뉴는 compact(16px 모서리, inset 2px) (materials.css:67, DESIGN.md:558) | Radix DropdownMenu·Popover와 doan 메뉴들에 적용 | buzz-ds |
| 다이얼로그 | compact 25rem / standard 40 / wide 55 / expanded 72rem, 안쪽 패딩 2rem(뷰포트 30rem 이하 1rem), 상단 8rem, 불투명 `surface-popover`, 28px 모서리. 제목+설명이 헤더, Close는 옆, 액션은 Cancel → 완료 순서. 등장 0.75rem 상승·220ms·`easing-enter`, 퇴장 0.25rem·120ms (overlays.css) | 공용 틀은 buzz-ds, 화면 하나만 여는 다이얼로그 내용은 그 화면 자식. 일반 다이얼로그 포커스·닫기 계약은 유지하며, 필수 온보딩의 예외는 자식 설계를 따른다. 모달 scrim은 구현된 `--bg-scrim` 역할을 사용한다 | buzz-ds, 각 화면 자식 |
| 패널 | 사이드바 `Panel`과 메인 `Panel joined`가 `space-panel-gap`(8px)으로 떨어져 떠 있다. 불투명 `surface-panel`, 모서리 `radius-container`(24px), `shadow-panel`(1px 윤곽 6% + 작은 그림자 두 겹). companion 패널은 메인 `Panel joined` 안에 도킹한 열이고 `border-inline-start: 1px solid var(--border-standard)`로만 나뉜다(AppShell.tsx:477-478, `features/panels/Panels.module.css` `.dock`) | 공용 doan-panel은 buzz-ds, 구현된 Shell/LNB는 별도 불투명 Panel 없이 native 반투명 재질이다. 흰 본문과 오른쪽 패널 최종 표시 정책은 담당 자식/현재 DESIGN을 따른다 | buzz-ds, buzz-shell |
| 셸 배경 | `bg-app` 단색 + 24px 간격 `texture-dots` 점 격자. 점 색은 `bg-app`에서 파생(라이트는 94% + 검정). 셸 패널과 내비게이션에는 glass를 쓰지 않는다 (DESIGN.md "Surface and depth") | doan은 점 격자를 쓰지 않고 native sidebar vibrancy를 사용한다(buzz-shell 완료). reduced-transparency는 불투명 대체 배경이다 | buzz-ds (토큰), buzz-shell |
| 앱 헤더 | 헤더 높이 `--size-topbar` 3.5rem = 56px(globals.css:195), macOS 신호등 (24, 30)(src-tauri/tauri.conf.json:21-24), 빈 헤더 배경만 드래그. 아이콘 버튼은 32px 상자·16px 아이콘·10px 모서리의 고스트, hover는 반투명 채움, pressed는 조금 더 진하게 (shell-design.md "Desktop chrome") | Electron `titleBarStyle: "hiddenInset"` + `trafficLightPosition`으로 같은 위치를 만들고 실측한다. 2026-10-22 Window 결정을 대체한다(본문 반영) | buzz-ds (`IconButton`), buzz-shell |
| 사이드바 | `SidebarNavigation`: `text-navigation` 라벨, body-sm Regular, 28px 행, 블록 패딩 2px, 앞 8px/뒤 6px, 아이콘 간격 6px, 행 간격 2px, 그룹 간격 16px, 섹션 제목·접기 화살표는 `text-subtle`, 선택은 `surface-sidebar-selected` + `text-sidebar-selected`, hover는 `affordance-sidebar-hover` | 선택/hover는 무채색 backdrop 역할이다. 프로젝트→캔버스 구조·프로젝트/워크트리 메뉴·프레임 트리 제거는 buzz-shell의 확정 구현을 따른다 | buzz-ds (토큰), buzz-shell |
| 온보딩 표면 | [DESIGN](../../DESIGN.md)·`.doan/canvases/buzz-onboarding.html` | 자체 doan 워드마크·Welcome CSS 그라디언트, 나머지 native 재질 근사 | buzz-onboarding |

## 가져오지 않는 Buzz 동작 (공통 결정 6)

Buzz 문서에 있지만 doan 동작을 바꾸므로 가져오지 않는다.

- 타이틀바 클릭으로 다이얼로그 닫기, 4px 드래그 임계값(shell-design.md:186-194)
- 타이틀바 더블클릭이 시스템 설정을 따르는 동작
- Settings를 작업 공간 위 모달로 여는 구성(shell-design.md:14, 73). doan Settings는 모달이 아니라 AppShell 페이지가 된다(2026-10-30 user, `buzz-settings` 계획. 그 전까지는 별도 창)
- 키보드 모달리티 속성(`data-keyboard-navigation`)과 그 훅
- hover로만 드러나는 행 액션(DESIGN.md:873)
- 헤더 캡슐 탭의 화살표 키 이동
- 사용자 액센트·Vibe 선택(Chillin'/Buzzin')

## 드래그 영역 (모든 자식 공통)

Electron의 `-webkit-app-region`은 DOM 쌓임 순서와 따로 hit-test된다. 그래서 헤더 띠 위에 그려지는 모든 상호작용 요소(헤더 버튼, Radix 메뉴·툴팁·팝오버, 헤더와 겹치는 `<dialog>`와 backdrop, 온보딩 헤더의 상호작용 요소)에 `no-drag`를 건다. 현재 Shell 캡슐·검색·메뉴와 공용 오버레이에 no-drag가 구현됐다. 후속 자식도 변경된 헤더 겹침 영역의 클릭을 짧은 실제 앱 probe로 확인한다. 과거 `.top button`만 있다는 설명은 더 이상 현재 상태가 아니다.

## 자식 진행 규칙

1. **시작**: clone 확인(규칙 2·3) → 이전 자식이 main에 머지됐으면 부모 [tasks.md](./tasks.md)의 그 줄을 체크하고 `docs(feature): buzz-restyle check <slug>`로 따로 커밋 → `/feature <slug>` → 아래 조사 메모 중 해당 메모를 자식 `design.md`로 **옮기고**(부모에서는 지운다), 그 이동도 같은 체크 커밋에 넣는다.
2. **초안**: 화면 자식은 `/design-draft`로 그 화면의 Buzz 스타일 초안을 새 파일(`.doan/canvases/buzz-<화면>.html`)로 그린다. 기존 초안은 고치지 않는다.
3. **구현과 대조**: 구현 뒤 `/design-sync`로 새 초안과 맞춘다. AGENTS.md와 design-draft/design-sync에 리디자인 예외가 이미 반영됐다(H2 완료). 새 초안은 해당 자식이 main에 머지될 때까지 정본이다. buzz-onboarding은 사용자가 디자인 승인·검증을 feature-review보다 먼저 진행하도록 지정했다.
4. **값 동기화**: 자식은 자기 변경이 영향을 주는 DESIGN.md 값을 갱신하고 해당 상태만 실제 앱에서 측정한다(`buzz-shell`은 특히 모든 화면에 영향). 자기 담당 DESIGN.md 절의 "buzz-ds 이전" 표시를 지우고 다시 측정한다.
5. **끝**: `node .agents/skills/verify/scripts/verify.mjs`와 변경 범위의 짧은 실제 앱 검증 통과, 결론 승격, 자식 디렉터리 삭제, PR. 부모 디렉터리는 건드리지 않는다.
   - 검증 정책 갱신(2026-10-27 user): 기존 화면별 e2e와 전체 실행 게이트를 제거했다. 격리 실행 기반만 유지하며, 새 e2e 시나리오는 앱 완성 후 당시 구조에 맞춰 작성한다. 이전 comments-ui 전체 실행 예외는 폐기됐다.

## DESIGN.md 절과 담당

"buzz-ds 이전" 표시는 아래 담당 자식이 지운다. 한 절을 두 자식이 나누면 나중 자식이 지운다.

| DESIGN.md 절 | 담당 |
|---|---|
| App shell — initial app-ui implementation (2026-10-22) | buzz-shell |
| Canvas area and right panel | buzz-canvas에서 완료(측정값을 바꾸고 "buzz-ds 이전" 표시 삭제) |
| Select and inspect (2026-10-23) | 캔버스 오버레이 부분은 buzz-canvas에서 완료, 인스펙터 부분과 표시 삭제는 buzz-inspector |
| Comments (2026-10-23) + comments-readability update | buzz-canvas-conversation (코멘트 UI를 걷어낼 때 절을 정리한다) |
| Onboarding (2026-10-24) + app-setup update | buzz-onboarding |
| Projects home (2026-10-25) + Cfix review round | buzz-home |
| Design navigation (2026-10-25) + Final review follow-up | 트리/LNB는 buzz-shell에서 완료, Overview 본문과 표시 삭제는 buzz-project에서 완료(새 'Project Overview' 절), Quick Open buzz-search |
| Settings and Home setup (2026-10-25) | Settings buzz-settings, Home 설정 부분 buzz-home, 표시 삭제 buzz-settings |
| UX audit recovery update (2026-10-25) | buzz-ds (툴팁·포커스 등 공용 수정) |
| Revision continuity (2026-10-26) | buzz-canvas-conversation (변경 표시는 buzz-canvas가 없앴다) |
| Comments Review (2026-10-26) | buzz-canvas-conversation (같음) |
| Hand off dialog (2026-10-26) | buzz-canvas-conversation (같음) |
| Feedback panel (2026-10-26) | buzz-project에서 완료(절 삭제, ID 변경 알림 행은 Comments 절로 옮김) |

## 자식 feature 조사 메모

자식을 시작할 때 해당 메모를 자식 `design.md`로 옮기고 여기서 지운다.

### 인계 완료한 조사

- AppShell: 구현·main 병합 완료(PR #30, `c625057`). 과거 헤더 배치·Home 포함 여부 질문과 점 격자/불투명 LNB 제안은 다시 적용하지 않는다. [DESIGN의 최종 완료 기록](../../DESIGN.md#app-shell)을 따른다.
- 온보딩: Buzz 원본 `OnboardingScreen.tsx`·`IdentitySetup.module.css` 확인 근거와 채택/조정 내용은 buzz-onboarding이 [DESIGN](../../DESIGN.md)에 남겼다. 기존 네 단계·Close/Escape 유지 제안은 새 필수 설정 흐름이 대체한다.
- 캔버스 영역: buzz-canvas가 보드를 캔버스 패널(흰 헤더 + 회색 보드) 안에 두기로 정했고, 무채색 선택·hover 표시를 어두운·밝은·violet 픽스처에서 확인했으며, iframe `color-scheme`을 따로 확인했다. 결과는 [DESIGN 'Canvas area and right panel'](../../DESIGN.md)에 있다. 요소 피커의 선택 모드 표시는 buzz-canvas-conversation 몫이다.

## 금지 표현 (모든 자식 공통, 2026-10-26 user)

- 왼쪽(시작 쪽) 테두리에 색을 칠하거나 두껍게 그어 메시지·안내·카드·행을 강조하지 않는다. 오류는 아이콘과 `text-danger` 글자 또는 상태 블록으로, 기본 안내는 `surface-inset` 채움이다. 승인된 온보딩 예외는 흰 elevation notice·진한 텍스트와 동색 아이콘이며 기존 프리미티브를 재사용한다(2026-10-28, 아직 구현 전). 패널 사이 1px 무채색 구분선은 해당하지 않는다.

## 공통 함정 (POSTMORTEM)

- **2026-10-25 — Production CSS extraction concealed missing development styles**: JS CSS import는 개발 렌더러에서 CSP에 막히고 프로덕션 번들에서는 가려졌다. 개발과 프로덕션 모두에서 대표 자식 요소의 computed style을 확인한다. 같은 항목의 예방 문장: 렌더러 외형을 바꿀 때는 iframe 미디어 선호를 computed `color-scheme`과 따로 확인한다.
- **projects-home checklist** (`overflow: hidden` + `max-height`): 정적 초안의 overflow를 그대로 복사해 네이티브 스크롤을 덮었다. Buzz를 보고 CSS를 쓸 때도 bounded 목록은 넘칠 만큼의 데이터와 실제 입력으로 스크롤 도달을 확인한다.
- **2026-10-24 — 모달 뒤 포커스**: 다이얼로그 마크업을 감싸는 래퍼를 바꿀 때 `showModal`·포커스 복귀 순서를 건드리지 않는다.
- **cascade layer**: 대체한 doan 규칙이 layer 밖에 남아 있으면 Buzz 규칙을 조용히 이긴다('CSS를 싣는 방법').

## 도니 시안 구현 인계

도니를 구현하는 워커는 [buzz-mascot 시안](../../../.doan/canvases/doan-mascot.html)과
[에셋·레이아웃 인계](../../../.doan/assets/doany/README.md)를 함께 읽는다. 아직 앱에는 적용하지 않았다.
단순히 기존 화면 위에 마스코트를 추가하는 변경이 아니라, 본문 배치도 바꾼다.

- 홈: ContentShell 본문 가용 높이 기준으로 도니·인사·입력창·추천 묶음을 중앙 정렬한 뒤 위로 64px 보정한다. 실제 도니는 약 64px, 모션 영역은 114px이다.
- Welcome: 창 크롬을 제외한 가용 높이 기준으로 도니·Doan·소개·Get started 묶음을 중앙 정렬한 뒤 위로 72px 보정한다. 실제 도니는 약 80px, 모션 영역은 142.5px이다. 버튼은 묶음 안에 둔다.
- 기존 152px 상단 여백이나 고정 `margin-top`으로 배치하지 않는다. 먼저 높이 기준 중앙 정렬을 하고 음수 보정을 적용한다. 도니는 일반 흐름에서 공간을 차지한다.
- 시안은 `min-height: 100%`, 세로 flex 중앙 정렬, 위 32px·아래 `32px + 보정량 × 2` padding으로 구현한다. 홈 아래 padding은 160px, Welcome은 176px이다. 낮은 창에서는 위를 자르지 않고 스크롤한다.
- 검증: 여러 본문 높이에서 묶음 중심과 보정량을 측정하고, 낮은 창에서 전체 콘텐츠·CTA 접근과 점프 시 베레모 잘림을 확인한다. 앱 구현 뒤 PRODUCT·ARCHITECTURE·DESIGN에 실제 결과를 반영한다.
