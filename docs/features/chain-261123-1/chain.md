# chain-261123-1

## 규칙

- 진행 방식은 [chain skill](../../../.agents/skills/chain/SKILL.md)과 AGENTS.md 'Workflow'의 Chains를 따른다. 리드가 각 링크의 conductor를 시작하고, PR을 리뷰·머지한다. conductor는 이 파일을 고치지 않는다.

## 순서

두 링크는 한 병렬 그룹이다. 리드가 둘을 최신 `origin/develop`에서 함께 시작하고, PR은 링크 순서(1 → 2)대로 머지한다.

- **겹침 확인**: 링크 1은 `app/src/renderer/chipField.ts`, 새 입력란 모듈, `styles.css`, `app/package.json`·`package-lock.json`, `chipField.test.ts`·`chipField.dom.test.ts`, 시안 `.doan/canvases/composer-hanging-indent.html`을 바꾼다. 호스트(`CanvasConversationPanel.tsx`, `HomeComposerView.tsx`, `ComposerParts.tsx`)와 그 테스트는 바꾸지 않는다(design.md '호스트 API'). 링크 2는 `app/src/main/conversation/*`, `main/prototype/*`, 렌더러의 Overview·캔버스 패널·Home·handoff 모듈, `cli/internal/cli/handoff_rules.go`, `cli/internal/export/viewer/viewerApp.js`(재생성, 원본은 `canvasScript.ts` 쪽), `eval/`을 바꾸고 `styles.css`·`chipField*`·`package.json`은 건드리지 않는다. 겹치는 파일은 공유 문서(PRODUCT, ARCHITECTURE, `docs/design/canvas-conversation.md`, BACKLOG)뿐이라 겹침으로 치지 않는다.
- **체인 밖 `/ship`(사용자 지시)**: `fix/overview-waiting-row-focus`가 BACKLOG 'Known defects'의 "Pressing a project row that waits for a permission request…"를 고친다. `ProjectOverview.tsx`와 `App.tsx`를 바꾸므로 링크 2와 겹친다. 이 PR은 준비되는 대로 머지하고, 그 뒤 링크 2 conductor에게 `origin/develop`을 병합하라고 한다(`/ship` 'Lead' 4단계).
- 구현 중 링크 2가 `styles.css`나 `chipField*`를, 링크 1이 호스트 composer 파일을 고쳐야 하면 conductor가 리드에게 알린다. 리드는 `/ship` 'Lead' 4단계대로 경합을 푼다.

1. **composer-list-hanging-indent** — [spec](../composer-list-hanging-indent/spec.md) · [design](../composer-list-hanging-indent/design.md) · [tasks](../composer-list-hanging-indent/tasks.md)
   - 상태: `/feature-review` 완료. 시안 `.doan/canvases/composer-hanging-indent.html` 확정(`ceec7e5ee`). ProseMirror PoC 완료(design.md 'PoC 결과'). tasks 1·2는 develop에서 끝났고 링크는 tasks 3부터 시작한다.
   - 이유: 입력란 하나에 모인 작은 변경이라 먼저 머지한다. tasks.md는 `/ship bypass` 순서를 적었지만 체인 링크는 `/orchestrate`로 돈다. conductor는 배치 하나로 tasks 3, 4, 6, 7, 8을 그 순서대로 진행한다.
   - **범위에 더한 결함(사용자 지시)**: BACKLOG 'Known defects'의 "A composer at its eight-row maximum shows its caret out of view after code focuses it at its end"를 링크 1에서 고친다. `focusFieldEnd`와 `focus(true)`가 다시 쓰는 `chipField.ts` 안에 있어서다. 코드가 놓은 커서도 보이게 스크롤하는지 Electron DOM 테스트로 고정하고, 고치면 그 BACKLOG 항목을 지운다. 같은 항목이 적은 다른 호출 경로(`CanvasConversationPanel.tsx` 패널 포커스, `App.tsx`의 삭제 뒤 포커스, Home의 `focusEnd`)도 확인한다.
   - tasks 5(사람의 한글 IME 확인)는 링크에서 하지 않는다(사용자 지시, '인계 기록'). 병합을 마친 뒤 리드가 develop 빌드로 사용자와 진행한다. conductor는 PR 본문에 IME 확인이 남았다고 적는다. 확인에서 걸친 선택 위 조합만 실패하면 design.md '결정'대로 BACKLOG 'Known defects'에 남기고, 다른 항목이 실패하면 리드가 사용자에게 보고하고 수정은 `/ship`으로 한다.
2. **project-conversation-handoff** — [spec](../project-conversation-handoff/spec.md) · [design](../project-conversation-handoff/design.md) · [tasks](../project-conversation-handoff/tasks.md)
   - 상태: `/feature-review` 완료. 새 시안 없음(문구만 바뀜). 선행 조건 overview-conversation-list는 develop에 머지됐다(#377, `81846cf9b`). tasks 0은 conductor가 다시 확인한다.
   - 이유: 가장 크다(main·renderer·프로토타입 창·CLI·eval, 배치 A~D 제안). 링크 1과 겹치는 코드가 없어 병렬로 돌리고 나중에 머지한다.

## 시작 점검

리드는 링크를 시작하기 전에 아래를 사용자에게 한 번에 묻고, 승인을 '인계 기록'에 적는다. 그 뒤로 conductor는 일상적인 판단을 스스로 하고, 새 제품·범위 결정이나 실제 사용자 상태에 닿는 결정만 묻는다.

1. 링크 1 tasks 5(한글 IME): 사용자가 답했다. 병합을 마친 뒤 리드가 사용자와 진행한다. VoiceOver 읽기 순서는 그 자리에서 사용자에게 묻는다.
2. 로그인 프로필: 사용자가 답했다. 체인이 끝난 뒤에도 남긴다.
3. 남겨 둔 프로필의 Claude Code·Codex 로그인: 2026-11-23 리드가 확인했고 둘 다 살아 있다. Claude는 `CLAUDE_CONFIG_DIR=<profiles>/claude claude auth status`에서 `loggedIn: true`(만료 2026-12-12), Codex는 `CODEX_HOME=<profiles>/codex codex -c 'cli_auth_credentials_store="keyring"' login status`에서 로그인됨. Codex 상태는 이 `-c` 없이 물으면 "Not logged in"으로 나온다. Cursor·Copilot·Antigravity는 `agent-auth/vault`에 있고 상태는 확인하지 않았다.

## 상시 권한

- 리드는 각 링크의 PR을 리뷰와 gate가 통과하면 링크 순서대로 develop에 머지한다(chain 기본). 링크 2의 PR은 링크 1이 머지된 뒤에 머지한다.
- conductor 런타임: Claude Code(리드와 같은 계열). 모델 경계 넘기는 허가되지 않았다. conductor와 워커는 Claude 모델만 쓴다.

## 로그인

- 링크 2의 `/runtime-test`(Overview·Home에서 보낸 프로젝트 대화의 handoff, Codex Ask 모드의 `doan handoff` 승인, 동시 실행)는 실제 Claude Code와 Codex 로그인이 필요하다. 링크 1은 로그인이 필요 없다(tasks 5의 IME 확인은 임시 HOME에서 띄운다).
- **Codex 계정(사용자 지정)**: `/agent-eval`과 `/runtime-test`의 Codex 확인은 사용자가 지정한 개인 계정으로 한다. eval 러너가 링크하는 실제 HOME의 `~/.codex/auth.json`과, 앱이 쓰는 로그인 프로필의 Codex(`<userData>/agent-auth/profiles/codex`, 토큰은 Keychain)가 둘 다 그 계정이다(2026-11-23 리드가 id_token의 email과 `agent-auth/metadata.json`으로 확인). 따로 바꿀 것이 없다. 이메일은 공개 저장소에 적지 않고 리드가 brief로 전달한다. 확인 직전에 `auth.json`의 email이 그 계정인지 보고, 다르면 멈추고 리드에게 알린다.
- 링크 2 tasks 1의 ACP PoC(Cursor, Antigravity, GitHub Copilot)는 AGENTS.md 'Real agent sign-ins'대로 격리된 복사본으로 돌린다. 이 provider는 `agent-auth/vault`에 있어 userData 복사본도 로그인된 채로 읽힌다.
- 로그인된 userData: `/Users/sinhyeok/code/doan-design/.scratch/provider-profile/userData`(메인 체크아웃, 이전 체인에서 남김). 링크는 각자 워크트리를 가지므로 이 절대 경로를 쓴다. 새 로그인을 청하기 전에 이 프로필이 아직 연결돼 있는지 먼저 확인한다. 리드는 시작 점검에서 필요한 로그인이 살아 있는지 확인하고, 끊겼으면 사용자에게 승인을 청한다.
- Claude Code와 Codex는 복사본에서 로그인이 풀린다(Keychain 항목이 `CLAUDE_CONFIG_DIR` 해시에 묶임, Codex는 `reauthRequired`). 이 둘을 쓰는 probe는 원래 경로를 쓰고, 한 userData에는 Electron 하나만 띄우며, 끝나면 `folders.json`·`ui-state.json`을 되돌린다. 지우는 probe는 복사본에서 하되 그때는 새 로그인이 필요하다.
- 실행: `/Users/sinhyeok/code/doan-design/.scratch/runtime-test/first-run-261119/launch-kept.sh`(읽고 링크 워크트리의 빌드를 가리키게 고쳐 쓴다). 개발 Electron을 띄울 때마다 Keychain "doan Safe Storage" 창이 한 번 뜬다. 사용자는 "허용"(한 번만)을 누르고 "항상 허용"은 누르지 않는다. 띄우기 전에 사용자에게 알린다.
- 프로필에는 등록된 프로젝트가 없다. 앱이 꺼진 동안 `<userData>/folders.json`에 `["/private/tmp/<project>"]`를 쓰고(`doan init --storage local` 먼저), 끝나면 지운다. probe가 남긴 대기 메시지나 대화는 링크 안에서 지운다.
- 링크마다 로그아웃하지 않는다. 체인이 끝난 뒤에도 로그아웃하지 않고 프로필을 남긴다(사용자 지시, chain skill 기본과 다름).

## 진행 규칙

- chain skill §3(Lead, Conductor)을 따른다.

## 운영 메모

- 워커 대기: conductor는 워커가 `worker_done` 없이 멈출 수 있으니, 대기 루프가 유휴 프롬프트나 working이 아닌 상태에서도 깨어나게 한다.
- GUI probe 조율: 두 링크가 동시에 돌므로 실제 앱 창을 띄우는 probe(링크 1의 `/runtime-test`·`/design-sync`, 링크 2의 `/runtime-test`)가 겹치지 않게 한다. 사용자 앞에서 하는 확인(Keychain 창 등)은 conductor가 리드에게 먼저 알리고, 리드가 한 번에 하나씩 사용자에게 넘긴다.
- `/agent-eval`: 링크 2는 `HANDOFF_GUIDANCE`(턴 프롬프트)와 `doan handoff`의 CLI 문구를 바꾸고 새 시나리오 R12를 더하므로 적용한다. tasks 6대로 마지막 통합 전에 `npm --prefix app run package` 뒤 실제 Claude Code·Codex 라운드를 돌고 `docs/usability-eval/`에 기록한다. 실제 Doan 앱이 켜져 있으면 eval real-state 가드가 걸린다. 링크 1은 CLI 출력·guide·`doan check` 규칙을 바꾸지 않아 해당 없다.
- PoC 증거는 메인 체크아웃의 `.scratch/prosemirror-poc/`, `.scratch/tiptap-poc/`, `.scratch/composer-indent/`에 있다(gitignore). 결론은 링크 1의 design.md에 있다.
- 링크 1은 ProseMirror 패키지를 `npm --prefix app install --save-exact`로 더한다(버전은 design.md 'PoC 결과'). 링크 2 워크트리는 링크 1이 머지되기 전 develop에서 시작하므로 `npm --prefix app ci`를 따로 한다. 링크 1 머지 뒤 리드가 링크 2에 `origin/develop`을 병합하라고 할 때 `npm --prefix app ci`를 다시 한다.

## 링크 상태

| 링크 | 세션·워크트리 | 시작 | PR·머지 | 상태 |
|---|---|---|---|---|
| 1 composer-list-hanging-indent | | | | 대기 |
| 2 project-conversation-handoff | | | | 대기 |

## 인계 기록

- 2026-11-23 (리드 세션, 체인 작성): 두 feature의 `/feature-review`, 링크 1의 PoC와 시안 확정을 마쳤다. 두 링크는 코드가 겹치지 않아 병렬 그룹으로 묶었다. 모델 경계 넘기 허가는 없다. 아직 '시작 점검'을 묻지 않았다.
- 2026-11-23 (리드 세션): 사용자가 eval과 Codex 확인에 쓸 개인 Codex 계정을 지정했다. 실제 `~/.codex`가 이미 그 계정이라 바꾼 것은 없다('로그인').
- 2026-11-23 (리드 세션): 사용자가 시작 점검 1·2에 답했다. 로그인 프로필은 체인이 끝난 뒤에도 남긴다. 한글 IME 확인(링크 1 tasks 5)은 링크에서 하지 않고, 병합을 마친 뒤 리드가 사용자와 진행한다. 체인 시작 지시는 아직 없다.
- 2026-11-23 (리드 세션): 다른 머신의 머지 뒤 확인(#377, #378)이 BACKLOG에 결함 두 건을 남겼다(`76843b352`). 사용자가 composer 커서 결함은 링크 1 범위에 넣고, 대기 행 포커스 결함은 체인 밖 `/ship`으로 지금 고치라고 했다('순서').
