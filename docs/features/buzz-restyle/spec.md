# buzz-restyle — spec (부모)

doan 앱의 시각 언어를 Block의 Buzz(`block/buzz-app`, Apache-2.0)로 바꾸는 작업의 부모 feature다(2026-10-26 user). 공통 결정, 자식 feature 정의, 공용 조사 내용을 담고, 모든 화면 리디자인이 끝날 때까지 허브로 남는다. 구현 task는 각 자식 feature 문서에 있다. 첫 자식은 디자인 시스템을 까는 `buzz-ds`다.

## 사용자

- **사람(앱 사용자)**: 모든 화면을 Buzz의 시각 언어로 본다.
- **에이전트**: 직접 얻는 것은 없다. 다만 `design/` 초안 10개가 `app/src/renderer/tokens.css`를 링크하고 `.doan/config.json`의 `tokenCss`도 이 파일을 가리키므로, 초안의 겉모습과 `doan check` 결과가 영향을 받는다.

## 문제

- 2026-10-22 app-ui 결정(PRODUCT §7)에 따라 앱은 다크 전용, 오렌지 액센트 하나, 시스템 sans 하나로 칠해져 있고, 레퍼런스는 Sorcerer다.
- 사용자는 이 시각 언어를 Buzz로 "copy & paste 수준"으로 바꾸고 싶어 한다. 떠 있는 패널, 패널을 나누는 방식, 앱 헤더, 앱 사이드바, 곡률, 폰트를 다루는 방식, AppShell 골격, 온보딩 표면까지 하나하나 전부 가져오는 것이 요구다(2026-10-26 user).
- 지금 토큰(`tokens.css`, 변수 25개)과 스타일(`styles.css` 611줄)은 화면 규칙과 공용 규칙이 섞여 있어서, 화면별 작업이 기댈 공용 기반이 없다. 그래서 디자인 시스템(`buzz-ds`)을 먼저 깐다.

## 공통 결정 (2026-10-26 user)

모든 자식 feature가 따른다.

1. 테마는 **라이트 단일**이다. 다크 전용 결정을 대체한다.
2. 주요 버튼은 **무채색**이다. 오렌지는 **선택 상태와 코멘트 핀 전용 액센트**로만 남는다.
3. 폰트는 **SF Pro, `font-sans` 하나**다. Inter와 고정폭 폰트는 쓰지 않는다. Buzz 타입 역할의 크기·행간·자간·굵기 조합은 그대로 가져온다.
4. UI 스택은 **Radix(shadcn) 그대로**다. Base UI는 들이지 않고, 스타일만 Buzz로 덮어씌운다.
5. Buzz 디자인 언어를 **copy & paste 수준**으로 가져온다. 조정은 [design.md](./design.md) 표의 '조정' 열에 적힌 것뿐이다.
6. 기능과 정보 구조는 바꾸지 않는다. 무엇이 어디에 있고 무엇을 누르면 어떻게 되는지는 그대로이고, 바뀌는 것은 겉모습과 그것을 위한 마크업 래퍼뿐이다.
7. Buzz 브랜드 자산(워드마크, 로고, 셰이더 아트워크)은 쓰지 않는다. Apache-2.0 §6은 상표 사용권을 주지 않는다.
8. 구현할 때는 **로컬 Buzz clone을 항상 참조**한다. 위치, 기준 커밋, 읽기 전용 규칙은 [design.md](./design.md)의 'Buzz clone 참조 규칙'을 따른다.

## 자식 feature

첫 자식 `buzz-ds`가 디자인 시스템을 깔고, 나머지는 화면(사용자가 한 번에 보고 다루는 단위)으로 나눴다. 순서대로 하나씩 진행한다. 각 자식은 차례가 오면 `/feature <slug>`로 spec·design·tasks를 만들고, 끝나면 자기 결론을 PRODUCT·ARCHITECTURE·DESIGN.md에 승격한 뒤 자기 디렉터리를 지운다.

| # | slug | 화면 | 범위 (지금 코드) | 선행 |
|---|---|---|---|---|
| 0 | `buzz-ds` | 디자인 시스템 | Buzz CSS 복사와 출처 표기, 라이트 토큰·역할, 타입·모서리·재질·모션, shadcn 테마 연결, 공용 컴포넌트 스타일(버튼, `IconButton`, `Panel`, 툴팁·메뉴·팝오버, 다이얼로그 틀, 토스트, 포커스, disabled, 스크롤바), 대비·변수 검사, DESIGN.md 디자인 시스템 절. 문서: [`../buzz-ds/`](../buzz-ds/spec.md) | 없음 |
| 1 | `buzz-shell` | 앱 셸 | Buzz `AppShell` 골격 이식: 점 격자 셸, 헤더(신호등·드래그 영역·아이콘 버튼·브레드크럼 자리), 사이드바 `Panel`, 메인 `Panel joined`, 오른쪽 `Panel`의 틀, 창 옵션(`App.tsx` 셸 마크업, main `BrowserWindow`) | buzz-ds |
| 2 | `buzz-onboarding` | 온보딩 | Buzz 첫 실행 표면을 온보딩 위저드에(`Onboarding.tsx`, `FirstPrompt.tsx`, 위저드 안 연결 행). doan 워드마크와 배경 자산 결정 | buzz-ds |
| 3 | `buzz-home` | 프로젝트 홈 | 프로젝트 카드 목록, 워크트리 행, 행 메뉴, 빈 상태, 드롭 오버레이, Add Projects·Project Setup 다이얼로그(`Home.tsx`, `AddProjectsDialog.tsx`, `ProjectSetupDialog.tsx`, `DropOverlay.tsx`) | buzz-shell |
| 4 | `buzz-search` | 검색 | Quick Open(Cmd+K) 다이얼로그, 입력, 결과 행(`QuickOpenDialog.tsx`) | buzz-shell |
| 5 | `buzz-project` | 캔버스 목록 | 사이드바 캔버스 트리(`SidebarNavigation` 수치), Overview 카드·썸네일·빈 상태(`Sidebar.tsx`, `ProjectOverview.tsx`) | buzz-shell |
| 6 | `buzz-canvas` | 캔버스 | 캔버스 영역과 보드, 줌·프레임 컨트롤, 오버레이 표시(선택·hover·치수), 프레임 하이라이트. 보드를 `Panel` 안에 둘지 결정 | buzz-shell |
| 7 | `buzz-inspector` | 인스펙터 | 오른쪽 패널의 Inspector(스타일·토큰 목록, 섹션, 값 행), 오른쪽 패널 탭(`RightPanel.tsx`) | buzz-shell |
| 8 | `buzz-comment` | 코멘트 | Comments 패널(카드, 작성·편집, 범위·상태 행), 코멘트 핀, Review bar, Feedback 패널, Hand Off 다이얼로그(`CommentsPanel.tsx`, `ReviewBar.tsx`, `FeedbackPanel.tsx`, `HandOffDialog.tsx`) | buzz-canvas, buzz-inspector |
| 9 | `buzz-settings` | 설정 창 | 별도 Settings 창(`settings.html`, `settingsWindow.tsx`, `settingsProjects.tsx`, `settings.css`, `connectionRows.css`)을 Buzz Settings 구성(48rem 열, `SettingsGroup`, `PreferenceRow`)으로 | buzz-ds |

나눈 기준:
- 사용자가 예로 든 `buzz-onboarding`, `buzz-home`, `buzz-search`처럼 화면 하나를 단위로 했다.
- 디자인 시스템은 모든 화면이 기대므로 맨 처음이다.
- 셸은 다른 화면이 모두 그 안에 들어가므로 먼저 한다. 온보딩과 설정 창은 셸 밖이라 buzz-ds만 있으면 된다.
- 코멘트는 캔버스 위 핀과 오른쪽 패널을 함께 쓰므로 캔버스와 인스펙터 다음에 한다.
- 다이얼로그와 토스트의 공용 스타일은 buzz-ds가 만들고, 각 다이얼로그의 내용은 그 다이얼로그를 여는 화면의 자식이 맡는다.

## 완료 조건

- `buzz-ds`와 9개 화면 자식 feature가 모두 main에 들어가고 각자 디렉터리를 지웠다.
- PRODUCT §7에 공통 결정이 기록되고, 2026-10-22 테마 결정과 Sorcerer 레퍼런스가 대체되었다고 적혔다(`buzz-ds`가 기록).
- `docs/DESIGN.md`에 "buzz-ds 이전" 표시가 남아 있지 않다.
- 이 디렉터리(`docs/features/buzz-restyle/`)를 지웠다.

## 비목표

- 다크 모드, 시스템 테마 따라가기, 사용자 액센트 선택(Buzz의 Chillin'/Buzzin').
- Base UI 도입, Buzz 컴포넌트 TSX의 동작 이식.
- Inter·JetBrains Mono 번들, 고정폭 역할.
- Buzz에만 있고 doan에 대응하는 화면이 없는 요소(glass 버튼, 아바타 모양, 메시지 버블, 커뮤니티 선택, 프로필, 페이지 탭, 생성 메뉴).
- 캔버스 iframe 안의 렌더링.
- 앱 아이콘.
