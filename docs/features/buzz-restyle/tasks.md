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

2026-10-28 main 이력·자식 디렉터리·PRODUCT/ARCHITECTURE/DESIGN을 대조했다. 완료 체크는 main 병합과 승격·검증 근거가 함께 있는 경우에만 한다. 디렉터리가 없는 미착수 자식을 완료로 보지 않는다. 과거 전체 e2e 미통과 기록은 그대로 보존하며, 현재는 AGENTS의 static/unit/build와 변경 범위 probe 정책을 따른다.

- [x] C0. `buzz-ds` — PR #27, `f0dc812` main 병합. 라이트 DS·프리미티브·공유 표면 구현과 승격 완료, 자식 디렉터리 삭제. [DESIGN](../../DESIGN.md#design-system)에 측정과 당시 네이티브 검증 한계가 있다. 그 한계를 전체 e2e 통과로 바꾸지 않는다.
- [x] C1. `buzz-shell` — PR #30, `c625057` main 병합. 구현·네이티브·패키지·변경 범위 runtime 검증과 정본 승격 완료, 자식 디렉터리 삭제. [최종 완료 기록](../../DESIGN.md#app-shell)에 revised verify gate와 집중 probe 결과가 있다.
- [x] C2. `buzz-onboarding` — `/orchestrate` 체인 링크 2(통합 브랜치 `feat-buzz-onboarding`). 첫 실행 Welcome → Agent → Project → Home, 공용 공급자 view-model, GitHub URL 재사용·clone, 완료 기록 v1, 앱·CLI·MCP가 같은 main 온보딩 서비스를 쓰는 app-socket v2를 구현했다. 결론은 [PRODUCT §5 항목 0·§6·§7](../../PRODUCT.md#5-mvp), [ARCHITECTURE §4·§7 'First-run onboarding'·§12](../../ARCHITECTURE.md#7-app-stack-electron--typescript), [DESIGN](../../DESIGN.md#onboarding)에 승격했다. 실제 앱에서 확인하지 못한 표면(dev 빌드, 실제 Cmd+W·폴더 시트 Escape, stop 확인 대화상자 등)은 PRODUCT §6에 남겼다. 이 체크는 그 PR과 함께 main에 들어가며, 자식 디렉터리는 지휘자가 마지막에 지운다.
- [x] C3. `buzz-home` — `/orchestrate`(통합 브랜치 `feat-buzz-home`). 홈을 대화 시작 화면으로 바꿨다. Home은 워크스페이스와 같은 셸이고 LNB가 보이며, 본문에는 인사 문구·홈 전용 그라디언트·입력창·추천 프롬프트만 있다. 입력창에는 프로젝트 선택기와 워크트리 트레이, 공급자·모델·effort 선택기, 디자인 프리셋 팝오버와 `/` 단축, 로컬 경로 첨부가 있다. 워크스페이스의 임시 대화 상태줄, LNB 상태 슬롯, Edit on Home, 진행 중 프로젝트 제거 확인, 공용 토스트 변경(창 오른쪽 아래, 동작은 오른쪽 `prominent`), 공용 변형 네 개(`quiet`·`trigger`·icon `xs`·icon `accent`), CLI·MCP 프리셋 `group`을 더했다. 홈 카드·체크리스트·외부 연결 배너는 없앴다. 결론은 [PRODUCT §5 항목 0·1·§6·§7·§8](../../PRODUCT.md#5-mvp), [ARCHITECTURE §7·§11·§12](../../ARCHITECTURE.md#7-app-stack-electron--typescript), [DESIGN](../../DESIGN.md#home)에 승격했다. 실제 앱에서 확인하지 못한 표면(Claude·Cursor 실행과 첨부 읽기, 실제 공급자의 실패 상태줄, 네이티브 드래그·붙여넣기)은 PRODUCT §6에 남겼다. 공통 결정 2(그라디언트는 Welcome만)에 홈 예외가 생겼다: 홈 전용 violet 타원 그라디언트(grain 없음)와 고른 프리셋 칩의 accent다(DESIGN.md 'Home'). spec.md 공통 결정 2 본문은 이 체크와 함께 고치지 않았다. 이 체크는 그 PR과 함께 main에 들어가며, 자식 디렉터리는 buzz-home Z2에서 지운다.
- [x] C4. `buzz-search` — PR #39, `c5e6948` main 병합(`/orchestrate`, 통합 브랜치 `feat-buzz-search`). Quick Open을 Buzz 검색 팔레트로 바꿨다: 공용 `.doan-dialog` 검색 변형, `.doan-input`과 돋보기, All/Canvases/Frames 필터 탭, 프로젝트(root) 그룹, 맞은 글자 밑줄, 결과 키로 유지하는 활성 행, 헤더 띠를 뺀 바깥 클릭 닫기, 고정 높이 목록. 검색 범위·매칭·순위는 그대로다. 결론은 [PRODUCT §5 항목 1·§7·§8](../../PRODUCT.md#5-mvp), [ARCHITECTURE §7 'Quick Open'](../../ARCHITECTURE.md#7-app-stack-electron--typescript), [DESIGN 'Design navigation'](../../DESIGN.md)에 승격했고, 공통 결정 10에 검색 변형을 더했다. 실제 앱에서 확인하지 못한 것: AppKit Cmd+K 키 입력, 네이티브 IME, 수정 뒤 클래식 스크롤바. 자식 디렉터리는 삭제했다.
- [x] C5. `buzz-add-projects` — `/orchestrate`(통합 브랜치 `feat-buzz-add-projects`). 헤더 Add Projects·Cmd+O·File > Add Project…·입력창 선택기의 Add Projects…가 AppShell 안의 Add Projects 페이지를 연다. 페이지는 온보딩 Project 단계(화면·포커스 훅·main의 `ProjectAdder`)를 공유해 프로젝트를 하나씩 추가하고, 헤더 캡슐 Add Projects / Projects가 페이지를 오가는 탭이 됐다. 설정 쓰기·clone 중에는 페이지를 떠나는 모든 이동이 막힌다. 여러 폴더 선택, 하위 저장소·워크트리 체크리스트, 창 전체 폴더 드롭, `AddProjectsDialog`·`SetUpFolderConfirm`·`DropOverlay`를 없앴고, 폴더 드롭은 'Open a local folder' 카드에만 받는다(온보딩도 같은 카드 드롭, 전체 폭 스크롤, clone 중 이유 줄을 받았다). 결론은 [PRODUCT §3·§5 항목 0·1·§6](../../PRODUCT.md#5-mvp), [ARCHITECTURE §7](../../ARCHITECTURE.md#7-app-stack-electron--typescript), [DESIGN 'Add Projects page'·'Onboarding'](../../DESIGN.md)에 승격했고, 공통 결정 6·10을 고쳤다. 실제 앱에서 확인하지 못한 것: 네이티브 Finder 드롭. 이 체크는 그 PR과 함께 main에 들어가며, 자식 디렉터리는 삭제했다.
- [ ] C6. `buzz-settings` — 계획과 초안 확정, 미구현([자식 문서](../buzz-settings/spec.md)). Settings를 AppShell 페이지로 바꾼다(2026-10-30 user: LNB 카테고리 Agents · Notifications · Connections · About, 본문 설정 UI, 헤더 Settings 탭과 Cmd+,가 이 페이지를 연다, 별도 창 제거). 인증 backend를 재구현하지 않는다. Settings는 agent-auth의 계정 메서드로 로그인·로그아웃만 하고 대화를 시작·전송하지 않는다. 창이 하나가 되므로 이 보장은 IPC가 아니라 테스트로 지킨다. `signOutFailed` 문구, `stop_required` 확인 뒤 `stop: true` 재요청, Copilot 확인의 요청 1회 비용을 처리한다. 로그인 시도는 페이지를 떠나도 계속되고, App 수준 컨트롤러가 상태를 들고 있다가 끝나면 토스트로 알린다([ARCHITECTURE §7](../../ARCHITECTURE.md#agent-authentication)). 공급자 행의 문구·버튼·aria는 공용 view-model `app/src/renderer/agentAuthView.ts`를 재사용한다. buzz-home 인계(2026-10-30): 홈 공급자 선택기의 동작 없는 짧은 상태 문구(`providerShortStatus`) 자리에 Settings > Agents로 가는 동작을 붙인다. 새로 더하는 것은 macOS 알림, 새 대화 기본 에이전트·모델·effort, About이다. 저장소별 Token CSS·Serve는 프로젝트 메뉴의 Project Settings 다이얼로그로 옮긴다.
- [ ] C7. `buzz-project` — 미착수. Overview 본문만 담당하며 완료된 LNB/프로젝트 메뉴를 다시 만들지 않는다.
- [ ] C8. `buzz-canvas` — 미착수. 캔버스 보드·컨트롤·선택 표시·오류.
- [ ] C9. `buzz-inspector` — 미착수. Inspector 내용. 오른쪽 패널 표시 정책은 buzz-conversation.
- [ ] C10. `buzz-conversation` — 미착수. agent-conversation 기반은 PR #28, `d6590a6`로 main 병합됐다. agent-auth(2026-10-28 main 병합)·buzz-canvas·buzz-inspector가 선행한다. 도안 연결 대화의 오류 코드, 끝난 턴 뒤 send의 최대 10초 종료 대기, 공급자별 권한 선택지는 [ARCHITECTURE §7](../../ARCHITECTURE.md#agent-authentication)에 있다. 대화 UI와 앱 코멘트 UI 교체 범위는 spec 표 8번. 온보딩 첫 프롬프트 단계는 buzz-onboarding이 제거했다(2026-10-29). 새 홈 입력창은 buzz-home 담당이다. buzz-home 인계(2026-10-30): (1) 홈 대화의 임시 상태줄(`ConversationStripView.tsx`), LNB 상태 슬롯, 프로젝트당 홈 대화 1개 규칙은 임시다. 대화 패널이 이를 대체하고 규칙을 다시 정한다. (2) 입력창은 대화 패널과 나눠 쓰도록 미리 분리하지 않았다(`HomeComposerView.tsx`, `homeComposer.ts`). 재사용 구조는 이 자식이 정한다. (3) 권한 요청 토스트의 Open은 root가 아니라 대화 id를 가리킨다(`homeRun.ts`). 대화 패널은 그 대화를 바로 열 수 있다. 고른 모델·effort는 index에 남아 같은 대화의 다음 send가 그 값을 쓴다([ARCHITECTURE §7](../../ARCHITECTURE.md#agent-conversation-runtime-and-ipc)).
- [ ] C11. `doan-mascot` — 계획 확정, 미구현([자식 문서](../doan-mascot/spec.md)). Welcome과 Home에 마스코트 Doany(시안과 같은 WebGL 모션)를 넣고 두 화면의 그룹을 높이 기준 중앙에 배치하며, 패키지 앱 아이콘을 Doany로 바꾼다. 새 시안 `.doan/canvases/doan-mascot.html`(`mascot-home`·`mascot-welcome`)이 이 자식이 머지될 때까지 두 화면의 정본이다(공통 결정 11). design.md '도니 시안 구현 인계'를 이 자식이 맡는다.

### 외부 선행과 다음 순서

`agent-auth`는 이 부모의 자식이 아니다. 2026-10-28 main에 병합됐고 결론은 [PRODUCT §3](../../PRODUCT.md#3-scope)·[ARCHITECTURE §7](../../ARCHITECTURE.md#agent-authentication)에 승격됐다. UI는 없고 실제 토큰 만료·갱신은 관찰하지 못했다.

직렬 경로(2026-10-28 사용자) `agent-cli-versions` `/orchestrate` → main 병합 → `buzz-onboarding` `/orchestrate` → main 병합은 buzz-onboarding PR로 끝난다. 선행을 충족한 다른 화면 자식은 spec의 의존성에 따라 진행할 수 있다. 온보딩의 CLI/MCP 계약 변경은 최종 agent-eval을 필수로 하며, 부모 전체 검증을 새 e2e suite로 만들지 않는다.

### 앱 전체 후속

- 입력창 오른쪽 클릭 편집 메뉴(잘라내기·복사·붙여넣기)가 없다. 앱 전체 문제라 buzz-home 범위에서 뺐다(2026-10-29, buzz-home spec 비목표). 어느 자식이 맡을지는 정하지 않았다.

## Z. 부모 정리

- [x] Z0. 당시 comments-ui `08-hidden-quit-close`의 네이티브 포커스 시간 초과 조사를 완료했다. PR #29, `6912eab`로 main에 병합됐다(2026-10-27). 잠긴 데스크톱과 제품 동작을 분리했고, 잠금 검사·명시적 실패 안내·네이티브 상태 증거를 추가했다.
  - 근거: [POSTMORTEM의 Native focus waits hid a locked desktop](../../POSTMORTEM.md#2026-10-27--native-focus-waits-hid-a-locked-desktop). unlocked runtime 통과 기록과 현재 `app/runtime/` 지원 기반을 확인했다. 삭제된 `app/e2e/comments-ui.ts`를 다시 실행할 과업으로 남기지 않는다. 이후 다른 원인으로 실패한 전체 실행 기록을 이 수정으로 통과 처리하지 않는다.

- [ ] Z1. 남은 표시, 다크 잔재, PRODUCT 본문 반영을 확인하고, AGENTS.md의 Buzz 참조 명령을 지운 뒤 이 디렉터리를 지운다.
  - 검증:
    - `grep -n 'buzz-ds 이전' docs/DESIGN.md` 결과 없음
    - `grep -nE 'color-scheme: *dark|#121212|#171717|#1d1d1d|#ecebe4|#f0773a|#3a2117|#1a0b03' app/src/renderer/*.css` 결과 없음
    - spec '완료 조건'의 대체 결과가 PRODUCT·ARCHITECTURE·DESIGN 본문에 현재 상태로 모두 적혀 있음
    - `grep -n 'buzz-app' AGENTS.md` 결과 없음
    - design.md의 미인계 '조사 메모: 캔버스 영역'이 해당 자식으로 인계됐고 모든 자식이 완료됨
    - `docs/features/buzz-restyle/`가 없음

── commit: `docs(feature): remove buzz-restyle after all screens` ──
