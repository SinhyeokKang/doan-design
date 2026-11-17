# 백로그 수정 배치 — backlog-fixes-261117

- 작성일: 2026-11-17
- 기준: `develop` `b9ffcf79d`(docs(backlog): settle six open questions)
- 출처: `docs/BACKLOG.md`의 'Known defects' 항목 가운데, 결정 없이 고칠 수 있는 12개와 2026-11-17에 사용자가 수정안을 정한 4개다. 이 문서에서는 항목을 BACKLOG 문장의 첫머리로 가리킨다. 줄 번호는 커밋마다 바뀌므로 쓰지 않는다.
- 성격: `/feature` 계획이 아니라 `/ship` 배치 목록이다. 배치 하나를 컨덕터 하나가 맡는다. 마지막 배치가 머지되면 이 디렉터리를 지운다.

## 1. 확인하지 못한 것 (먼저)

- **실제 앱에서 재현하지 않았다.** 각 항목은 BACKLOG의 기록과, 이 문서를 쓰면서 확인한 코드 위치에 기댄다. 컨덕터가 고치기 전에 재현하거나 실패하는 테스트로 고정한다.
- **아직 남아 있는지 확인한 항목**은 다음 넷이다.
  - `/` 목록: `.slash-popover`가 `styles.css`에서 여전히 absolute로 놓인다.
  - busy 컨트롤: `ds/controls.css`의 hover·pressed 규칙이 `:disabled`와 `[data-disabled]`만 제외한다.
  - 프리셋 Retry: `HomeComposerView.tsx`에서 여전히 `update({ presets: undefined })`를 한다.
  - 버디 부제: `Onboarding.tsx`에 "You can change it later in Settings."가 있다.
  - 나머지 항목은 코드 위치만 찾았고 경로를 끝까지 추적하지 않았다.
- **`doan.rules`(B6-1)**: 릴리스 태그 21개(`v0.1.0-rc.1`–`v0.1.18`)의 `codexRuleText()`가 모두 같다. 그래서 지금은 "이전 텍스트 목록"에 넣을 항목이 없다. 이 작업은 앞으로 텍스트가 바뀔 때를 대비해 장치를 만드는 일이다.

## 2. 사용자 결정 (2026-11-17)

BACKLOG에 "Fix (decided)"로 적었다. 구현이 끝나면 각 배치가 PRODUCT·ARCHITECTURE에 지금 규칙으로 옮겨 적는다.

| 항목 | 결정 |
|---|---|
| 고아 start (`drafts.json` `starts`) | 캔버스를 Move to Trash하면 그 캔버스의 starts를 지우고, 프로젝트를 Remove from Doan하면 그 루트들의 starts를 지운다. 다른 composer로 옮겨 복원하지 않는다. |
| 프로토타입 창 최소 높이 | 프레임 영역의 최소 높이를 너비와 같은 360px로 둔다. 더 낮은 프레임은 그 안에서 세로 가운데에 놓는다. |
| `ls`가 읽지 못한 하위 폴더 | 그 폴더를 `error`가 있는 행으로 보고하고 나머지 캔버스는 나열한다. 읽을 수 없는 캔버스 파일(`unreadable_canvas`)과 같은 규칙이다. |
| `doan.rules`의 이전 텍스트 | 이전 릴리스들의 `codexRuleText()`를 코드에 목록으로 두고, 그중 하나와 정확히 일치하면 Doan 것으로 보고 교체한다. 사람이 고친 파일은 계속 남의 것이다. |

현행을 유지하기로 한 두 항목(About의 GitHub 링크, Esc 폴백)은 BACKLOG에서 지웠다. 이 배치에는 들어가지 않는다.

## 3. 배치

| 배치 | 브랜치 | 항목 | 주로 바뀌는 파일 |
|---|---|---|---|
| B1 컴포저 상태 | `fix/composer-states` | 1-1 `/` 목록 넘침, 1-2 busy 컨트롤 hover, 1-3 프리셋 Retry, 1-4 Home Send 사유 | `styles.css`, `ds/controls.css`, `ComposerParts.tsx`, `HomeComposerView.tsx`, `DockedComposer.tsx` |
| B2 문구 | `fix/backlog-wording` | 2-1 버디 부제, 2-2 `session_in_use`, 2-3 `account_mismatch` | `Onboarding.tsx`, `dockedRules.ts`, `agentAuthView.ts` |
| B3 제거 뒤 정리 | `fix/removal-cleanup` | 3-1 숨은 worktree, 3-2 프로토타입 창 닫기, 3-3 고아 start, 3-4 `conversationByCanvas` | `homeRun.ts`, `App.tsx`, `main/index.ts`, `prototypeWindow.ts`, `conversation/drafts.ts`, `canvasTrash.ts` |
| B4 프로토타입 창 | `fix/prototype-window-limits` | 4-1 24시간제, 4-2 최소 높이 | `prototypeWindow.ts`, `prototype/fit.ts`, `main/index.ts`, `clockHourCycle.ts` |
| B5 `ls` 폴더 행 오류 | `fix/ls-folder-row-error` | 5-1 | `cli/internal/repo/files.go`, `cli/internal/cli/read.go`, 앱의 `ls` 행 처리 |
| B6 설정·격리 | `fix/setup-rule-history` | 6-1 `doan.rules` 이전 텍스트, 6-2 `isolatedEnv` PATH | `agentSetup/plan.ts`, `app/runtime/environment.ts` |
| B7 eval transcript reader | `fix/eval-heredoc-doan` | 7-1 Python heredoc 안의 `doan` 호출 읽기 | `eval/lib/transcript.ts`, `eval/scenarios/D1/presets.ts` |
| B8 lint `no-unnecessary-condition` | `refactor/lint-unnecessary-condition` | 8-1 규칙 켜기와 지적 정리 | `app/.oxlintrc.json`, `app/src`·`app/runtime`의 비테스트 파일 약 37개 |
| B9 `eval/` 타입체크와 lint | `refactor/eval-typecheck` | 9-1 타입체크 켜기, 9-2 lint 켜기 | `eval/` 전체, 타입체크·lint 설정, verify 게이트 |

**순서와 겹침.**
- B1, B2, B3, B5, B6은 바로 동시에 돌려도 된다. 서로 고치는 파일이 겹치지 않는다.
- B4는 B3의 PR이 머지된 뒤에 띄운다. 둘 다 `prototypeWindow.ts`와 `main/index.ts`를 고친다.

**모든 배치 공통.**
- 컨덕터는 `/ship`으로 진행하고, 끝나면 `/verify`를 돌린다.
- 앱 동작이 바뀌는 배치(B1–B5)는 바뀐 동작만 `/runtime-test`로 짧게 확인한다. 확인하지 못한 것은 PR 본문에 적는다.
- 마지막 단계에서 다음을 한다.
  - 고친 항목을 BACKLOG에서 지운다.
  - 2절의 결정이 있으면 PRODUCT·ARCHITECTURE에 지금 규칙으로 적는다.
  - 측정값이 바뀌면 DESIGN과 `docs/design/*.md`를 고친다.
- 버그 수정은 `/postmortem` 대상인지 판단한다.
- 코드 주석에 이 문서나 배치 번호를 적지 않는다.

## 4. 배치별 작업

### B1 컴포저 상태 (`fix/composer-states`)

1. **`/` 목록 넘침** (BACKLOG "The `/` list runs past the right edge…")
   - 현상: 캔버스 대화 패널이나 프로토타입 창 대화 패널이 좁으면 `.slash-popover`가 패널 오른쪽 밖으로 나간다.
   - 수정: 목록 너비를 composer 너비 안으로 제한한다. 바꾸는 범위는 좁은 패널에서만 보이는 차이로 한정한다.
   - 확인: 좁은 캔버스 패널과 프로토타입 창 패널에서 `/runtime-test`로 본다.
2. **busy 컨트롤의 hover·pressed** (BACKLOG "A busy confirm or busy Retry…")
   - 현상: `aria-disabled`와 `aria-busy`가 붙은 버튼에도 공용 hover·pressed 채움이 들어간다.
   - 수정: `ds/controls.css`의 제외 조건에 busy 상태를 더한다. 포커스와 라벨은 그대로 둔다(DESIGN 'Busy action').
   - 확인: `ds/controls.test.ts`에 테스트를 더하고, Move to Trash 확인창에서 런타임으로 확인한다.
3. **프리셋 팝오버 Retry** (BACKLOG "The preset popover's Retry…")
   - 현상: Retry를 누르면 `readPresets`가 `presets: undefined`로 비워 알림과 Retry가 언마운트되고 포커스를 잃는다. Home과 도킹 composer 모두 해당한다.
   - 수정: 다시 읽는 동안 알림과 Retry를 남긴다. 기존 `retryButton`·`useRetry`(`ListRetryButton.tsx`)를 쓴다.
   - 확인: Home과 도킹 composer 각각 단위 테스트로 확인한다.
4. **Home Send의 사유 연결** (BACKLOG "Home's disabled Send button exposes the blocking reason…")
   - 현상: "no agent"일 때만 Send에 툴팁과 접근성 설명이 붙는다. 프로젝트 없음, 글자 수 초과, 확인 중, 다른 대화 진행 중일 때는 사유가 composer 아래에만 보인다.
   - 수정: 다섯 경우 모두 사유를 Send의 툴팁과 `aria-describedby`에 연결한다(PRODUCT §5 item 1의 Send 계약).
   - 확인: `HomeComposerView` 테스트로 확인한다.

### B2 문구 (`fix/backlog-wording`)

문구를 쓰기 전에 Doan의 `clarify` 프리셋(`doan design-skill clarify --json`)을 읽는다.

1. **첫 실행 버디 부제** (BACKLOG "The first-run Buddy subtitle says…")
   - 현상: "You can change it later in Settings."라고만 하고, Settings에서 바꿀 때마다 24시간 잠금이 걸린다는 사실(PRODUCT §5 item 0 'General')을 알리지 않는다.
   - 수정: 부제가 잠금을 알리게 한다. 첫 실행에서 고르는 것 자체는 잠금을 걸지 않는다.
2. **`session_in_use` 문구** (BACKLOG "Continuing a terminal session on a Claude session that a Doan conversation's background work still holds…")
   - 현상: 세션을 쥔 쪽이 Doan 자신의 대화인데도 `dockedRules.ts`의 두 문구가 "elsewhere"라고 한다.
   - 수정: 거부는 그대로 두고 문구만 고친다. 쥔 쪽이 Doan 대화인지 화면에서 알 수 있으면 그 경우를 따로 말한다. 알 수 없으면 두 경우를 모두 덮는 문구를 쓴다.
3. **`account_mismatch` 문구** (BACKLOG "The `account_mismatch` notice does not say when only the organization differs…")
   - 현상: `agentAuthView.ts`는 "a different <provider> account"라고만 한다. 계정은 같고 조직만 다른 경우를 말하지 않는다.
   - 수정: main이 조직만 다른 경우를 구분해 넘기는지 먼저 확인한다. 구분할 수 있으면 그 문구를 따로 두고, 구분할 수 없으면 계정과 조직을 함께 덮는 문구로 바꾼다.

### B3 제거 뒤 정리 (`fix/removal-cleanup`)

1. **숨은 자동 등록 worktree** (BACKLOG "The menu's Remove from Doan… passes only the group's shown rows…")
   - 현상: 사이드바, 문제 오버레이, Project Settings 페이지의 Remove from Doan은 보이는 행만 넘긴다. 그래서 목록에 띄울 수 없는 자동 등록 worktree가 `folders.json`과 `auto-folders.json`에 남는다.
   - 수정: `doan remove`처럼 그룹 전체를 넘긴다(PRODUCT §5 items 1, 10). 시작점은 `homeRun.ts` `remove`·`confirmRemove`와 각 메뉴의 호출부다.
2. **제거된 프로젝트의 프로토타입 창** (BACKLOG "A removed project's prototype window stays open…")
   - 수정: Remove from Doan과 `doan remove`가 공유하는 `main/index.ts` `removeRoots`에서, 제거된 루트의 캔버스를 띄운 프로토타입 창을 닫는다.
3. **고아 start** (BACKLOG "A new conversation's first message that a quit stopped…", 2절 결정)
   - 수정: 캔버스를 Move to Trash하면(`canvasTrash.ts`) 그 캔버스의 starts를 지우고, 프로젝트를 제거하면(`removeRoots`) 그 루트들의 starts를 지운다(`conversation/drafts.ts`).
   - 함께 볼 것: 지운 start에 붙어 있던 첨부 사본이 정리되는지 확인한다.
   - 확인: 실제 파일을 쓰는 단위 테스트로 확인한다.
4. **`conversationByCanvas`가 줄지 않음** (BACKLOG "ui-state's `conversationByCanvas`… shrinks only when a root is removed…")
   - 현상: 삭제된 대화나 캔버스의 항목이 남는다. 캔버스가 약 800개 쌓이면 64 KiB 상한(`UI_STATE_MAX_BYTES`)을 넘고, 그 뒤로 ui-state 저장이 모두 거부된다.
   - 수정: 대화를 삭제하거나 캔버스를 휴지통으로 옮길 때 해당 항목을 지운다.
   - 확인: 상한 가까이에서도 저장되는지 단위 테스트로 확인한다.

### B4 프로토타입 창 (`fix/prototype-window-limits`, B3 머지 뒤)

1. **24시간제** (BACKLOG "The prototype window's conversation panel does not follow macOS's 24-hour setting…")
   - 현상: main은 `clockArgument`(`--doan-clock-hour12`)를 메인 창에만 넘긴다(`main/index.ts`). 그래서 프로토타입 창 패널의 `localClock()`은 renderer의 `Intl`을 쓴다.
   - 수정: 프로토타입 창(`prototypeWindow.ts`의 `new BrowserWindow`)에도 같은 인자를 넘긴다.
2. **최소 높이 360px** (2절 결정)
   - 수정: 프레임 영역의 최소 높이를 360px로 둔다. 지금 최소 크기는 `setMinimumSize(width, 0)`이다(`prototypeWindow.ts`). 맞춤 계산은 `prototype/fit.ts`에 있다. 낮은 프레임은 영역 안에서 세로 가운데에 놓는다.
   - 확인: Fit과 Responsive 각각, 대화 패널이 열린 상태와 닫힌 상태로 `fit.test.ts`에서 확인하고, `600x10` 마크를 `/runtime-test`로 본다.
   - 고칠 문서: ARCHITECTURE §3 'Prototype window' 'Fit', PRODUCT §5 item 2 'Prototype window'.

### B5 `ls` 폴더 행 오류 (`fix/ls-folder-row-error`)

1. **읽지 못한 하위 폴더** (2절 결정)
   - 현상: `.doan/canvases/` 아래 하위 폴더 하나를 읽지 못하면 `ls` 전체가 실패하고(ARCHITECTURE §12: whole-set failures fail the command), 앱은 프로젝트를 CLI 오류로 보인다.
   - 수정: 걷기(`cli/internal/repo/files.go` `WalkDir`)에서 폴더 오류를 그 폴더의 행 오류로 바꾸고 나머지를 나열한다. 행 모양은 `unreadable_canvas`(`cli/internal/cli/read.go`)를 따른다. 새 오류 코드가 필요한지는 컨덕터가 정한다. 메시지에 절대 경로를 넣지 않는다.
   - 앱: 폴더 행은 캔버스가 아니다. 사이드바와 목록이 이 행을 열 수 있는 캔버스로 다루지 않는지 확인한다.
   - CLI 출력이 바뀌므로 `/agent-eval` 판단을 PR에 적는다.
   - 고칠 문서: ARCHITECTURE §12, PRODUCT §5 item 9.

### B6 설정·격리 (`fix/setup-rule-history`)

1. **`doan.rules` 이전 텍스트** (2절 결정)
   - 수정: `agentSetup/plan.ts`의 소유 판정(`codexRuleText()` 일치)에 이전 텍스트 목록을 더한다. Connect의 옛 링크를 인식하는 형식(`plan.ts`)을 따른다. 1절대로 지금은 목록이 비어 있다.
   - 확인: 현재 텍스트를 고정하는 테스트를 둔다. 텍스트를 바꾸면 그 테스트가 실패해서 바꾸는 사람이 이전 텍스트를 목록에 넣게 만든다.
   - 고칠 문서: ARCHITECTURE §7 'Agent setup' 'Ownership'.
2. **`isolatedEnv`의 PATH** (BACKLOG "`app/runtime/environment.ts` `isolatedEnv` passes the caller's `PATH`…")
   - 현상: 호출한 쪽의 PATH를 그대로 넘긴다. 그래서 `HOME`을 무시하는 에이전트 CLI(Antigravity `agy`)가 실제 사용자 상태를 건드릴 수 있다.
   - 수정: 고정된 시스템 PATH(`/usr/bin:/bin:/usr/sbin:/sbin`)를 기본으로 한다. 프로브에 필요한 도구가 빠지면 그 경로만 명시적으로 넘긴다. docked buddy 프로브는 이미 이 PATH를 직접 고정했다.
   - 확인: `node --test 'app/runtime/*.test.ts'`를 돌리고, 기존 프로브 하나가 그대로 도는지 본다.

### B7 eval transcript reader (`fix/eval-heredoc-doan`, 2026-11-17 추가)

1. **Python 안에서 호출한 `doan`** (BACKLOG "The agent-eval transcript reader cannot read `doan` calls Codex makes from inside Python…")
   - 현상: Codex가 `python3 -` heredoc 안에서 `subprocess.run(['doan', …])`를 부르거나, heredoc으로 쓴 `.py`를 실행하면 `interpreterMayRunDoan`(`eval/lib/transcript.ts`)이 그 명령을 incomplete로 본다. 그러면 `preset_reads_allowed`(`eval/scenarios/D1/presets.ts`)가 실패한다. 판정이 실패 쪽으로 닫혀 있어서 허용된 읽기만 한 실행도 떨어진다.
   - 수정: BACKLOG가 적은 첫 번째 선택지를 구현한다. heredoc 본문을 정적으로 읽어, `doan` argv 목록이 모두 문자열 리터럴인 호출만 읽은 것으로 센다. 동적인 인자와 `.py` 파일은 계속 incomplete로 둔다. 두 번째 선택지(`doan` 바이너리의 읽기 로그)는 ARCHITECTURE를 바꾸므로 이 배치에 넣지 않는다.
   - 확인: 리터럴 호출, 동적 호출, `.py` 파일 각각의 transcript fixture로 `node --test 'eval/**/*.test.ts'`와 `node eval/run.ts --self-test --scenarios D10g,D10h`를 돌린다. 실제 에이전트 라운드는 돌리지 않는다.
   - `/verify --eval`을 쓴다. 제품 CLI와 가이드는 바뀌지 않으므로 `/agent-eval`은 필요 없다.

### B8 lint `no-unnecessary-condition` (`refactor/lint-unnecessary-condition`, 2026-11-17 추가)

1. **규칙 켜기** (BACKLOG "`no-unnecessary-condition` is excluded from app lint…")
   - 현상: 이 규칙을 앱 lint에서 빼 두었다. 켜면 비테스트 소스 37개 파일에서 115건이 나온다(BACKLOG 기록 기준이며, 지금 숫자는 컨덕터가 다시 잰다). POSTMORTEM의 “Home remembered its choice on every mount” 버그는 이 규칙이 있었다면 잡혔다.
   - 수정: `app/.oxlintrc.json`에서 규칙을 error로 켜고, 지적을 하나씩 정리한다.
     - 실제로 불필요한 조건은 지운다.
     - IPC, JSON, 파일, 외부 프로세스 경계처럼 타입이 실제 값보다 좁아서 생긴 지적은 방어 조건을 지우지 않는다. 대신 그 입력의 타입을 `unknown`이나 실제 모양으로 넓힌다.
     - 동작을 바꾸지 않는다. 지적 하나를 고치다 동작이 바뀌는 버그를 찾으면, 따로 테스트로 고정하고 PR 본문에 적는다.
     - 규칙을 끄는 주석은 이유가 분명한 곳에만 쓰고, 이유를 주석에 적는다.
   - 테스트 파일과 `eval/`은 이 배치 범위가 아니다(BACKLOG의 별도 항목).
   - 확인: `npm --prefix app run lint`가 오류 없이 통과하고, `/verify`를 돌린다. 앱 동작은 바뀌지 않으므로 `/runtime-test`는 필요 없다.
   - 고칠 문서: BACKLOG 항목을 지운다. verify 스킬의 lint 설명이 규칙 목록을 말하면 맞춘다.

### B9 `eval/` 타입체크와 lint (`refactor/eval-typecheck`, B7 머지 뒤 2026-11-17 추가)

BACKLOG "Lint for `eval/` needs type checking first…" 항목이다.

1. **타입체크 켜기**
   - 현상: `eval/`을 포함하는 tsconfig가 없다. 임시 tsconfig로 돌리면 TypeScript 오류가 110건 나온다(BACKLOG 기록 기준이며, B7 머지 뒤 숫자는 컨덕터가 다시 잰다).
   - 수정: `eval/`을 타입체크하는 tsconfig를 두고 오류를 고친다. 그 타입체크를 공용 게이트(`.agents/skills/verify/scripts/verify.mjs`)에 넣는다. 런타임 동작은 바꾸지 않는다. `node eval/run.ts`처럼 Node가 TypeScript를 그대로 실행하는 방식도 그대로 둔다.
2. **lint 켜기**
   - 수정: 비테스트 `eval/` 코드에 앱과 같은 type-aware lint를 적용하고, `eval/lib/socket.ts`의 no-misused-promises 1건(자식 프로세스의 `process.stdin.on("end", …)` 처리기)을 고친다. 테스트 파일은 앱처럼 범위 밖이다.
- 확인: `/verify --eval`, `node --test 'eval/**/*.test.ts'`, `node eval/run.ts --self-test`. 실제 에이전트 라운드는 돌리지 않는다.
- 겹침: B8이 `app/.oxlintrc.json`을 고친다. lint 설정을 함께 건드리면 나중에 머지하는 쪽이 develop을 받아 맞춘다.
- 고칠 문서: BACKLOG 항목을 지우고, AGENTS.md 'Commands'의 lint·typecheck 설명과 verify 스킬의 단계 설명을 지금 게이트에 맞춘다.

## 5. 리드 인수인계

**지금 상태 (2026-11-17)**
- 결정과 배치 구성까지 끝났다. 띄운 컨덕터도, 구현한 것도 없다.
- 남은 사용자 결정은 없다. 구현하다 새 결정이 필요하면 컨덕터가 사용자에게 직접 묻는다.

**리드가 할 일**
1. 3절의 순서대로 배치마다 컨덕터를 하나씩 띄운다. 방법은 `/ship` 'Lead'(`.agents/skills/ship/lead.md`)를 따른다.
   - 브랜치는 3절 표의 이름을 쓰고, 최신 `origin/develop`에서 만든다.
   - 브리프에는 다음을 적는다.
     - `/ship` 대상: 이 문서 4절의 해당 배치
     - 읽을 곳: 1절, 2절
     - 동시에 도는 컨덕터 가운데 파일이 겹치는 것
2. B1, B2, B3, B5, B6은 동시에 띄운다. B4는 B3이 머지된 뒤에 띄운다. B7은 eval만 고쳐 다른 배치와 겹치지 않는다.
3. PR을 리뷰할 때 다음을 본다.
   - 범위가 4절의 해당 배치와 맞는지
   - 고친 항목을 BACKLOG에서 지웠는지, 2절 결정을 PRODUCT·ARCHITECTURE에 적었는지
   - `/runtime-test`로 확인하지 못한 것을 PR에 적었는지
   - B2는 `clarify` 프리셋을 읽었는지, B5는 `/agent-eval` 판단을 적었는지
4. 마지막 배치가 머지되면 이 디렉터리(`docs/features/backlog-fixes-261117/`)를 지운다.
