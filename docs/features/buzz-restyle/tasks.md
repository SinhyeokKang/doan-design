# buzz-restyle — tasks (부모)

부모의 task는 하네스를 준비하고, 자식 feature를 끝내고, 마지막에 정리하는 것이다. 각 자식의 구현 task는 그 자식의 `tasks.md`에 있다. 부모는 `/ship`이나 `/orchestrate`로 진행하지 않는다. 이 문서의 수정은 하네스·문서 변경 경로(AGENTS.md 'Commit conventions')로 대화 중에 커밋한다.

자식 하나를 시작하고 끝내는 절차는 [design.md](./design.md)의 '자식 진행 규칙'을 따른다.

## H. 하네스 준비 (`buzz-ds` 구현 전에. `buzz-ds`도 새 초안과 `/design-sync`를 쓴다)

- [x] H1. AGENTS.md Workflow 'Terms'에 부모 feature를 정의한다: 자식 feature를 정의하고 공통 결정을 보관하는 허브, `/ship`·`/orchestrate` 대상이 아님, 마지막 자식 뒤 삭제.
  - 검증: `grep -n 'parent feature' AGENTS.md`에 정의 줄이 있다.
- [x] H2. 리디자인 초안을 허용하도록 하네스를 넓힌다(공통 결정 11).
  - AGENTS.md의 `/design-sync` 규칙과 `.agents/skills/design-sync/SKILL.md`: 리디자인 자식의 새 초안은 그 자식이 머지될 때까지 정본이다.
  - `.agents/skills/design-draft/SKILL.md`: 리디자인 자식은 main에 이미 있는 화면의 새 초안을 그릴 수 있다. "다크 전용" 규칙을 라이트 단일과 역할 토큰으로 바꾼다.
  - 검증: `grep -n 'redesign' AGENTS.md .agents/skills/design-sync/SKILL.md .agents/skills/design-draft/SKILL.md`에 세 파일 모두 줄이 있다.
- [x] H3. AGENTS.md Commands에 읽기 전용 Buzz 참조 명령 `git -C ~/code/buzz-app rev-parse HEAD`와 `git -C ~/code/buzz-app show <sha>:<path>`를 추가한다.
  - 검증: `grep -n 'buzz-app' AGENTS.md`에 두 명령이 있다.

── commit: `docs(agents): define parent features` / `docs(skills): let design skills follow redesign drafts` / `docs(agents): add Buzz reference commands` ──

## C. 자식 feature

2026-10-28 main 이력·자식 디렉터리·PRODUCT/ARCHITECTURE/DESIGN을 대조했다. 완료 체크는 main 병합과 승격·검증 근거가 함께 있는 경우에만 한다. 디렉터리가 없는 미착수 자식을 완료로 보지 않는다. 과거 전체 e2e 미통과 기록은 그대로 보존하며, 현재는 AGENTS의 static/unit/build와 변경 범위 probe 정책을 따른다. 체크 항목의 PRODUCT 절 번호는 병합 당시 기준이다. 그 뒤 PRODUCT의 PoC·결정 기록·열린 질문 절(옛 §6·§7·§8)은 없어졌고, 실제 앱에서 확인하지 못한 표면은 [BACKLOG](../../BACKLOG.md)로 옮겨졌다.

- [x] C0. `buzz-ds` — PR #27, `f0dc812` main 병합. 라이트 DS·프리미티브·공유 표면 구현과 승격 완료, 자식 디렉터리 삭제. [DESIGN](../../DESIGN.md#design-system)에 측정과 당시 네이티브 검증 한계가 있다. 그 한계를 전체 e2e 통과로 바꾸지 않는다.
- [x] C1. `buzz-shell` — PR #30, `c625057` main 병합. 구현·네이티브·패키지·변경 범위 runtime 검증과 정본 승격 완료, 자식 디렉터리 삭제. [최종 완료 기록](../../DESIGN.md#app-shell)에 revised verify gate와 집중 probe 결과가 있다.
- [x] C2. `buzz-onboarding` — `/orchestrate` 체인 링크 2(통합 브랜치 `feat-buzz-onboarding`). 첫 실행 Welcome → Agent → Project → Home, 공용 공급자 view-model, GitHub URL 재사용·clone, 완료 기록 v1, 앱·CLI·MCP가 같은 main 온보딩 서비스를 쓰는 app-socket v2를 구현했다. 결론은 [PRODUCT §5 항목 0·§6·§7](../../PRODUCT.md#5-mvp), [ARCHITECTURE §4·§7 'First-run onboarding'·§12](../../ARCHITECTURE.md#7-app-stack-electron--typescript), [DESIGN](../../DESIGN.md#onboarding)에 승격했다. 실제 앱에서 확인하지 못한 표면(dev 빌드, 실제 Cmd+W·폴더 시트 Escape, stop 확인 대화상자 등)은 PRODUCT §6에 남겼다. 자식 디렉터리는 삭제했다. Doan MCP 서버는 이후 remove-mcp(PR #48)가 없앴다.
- [x] C3. `buzz-home` — `/orchestrate`(통합 브랜치 `feat-buzz-home`). 홈을 대화 시작 화면으로 바꿨다. Home은 워크스페이스와 같은 셸이고 LNB가 보이며, 본문에는 인사 문구·홈 전용 그라디언트·입력창·추천 프롬프트만 있다. 입력창에는 프로젝트 선택기와 워크트리 트레이, 공급자·모델·effort 선택기, 디자인 프리셋 팝오버와 `/` 단축, 로컬 경로 첨부가 있다. 워크스페이스의 임시 대화 상태줄, LNB 상태 슬롯, Edit on Home, 진행 중 프로젝트 제거 확인, 공용 토스트 변경(창 오른쪽 아래, 동작은 오른쪽 `prominent`), 공용 변형 네 개(`quiet`·`trigger`·icon `xs`·icon `accent`), CLI·MCP 프리셋 `group`을 더했다. 홈 카드·체크리스트·외부 연결 배너는 없앴다. 결론은 [PRODUCT §5 항목 0·1·§6·§7·§8](../../PRODUCT.md#5-mvp), [ARCHITECTURE §7·§11·§12](../../ARCHITECTURE.md#7-app-stack-electron--typescript), [DESIGN](../../DESIGN.md#home)에 승격했다. 실제 앱에서 확인하지 못한 표면(Claude·Cursor 실행과 첨부 읽기, 실제 공급자의 실패 상태줄, 네이티브 드래그·붙여넣기)은 PRODUCT §6에 남겼다. 공통 결정 2(그라디언트는 Welcome만)에 홈 예외가 생겼다: 홈 전용 violet 타원 그라디언트(grain 없음)와 고른 프리셋 칩의 accent다(DESIGN.md 'Home'). spec.md 공통 결정 2에 홈 예외를 적었다. 자식 디렉터리는 삭제했다.
- [x] C4. `buzz-search` — PR #39, `c5e6948` main 병합(`/orchestrate`, 통합 브랜치 `feat-buzz-search`). Quick Open을 Buzz 검색 팔레트로 바꿨다: 공용 `.doan-dialog` 검색 변형, `.doan-input`과 돋보기, All/Canvases/Frames 필터 탭, 프로젝트(root) 그룹, 맞은 글자 밑줄, 결과 키로 유지하는 활성 행, 헤더 띠를 뺀 바깥 클릭 닫기, 고정 높이 목록. 검색 범위·매칭·순위는 그대로다. 결론은 [PRODUCT §5 항목 1·§7·§8](../../PRODUCT.md#5-mvp), [ARCHITECTURE §7 'Quick Open'](../../ARCHITECTURE.md#7-app-stack-electron--typescript), [DESIGN 'Design navigation'](../../DESIGN.md)에 승격했고, 공통 결정 10에 검색 변형을 더했다. 실제 앱에서 확인하지 못한 것: AppKit Cmd+K 키 입력, 네이티브 IME, 수정 뒤 클래식 스크롤바. 자식 디렉터리는 삭제했다.
- [x] C5. `buzz-add-projects` — `/orchestrate`(통합 브랜치 `feat-buzz-add-projects`). 헤더 Add Projects·Cmd+O·File > Add Project…·입력창 선택기의 Add Projects…가 AppShell 안의 Add Projects 페이지를 연다. 페이지는 온보딩 Project 단계(화면·포커스 훅·main의 `ProjectAdder`)를 공유해 프로젝트를 하나씩 추가하고, 헤더 캡슐 Add Projects / Projects가 페이지를 오가는 탭이 됐다. 설정 쓰기·clone 중에는 페이지를 떠나는 모든 이동이 막힌다. 여러 폴더 선택, 하위 저장소·워크트리 체크리스트, 창 전체 폴더 드롭, `AddProjectsDialog`·`SetUpFolderConfirm`·`DropOverlay`를 없앴고, 폴더 드롭은 'Open a local folder' 카드에만 받는다(온보딩도 같은 카드 드롭, 전체 폭 스크롤, clone 중 이유 줄을 받았다). 결론은 [PRODUCT §3·§5 항목 0·1·§6](../../PRODUCT.md#5-mvp), [ARCHITECTURE §7](../../ARCHITECTURE.md#7-app-stack-electron--typescript), [DESIGN 'Add Projects page'·'Onboarding'](../../DESIGN.md)에 승격했고, 공통 결정 6·10을 고쳤다. 실제 앱에서 확인하지 못한 것: 네이티브 Finder 드롭. 자식 디렉터리는 삭제했다.
- [x] C6. `buzz-settings` — PR #45, `949a6c0` main 병합(`/orchestrate`, 통합 브랜치 `feat-buzz-settings`). 별도 Settings 창을 AppShell 안의 Settings 페이지로 바꿨다. 헤더 Settings 탭, Settings…(Cmd+,), 홈 에이전트 선택기의 동작, 로그인 토스트의 Open Agents settings가 이 페이지를 연다. 공급자 행은 공용 view-model `app/src/renderer/agentAuthView.ts`를 쓰고, 로그인은 페이지를 떠나도 App 수준 컨트롤러가 이어 간다. 알림, 새 대화 기본값(`preferences.json`), About을 더했고, 저장소별 Token CSS·Serve는 프로젝트 메뉴의 Project Settings 다이얼로그로 옮겼다. 결론은 [PRODUCT §5 항목 0](../../PRODUCT.md#5-mvp), [ARCHITECTURE §7 'Settings IPC'](../../ARCHITECTURE.md#settings-ipc), [DESIGN 'Settings'](../../DESIGN.md#settings)에 승격했다. 자식 디렉터리는 삭제했다. Connections 카테고리는 이후 zero-setup-agents(PR #47)가 없앴고, 지금 카테고리는 Agents · Notifications · About이다.
- [x] C7. `buzz-project` — `/orchestrate`(통합 브랜치 `feat-buzz-project`). Overview를 프로젝트 대화 화면으로 바꿨다(spec 표 7번). 헤더는 프로젝트·브랜치 칩(워크트리가 둘 이상이면 워크트리 메뉴, 문제 워크트리는 고치는 동작)·대화 제목 드롭다운, 메인은 `ConversationThread`와 `DockedComposer`, 오른쪽 패널은 현재 대화가 있는 캔버스 목록(`CanvasConversationList.tsx`)이다. 기본 대화는 요청된 대화 → 이 기기에서 마지막에 본 대화(ui-state `conversationByRoot`) → 최근 프로젝트 대화 → 새 대화 순으로 고르고, 기존 캔버스 수정 승격 때 메인을 새 대화로 초기화하고 초안과 이동 줄을 남긴다. File > New Conversation(⌘N)을 더했고, 프로젝트 대화는 Overview가 창 포커스를 가진 채 보일 때만 본 것으로 기록한다. FirstPrompt, Overview 카드, Feedback 패널, `comments:project`, 캔버스 없는 코멘트의 앱 경로, Overview 상태줄을 지웠다. 캔버스 없는 코멘트는 CLI로만 다룬다. 빌드한 앱에서 `/design-sync`로 `buzz-project.html` 9프레임과 `buzz-conversation.html`의 docked·스레드 보드를 맞췄다(스레드 CSP와 Markdown 표시 포함). 결론은 [PRODUCT §3·§5 항목 1·3·5](../../PRODUCT.md#5-mvp), [ARCHITECTURE §2·§3·§7](../../ARCHITECTURE.md#agent-conversation-runtime-and-ipc), [DESIGN 'Project Overview'](../../DESIGN.md#project-overview)에 승격했다. 자식 디렉터리는 삭제했다. 병합 당시 C12에 남긴 것: 캔버스 페이지의 대화 패널(오른쪽 행에서 들어온 캔버스를 그 현재 대화로 열기, 본 것 규칙을 '대화 패널이 보일 때'로 바꾸기), 캔버스 페이지의 임시 상태줄, 코멘트 컴포넌트 삭제(화면은 buzz-canvas가 캔버스 페이지에서 뺐다).
- [x] C8. `buzz-canvas` — `/orchestrate`(통합 브랜치 `feat-buzz-canvas`). 캔버스 페이지를 새 배치로 바꿨다. 보드 밖 흰 캔버스 헤더(캔버스 / 프레임 서랍, − · 배율 값 · +, 패널이 접혔을 때만 열기 버튼), 회색 보드, 보드 아래 가운데 도구모음(선택 피커 하나)이다. 서랍에서 프레임을 고르면 그 프레임으로 이동하고 선택한다(`selectFrame(index, id)`, 다시 로드로 순서가 바뀌어도 고른 id를 따른다). 배율 메뉴는 Fit·100%·50%·200%다. 캔버스 위 Reload 버튼, `.zctl` 띠, 왼쪽 아래 변경 표시와 `bottomLabel`은 없앴다. Fit과 프레임 이동은 위 56·좌우 32·아래 64 inset을 쓰고, 첫 Fit은 캔버스 페이지의 패널 폭이 적용된 뒤에 맞춘다. 오른쪽 열은 캔버스 대화 패널 껍데기(제목 "Conversation", 닫기, 한 줄 빈 본문, 직접 만든 폭 손잡이, 열림·폭을 기억하는 `UiState.rightPanel`)로 바꿨다. 캔버스 페이지에서 Inspector·Canvas info·Comments 화면(패널, 코멘트 핀, Review bar, Hand Off)을 그리지 않고 코멘트 세션도 열지 않는다(컴포넌트와 main 경로는 남김). 에이전트 작업 표시(가장자리 그라디언트, 점 필드, 위쪽 가운데 안내, 일하는 중 Stop·응답 대기 중 Open, 프로젝트 root 단위)를 더했다. 같은 작업에서 모두 absolute인 프레임으로 이뤄진 캔버스의 iframe 높이 진동도 고쳤다. 결론은 [PRODUCT §3·§4·§5 항목 2·3·4·5·7·§6](../../PRODUCT.md#5-mvp), [ARCHITECTURE §3·§7](../../ARCHITECTURE.md#3-canvas-rendering), [DESIGN 'Canvas area and right panel'](../../DESIGN.md#canvas-area-and-right-panel)에 승격했다. 실제 앱에서 확인하지 못한 표면은 PRODUCT §6에 남겼다. 공통 결정 2(accent)와 6(보존)에 예외가 생겼다. 자식 디렉터리는 삭제했다.
- [ ] C9. `buzz-inspector` — 미착수. 앱 안 플로팅 인스펙터 패널과 그 내용, 선택이 없을 때의 Canvas info, 도구모음의 인스펙트 도구. buzz-canvas가 Inspector와 Canvas info를 캔버스 페이지에서 이미 뺐다(`RightPanel.tsx`의 컴포넌트와 선택 때 값을 모으는 경로만 남아 있다). 그래서 이 자식은 오른쪽 패널에서 옮기는 일이 아니라, 캔버스 위 새 자리에 두 화면을 다시 놓는 일이다. `docs/DESIGN.md` 'Select and inspect'의 Inspector 행에 "buzz-ds 이전" 표시가 남아 있다.
- [x] C10. `buzz-conversation` — `/orchestrate`(통합 브랜치 `feat-buzz-conversation`). 대화의 공용 부분을 만들었다(spec 표 10번). main은 root별 대화 목록(`conversation:list`·`markSeen`·`listChanged`)과 기기 안에 남는 안 본 종료(`seenSeq`), root당 일하는 프로젝트 대화 하나(`project_busy`), send의 첨부·모델·effort, 턴마다 판정하는 승격(새 캔버스, 또는 이 턴의 edit 경로와 폴더 감시 변경이 함께 가리키는 기존 캔버스), 보관 대화 복구, 대기열(`drafts.json`, 재시작 뒤 초안으로 돌려줌), `shell:openLink`, `attachments:fromPaths`를 갖췄다. renderer는 입력창 프리미티브(`ComposerParts.tsx`)로 Home을 `HeroComposer`로 다시 조립했고, props만 받는 `DockedComposer`와 `ConversationThread`(Markdown, `react-markdown`·`remark-gfm`)를 더했다. 상태줄·LNB 슬롯·Home 이유 줄·제거 확인·Edit on Home은 main 목록에서 세워 다시 로드와 재시작 뒤에도 남는다. 결론은 [PRODUCT §3 항목 6·§5 항목 1 'Project conversations'](../../PRODUCT.md#5-mvp), [ARCHITECTURE §7 'Agent conversation runtime and IPC'](../../ARCHITECTURE.md#agent-conversation-runtime-and-ipc), [DESIGN 'Home'](../../DESIGN.md#home)에 승격했다. 공통 결정 10과 비목표 '고정폭 역할'에 이 자식의 예외 두 가지가 생겼다(spec.md 공통 결정 10·비목표에 적었다). docked 입력창의 실제 포커스·한글 조합, 빌드한 앱에서 스레드의 CSP, docked·스레드 화면 대조는 이 화면을 처음 놓는 C7이 확인한다. 자식 디렉터리는 buzz-conversation Z2에서 지웠다.
- [x] C11. `doan-mascot` — `/orchestrate`(통합 브랜치 `feat-doan-mascot`). Welcome과 Home에 마스코트 Doany를 넣었다. 모션은 시안 `mascot.js`와 같고, 그 출력을 고정 데이터로 고정했다. 두 화면의 그룹은 높이 기준으로 중앙에 둔다(Home −64, Welcome −72, 짧은 창에서는 오프셋이 먼저 줄어든다). 첫 실행 Tab 트랩은 DOM 순서를 따르고, Welcome은 같은 task에서 h1에 포커스를 준다. 패키지 앱 아이콘은 Doany다. 결론은 [PRODUCT §5 'Doany'·'Home'](../../PRODUCT.md#5-mvp), [ARCHITECTURE §7](../../ARCHITECTURE.md#7-app-stack-electron--typescript), [DESIGN 'Home'·'Onboarding'](../../DESIGN.md)에 승격했다. 실제 앱에서 확인하지 못한 것: 포인터 시선·깜빡임 주기(단위 테스트만), 실제 컨텍스트 손실·텍스처 실패, 줄인 투명도·강제 색상. 1240 높이는 에뮬레이션이다. 자식 디렉터리는 삭제했다.
- [x] C12. `buzz-canvas-conversation` — `/orchestrate`(통합 브랜치 `feat-buzz-canvas-conversation`). 캔버스 페이지의 대화 패널을 채웠다. 제목 메뉴(새 대화, 이 캔버스의 현재·보관 대화), 스레드, docked 입력창이 Overview의 부품과 규칙을 쓰고, 첫 전송이 이 캔버스에 묶인 새 대화를 시작한다(모델·effort·첨부, 터미널 세션 이어 가기). 입력창은 인라인 앵커 칩을 담는 contenteditable 필드가 됐고(Home·Overview도 같은 필드), 입력창의 Pick from canvas(프레임 배경은 프레임 칩, 요소는 요소 칩, ⇧-클릭은 점 칩), 도구모음의 Add to conversation과 Edit > Add Selection to Conversation(⌘L), 칩 locate를 더했다. 패널을 여는 규칙, 접힌 패널의 새 소식 점, 답 대기 중 캡슐의 Open, 본 것 규칙(펴진 패널·창 포커스), 캔버스 페이지 임시 상태줄 제거, 오류 표 전체를 구현했다. 앱의 코멘트 화면 코드(Comments 패널, 핀, Review, Hand Off, 코멘트·Review IPC, 초안 가드)와 그 초안 3개를 지웠다. 코멘트 파일·CLI·스킬·eval은 남았다. 공용 선택 카드는 왼쪽 위 라디오가 됐다. 앱이 보내는 앵커를 측정하는 eval R8을 더했다(첫 라운드 claude pass/partial/pass, codex pass×3). PRODUCT §6 열린 질문은 `docs/BACKLOG.md`로 옮겼다. 결론은 [PRODUCT §1·§3·§4·§5 항목 1·2·3·5·6](../../PRODUCT.md#5-mvp), [ARCHITECTURE §2·§3·§7](../../ARCHITECTURE.md), [DESIGN](../../DESIGN.md), [BACKLOG](../../BACKLOG.md)에 승격했다. 실제 앱에서 확인하지 못한 표면(네이티브 ⌘L·⌘N 단축키, 로그인 만료 행, 네이티브 IME, 일부 타일)은 BACKLOG에 남겼다. buzz-inspector는 선행이 아니게 됐다(2026-11-01 user). 자식 디렉터리는 삭제했다.
- [ ] C13. `project-settings` — 미착수. Project Settings 다이얼로그 리워크, `doan skill` 가이드의 관련 문구 수정, DESIGN 'Projects home' 재측정과 표시 삭제(spec 표 13번).

### 외부 선행과 다음 순서

`agent-auth`는 이 부모의 자식이 아니다. 2026-10-28 main에 병합됐고 결론은 [PRODUCT §3](../../PRODUCT.md#3-scope)·[ARCHITECTURE §7](../../ARCHITECTURE.md#agent-authentication)에 승격됐다. UI는 없고 실제 토큰 만료·갱신은 관찰하지 못했다.

직렬 경로(agent-cli-versions → buzz-onboarding)는 PR #34·#35로 끝났다. 남은 자식은 spec의 '선행' 열을 따른다. 온보딩 CLI 계약을 바꾸면 agent-eval을 돌리며, 부모 전체 검증을 새 e2e suite로 만들지 않는다.

### 앱 전체 후속

- 입력창 오른쪽 클릭 편집 메뉴가 없는 문제는 [BACKLOG](../../BACKLOG.md)의 'Known defects'로 옮겼다.

## Z. 부모 정리

- [x] Z0. 당시 comments-ui `08-hidden-quit-close`의 네이티브 포커스 시간 초과 조사를 완료했다. PR #29, `6912eab`로 main에 병합됐다(2026-10-27). 잠긴 데스크톱과 제품 동작을 분리했고, 잠금 검사·명시적 실패 안내·네이티브 상태 증거를 추가했다.
  - 근거: [POSTMORTEM의 Native focus waits hid a locked desktop](../../POSTMORTEM.md#2026-10-27--native-focus-waits-hid-a-locked-desktop). unlocked runtime 통과 기록과 현재 `app/runtime/` 지원 기반을 확인했다. 삭제된 `app/e2e/comments-ui.ts`를 다시 실행할 과업으로 남기지 않는다. 이후 다른 원인으로 실패한 전체 실행 기록을 이 수정으로 통과 처리하지 않는다.

- [ ] Z1. 남은 표시, 다크 잔재, PRODUCT 본문 반영을 확인하고, AGENTS.md의 Buzz 참조 명령을 지운 뒤 이 디렉터리를 지운다.
  - 검증:
    - `grep -n '^> buzz-ds 이전' docs/DESIGN.md` 결과 없음, 그리고 DESIGN.md 'Evidence and verification policy'의 '"buzz-ds 이전" sections' 항목을 지웠다
    - `grep -nE 'color-scheme: *dark|#121212|#171717|#1d1d1d|#ecebe4|#f0773a|#3a2117|#1a0b03' app/src/renderer/*.css` 결과 없음
    - spec '완료 조건'의 대체 결과가 PRODUCT·ARCHITECTURE·DESIGN 본문에 현재 상태로 모두 적혀 있음
    - `grep -n 'buzz-app' AGENTS.md` 결과 없음
    - design.md '자식 feature 조사 메모'에 인계하지 않은 메모가 없고 모든 자식이 완료됨
    - `docs/features/buzz-restyle/`가 없음

── commit: `docs(feature): remove buzz-restyle after all screens` ──
