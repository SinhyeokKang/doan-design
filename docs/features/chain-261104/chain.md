# orchestrate chain — 2026-11-04

규칙: [`/chain`](../../../.agents/skills/chain/SKILL.md) §3, AGENTS.md 'Workflow'의 Chains 항목. 이 파일은 이 체인의 순서·상시 권한·상태·인계 기록의 정본이다. 마지막 링크가 병합한 뒤 이 디렉터리를 지운다.

이 파일과 세 feature 문서는 `feat/mcp-connectors` 브랜치에서 썼고, mcp-connectors PR이 main에 병합될 때 main에 들어간다. 체인은 그 병합 뒤, main의 깨끗한 checkout에서 시작한다(2026-11-04 사용자).

## 순서

링크는 직렬이다. 앞 링크가 main에 병합된 뒤 다음 링크가 최신 `origin/main`에서 시작한다. 사람이 필요한 링크를 앞에, 필요 없는 링크를 뒤에 둔다(2026-11-04 사용자). 세 feature 모두 `/feature-review`를 마쳤고 남은 '확인 필요'가 없다.

1. `cli-minimum-versions` — [spec](../cli-minimum-versions/spec.md)·[design](../cli-minimum-versions/design.md)·[tasks](../cli-minimum-versions/tasks.md). 사람이 가장 많이 필요하다: E0의 릴리스 목록 내려받기 승인(한 번에), 다섯 provider의 후보별 로그인 승인(사람의 브라우저), 새 최소 버전 결정(D1). UI가 없어 초안이 없다. mcp-connectors의 MCP 항목을 확인 목록에 쓰므로 그 병합 뒤에만 시작할 수 있다. 바꾸는 파일은 `conversation/minimumVersions.ts`·floor 상수와 그 테스트, 문서다.
2. `canvas-composer-polish` — [spec](../canvas-composer-polish/spec.md)·[design](../canvas-composer-polish/design.md)·[tasks](../canvas-composer-polish/tasks.md). 초안 확정(`.doan/canvases/canvas-composer-polish.html`, design '사용자 확정'). 사람은 C2 `/runtime-test`에서 Send now와 답 대기 admission을 로그인한 provider로 볼 때만 필요하다. renderer 여러 곳과 main `conversation/project.ts`·`service.ts`(admission, promotion)를 바꾼다. 링크 1의 conversation 변경 위에서 시작하게 둘째에 둔다.
3. `export-viewer-chrome` — [spec](../export-viewer-chrome/spec.md)·[design](../export-viewer-chrome/design.md)·[tasks](../export-viewer-chrome/tasks.md). 초안 확정(`.doan/canvases/export-viewer-chrome.html`, design '사용자 확정'). 사람이 필요 없다(확인은 Playwright Chromium·WebKit). 바꾸는 파일은 `cli/internal/export/viewer/`와 `app/src/main/exportViewer.test.ts`로 다른 두 링크와 겹치지 않는다.

## 시작 점검 (첫 지휘자)

첫 지휘자는 링크 1을 시작하기 전에 다음을 점검하고, 사용자에게 한 번에 승인을 받아 '인계 기록'에 적는다. 승인 뒤에는 링크마다 멈추지 않는다.

- mcp-connectors가 main에 병합됐고, 세 feature 문서와 두 초안이 main에 있는지 확인한다.
- 세 feature 문서에 '확인 필요'·'미정'이 남지 않았는지 다시 확인한다(2026-11-04에 모두 결정으로 바꿨다).
- 링크 1의 'AGENTS.md Commands에 없는 명령'(릴리스 목록 조회, 후보 설치, 정적 검사 스크립트)을 무엇으로 쓸지 사용자에게 확인받는다. tasks.md는 쓴 명령을 'E 결과'에 적으라고만 했다.
- 링크 1의 E0 릴리스 목록 내려받기 승인을 이때 한 번에 받는다(링크 1 결정 3).
- 로그인: 링크 1은 후보마다 따로 둔 userData를 쓰므로 공용 프로필과 섞지 않는다. 링크 2 C2에서 로그인한 provider로 Send now와 답 대기 admission을 볼지 정하고, 보기로 하면 아래 '로그인'대로 공용 프로필을 만든다.
- Codex 작업자 허가(아래 '상시 권한')를 확인하고 링크 1 시작 때 Codex 남은 사용량을 본다.

승인 뒤 각 지휘자는 일상적인 판단을 스스로 한다. 새 제품·범위 결정이나 실제 사용자 상태를 건드리는 결정이 생길 때만 묻는다.

## 상시 권한 (2026-11-04 사용자)

- **main 병합**: 모든 링크가 자기 PR을 main에 병합한다. 병합 전 조건은 orchestrate의 통합 gate(통합 HEAD `/verify`, 영향받은 앱 동작 `/runtime-test`, 해당하면 `/agent-eval`)와 문서 승격·feature 디렉터리 삭제다.
- **지휘자 런타임**: Claude Code.
- **Codex 작업자**(사용자가 이 체인에 허용함, 2026-11-04): 모든 링크에서 Claude 지휘자가 Codex 작업자를 섞어 쓸 수 있다(AGENTS.md 'Runtime differences'의 교차 허가). 주 구현은 Claude가 맡고, Codex는 독립 리뷰와 일부 기계적 배치에 쓴다. 모델·effort는 orchestrate §0의 Codex 규칙을 따른다. 지휘자는 링크를 시작할 때와 배치를 나눌 때 Codex의 남은 사용량을 확인하고 그에 맞춰 Codex에 줄 배치를 정한다. 사용한 범위는 각 링크의 orch.md에 적는다. 지휘자 자신은 Claude Code다.
- **링크 1의 명령과 내려받기**(사용자, 2026-11-05 시작 점검): 릴리스 목록은 `npm view <pkg> versions --json`(`@anthropic-ai/claude-code`, `@openai/codex`, `@github/copilot`)과 Cursor의 공개 배포 경로 조회로, 설치는 `npm install --prefix .scratch/cli-minimum-versions/clis/<provider>-<version>`로, 정적 검사와 상태 비교는 `.scratch` 스크립트로 한다. `-g`, Homebrew, `claude install`·`claude update`, Cursor 설치 스크립트, 자체 업데이트는 쓰지 않는다. 내려받기 목록은 규칙으로 미리 승인했다: provider마다 테스터의 가장 오래된 버전부터 지금 최소 버전 바로 아래까지의 모든 릴리스. 지휘자는 그 목록을 다시 묻지 않고 'E 결과'에 적는다.
- **멈추지 않고 진행**(사용자, 2026-11-05 링크 1 중): 체인을 멈추지 말고 끝까지 간다. 웬만한 결정은 지휘자가 내린다. 새 의존성, 범위 밖 변경, 실제 사용자 상태를 되돌릴 수 없게 바꾸는 일만 묻는다.
- 그 밖의 권한(새 의존성, 범위 밖 변경, 위 규칙 밖의 내려받기)은 평소대로 사용자에게 묻는다.

## 로그인 (필요한 링크만)

- provider 로그인이 필요한 probe는 실제 HOME(Keychain)의 로그인을 쓴다. 임시 HOME에서는 로그인이 실패한다.
- 공용 프로필: 체인 작성 세션이 시작 점검에서 사용자 브라우저 승인으로 다섯 provider(Claude Code, Codex, Cursor, Antigravity, Copilot)의 로그인을 만들었다. 세 링크 모두 로그인한 provider가 필요한 확인에 이 프로필을 쓴다(사용자, 2026-11-05). 링크 2 C2는 이 프로필로 Send now와 답 대기 admission을 본다.
- 링크 1: 후보 CLI는 공용 프로필 자체에 붙이지 않는다(오래된 CLI가 프로필을 망가뜨릴 수 있다, cli-minimum-versions design 'HOME과 로그인'). 후보마다 따로 둔 userData를 쓰고 그 정리는 Z0이 한다. Cursor·Copilot처럼 credential이 프로필 안 파일에 있는 provider는 공용 프로필의 복사본으로 통과 기준 1(a)의 지금 설치본 sign-in을 대신해 사용자 sign-in을 줄인다. Claude Code·Codex의 credential은 프로필 경로로 구분한 Keychain 항목이라 복사본에서 sign-in되지 않은 상태가 되므로(같은 design '통과 기준' 1), 이 둘과 통과 기준 2(후보 CLI의 새 sign-in)는 사용자 sign-in이 필요하다. 복사본이 만든 Keychain 항목도 Z0이 지운다.
- 로그인한 userData는 main checkout의 절대 경로 `/Users/sinhyeok/code/doan-design/.scratch/provider-profile/userData`에 둔다. 링크마다 worktree가 달라서다. `DOAN_RUNTIME`과 repo는 probe마다 임시로 둔다.
- 프로필을 망가뜨릴 수 있는 probe는 복사본으로 돌린다. 로그인을 다시 요청하기 전에 프로필이 연결되어 있는지 먼저 확인한다. 링크마다 병합할 때 로그아웃하지 않는다. 마지막 링크가 병합하기 전에 앱에서 다섯 연결을 모두 로그아웃하고, 그 프로필이 만든 Keychain 항목(Claude는 `Claude Code-credentials-5def49d2`)이 사라졌는지 확인한 뒤 userData를 지운다.

## 인계와 물러나기

[`/chain`](../../../.agents/skills/chain/SKILL.md) §3을 따른다: 링크마다 새 Claude Code 세션과 최신 `origin/main`에서 만든 새 Orca worktree, 링크를 끝까지 마친 뒤 이 파일에 결과를 적고 main에 push, 다음 세션이 브리프로 시작한 것을 확인한 뒤 물러남.

## 운영 메모

- worker 대기는 Orca가 깨운다. heartbeat·status는 조용히 ack하고 `worker_done`·`question`·`escalation`에만 반응한다. 작업자가 `worker_done` 없이 멈출 수 있으므로 activity가 working이 아니거나 terminal이 idle 프롬프트면 깨운다.
- 새 child worktree에는 `node_modules`가 없다. 작업자는 `npm --prefix app ci`부터 한다(gate 실패가 아니다).
- 설치된 `doan check --repo .`는 기존 `select-inspect.html`의 `implements_not_found` 1건으로 exit 4다. 검증은 "전후 finding 목록이 같다"로 본다.
- `onboarding/clone.test.ts`와 `shell.test.ts`의 replace 테스트는 부하에서 가끔 실패한다(BACKLOG). 단독으로 다시 돌려 통과하면 flake로 적는다.
- `/agent-eval`: 링크 1·2는 guide·CLI 출력·`doan check` 규칙·skill stub을 바꾸지 않아 돌지 않는다. 링크 3은 출력 파일의 viewer 부분만 바뀌어 `node eval/run.ts --self-test --scenarios X1`만 돌린다(tasks C3).

## 링크 상태

| 링크 | 세션·worktree | 시작 | PR·병합 | 상태 |
|---|---|---|---|---|
| 1 cli-minimum-versions | Claude Code · Orca `cli-minimum-versions-orch` | 2026-11-05 | #94 · `cfa91a7b` | 완료 |
| 2 canvas-composer-polish | Claude Code · Orca `canvas-composer-polish-orch` | 2026-11-05 | #95 · `d0f5f7c2` | 완료 |
| 3 export-viewer-chrome | Claude Code · Orca `export-viewer-chrome-orch` | 2026-11-05 | | 진행 중 |

## 인계 기록

- 2026-11-04 체인 작성 세션(mcp-connectors 지휘 세션): 순서(사람이 필요한 링크 먼저)와 상시 권한(각 링크가 병합, Codex 작업자 허용)을 사용자와 정해 이 파일을 썼다. `feat/mcp-connectors`에 커밋했고 그 PR과 함께 main에 들어간다. 첫 지휘자는 mcp-connectors 병합 뒤 main의 깨끗한 checkout에서 '시작 점검'부터 한다.
- 2026-11-05 체인 작성 세션(시작 점검): 사용자가 자기 전에 세 링크의 승인을 한 번에 주기를 원해, 첫 지휘자 대신 이 세션이 시작 점검을 하고 일괄 승인을 받았다. 첫 지휘자는 시작 점검을 다시 하지 않고 `/orchestrate docs/features/cli-minimum-versions/`부터 한다.
  - 확인: mcp-connectors가 main에 병합됐다(`c43ce39f`). 세 feature 문서와 두 초안이 main에 있다. 세 feature에 '확인 필요'가 없다. export-viewer-chrome C1의 '명령 미정'은 검증 명령이라 그 링크 지휘자가 정해 tasks.md에 적는다.
  - 순서: 그대로 둔다(사용자). 링크 1은 사용자가 있어야 진행되는 단계가 남아 있다: E0의 테스터 Copy details, E3·E4의 후보별 브라우저 sign-in, D1 최소 버전 결정, C1 Copilot 요청 사전 고지. 링크 1 지휘자는 그 단계에서 사용자를 기다리고, 그동안 사용자 없이 할 수 있는 일(Antigravity 코드 근거, 실험 환경 스크립트 준비 등)만 한다.
  - 링크 1 명령과 내려받기: '상시 권한'대로 규칙으로 미리 승인했다.
  - 로그인: 공용 프로필에 다섯 provider 연결을 만들었고 세 링크가 모두 쓴다('로그인'). 링크 1은 그 복사본으로 Cursor·Copilot의 sign-in만 줄일 수 있다. 프로필을 만든 dev 앱은 닫았다.
  - Codex 작업자 허가를 사용자가 다시 확인했다. 남은 사용량은 각 링크 지휘자가 시작 때 본다.
- 2026-11-05 링크 1 지휘자(cli-minimum-versions): PR #94를 `cfa91a7b`로 병합했다.
  - 결과: 최소 버전을 Claude Code 2.1.284, Codex 0.158.0, Copilot 1.0.89로 낮췄고 floor도 따라 내렸다. Cursor는 옛 버전을 받을 공개 경로가 없어 유지했다. 테스터 버전이 없어 사용자가 하한을 2026-09-28 이후 릴리스로 정했다. 사용자 요청으로 열린 대화가 `session_in_use`로 거절될 때 범용 문구 대신 "<agent> is using this session in another terminal. Try again when it finishes there."를 보이게 했다(`renderer/dockedRules.ts` `SEND_ERRORS`).
  - 검증: 통합 HEAD `f66b10c3`에서 `verify: PASS`. 실제 앱 확인은 PR 본문에 있다. Z0 정리 뒤 사람 상태가 실험 전 snapshot과 같다.
  - 남은 것: Notion '팀 901'의 워크스페이스 수준 "Enabled clients: Claude Code"는 사람의 다른 사용에 영향이 갈 수 있어 그대로 두었다. 연결별로 거둘 화면은 없었다. `providers.ts`의 Copilot "1.0.105 has no status command" 주석은 1.0.105에서 관찰한 사실로 남겼다(1.0.89에서도 같은 상태 확인이 통과).
  - 다음 링크가 알 것: (1) 공용 프로필의 **복사본**을 다른 worktree의 dev 앱으로 열면 vault를 읽지 못했다(Cursor·Antigravity·Copilot이 `check_failed`). 링크 2는 복사본이 아니라 `/Users/sinhyeok/code/doan-design/.scratch/provider-profile/userData`를 그 자리에서 쓰고, 같은 증상이면 먼저 이 원인을 의심한다. (2) Copilot 요청은 링크 1에서 약 10개를 썼다. (3) 지금 Codex 계정의 모델 목록(`~/.codex/models_cache.json`)에는 gpt-6-luna, gpt-5.6-terra, gpt-5.6-luna만 있고 orchestrate §0의 Astra·Sol id가 없다. 링크 1은 리뷰를 Claude Sonnet에 맡겼다. (4) Codex·Copilot의 `login`은 기본 브라우저(Chrome)를 직접 연다. Claude는 Doan의 "Open again" 링크를 ego-browser(로그인된 계정)에서 승인할 수 있다. (5) 사람 상태 비교 스크립트 `.scratch/cli-minimum-versions/state/state.ts`(링크 1 worktree)는 실제 runtime `sessions.jsonl`도 비교한다. 셸에서 `doan check`를 돌릴 때는 꼭 임시 `DOAN_RUNTIME`을 준다.
  - 구현 브랜치(남김): `feat/cli-minimum-versions`, `SinhyeokKang/feat-lower-provider-cli`, `SinhyeokKang/fix-session-in-use`.
- 2026-11-05 링크 2 지휘자(canvas-composer-polish): PR #95를 `d0f5f7c2`로 병합했다.
  - 결과: 여섯 가지를 모두 넣었다. Presets 목록과 `/` 목록은 캔버스를 포함한 바깥 누름에 닫힌다(canvas script의 새 `press` 메시지). Send now는 메시지를 바로 쓰레드로 옮긴다. 툴바 세 번째 도구는 Picker이고 ⌘L은 Pick from Canvas다(Add to conversation 삭제). 권한 답을 기다리는 대화는 같은 프로젝트를 막지 않는다. 툴바 Export와 Canvas conversations 행 Delete가 생겼다. PRODUCT·ARCHITECTURE·DESIGN·BACKLOG·POSTMORTEM을 고쳤고 feature 디렉터리를 지웠다.
  - 진행 중 지휘자가 정한 것(사용자에게 묻지 않음, 상시 권한 '멈추지 않고 진행'): 겹친 턴에서 두 턴이 다툰 새 캔버스는 어느 대화에도 붙지 않는다(design의 역방향 기대값 "뒤에 판정되는 B는 X에 붙음"보다 spec 완료 조건 4를 따름). 캔버스 누름 신호는 기존 select·clear·picked 대신 새 `press` 메시지로 했다. 픽 취소 뒤 포커스는 사람이 옮기지 않았을 때만 픽 전 위치로 돌린다. 오른쪽·Ctrl 누름은 `/` 목록을 닫고 포커스를 필드에 둔다. "열린 권한 요청이 하나라도 있으면 답 대기"로 보는 한계는 ARCHITECTURE §7에 적었다.
  - 검증: 통합 HEAD `797bd397`에서 `verify: PASS`. 실제 앱: 격리 앱 probe 79/79(Esc 수정 뒤), 공용 프로필 Claude Code 5턴으로 답 대기 admission과 Send now 확인, `/design-sync` 9프레임 140쌍. real-state 변화 없음.
  - 확인하지 못한 것: 네이티브 ⌘L과 네이티브 저장 패널 포커스(데스크톱 잠김, BACKLOG), 턴 실행 중 provider 거절과 겹친 턴의 캔버스 promotion의 실제 앱 동작(unit만), 중첩 iframe press(unit만).
  - 다음 링크가 알 것: (1) export-viewer-chrome: 앱 툴바가 이제 Select, Hand, Picker, 구분선, Export다. 그 design대로 `exportViewer.test.ts`는 Select·Hand 두 항목과 toolbar 이름만 고정하면 된다. (2) 공용 프로필에는 C2b의 임시 repo용 Claude transcript가 남아 있다. 마지막 링크가 프로필을 지울 때 함께 사라진다. 이 링크는 로그아웃하지 않았다. (3) agent-questions(체인 밖)가 나중에 들어오면: main의 답 대기 판정(`project.ts` `ProjectTurn.asking`, `service.ts` `Live.asking`)은 `permission.request`·`permission.resolved`만 센다. 질문 대기도 root를 막지 않게 하려면 질문 요청을 같은 집합에 더해야 한다. (4) Codex 작업자는 쓰지 않았다(모델 목록에 Astra·Sol id가 없음). Claude 작업자와 Claude 리뷰만 썼다.
  - 구현 브랜치(남김, 로컬): `feat/canvas-composer-polish`(원격에도 있음), `SinhyeokKang/ccp-adm`, `SinhyeokKang/ccp-send`, `SinhyeokKang/ccp-tool`, `SinhyeokKang/ccp-pre`, `SinhyeokKang/ccp-sync`, `SinhyeokKang/ccp-docs`. batch worktree는 모두 지웠다.
