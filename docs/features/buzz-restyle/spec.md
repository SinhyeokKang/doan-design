# buzz-restyle — spec (부모)

doan 앱의 시각 언어를 Block의 Buzz(`block/buzz-app`, Apache-2.0)로 바꾸는 작업의 부모 feature다(2026-10-26 user). 공통 결정, 자식 feature 정의, 공용 조사 내용을 담고, 모든 화면 리디자인이 끝날 때까지 허브로 남는다. 구현 task는 각 자식 feature 문서에 있다. 첫 자식은 디자인 시스템을 까는 `buzz-ds`다.

부모는 `/ship`이나 `/orchestrate`로 진행하지 않는다. 부모 디렉터리는 [tasks.md](./tasks.md)의 마지막 task만 지우고, 자식의 진행은 부모 디렉터리를 지우지 않는다.

## 사용자

- **사람(앱 사용자)**: 모든 화면을 Buzz의 시각 언어로 본다.
- **에이전트**: 직접 얻는 것은 없다. 다만 `design/` 초안 12개가 `app/src/renderer/tokens.css`를 링크하고 `.doan/config.json`의 `tokenCss`도 이 파일을 가리키므로, 초안의 겉모습과 `doan check` 결과가 영향을 받는다(`agent-handoff`, `app-setup`, `app-shell`, `comments-readability`, `comments-ui`, `design-nav`, `onboard`, `project-feedback`, `projects-home`, `revision-continuity`, `revision-recheck`, `select-inspect`).

## 문제

- 2026-10-22 app-ui 결정(PRODUCT §7)에 따라 앱은 다크 전용, 오렌지 액센트 하나, 시스템 sans 하나로 칠해져 있고, 레퍼런스는 Sorcerer다.
- 사용자는 이 시각 언어를 Buzz로 "copy & paste 수준"으로 바꾸고 싶어 한다. 떠 있는 패널, 패널을 나누는 방식, 앱 헤더, 앱 사이드바, 곡률, 폰트를 다루는 방식, AppShell 골격, 온보딩 표면까지 하나하나 전부 가져오는 것이 요구다(2026-10-26 user).
- 지금 토큰(`tokens.css`, 변수 25개)과 스타일(`styles.css` 611줄)은 화면 규칙과 공용 규칙이 섞여 있어서(2026-10-26 기준), 화면별 작업이 기댈 공용 기반이 없다. 그래서 디자인 시스템(`buzz-ds`)을 먼저 깐다.

## 공통 결정 (2026-10-26 user, feature-review 반영)

모든 자식 feature가 따른다. `buzz-ds`가 main에 들어간 뒤로는 PRODUCT §7이 정본이고, 이 목록은 요약이다.

1. **테마**는 라이트 단일이다. 다크 전용 결정을 대체한다.
2. **색**: 주요 버튼은 무채색이다. 액센트는 **doan 고유 violet 램프**를 쓰고(9단계 `#973be1`, 흰 글자. 12단계와 contrast·ink·pressed·link 쌍은 레퍼런스 iris 램프의 단계별 밝기 구조에 violet 색상을 얹어 doan이 만든다. 2026-10-26 user, 처음 결정한 Buzz citrus와 중간에 고른 오렌지를 대체), **Buzz가 액센트를 쓰는 용례에 대응하는 자리에만** 쓴다.
   - 메시지 버블 → 코멘트 카드(연한 액센트 채움, Buzz의 Chillin' 수준)
   - Send 버튼 → 코멘트 제출 버튼(진한 액센트 채움)
   - 사이드바 hover·선택 → 사이드바 트리의 현재 위치 행(`aria-current="location"`, 진한 선택 채움 + 짝 글자)과 트리 행 hover(더 옅은 채움)
   - 코멘트 핀
   - 그 밖(캔버스 선택·hover 표시, 치수, 프레임 하이라이트, 탭, 메뉴, 링크, 카운트, Open 태그, 스피너, 온보딩 단계 등)은 Buzz 무채색 역할이다. 오렌지는 남지 않는다.
3. **폰트**는 시스템 스택(`-apple-system`/`system-ui`, macOS에서 SF Pro로 그려짐, `Apple SD Gothic Neo` 대체 유지) 하나다. Inter와 고정폭 폰트는 쓰지 않는다. Buzz 타입 역할의 크기·행간·자간·굵기 조합은 그대로 가져오되, 자간은 Inter 기준이라 측정으로 확인한다.
4. **UI 스택**은 Radix(shadcn) 그대로다. Base UI와 Buzz의 JS 훅은 들이지 않는다. 새로 쓰는 CSS는 처음부터 Radix `data-state`, 네이티브 `<dialog>[open]`, `:focus-visible`에 건다.
5. Buzz는 **레퍼런스**다(2026-10-26 user). 화면이 Buzz와 같은 값과 규칙으로 보이는 것을 목표로 하되, 코드는 clone에서 값과 규칙을 읽고 doan이 새로 쓴다. Buzz 파일을 옮기지 않고, 코드에 Buzz 출처 주석이나 라이선스 사본을 두지 않는다. Buzz를 참고했다는 사실은 AGENTS.md 레퍼런스 규칙에 따라 PRODUCT §7과 DESIGN.md에만 적는다. Buzz와 다르게 가는 곳은 [design.md](./design.md) 표의 '조정' 열과 '가져오지 않는 Buzz 동작'에 적힌 것뿐이다.
6. **기능과 정보 구조는 바꾸지 않는다.** 무엇을 누르면 어떻게 되는지는 그대로다. 항목을 Buzz 골격의 자리(예: 헤더 세 자리)로 옮기는 것은 각 항목이 같은 동작을 유지할 때만 마크업 변경으로 보고, 배치는 해당 자식에서 사용자에게 확인한다.
7. **Buzz 브랜드 자산**(워드마크, 로고, 셰이더 아트워크, `public/shell-gradient.png`)은 쓰지 않는다. Apache-2.0 §6은 상표 사용권을 주지 않고, 그라디언트 이미지는 NOTICE에 따로 제공된 자산으로 적혀 있다.
8. 구현할 때는 **로컬 Buzz clone을 항상 참조**한다. 위치, 기준 커밋, 읽기 전용 규칙은 [design.md](./design.md)의 'Buzz clone 참조 규칙'을 따른다.
9. **이름**: 새로 쓰는 디자인 시스템 클래스는 `doan-` 접두어를 쓴다(예: `doan-dialog`, `doan-shell-header`). 데이터 속성은 `data-doan-*`가 캔버스 컨벤션(ARCHITECTURE §1의 `data-doan-id` 등) 몫이라 `data-ui-*`를 쓴다.
10. **여러 화면이 함께 쓰는 요소는 `buzz-ds`가 맡는다**: `ProjectSetupDialog`, `AddProjectsDialog`, `FirstPrompt`, `ConnectionRows`(`connectionRows.css`), `.ob-dialog`, `ErrorDetails`, `Toast`, 스피너. 화면 자식은 쓰기만 하고, 바꿔야 하면 사용자에게 확인한다.
11. **대조 방법**: 화면 자식은 `/design-draft`로 그 화면의 Buzz 스타일 초안을 **새 파일**로 먼저 그리고, 구현 뒤 `/design-sync`로 맞춘다. 기존 초안 12개는 이력으로 남기고 고치지 않는다. 단 `doan check`가 정의되지 않은 변수 오류를 내면 안 된다.
12. **중간 상태**: 자식마다 main에 머지하고, 그동안 main은 반쯤 바뀐 화면(라이트 토큰 + 이전 배치)을 허용한다. 마지막 자식이 머지될 때까지 main에서 만든 빌드는 배포하지 않는다.
13. **테마 소스**: main은 `nativeTheme.themeSource = "light"`로 고정한다. 네이티브 스크롤바·폼 컨트롤·메뉴와 캔버스 iframe의 `prefers-color-scheme`이 macOS 외형과 상관없이 light가 된다(2026-10-26 user, `buzz-ds`가 실현).
14. **공통 결정을 바꿀 때**는 진행 전에 사용자에게 확인한다. 승인되면 PRODUCT §7에 날짜와 근거가 있는 줄을 추가하고(대체하는 절도 고친다), 이 목록도 함께 고친다.

## 자식 feature

첫 자식 `buzz-ds`가 디자인 시스템과 공유 요소를 깔고, 나머지는 화면(사용자가 한 번에 보고 다루는 단위)으로 나눴다. 순서는 '선행' 열을 따른다. 선행이 끝난 자식끼리는 표의 번호 순서를 기본으로 하되 바꿔도 된다. 각 자식은 차례가 오면 `/feature <slug>`로 spec·design·tasks를 만들고, 끝나면 자기 결론을 PRODUCT·ARCHITECTURE·DESIGN.md에 승격한 뒤 자기 디렉터리를 지운다.

| # | slug | 화면 | 범위 (지금 코드) | 선행 |
|---|---|---|---|---|
| 0 | `buzz-ds` | 디자인 시스템 | 라이트 토큰·역할(기존 이름은 별칭), 액센트 violet 램프, `themeSource` light, 타입·모서리·재질·모션, shadcn 테마 연결, 공용 컴포넌트 스타일(버튼, `IconButton`, `Panel`, 툴팁, 메뉴·팝오버, 다이얼로그 틀, 토스트, 스피너, 포커스, disabled, 스크롤바), 공통 결정 10의 공유 요소, 모달 scrim 값, 대비·변수 검사, DESIGN.md 디자인 시스템 절. 문서: [`../buzz-ds/`](../buzz-ds/spec.md) | 없음 |
| 1 | `buzz-shell` | 앱 셸 | Buzz `AppShell` 골격 이식: 점 격자 셸, 메인 창의 모든 헤더 띠(작업 공간과 Home의 헤더, 신호등·드래그 영역·아이콘 버튼·항목 자리), 사이드바 `Panel`, 메인 `Panel joined` 안에 도킹한 오른쪽 열의 틀, 창 옵션(`App.tsx` 셸 마크업, main `BrowserWindow`) | buzz-ds |
| 2 | `buzz-onboarding` | 온보딩 | Buzz 첫 실행 표면을 온보딩 위저드에(`Onboarding.tsx`). 위저드는 Close·Escape가 있는 모달 `<dialog>`로 유지한다. doan 워드마크와 배경 결정 | buzz-ds |
| 3 | `buzz-home` | 프로젝트 홈 | 프로젝트 카드 목록, 워크트리 행, 행 메뉴, 빈 상태, 드롭 오버레이, 연결 칩, 설정 배너, "Finish setting up doan" 카드(`Home.tsx`, `DropOverlay.tsx`) | buzz-shell |
| 4 | `buzz-search` | 검색 | Quick Open(Cmd+K) 다이얼로그 내용, 입력, 결과 행(`QuickOpenDialog.tsx`) | buzz-shell |
| 5 | `buzz-project` | 캔버스 목록 | 사이드바 캔버스 트리(`SidebarNavigation` 수치, 색은 buzz-ds 대응표대로), Overview 카드·썸네일·빈 상태(`Sidebar.tsx`, `ProjectOverview.tsx`) | buzz-shell |
| 6 | `buzz-canvas` | 캔버스 | 캔버스 영역과 보드, 줌·프레임 컨트롤, 오버레이 표시(선택·hover·치수), 프레임 하이라이트, 캔버스 로딩·문제 메시지, `.canvas-notice`. 보드를 `Panel` 안에 둘지 결정 | buzz-shell |
| 7 | `buzz-inspector` | 인스펙터 | 오른쪽 열의 Inspector(스타일·토큰 목록, 섹션, 값 행), 오른쪽 열 탭(`RightPanel.tsx`) | buzz-shell |
| 8 | `buzz-comment` | 코멘트 | Comments 패널(액센트 카드, 작성·편집, 액센트 제출 버튼, 범위·상태 행), 코멘트 핀, Review bar·배너·도움말, Feedback 패널, Hand Off 다이얼로그(`CommentsPanel.tsx`, `ReviewBar.tsx`, `FeedbackPanel.tsx`, `HandOffDialog.tsx`) | buzz-canvas, buzz-inspector |
| 9 | `buzz-settings` | 설정 창 | 별도 Settings 창(`settings.html`, `settingsWindow.tsx`, `settingsProjects.tsx`, `SettingsDialog.tsx`, `settings.css`)을 Buzz Settings 구성(48rem 열, `SettingsGroup`, `PreferenceRow`)으로. 창은 별도 창으로 유지한다 | buzz-ds |

나눈 기준:
- 사용자가 예로 든 `buzz-onboarding`, `buzz-home`, `buzz-search`처럼 화면 하나를 단위로 했다.
- 디자인 시스템과 공유 요소는 모든 화면이 기대므로 맨 처음이다.
- 셸은 다른 화면이 모두 그 안에 들어가므로 화면 자식보다 먼저다. 신호등 위치는 창마다 하나라서, Home 헤더 띠까지 셸이 맡는다. 온보딩과 설정 창은 셸 밖이라 `buzz-ds`만 있으면 된다.
- 코멘트는 캔버스 위 핀과 오른쪽 열을 함께 쓰므로 캔버스와 인스펙터 다음이다.
- 다이얼로그와 토스트의 공용 틀은 `buzz-ds`가 만들고, 화면 하나만 여는 다이얼로그의 내용(Quick Open, Hand Off)은 그 화면의 자식이 맡는다.
- 모든 자식은 자기 화면의 빈 상태, 로딩, 오류, 비활성 상태를 목록으로 만들고 각 상태를 바꾼다.

## 완료 조건

- `buzz-ds`와 9개 화면 자식이 모두 main에 들어가고 각자 디렉터리를 지웠다. 확인: main에서 `test ! -d docs/features/<slug>`가 열 개 모두 통과.
- PRODUCT §7에 공통 결정이 기록되고, 다음 결정이 대체되었다고 적혔다.
  - 2026-10-22 테마 결정과 Sorcerer 레퍼런스: `buzz-ds`가 기록
  - 2026-10-25 공유 툴팁 패딩 12/6px: `buzz-ds`가 기록
  - 2026-10-22 Window 결정(상단 40px, 신호등 (12, 14), top bar 전체가 드래그 영역)과 Layout V1의 오른쪽 패널 서술: `buzz-shell`이 기록
- `docs/DESIGN.md`에 "buzz-ds 이전" 표시가 남아 있지 않다. 확인: `grep -n 'buzz-ds 이전' docs/DESIGN.md` 결과 없음.
- 렌더러 CSS에 다크 시절 값이 남아 있지 않다. 확인: `grep -nE 'color-scheme: *dark|#121212|#171717|#1d1d1d|#ecebe4|#f0773a|#3a2117|#1a0b03' app/src/renderer/*.css` 결과 없음.
- 이 디렉터리(`docs/features/buzz-restyle/`)를 지웠다.

## 비목표

- 다크 모드, 시스템 테마 따라가기, 사용자 액센트 선택과 Buzzin' 수준.
- Base UI 도입, Buzz 코드(CSS·TSX)의 복사, Buzz JS 훅.
- Inter·JetBrains Mono 번들, 고정폭 역할.
- Buzz에만 있고 doan에 대응하는 화면이 없는 요소(glass 버튼, 아바타 모양, 커뮤니티 선택, 프로필, 페이지 탭, 생성 메뉴).
- 기존 `design/` 초안 12개의 갱신.
- 캔버스 iframe 안의 렌더링.
- 앱 아이콘.
