# buzz-restyle — spec (부모)

doan 앱의 시각 언어를 Block의 Buzz(`block/buzz-app`, Apache-2.0)로 바꾸는 작업의 부모 feature다(2026-10-26 user). 공통 결정, 자식 feature 정의, 공용 조사 내용을 담고, 모든 화면 리디자인이 끝날 때까지 허브로 남는다. 구현 task는 각 자식 feature 문서에 있다. 2026-10-28 기준 `buzz-ds`와 `buzz-shell`은 main에 병합됐고, `buzz-onboarding`은 디자인 승인·HTML 검증·feature-review를 마쳤다. 별도 기반 기능 `agent-auth`는 2026-10-28 main에 병합됐다(PR #33). 온보딩 구현은 2026-10-28 재검토에서 추가된 선행 조건(초안 보완, PRODUCT 기록, CLI 최소 버전 정책)을 따른다.

부모는 `/ship`이나 `/orchestrate`로 진행하지 않는다. 부모 디렉터리는 [tasks.md](./tasks.md)의 마지막 task만 지우고, 자식의 진행은 부모 디렉터리를 지우지 않는다.

## 사용자

- **사람(앱 사용자)**: 모든 화면을 Buzz의 시각 언어로 본다.
- **에이전트**: 승인된 buzz-onboarding CLI/MCP로 사용자의 setup을 수행할 수 있다(구현 전). 시각 변경과 관련해서는 `.doan/canvases/` 초안들이 `app/src/renderer/tokens.css`를 링크하고 `.doan/config.json`의 `tokenCss`도 이 파일을 가리키므로, 초안의 겉모습과 `doan check` 결과가 영향을 받는다. 현재 기존 이력 12개와 buzz-ds·buzz-shell·buzz-onboarding 초안이 있으며 새 온보딩은 아직 앱 구현이 아니다.

## 출발점과 현재 상태

2026-10-26 시작 시 앱은 다크·오렌지·시스템 sans의 Sorcerer 기반 UI였고, 토큰 25개와 화면/공용 규칙이 섞인 스타일을 사용했다. 사용자는 패널·헤더·사이드바·모서리·폰트·AppShell·온보딩을 Buzz의 시각 언어로 바꾸도록 요청했다. 이는 당시 문제의 기록이며 현재 앱 상태가 아니다.

현재 라이트 역할 토큰·프리미티브와 Geist·네이티브 반투명 AppShell은 구현됐다. 나머지 화면의 본문·동작은 자식별로 바꾼다. 완료 증거와 남은 작업은 [tasks.md](./tasks.md), 구현 값은 [DESIGN](../../DESIGN.md), 온보딩은 2026-10-29 buzz-onboarding으로 구현됐고 결정은 [PRODUCT §5·§7](../../PRODUCT.md), 구조는 [ARCHITECTURE](../../ARCHITECTURE.md)에 있다.

## 공통 결정 (2026-10-26 user, feature-review 반영)

모든 자식 feature가 따른다. `buzz-ds`가 main에 들어간 뒤로는 PRODUCT·ARCHITECTURE·DESIGN 본문이 정본이고, 이 목록은 요약이다.

1. **테마**는 라이트 단일이다. 다크 전용 결정을 대체한다.
2. **색**: 주요 버튼은 무채색이다. 액센트는 **doan 고유 violet 램프**를 쓰고(9단계 `#973be1`, 흰 글자. 12단계와 contrast·ink·pressed·link 쌍은 레퍼런스 iris 램프의 단계별 밝기 구조에 violet 색상을 얹어 doan이 만든다. 2026-10-26 user, 처음 결정한 Buzz citrus와 중간에 고른 오렌지를 대체), 기본적으로 **Buzz가 액센트를 쓰는 용례에 대응하는 자리**에 쓴다. 승인된 doan 예외는 아래 앵커 칩, Welcome 배경, `buzz-home` 홈의 accent 자리다.
   - 메시지 버블 → 대화의 내 메시지(연한 액센트 채움, Buzz의 Chillin' 수준)
   - Send 버튼 → 대화 전송 버튼(진한 액센트 채움)
   - LNB hover·선택은 무채색 음영으로 변경한다(2026-10-27 user, buzz-shell). Accent는 캔버스 우측 미확인 Dot의 시각 표시에 사용하되 상태 판별·저장은 후속이다.
   - 대화 입력창과 메시지의 인라인 앵커 칩(연한 액센트 채움 + 진한 글자, 메신저 멘션처럼). Buzz는 일반 멘션을 무채색으로 두지만 doan의 앵커 칩은 메시지의 핵심 대상이라 액센트를 쓴다(doan 조정, 2026-10-26 user)
   - `buzz-canvas-conversation`이 코멘트를 걷어내기 전까지는 `buzz-ds`가 구현한 코멘트 카드, 코멘트 제출 버튼, 코멘트 핀이 액센트 자리로 남는다(2026-10-26, 대화로 바꾸기 전의 자리)
   - `buzz-onboarding` Welcome 배경은 accent 기반 타원 그라디언트와 alpha grain을 쓴다(2026-10-28 승인, 초안만 완료). 다른 온보딩 단계에는 그라디언트를 쓰지 않는다.
   - 예외: `buzz-home` 홈은 violet 타원 그라디언트를 쓴다(grain 없음). 고른 프리셋 칩·Send·추천 프롬프트 아이콘·드롭 외곽선·LNB 상태 슬롯도 accent 자리다(DESIGN.md 'Home').
   - 그 밖(캔버스 선택·hover 표시, 치수, 프레임 하이라이트, 탭, 메뉴, 링크, 카운트, Open 태그, 스피너, 온보딩 단계 등)은 Buzz 무채색 역할이다. 오렌지는 남지 않는다.
3. **폰트**는 Geist를 로컬 번들로 제공하고 앱 공통 `--type-family`에 적용한다(2026-10-27 user, buzz-shell). 기존 시스템 스택은 대체 글꼴로 유지한다. 이는 Settings 등 모든 공통 폰트 사용처에 적용되는 결정이며 iframe 자체 스타일은 바꾸지 않는다. LNB·헤더는 14/20 400, 프로젝트 이름은 500이다. 다른 역할의 굵기는 승인 없이 일괄 변경하지 않는다.
4. **UI 스택**은 Radix(shadcn) 그대로다. Base UI와 Buzz의 JS 훅은 들이지 않는다. 새로 쓰는 CSS는 처음부터 Radix `data-state`, 네이티브 `<dialog>[open]`, `:focus-visible`에 건다.
5. Buzz는 **레퍼런스**다(2026-10-26 user). 화면이 Buzz와 같은 값과 규칙으로 보이는 것을 목표로 하되, 코드는 clone에서 값과 규칙을 읽고 doan이 새로 쓴다. Buzz 파일을 옮기지 않고, 코드에 Buzz 출처 주석이나 라이선스 사본을 두지 않는다. Buzz를 참고했다는 사실은 AGENTS.md 레퍼런스 규칙에 따라 DESIGN.md에만 적는다. Buzz와 다르게 가는 곳은 [design.md](./design.md) 표의 '조정' 열과 '가져오지 않는 Buzz 동작'에 적힌 것뿐이다.
6. **기존 기능은 보존한다.**  승인된 예외(2026-10-27 user, buzz-shell)는 프로젝트→캔버스 LNB, 프레임 트리 제거, 실행 중 이전·다음 기록, 프로젝트 메뉴의 Overview·워크트리 선택·관리 액션이다. 프로젝트 제거는 등록된 워크트리 전체를 앱 목록에서 제거한다. 추가 승인(2026-10-27~28): 홈은 프로젝트 선택이 가능한 단일 대화 입력창을 buzz-home에서 설계하고, 인증 백엔드는 별도 agent-auth가 맡는다. buzz-onboarding은 필수 에이전트/프로젝트 설정과 CLI/MCP setup을 담당한다. 이 항목들은 계획이며 Shell 완료에 포함되지 않는다. 추가 승인(2026-10-30 user, 계획): 헤더 캡슐 Add Projects / Projects / Settings는 페이지를 오가는 탭이 된다(지금 Projects는 이동 동작이 없는 선택 표시다, PRODUCT §5). 프로젝트 추가는 네이티브 폴더 선택 대신 온보딩 Project 단계를 재사용한 페이지, Settings는 별도 창 대신 LNB 설정 내비게이션과 본문 설정 UI를 가진 AppShell 페이지다(`buzz-add-projects`, `buzz-settings`). 구현 완료 때 PRODUCT §5·§7을 고친다. 보존 예외(2026-10-30 user, buzz-add-projects 구현 완료): Add Projects 페이지는 프로젝트를 하나씩 추가한다. 여러 폴더 선택, 하위 저장소·워크트리 체크리스트, 같은 저장소의 다른 워크트리 제안, 창 전체 폴더 드롭은 없앴다. 폴더 드롭은 'Open a local folder' 카드에만 받는다.
7. **Buzz 브랜드 자산**(워드마크, 로고, 셰이더 아트워크, `public/shell-gradient.png`)은 쓰지 않는다. Apache-2.0 §6은 상표 사용권을 주지 않고, 그라디언트 이미지는 NOTICE에 따로 제공된 자산으로 적혀 있다.
8. 구현할 때는 **로컬 Buzz clone을 항상 참조**한다. 위치, 기준 커밋, 읽기 전용 규칙은 [design.md](./design.md)의 'Buzz clone 참조 규칙'을 따른다.
9. **이름**: 새로 쓰는 디자인 시스템 클래스는 `doan-` 접두어를 쓴다(예: `doan-dialog`, `doan-shell-header`). 데이터 속성은 `data-doan-*`가 캔버스 컨벤션(ARCHITECTURE §1의 `data-doan-id` 등) 몫이라 `data-ui-*`를 쓴다.
10. **여러 화면이 함께 쓰는 요소는 `buzz-ds`가 맡는다**: `ProjectSetupDialog`, `FirstPrompt`, `ConnectionRows`(`connectionRows.css`), `.ob-dialog`, `ErrorDetails`, `Toast`, 스피너. 화면 자식은 쓰기만 하고, 바꿔야 하면 사용자에게 확인한다. 구현된 공통 변경(2026-10-27, buzz-shell): 칩 기본 글자 12px·상하 2px·좌우 6px, 읽기 전용 워크트리 칩의 translucent 변형, 프로젝트 이름 해시 8색 폴백. 추가 승인·미구현(2026-10-28, buzz-onboarding): 공용 lg 버튼 48px, notice 12px/16px·흰 elevation·진한 텍스트/동색 아이콘·로딩 spinner, 온보딩과 ShellSidebar의 연한 썸네일 배경·진한 글자. 기존 프리미티브를 확장하며 별도 복제품을 만들지 않는다. 온보딩 버튼/입력창의 translucent 변형과 본문 전체 panel 래핑은 철회됐다. 추가 승인·구현(2026-10-30, buzz-search): 공용 `.doan-dialog`의 검색 변형 `data-ui-presentation="search"`(패딩 `--space-3`, 모서리 32px, `--surface-panel`, `corner-shape: squircle`, 열린 상태 `gap: 0`). 기존 사용처의 크기와 동작은 그대로다. `AddProjectsDialog`(`SetUpFolderConfirm` 포함)는 buzz-add-projects가 Add Projects 페이지로 대체하며 삭제했다(2026-10-30). 예외·구현(2026-10-31 user, buzz-conversation spec 결정 19): 화면 자식인 buzz-conversation이 공용 텍스트 버튼의 `xs` 크기 변형 `doan-button[data-ui-size="xs"]`(24px, caption, 안쪽 4/8, 아이콘 14px)를 `ds/controls.css`에 더했다. docked 입력창의 에이전트·effort 선택에 쓴다. 함께 구현한 것: 입력창 포커스 보더 `--border-field-focus`와 `--shadow-sm`(Home·docked 입력창 카드만, 다른 텍스트 필드는 그대로), 입력창 도구의 비활성 잉크 수정. 값은 DESIGN.md 'Shared variants'·'Focus'에 있다.
11. **대조 방법**: 화면 자식은 `/design-draft`로 그 화면의 Buzz 스타일 초안을 **새 파일**로 먼저 그리고, 구현 뒤 `/design-sync`로 맞춘다. 기존 초안 12개는 이력으로 남기고 고치지 않는다. 단 `doan check`가 정의되지 않은 변수 오류를 내면 안 된다.
12. **중간 상태**: 자식마다 main에 머지하고, 그동안 main은 반쯤 바뀐 화면(라이트 토큰 + 이전 배치)을 허용한다. 마지막 자식이 머지될 때까지 main에서 만든 빌드는 배포하지 않는다.
13. **테마 소스**: main은 `nativeTheme.themeSource = "light"`로 고정한다. 네이티브 스크롤바·폼 컨트롤·메뉴와 캔버스 iframe의 `prefers-color-scheme`이 macOS 외형과 상관없이 light가 된다(2026-10-26 user, `buzz-ds`가 실현).
14. **공통 결정을 바꿀 때**는 진행 전에 사용자에게 확인한다. 미구현 자식의 승인 사항은 해당 feature와 이 허브에 계획으로 기록하고, 구현 완료 시 PRODUCT·ARCHITECTURE·DESIGN 본문을 현재 상태로 고치고(대체되는 내용은 지우고, 근거는 커밋 메시지에 쓴다), 이 목록도 함께 고친다.

## 자식 feature

첫 자식 `buzz-ds`가 디자인 시스템과 공유 요소를 깔고, 나머지는 화면(사용자가 한 번에 보고 다루는 단위)으로 나눴다. 순서는 '선행' 열을 따른다. 선행이 끝난 자식끼리는 표의 번호 순서를 기본으로 하되 바꿔도 된다. 각 자식은 차례가 오면 `/feature <slug>`로 spec·design·tasks를 만들고, 끝나면 자기 결론을 PRODUCT·ARCHITECTURE·DESIGN.md에 승격한 뒤 자기 디렉터리를 지운다.

| # | slug | 화면 | 범위·상태 | 선행 |
|---|---|---|---|---|
| 0 | `buzz-ds` | 디자인 시스템 | 라이트 토큰·역할(기존 이름은 별칭), 액센트 violet 램프, `themeSource` light, 타입·모서리·재질·모션, shadcn 테마 연결, 공용 컴포넌트 스타일(버튼, `IconButton`, `Panel`, 툴팁, 메뉴·팝오버, 다이얼로그 틀, 토스트, 스피너, 포커스, disabled, 스크롤바), 공통 결정 10의 공유 요소, 모달 scrim 값, 대비·변수 검사, DESIGN.md 디자인 시스템 절. 완료·main 병합: [DESIGN](../../DESIGN.md#design-system) | 없음 |
| 1 | `buzz-shell` | 앱 셸·LNB | 투명·블러 Shell/LNB와 흰 본문, 56px 헤더·이전/다음·Add Projects/Projects/Settings, 검색 진입점, 프로젝트→캔버스 LNB·프로젝트 메뉴·워크트리 선택·Overview 진입, Geist 로컬 제공·공통 칩·썸네일 폴백, 창 옵션. 오른쪽 내용과 최종 표시 정책은 후속 자식 | buzz-ds |
| 2 | `buzz-onboarding` | 온보딩 | Welcome → Agent 로그인 → 로컬/GitHub 프로젝트 → Home. 최소 한 공급자 ready·프로젝트 필수, 기존 Git/gh로 로컬 재사용/clone, CLI/MCP setup을 같은 main 서비스로 제공한다. 미완료 재실행은 Welcome부터 저장된 연결/프로젝트 유지. 2026-10-29 구현·병합: [PRODUCT §5](../../PRODUCT.md) | buzz-ds, buzz-shell, agent-auth |
| 3 | `buzz-home` | 프로젝트 선택 전 홈 | 단일 대화 입력창과 그 안의 프로젝트 선택 UI. 온보딩의 선택 root를 인수하고 agent-auth의 인증된 실행 기반을 사용한다. 상세 화면 설계는 미착수이며 OAuth/토큰을 재구현하지 않는다. LNB 메뉴는 buzz-shell 소유 | buzz-shell, agent-auth |
| 4 | `buzz-search` | 검색 | Quick Open(Cmd+K) 다이얼로그 내용, 입력, 결과 행(`QuickOpenDialog.tsx`) | buzz-shell |
| 5 | `buzz-add-projects` | 프로젝트 추가 페이지 | 헤더 Add Projects(Cmd+O, File > Add Project…)가 네이티브 폴더 선택 대신 AppShell 안의 페이지를 연다. 온보딩 Project 단계(로컬 폴더, GitHub URL 재사용·clone, 설정이 필요한 폴더의 Set up)를 가능한 만큼 재사용한다(2026-10-30 user). 헤더 캡슐 Add Projects / Projects / Settings가 페이지를 오가는 진짜 탭이 되는 첫 자식이다(Add Projects ↔ Projects). 여러 폴더 선택·하위 저장소 체크리스트·폴더 드롭을 어떻게 옮길지는 이 자식의 `/feature`가 정한다. `AddProjectsDialog`(공통 결정 10의 buzz-ds 공유 요소)를 바꾸거나 걷어내는 일을 포함한다 | buzz-shell, buzz-onboarding |
| 6 | `buzz-settings` | 설정 페이지 | 별도 Settings 창(`settings.html`, `settingsWindow.tsx`, `settingsProjects.tsx`, `settings.css`, `preload/settings.ts`)을 AppShell 안의 페이지로 바꾼다(2026-10-30 user). LNB는 ShellSidebar를 그대로 쓰고 카테고리 Agents · Notifications · Connections · About을 보인다. 본문은 Buzz Settings의 카테고리 구성(제목 → 섹션 + `SettingsGroup` + `PreferenceRow`, 48rem 열)만 참고한다. 헤더 Settings 탭과 Settings…(Cmd+,)가 이 페이지를 연다. 알림·새 대화 기본값·About을 새로 더하고, 저장소별 Token CSS·Serve는 프로젝트 메뉴의 Project Settings 다이얼로그로 옮긴다. 확정 초안은 `.doan/canvases/buzz-settings.html`, 세부는 자식 문서에 있다. 2026-10-25 app-setup 'Settings는 별도 창' 결정을 대체한다(구현 완료 때 본문을 현재 규칙으로 고친다) | buzz-ds, buzz-add-projects |
| 7 | `buzz-project` | 프로젝트 Overview | 완료. Overview를 프로젝트 대화 화면으로 바꿨다(2026-10-31 user). 헤더는 프로젝트·브랜치 칩(워크트리가 둘 이상이면 워크트리 선택)·대화 제목 드롭다운, 메인은 `buzz-conversation`의 스레드와 하단 `docked` 입력창, 오른쪽 패널은 현재 대화가 있는 캔버스 목록(캔버스당 현재 대화 하나, 미리보기, 펼치지 않음)이다. 캔버스 대화는 항상 캔버스로 연다. 기존 캔버스 수정으로 승격되면 메인이 새 대화로 초기화되고 이동 알림을 남긴다. FirstPrompt, Feedback 패널, 캔버스 없는 코멘트의 앱 경로를 지웠다(CLI로만 다룸). 현재 규칙은 PRODUCT §5 항목 3 'Project Overview'와 DESIGN 'Project Overview'가 정본이다 | buzz-shell, buzz-conversation |
| 8 | `buzz-canvas` | 캔버스 | 캔버스 영역과 보드, 줌·프레임 컨트롤, 오버레이 표시(선택·hover·치수, 요소 피커가 쓰는 선택 모드), 프레임 하이라이트, 캔버스 로딩·문제 메시지, `.canvas-notice`. 보드를 `Panel` 안에 둘지 결정 | buzz-shell |
| 9 | `buzz-inspector` | 인스펙터 | 오른쪽 패널 Inspector 탭의 내용(스타일·토큰 목록, 섹션, 값 행). 패널의 표시·숨김과 탭 틀은 `buzz-canvas-conversation` | buzz-shell |
| 10 | `buzz-conversation` | 대화 (공용) | 에이전트와의 실시간 대화 UI 중 캔버스에 묶이지 않은 공용 부분(기존 `buzz-comment` 자리, 2026-10-26 user. 2026-10-31 user가 캔버스 전용 부분을 12번으로 나눴다): 대화 스레드 프리미티브(메시지, 권한 요청, 진행·실패 상태, 새 대화 시작), 입력창 공용 프리미티브와 두 타입 — `hero`(Home: 항상 box, 프로젝트 선택·워크트리 트레이·히어로 배치)와 `docked`(Overview·캔버스 대화 패널: 비어 있으면 한 줄 capsule, 줄바꿈·첨부·프리셋 칩이 생기면 box, 텍스트와 칩이 모두 없을 때만 capsule로 돌아감, 에이전트·effort는 카드 아래 줄, 모양 전환에 textarea를 다시 마운트하지 않음). 대화 목록의 재시작 뒤 유지, 캔버스에 묶이지 않은 프로젝트 대화 여러 개, 캔버스별 보관 대화 다시 열기. 홈 대화의 임시 상태줄·LNB 상태 슬롯·프로젝트당 홈 대화 1개 규칙을 다시 정한다. 구현 완료 때 PRODUCT §3 항목 6·§5 항목 1을 고친다. 기반은 [`agent-conversation`](../../PRODUCT.md#agent-conversation-foundation-contract) | agent-conversation, agent-auth, buzz-shell |
| 12 | `buzz-canvas-conversation` | 캔버스 대화 | `buzz-conversation` 프리미티브를 캔버스 오른쪽 패널에 놓는다(2026-10-31 user): 오른쪽 패널의 표시·숨김(요소를 고르거나 대화를 시작하면 열림)과 대화·인스펙터 탭 틀(`RightPanel.tsx`), 캔버스당 현재 대화 하나인 대화 탭, 입력창 옆 요소 피커, 인라인 앵커 칩, 보관한 대화를 여는 캔버스 구석 버튼. Overview 오른쪽 행에서 들어온 캔버스는 그 현재 대화 탭으로 열고, 본 것 규칙을 '대화 패널이 보일 때'로 바꾼다. 프로젝트 대화가 캔버스로 넘어오면 이 패널에서 이어 간다. 캔버스 페이지의 임시 상태줄을 대화 패널로 바꾼다. 앱의 코멘트 화면 제거(Comments 패널, 코멘트 핀, Review bar·배너, Hand Off 다이얼로그. FirstPrompt, Overview의 Feedback 패널, 캔버스 없는 코멘트의 앱 경로는 `buzz-project`가 지웠다). CLI·MCP·스킬·포맷·eval의 코멘트 제거는 별도 feature(2026-10-26 user) | buzz-conversation, buzz-canvas, buzz-inspector |

나눈 기준:
- 사용자가 예로 든 `buzz-onboarding`, `buzz-home`, `buzz-search`처럼 화면 하나를 단위로 했다.
- 순서 변경(2026-10-30 user): `buzz-search` 다음에 `buzz-add-projects`, 그다음 `buzz-settings`를 둔다. 둘 다 별도 창·네이티브 대화상자를 AppShell 페이지로 바꾸고, 헤더 캡슐을 페이지 탭으로 만든다. 프로젝트 추가가 탭 이동을 먼저 깔고 설정이 그 위에 LNB 내비게이션을 더한다. `buzz-project` 이하는 그 뒤로 밀린다.
- 디자인 시스템과 공유 요소는 모든 화면이 기대므로 맨 처음이다.
- 셸은 다른 화면이 모두 그 안에 들어가므로 화면 자식보다 먼저다. 신호등 위치는 창마다 하나라서, Home 헤더 띠까지 셸이 맡는다. 설정 창의 시각 기반은 buzz-ds다. 온보딩은 승인된 AppShell 톤과 agent-auth의 인증/readiness 계약도 선행한다.
- 순서 변경(2026-10-31 user): Overview가 프로젝트 대화 화면이 되므로 대화의 공용 부분(`buzz-conversation`)을 `buzz-project`보다 먼저 한다. 오른쪽 패널과 캔버스 선택 모드를 함께 쓰는 캔버스 전용 부분은 `buzz-canvas-conversation`으로 나눠 캔버스와 인스펙터 다음에 둔다. 기반 feature `agent-conversation`(UI 없음)은 이미 main에 들어갔다. 새 계정 기반 실행은 2026-10-28 main에 병합된 agent-auth를 사용한다.
- 다이얼로그와 토스트의 공용 틀은 `buzz-ds`가 만들고, 화면 하나만 여는 다이얼로그의 내용(Quick Open)은 그 화면의 자식이 맡는다. Hand Off는 `buzz-canvas-conversation`이 코멘트와 함께 걷어낸다.
- 모든 자식은 자기 화면의 빈 상태, 로딩, 오류, 비활성 상태를 목록으로 만들고 각 상태를 바꾼다.

### 대화 UI 상세 (PRODUCT에서 옮김)

- `buzz-canvas-conversation`: 입력창 옆 요소 피커를 켜면 캔버스 요소 선택에 들어가고, Esc로 취소한다. 요소를 고르면 입력창 커서 위치에 인라인 앵커 칩이 들어가고 입력창 포커스가 돌아온다. 캔버스 빈 곳을 누르면 좌표 칩이 들어간다.
- `buzz-canvas-conversation`: 보낸 메시지의 칩을 누르면 그 대상으로 이동해 강조한다. 요소는 `data-doan-id`로 먼저, 다음으로 selector로 찾고, 둘 다 못 찾으면 위치를 쓸 수 없다는 상태를 보인다.
- `buzz-conversation`: busy·오류 응답으로 거절된 입력은 입력창에 남는다. 동시 대화 수 상한은 이 화면이 정한다(기반은 상한을 두지 않는다).
- main은 마지막 자식이 병합될 때까지 반쯤 바뀐 화면을 보일 수 있고, 그 전에는 릴리스하지 않는다.

## 프로젝트 Overview 방향 (2026-10-31 user)

2026-10-28 메모(선택 프로젝트에 묶인 입력창과 추천 프롬프트)를 구체화했다. Home은 프로젝트를 가로지르는 시작 화면(가운데 `hero` 입력창)이고, Overview는 한 프로젝트의 대화를 이어 가는 화면(메인 스레드와 하단 `docked` 입력창)이다. 추천 칩은 입력창을 채우기만 하고 사람이 전송한다. 예: `.doan/ds/`가 없으면 “{SelectedProject} 디자인 시스템을 만들어줘”가 먼저 온다. 범위는 표 7·10·12번이다.

## 별도 기반 기능과 인계

- `agent-conversation`: main 병합 완료(`d6590a6`, PR #28). 대화 backend/preload 기반이며 완료된 대화 UI가 아니다. [PRODUCT 계약](../../PRODUCT.md#agent-conversation-foundation-contract)의 검증 한계를 유지한다.
- `agent-auth`: 2026-10-28 main에 병합됐다. 결론은 [ARCHITECTURE §7](../../ARCHITECTURE.md#agent-authentication)에 있다. Claude Code·Codex·Cursor·Antigravity·GitHub Copilot을 모두 제공하며 플랫폼별 한 계정이다. 온보딩·홈·Canvas 대화는 같은 인증 기반을 소비한다.
- 온보딩 CLI/MCP는 인증·Git 처리를 복제하지 않고 main 서비스를 호출한다. 설치 직후 번들 CLI bootstrap, 브라우저 사용자 승인, 작업 ID/status, 기존 active v1 호환과 신규 socket v2는 [ARCHITECTURE](../../ARCHITECTURE.md)에 승격됐다(buzz-onboarding, 2026-10-29). 코멘트 CLI/MCP 제거와는 별개다.

## 완료 조건

- `buzz-ds`와 11개 화면 자식이 모두 main에 들어가고 각자 디렉터리를 지웠다. 확인: 각 자식의 main 병합·승격·검증 근거와 디렉터리 삭제를 함께 대조한다. 디렉터리가 없다는 사실만으로 미착수 자식을 완료로 보지 않는다.
- 공통 결정이 PRODUCT·ARCHITECTURE·DESIGN 본문에 현재 상태로 적혔고, 대체된 내용은 본문에서 지워졌다.
  - 2026-10-22 테마 결정과 Sorcerer 레퍼런스: `buzz-ds`가 기록
  - 2026-10-25 공유 툴팁 패딩 12/6px: `buzz-ds`가 기록
  - 2026-10-22 Window 결정(상단 40px, 신호등 (12, 14), top bar 전체가 드래그 영역)과 Layout V1의 오른쪽 패널 서술: `buzz-shell`이 기록
- `docs/DESIGN.md`에 "buzz-ds 이전" 표시가 남아 있지 않다. 확인: `grep -n 'buzz-ds 이전' docs/DESIGN.md` 결과 없음.
- 렌더러 CSS에 다크 시절 값이 남아 있지 않다. 확인: `grep -nE 'color-scheme: *dark|#121212|#171717|#1d1d1d|#ecebe4|#f0773a|#3a2117|#1a0b03' app/src/renderer/*.css` 결과 없음.
- 이 디렉터리(`docs/features/buzz-restyle/`)를 지웠다.

## 비목표

- 다크 모드, 시스템 테마 따라가기, 사용자 액센트 선택과 Buzzin' 수준.
- Base UI 도입, Buzz 코드(CSS·TSX)의 복사, Buzz JS 훅.
- Inter·JetBrains Mono 번들, 고정폭 역할. 예외(2026-10-31 user, buzz-conversation spec 결정 19, 구현): 대화 스레드의 에이전트 답 안 인라인 코드·코드 블록과 활동 경로만 시스템 mono 스택(`--type-family-mono`, 폰트 번들 없음)을 쓴다. 앱의 다른 인라인 코드는 sans 칩이다(DESIGN.md 'Type roles').
- Buzz에만 있고 doan에 대응하는 화면이 없는 요소(glass 버튼, 아바타 모양, 커뮤니티 선택, 프로필, 페이지 탭, 생성 메뉴).
- 기존 `.doan/canvases/` 초안 12개의 갱신.
- 캔버스 iframe 안의 렌더링.
- 앱 아이콘.
