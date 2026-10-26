# buzz-restyle — design (부모)

모든 자식 feature가 기대는 레퍼런스, 디자인 언어, 자식별 조사 메모다. 자식의 `design.md`는 이 문서를 인용하고 자기 범위의 세부만 적는다.

## 레퍼런스

- `block/buzz-app` (Apache-2.0), 로컬 clone `~/code/buzz-app`, 커밋 `c40dfdf4` (2026-10-26 확인). Buzz 1.0 베타이며, 0.X는 `block/buzz`에 있다(README).
- 규칙: `src/shared/design-system/DESIGN.md`, `docs/shell-design.md`, `docs/design-system.md`.
- 값: `src/shared/design-system/styles/{tokens,materials,typography,components}.css`, 셸 규칙은 `src/shared/styles/globals.css`의 `shell-*`.
- 아래 수치는 그 파일에서 읽은 값이다. 실제 렌더링 측정은 각 자식 feature가 한다.

## Buzz clone 참조 규칙 (모든 자식 공통, 2026-10-26 user)

작업하는 머신에는 사용자가 `block/buzz-app`을 로컬에 clone해 둔다. 모든 자식 feature의 `/feature`·`/tdd`·`/implement`·`/refactor`·`/code-review`·`/design-sync`는 이 clone을 정본으로 참조한다.

1. **위치**: `~/code/buzz-app`. 그 경로에 없으면 추측하거나 새로 clone하지 말고 사용자에게 경로를 묻는다.
2. **시작 전 확인**: `git -C ~/code/buzz-app rev-parse HEAD`로 커밋을 확인한다. 이 문서의 기준 커밋은 `c40dfdf4`다.
3. **기준 커밋 고정**: HEAD가 기준 커밋과 다르면 작업 트리를 바꾸지 말고 `git -C ~/code/buzz-app show c40dfdf4:<경로>`로 기준 커밋의 파일을 읽는다. 새 upstream을 따라가려면 사용자에게 확인한 뒤 이 문서의 기준 커밋과 출처 주석을 함께 바꾼다.
4. **기억이나 웹으로 대신하지 않는다**: 값, 클래스 이름, 마크업 골격, 규칙 문장은 clone의 파일을 열어 확인한 것만 쓴다. 이 문서의 수치도 요약이므로, 구현할 때는 원본 파일에서 다시 읽는다.
5. **clone은 읽기 전용**이다. 설치(`pnpm install`), 빌드, 실행, 수정을 하지 않는다. Buzz 화면을 직접 측정해야 하면 사용자에게 먼저 묻는다.
6. **출처 기록**: 복사하거나 옮긴 값은 원본 경로(필요하면 줄 번호)와 기준 커밋을 출처 주석이나 DESIGN.md에 남긴다.

## 출처 표기 (모든 자식 공통)

- 복사한 CSS는 `app/src/renderer/buzz/`에 둔다(`buzz-ds`가 만든다). 파일마다 머리에 출처 리포, 커밋, 원본 경로, Apache-2.0, 수정 내용을 영어로 적는다.
- 같은 디렉터리에 Apache-2.0 `LICENSE`와 원본 `NOTICE.md` 사본을 둔다.
- 마크업 골격을 옮긴 TSX에도 원본 경로를 주석으로 남긴다.

## 디자인 언어와 담당

"copy & paste 수준"이 기준이다. 각 항목은 Buzz의 해당 규칙을 그대로 따르고, 바꾸는 곳은 '조정' 열에만 적는다.

| 영역 | Buzz 규칙 (출처) | 조정 | 담당 |
|---|---|---|---|
| 색 | `color / purpose / emphasis / state` 역할 이름. 텍스트는 기본·보조·메타 3단계. 주요 버튼은 무채색 prominent. 액센트는 정해진 자리에만 | 액센트는 오렌지 하나로 고정, 자리는 선택 상태와 코멘트 핀뿐. 상태색(ok/warn/err)은 Buzz 상태 역할 | buzz-ds |
| 타입 | 역할 단위(크기+행간+자간+굵기). 400은 읽기·라벨, 500은 동작·구조. caption 12/16, body 14/20, label 16/24, body-lg 20/28, 제목류 행간 1.1 | 글꼴은 SF Pro(`font-sans` 하나). 고정폭 역할은 가져오지 않는다. 지금의 13px 기본과 10.5~12.5px 소형 텍스트는 Buzz 역할로 옮긴다 | buzz-ds |
| 모서리 | 12/16/20/24/28px(`chip/row/control/container/panel`), 원·캡슐·알약은 별도. 중첩 모서리는 `max(0, 바깥 radius − inset)`, inset에 패딩과 바깥 테두리 포함, 단계로 반올림하지 않는다 | 없음 | buzz-ds |
| 포커스 | Buzz 포커스 링 레시피 (DESIGN.md "Focus appearance") | 없음 | buzz-ds |
| 상태 | pressed는 위치 대신 채움만 바꾼다, 선택은 hover와 별개로 남는다, disabled는 강조 단계로 쓰지 않는다 | 지금 `button:disabled { opacity: .4 }`를 Buzz disabled 역할로 교체 | buzz-ds |
| 모션 | fast 120ms, state 150ms, panel-enter 180ms, settle 220ms. 정보 없는 애니메이션은 넣지 않는다 | 없음 | buzz-ds |
| 밀도 | 패널 패딩 24px, 컨트롤 inset 16px, 그룹 간격 32px. 얇은 네이티브 스크롤바 `scrollbar-width: thin` + `scrollbar-thumb-quiet` | doan의 `.native-scroll` 유지(Radix ScrollArea 금지 결정과 일치) | buzz-ds (토큰), 각 화면 자식 (적용) |
| 플로팅 표면 | `floating-surface`: 90% 불투명 배경, 블러, 24px 모서리, 투명 1px 테두리, 라이트는 윤곽+접촉+주변 그림자. 목록 inset 4px, 행 패딩 8/12px, 안쪽 모서리는 파생값. 짧은 액션 메뉴는 compact(16px 모서리, inset 2px) (materials.css:67) | Radix Tooltip·DropdownMenu·Popover와 doan 메뉴들에 적용 | buzz-ds |
| 다이얼로그 | compact 25rem / standard 40 / wide 55 / expanded 72rem, 인셋 2rem(뷰포트 30rem 이하 1rem), 상단 8rem, 불투명 `surface-popover`, 28px 모서리. 제목+설명이 헤더, Close는 옆, 액션은 Cancel → 완료 순서. 등장 0.75rem 상승·220ms·`easing-enter`, 퇴장 0.25rem·120ms | 공용 스타일은 buzz-ds, 각 다이얼로그 내용은 해당 화면 자식. 포커스·닫기 동작은 그대로 | buzz-ds, 각 화면 자식 |
| 패널 | 사이드바 `Panel`과 메인 `Panel joined`가 `space-panel-gap`(8px)으로 떨어져 떠 있다. 불투명 `surface-panel`, 모서리 `radius-container`(24px), `shadow-panel`(1px 윤곽 6% + 작은 그림자 두 겹). 중첩 패널은 테두리·모서리·그림자 없이 `border-standard` 실선으로 나뉜다 | `Panel` 컴포넌트는 buzz-ds, 배치는 buzz-shell. 오른쪽 패널도 독립 `Panel` | buzz-ds, buzz-shell |
| 셸 배경 | `bg-app` 단색 + 24px 간격 `texture-dots` 점 격자. 점 색은 `bg-app`에서 파생(라이트는 6% 어둡게). 셸 패널과 내비게이션에는 glass를 쓰지 않는다 (DESIGN.md "Surface and depth") | 없음 | buzz-ds (토큰), buzz-shell |
| 앱 헤더 | macOS overlay 타이틀바, 신호등 자리 확보, 헤더 48px, 빈 헤더 배경만 드래그. 아이콘 버튼은 32px 상자·16px 아이콘·10px 모서리의 고스트, hover는 반투명 채움, pressed는 조금 더 진하게 (shell-design.md "Desktop chrome") | Electron `titleBarStyle: "hiddenInset"` + `trafficLightPosition`으로 같은 배치. 지금 결정(상단 40px, 신호등 (12, 14))을 대체 | buzz-ds (`IconButton`), buzz-shell |
| 사이드바 | `SidebarNavigation`: `text-navigation` 라벨, body-sm Regular, 28px 행, 블록 패딩 2px, 앞 8px/뒤 6px, 아이콘 간격 6px, 행 간격 2px, 그룹 간격 16px, 섹션 제목·접기 화살표는 `text-subtle`, 선택은 `surface-sidebar-selected` 채움 | 선택 채움은 오렌지 쌍. 트리 들여쓰기·twisty·카운트는 doan 정보 구조 유지 | buzz-ds (토큰), buzz-project |
| 온보딩 표면 | 아래 '온보딩' | Buzz 워드마크 대신 doan 워드마크 | buzz-onboarding |

## 자식 feature 조사 메모

자식을 시작할 때 해당 메모를 자식 `design.md`로 옮긴다.

### 조사 메모: AppShell (`buzz-shell`용)

사용자 요청: "AppShell 자체를 복붙" (2026-10-26).

Buzz `src/app/shell/AppShell.tsx`(514줄)의 마크업 골격과 `src/shared/styles/globals.css`의 `shell-*` 규칙을 그대로 옮긴다.

- 골격: `shell-background`(전체 창, 점 격자) → `shell-header`(macOS면 `shell-header-mac`, 신호등 자리) → `shell-workspace` → `shell-body` → `shell-content` 안에 `shell-navigation`(사이드바 `Panel as="aside"`)과 `<main>`(메인 `Panel joined`).
- 헤더 구성: 왼쪽 `shell-history`, 가운데 `shell-center-capsule`(`chrome-navigation` 트랙), 오른쪽 `shell-actions`. doan 기존 top bar 항목을 이 세 자리에 옮기고, Buzz에만 있는 항목(커뮤니티 선택, 프로필, 페이지 탭, 생성 메뉴, 검색 결과)은 가져오지 않는다.
- Buzz `Panel`은 "둥근 표면만 소유한다: 채움, 테두리, 그림자, 클리핑"(`Panel.tsx` 주석)이라 동작이 없다. `IconButton`처럼 동작이 있는 컴포넌트는 기존 `<button>`/Radix에 Buzz 클래스만 입힌다.
- 오른쪽 패널(Comments/Inspector)은 Buzz `PanelFrame`의 companion 자리 규칙을 따라 메인 `Panel` 옆 독립 `Panel`로 둔다.
- 가져오지 않는 것: Tauri API(`isTauri`, `macTitleBarDragHandlers`, `WindowControls`), Buzz 서비스 타입, 라우팅·검색·커뮤니티 로직. 창 드래그는 Electron `-webkit-app-region`으로 같은 영역(빈 헤더 배경)에 건다.

### 조사 메모: 온보딩 (`buzz-onboarding`용)

사용자 요청: "Buzz 온보딩 스타일을 우리 온보딩에" (2026-10-26).

Buzz의 첫 실행 화면은 `src/features/identity/OnboardingScreen.tsx` + `IdentitySetup.module.css`다.

- 구성: 셸 대신 창 전체를 덮는 `landing`(배경 `#e7f0ef` + `public/shell-gradient.png`를 창 크기로 늘림) → 3.5rem 높이 드래그 전용 `titlebar` → 최대 40rem `content` 안에 가운데 정렬 `brand`(워드마크 최대 23rem + `text-body-lg` 태그라인)와 아래쪽 최대 27.5rem `actions` 열. 설정 단계 폼은 최대 32rem `setup` 열에 `space-4` 간격.
- doan 온보딩 위저드(PRODUCT §5, 1~4단계, `Onboarding.tsx`)에 이 표면과 열 폭을 입힌다. 단계 구성, 문구, 동작, 포커스 규칙은 바꾸지 않는다.
- Buzz 워드마크는 WebGL 셰이더(`OnboardingWordmark.tsx`, `wordmark.frag`)로 그린 Buzz 브랜드 아트워크라 쓰지 않는다. doan 워드마크와 그라디언트 배경 이미지를 어떻게 할지는 `buzz-onboarding`에서 묻는다.

### 조사 메모: 캔버스 영역 (`buzz-canvas`용)

Buzz는 점 격자를 셸 바닥에만 두고, 읽기 패널은 불투명하게 둔다. doan의 캔버스 보드(`.area`, 지금 `--board-bg` + 16px 점)를 메인 `Panel` 안 불투명 보드로 둘지, 셸 점 격자가 비치는 영역으로 둘지는 `buzz-canvas`에서 묻는다.

## 공통 함정 (POSTMORTEM)

- **2026-10-25 — Production CSS extraction concealed missing development styles**: JS CSS import는 개발 렌더러에서 CSP에 막히고 프로덕션 번들에서는 가려졌다. 스타일시트는 HTML `<link>`로 싣고, 개발과 프로덕션 모두에서 대표 자식 요소의 computed style을 확인한다.
- **projects-home checklist** (`overflow: hidden` + `max-height`): 정적 초안의 overflow를 그대로 복사해 네이티브 스크롤을 덮었다. Buzz CSS를 복사할 때도 bounded 목록은 넘칠 만큼의 데이터와 실제 입력으로 스크롤 도달을 확인한다.
- **2026-10-24 — 모달 뒤 포커스**: 다이얼로그 마크업을 감싸는 래퍼를 바꿀 때 `showModal`·포커스 복귀 순서를 건드리지 않는다.
