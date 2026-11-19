# chain-261119-1

## 규칙

- 진행 방식은 [chain skill](../../../.agents/skills/chain/SKILL.md)과 AGENTS.md 'Workflow'의 Chains를 따른다. 리드가 각 링크의 conductor를 시작하고, PR을 리뷰·머지한다. conductor는 이 파일을 고치지 않는다.

## 순서

직렬로 진행한다. 세 링크 모두 `app/src/renderer/styles.css`를 바꾼다. header와 inspector는 `App.tsx`, export 뷰어 `cli/internal/export/viewer/shell.*`, `assemble.go`, `app/src/main/exportViewer.test.ts`도 함께 바꾼다. 그래서 병렬 그룹이 없다.

1. **composer-markdown** — [spec](../composer-markdown/spec.md) · [design](../composer-markdown/design.md) · [tasks](../composer-markdown/tasks.md)
   - 상태: `/feature-review` 완료. 초안 `.doan/canvases/composer-markdown.html` 확정. PoC 완료(design.md 'PoC 결과').
   - 이유: 다른 두 링크와 겹치는 파일이 `styles.css`뿐이고, 범위가 가장 작다. 먼저 끝내 뒤 링크의 기반 변화를 줄인다.
2. **header-breadcrumb-worktree** — [spec](../header-breadcrumb-worktree/spec.md) · [design](../header-breadcrumb-worktree/design.md) · [tasks](../header-breadcrumb-worktree/tasks.md)
   - 상태: `/feature-review` 완료. 초안 `.doan/canvases/header-breadcrumb-worktree.html`(viewer-header 포함) 확정. PoC 없음.
   - 이유: 캔버스 헤더와 export 뷰어 헤더의 구조를 바꾼다. inspector 링크가 그 헤더 위에 Show inspector를 얹으므로 먼저 간다.
3. **inspector-reach** — [spec](../inspector-reach/spec.md) · [design](../inspector-reach/design.md) · [tasks](../inspector-reach/tasks.md)
   - 상태: `/feature-review` 완료. 초안 `.doan/canvases/inspector-reach-bubble.html`, `.doan/canvases/inspector-reach-viewer.html` 확정. PoC 완료(design.md 'PoC 결과', 'PoC 뒤 결정': 행 단위 물러서기).
   - 이유: 가장 크고(앱 (B) + CLI 뷰어 (A)), header 링크가 바꾼 뷰어 헤더를 쓴다. tasks대로 (B)를 먼저, (A)를 나중에 배치로 나눈다.

## 시작 점검

리드는 링크 1을 시작하기 전에 아래를 사용자에게 한 번에 묻고, 승인을 '인계 기록'에 적는다. 그 뒤로 conductor는 일상적인 판단을 스스로 하고, 새 제품·범위 결정이나 실제 사용자 상태에 닿는 결정만 묻는다.

1. composer 완료 조건 7(한글 IME 조합)은 macOS 한글 IME로 사람이 실제 앱에서 확인한다. 링크 1의 `/runtime-test` 때 사용자가 직접 확인할지, 확인하지 못하면 BACKLOG 'Not verified in the real app'에 남기는 것으로 끝낼지.
2. composer PoC의 남은 점: ⌘←로 기호 앞에 가서 입력하면 그 줄은 목록이 아니게 된다(텍스트 모델대로). 이대로 둘지.
3. inspector tasks 10(브라우저 확인)의 확인 명령이 "command undecided"다. conductor가 `.scratch/` 스크립트를 정해 쓰는 것을 미리 승인할지. 실제 Safari는 실행하지 않고 BACKLOG에 남긴다.
4. inspector tasks 8의 생성 스크립트(TS → `cli/internal/export/viewer/inspect.js`, `--check`)를 AGENTS.md 'Commands'에 더하는 것을 conductor가 링크 브랜치에서 해도 되는지.
5. 로그인 프로필(아래 '로그인')을 체인이 끝난 뒤에도 남길지. 이전 세션에서 사용자는 이 프로필을 지우지 말고 로그아웃하지 말라고 했다. chain skill 기본(마지막에 로그아웃·삭제)과 다르므로 확인한다.

## 상시 권한

- 리드는 각 링크의 PR을 리뷰와 gate가 통과하면 링크 순서대로 develop에 머지하고 다음 링크를 시작한다(chain 기본).
- conductor 런타임: Claude Code(리드와 같은 계열).
- **모델 경계 넘기(사용자 허가, 2026-11-19)**: 이 체인의 모든 링크에서 conductor가 Codex 워커를 쓸 수 있다. 조건:
  - conductor는 링크 시작 때와 배치를 나눌 때 Codex의 남은 사용량을 확인한다. 배치 계획을 세우기 전에 반드시 확인하고, 남은 양이 있을 때만 Codex 워커를 띄운다. Codex 토큰은 2026-11-19 18:16 무렵 초기화될 예정이다(사용자 안내). 그 전이라 남은 양이 없으면 초기화 뒤 다시 확인한다.
  - 각 링크의 `orch.md`에 Codex를 쓴 배치와 이유를 적는다.
  - 모델과 effort는 `/orchestrate` §0 3의 공통 규칙을 따른다(Codex Astra·Sol, Claude 모두 effort 상한 `high`).
- **링크 2·3 모델 배치(사용자 지시, Astra 신버전 시험)**: 링크 2(header-breadcrumb-worktree)와 링크 3(inspector-reach)은 conductor가 Claude Code이고, 구현 배치(수정 라운드 포함)는 모두 Codex `gpt-6.2-astra` 워커가 맡는다. 리뷰(독립 리뷰 워커와 conductor 리뷰)는 Claude가 맡는다. effort는 배치 난도에 따라 `medium` 또는 `high`로 정한다. Codex 남은 사용량 확인 규칙은 위와 같다. `orch.md`와 PR 본문에 Astra 신버전의 결과(라운드 수, 리뷰에서 나온 문제)를 적는다.

## 로그인

- composer 링크의 `/runtime-test`는 보낸 버블·제목·큐 행을 보려면 실제 대화가 필요해서 provider 로그인이 필요하다. header와 inspector 링크는 로그인이 필요 없다.
- 로그인된 userData: `/Users/sinhyeok/code/doan-design/.scratch/provider-profile/userData`(메인 체크아웃). Claude Code, Codex, Cursor, Antigravity, Copilot이 로그인되어 있다. 링크는 각자 워크트리를 가지므로 이 절대 경로를 쓴다.
- 실행: `/Users/sinhyeok/code/doan-design/.scratch/runtime-test/first-run-261119/launch-kept.sh`(읽고 링크 워크트리의 빌드를 가리키게 고쳐 쓴다). 개발 Electron을 띄울 때마다 Keychain "doan Safe Storage" 창이 한 번 뜬다. 사용자는 "허용"(한 번만)을 누르고 "항상 허용"은 누르지 않는다. 띄우기 전에 사용자에게 알린다.
- 프로필에는 등록된 프로젝트가 없다. 앱이 꺼진 동안 `<userData>/folders.json`에 `["/private/tmp/<project>"]`를 쓰고(`doan init --storage local` 먼저), 끝나면 지운다.
- 링크마다 로그아웃하지 않는다. 지우는 probe는 복사본으로 한다. 새 로그인을 청하기 전에 프로필을 먼저 확인한다. 체인이 끝난 뒤에도 로그아웃하지 않고 프로필을 남긴다(사용자 승인, '인계 기록').
- probe가 남긴 대기 메시지나 대화는 링크 안에서 지운다(이전 세션에 대기 메시지가 남은 적이 있다).

## 진행 규칙

- chain skill §3(Lead, Conductor)을 따른다.

## 운영 메모

- 워커 대기: conductor는 워커가 `worker_done` 없이 멈출 수 있으니, 대기 루프가 유휴 프롬프트나 working이 아닌 상태에서도 깨어나게 한다.
- `/agent-eval`: 세 링크 모두 CLI 출력·guide·`doan check` 규칙을 바꾸지 않아 정식 라운드는 필요 없다. header와 inspector 링크는 export 파일이 바뀌므로 `node eval/run.ts --self-test --scenarios X1,X2` self-test PASS를 확인한다.
- export 출력 고정 테스트(`TestAssembleOutputIsPinned`)는 header 링크와 inspector 링크에서 각각 갱신된다. inspector 링크는 header 링크가 머지된 develop에서 시작한다.
- PoC 증거는 메인 체크아웃의 `.scratch/composer-markdown/`, `.scratch/inspector-reach/`에 있다(gitignore). 결론은 각 design.md에 있다.
- 실제 Doan 앱이 켜져 있으면 eval real-state 가드가 걸린다. self-test는 상관없다.

## 링크 상태

| 링크 | 세션·워크트리 | 시작 | PR·머지 | 상태 |
|---|---|---|---|---|
| 1 composer-markdown | Claude conductor · `/Users/sinhyeok/orca/workspaces/doan-design/composer-markdown-orch` (`feat/composer-markdown`) | 2026-11-19 17:58 (`2b11f18cd`) | [#307](https://github.com/SinhyeokKang/doan-design/pull/307) · `dc07740a4` | 머지 |
| 2 header-breadcrumb-worktree | Claude conductor(구현 Codex `gpt-6.2-astra`, 리뷰 Claude) · `/Users/sinhyeok/orca/workspaces/doan-design/header-breadcrumb-worktree-orch` (`feat/header-breadcrumb-worktree`) | 2026-11-19 21:07 (`50ecade95`) | | 진행 중 |
| 3 inspector-reach | | | | 대기 |

## 인계 기록

- 2026-11-19 (리드 세션, 체인 작성): 세 feature의 `/feature-review`, 초안 확정, PoC(composer, inspector (A))를 마쳤다. 사용자는 이 체인을 새 리드 세션이 시작한다고 했다. Codex 워커 허가는 사용자가 이 체인 전체에 대해 주었다. 같은 날 공통 규칙에서 Codex Astra의 effort 상한을 `high`로 올렸다(`b160a7aa9`). 아직 '시작 점검'을 묻지 않았다.
- 2026-11-19 (새 리드 세션, 체인 시작): 사용자가 '시작 점검'을 승인했다.
  1. composer 완료 조건 7(한글 IME): 링크 1의 `/runtime-test` 때 사용자가 실제 앱에서 직접 확인한다. 확인하지 못하면 BACKLOG 'Not verified in the real app'에 남긴다.
  2. ⌘←로 기호 앞에 입력하면 목록이 풀리는 동작은 그대로 둔다.
  3. inspector tasks 10: conductor가 `.scratch/` 확인 스크립트를 정해 쓰는 것을 승인했다. 실제 Safari는 실행하지 않고 BACKLOG에 남긴다.
  4. inspector tasks 8의 생성 스크립트 명령을 conductor가 링크 브랜치에서 AGENTS.md 'Commands'에 더해도 된다.
  5. 로그인 프로필은 체인이 끝난 뒤에도 남긴다. 로그아웃하지 않고 지우지 않는다(chain skill 기본과 다름).
  - Codex: 사용자가 18:16 무렵 토큰 초기화를 알렸다. conductor는 배치 계획 전에 Codex 남은 사용량을 확인하고, 사용할 수 있을 때만 Codex 워커를 띄운다('상시 권한').
  - 링크 2: 사용자가 Astra 신버전을 시험하려고 구현은 Codex `gpt-6.2-astra`, 리뷰는 Claude Code로 하자고 했다('상시 권한').
  - 링크 3: 사용자가 링크 3도 링크 2와 같은 모델 배치로 하자고 했다('상시 권한').
- 2026-11-19 (리드, 링크 1 머지): PR #307을 `dc07740a4`로 머지하고 conductor 워크트리를 지웠다(브랜치 `feat/composer-markdown`은 남김). 다음 링크가 알아야 할 것:
  - `app/src/renderer/styles.css`에 전역 `.list-mark`·`.list-depth` 규칙과 `.conversation-thread .bubble-*` 목록 규칙이 생겼다. design check가 커스텀 속성을 `:root`에만 허용해서 `attr(... type(<number>))`를 쓴다.
  - 사용자 결정: 목록 한 단계 20px(`--space-5`), 모든 기호를 한 단계 안쪽에 둔다, 기호 열 12px(`--space-3`), 버블 번호는 오른쪽 정렬.
  - 실제 앱에서 확인하지 못한 것(BACKLOG): VoiceOver가 숨은 기호를 읽는 방식, 기호 안에서 시작하는 실제 마우스 드래그, 조합을 끝낸 키를 다시 보내지 않는 입력기.
  - 로그인 프로필은 남겼다. 그 프로필의 Claude Code는 11월 21일 13:00까지 주간 한도에 걸려 있고 Codex는 쓸 수 있다.
  - 전체 verify에서 `src/main/shell.test.ts`가 부하 때문에 20초 타임아웃으로 한 번 실패한 적이 있다(다시 돌리면 통과, 바뀐 영역 아님).
