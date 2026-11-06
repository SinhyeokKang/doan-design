# canvas-handoff — orch

원본: [spec](./spec.md)·[design](./design.md)·[tasks](./tasks.md). 체인 [chain-261106](../chain-261106/chain.md) 링크 2이다. 권한(main 병합, 실제 HOME·공용 프로필 probe, `/agent-eval`)은 체인 파일의 '상시 권한'과 '시작 점검 승인'을 따른다.

- 시작 hash: `53314359`(origin/main, 링크 1 병합 `3e98f455` 뒤), D1 체크 `8024e44e`.
- 통합 branch: `feat/canvas-handoff`.
- 지휘자: Claude Code(canvas-handoff-orch). 작업자는 모두 Claude다.
- Codex: 쓰지 않는다. 2026-11-06 Codex 주간 한도(`window_minutes: 10080`)가 92% 사용이고 2026-11-11에 초기화된다(`$CODEX_HOME/sessions/2026/11/06/rollout-2026-11-06T04-47-14-…jsonl`, 2026-11-05T19:47Z 기록). 남은 양은 E3의 Codex 실행에 남긴다.

## 결정 기록

1. **Codex 프로필의 `doan handoff` 승인**(사람, 2026-11-06): 링크 1이 Codex 프로필에 `doan` 전부 허용 규칙을 넣어, 그대로 두면 Codex Default·Accept edits의 핸드오프가 묻지 않는다. 사람은 "handoff만 묻게"를 골랐다. Codex 프로필에만 `rules/doan-handoff.rules`(`prompt`)를 더한다(design §4, tasks C4). 고르지 않은 것: Codex는 묻지 않게 두기, Claude에도 허용 규칙 더하기.
2. **batch 나누기**(지휘자 판단, 근거: 파일 겹침과 선행 관계). schema(A1)가 Go CLI와 TS main 둘의 선행이라 먼저 둔다. renderer(U)는 main의 이벤트 타입·IPC에 기대므로 M 뒤이고, eval(E)은 `turnPrompt`(B3)와 v5 schema에 기대므로 M 뒤에 U와 나란히 돈다.
3. **R1·R2·Z는 지휘자가 맡는다**(지휘자 판단, 근거: R1은 실제 HOME과 공용 프로필을 쓰고, Z는 문서 승격이다).
4. **`/design-sync`**(지휘자 판단, 근거: AGENTS.md 'Workflow', 이 화면들의 첫 구현): U batch가 design '초안 요청'의 여섯 frame을 비교한다.

## batch

| batch | 항목 | 파일 소유 | 선행 | 모델·effort(이유) | gate | 상태 |
|---|---|---|---|---|---|---|
| S | A1 | `schema/app-socket.v5.schema.json`, `schema/fixtures/app-socket-v5/`, `app/src/formats/validate.ts`, `cli/internal/formats/validate.go`(+테스트) | — | Sonnet high(v4 패턴을 따르지만 바이트 상한·코드 목록을 맞춰야 한다) | `go test ./...`, `npm --prefix app test` | 통합(`3e7a38a8`·`7821d922`). 리뷰는 G·M 리뷰가 schema를 함께 본다(지휘자 판단: schema·fixture만이고 v4 패턴) |
| G | B1, C3 | `cli/`(formats 제외) | S | Opus medium(직렬화 줄 상한과 exit 매핑의 경계 사례가 많다) | `go test ./...`, `go vet ./...` | 통합(`d353bb8a`·`5ea6bd15`·`f58cff7d`). 리뷰 RG(Opus medium): 🔴0 🟡0 🟢4, 고치지 않음 |
| M | B2, B3, B4, C1, C2, C4 | `app/src/main/`(runtime·conversation·agentAuth), `app/src/shared/`·preload의 이벤트·IPC 타입 | S | Opus high(턴 끝 판정, `contested`, 큐 옮기기, 수락 직전 재확인 등 동시성) | `npm --prefix app test`, typecheck | 통합(`87c5d927`·`dc232869`·`78ad1803`, 수정 1회 `965795cc`·`1e4f2c39`). 리뷰 RM(Opus high): 🔴0 🟡2(고침) ⚪5(⚪2만 고침) ❓1(지휘자 판단) |
| U | B5, U1, U2, `/design-sync` | `app/src/renderer/`, DESIGN.md | M | Opus high(이동·toast·read 대기 규칙과 초안 일치) | `npm --prefix app test`, typecheck, build, `/design-sync` | 진행(`ctx_ac7f36eafb88`, ch-u) |
| E | E1, E2, E3 | `eval/`, USABILITY-EVAL.md | G, M | Sonnet high(fake app·시나리오는 기존 패턴, E3는 실제 실행) | `node eval/run.ts --self-test`, `node --test 'eval/**/*.test.ts'`, E3 라운드 | 통합(`cc6988a2`·`fcc549a6`, 수정 1회 `00f6aeb6`·`00ab1296`). 리뷰 RE: 🔴0 🟡2(고침). E3: R10 Claude 통과(새 검사로 다시 채점), Codex 실패(U-024), R8d·R9b 통과·부분 |
| 지휘자 | R1, R2, Z1–Z3 | PRODUCT·ARCHITECTURE·BACKLOG, feature 디렉터리 | 모두 | — | `/runtime-test`, `verify.mjs --eval`, `/doc-check` 범위 확인 | 대기 |

리뷰: batch마다 독립 Claude 리뷰 작업자가 `/code-review`를 돈다(모델은 diff 난이도로 정한다).

순서: S → (G ∥ M) → (U ∥ E) → R1 → R2 → Z → rebase → 통합 gate → PR·병합. G와 M, U와 E는 파일이 겹치지 않는다.

## 진행 기록
- G 리뷰 RG의 🟢 4개(U+FEFF만 있는 메시지가 Go에서는 통과하고 ajv `\S`에서는 막혀 `internal_error`가 됨, C1 허용 fixture 없음, root가 길 때 넘침 메시지가 `--message`를 탓함, `v` 해석 중복)는 고치지 않는다(지휘자 판단: 사람이 쓰지 않는 경계이거나 동작에 영향이 없다). 근거: `.scratch/evidence/review-G.md`.
- M은 리뷰 전에 통합했다(지휘자 판단: U·E가 M의 이벤트·IPC 모양에 기대고, 리뷰 수정은 `app/src/main/`에만 생기므로 U·E와 겹치지 않는다). RM의 수정은 M 작업자가 ch-m에서 고치고 다시 cherry-pick한다.
- M의 계획과 다른 점: `handoff.resolved` started는 `{outcome, target: {conversationId, canvas}}`이다(이벤트 envelope의 `conversationId`와 겹쳐서). refused `reason`에는 판정 이유 넷 밖에 시작 거절 코드(`not_logged_in` 등)도 온다. 이 문구는 초안에 없으므로 U가 "Didn’t hand off to <file>." 뒤에 이미 있는 시작 거절 문장을 붙인다(지휘자 판단: 새 문구를 만들지 않는다).
- RM ❓1(시작 거절 코드의 문구)은 사람에게 묻지 않았다. 지휘자 판단으로 앞의 규칙(이미 있는 시작 거절 문장을 붙인다)을 쓴다. 근거: 확정 문구를 바꾸지 않고 새 문구를 만들지 않는다. M 수정 1회는 POSTMORTEM에 적지 않는다(지휘자 판단: main에 들어간 적 없는 결함을 리뷰가 잡았다).
- 통합 HEAD `1e4f2c39`에서 `npm --prefix app test`는 exit 0(8460 tests)이다.
- E 결과(`.scratch/evidence/handoff-E.md`): R10 Codex가 heredoc `doan handoff … --message - <<'EOF'`에서 socket에 닿지 못했다(U-024, 원인 미확인: Codex 규칙이 heredoc 명령에 맞지 않는 것으로 보인다). 실제 앱에서도 그러면 `doan-handoff.rules`의 `prompt`도 걸리지 않는다. R1에서 Codex Default로 확인하고, `HANDOFF_GUIDANCE`를 고칠지는 그 결과로 정한다.
- E 리뷰 RE(Sonnet high): 🔴0 🟡2 🟢5 ❓2. 🟡1(heredoc 본문을 명령으로 읽음)·🟡2(R10 검사가 과제를 재지 않음)와 🟢1·4·5를 E 작업자에게 수정 1회로 보냈다. ❓1(거절 뒤 수락)은 수락 한 번이면 통과로 정했다(지휘자 판단: 앱이 턴마다 수락을 한 번만 받는다). ❓2(대용 대화에 `DOAN_APP_CONVERSATION`·`DOAN_CONVERSATION_ID`가 없음)는 Z2에서 ARCHITECTURE §14에 적는다. 근거: `.scratch/evidence/review-E.md`.
- Codex `execpolicy check`(0.166.0)로 맨 명령 `doan handoff …`는 `doan`(allow)과 `doan handoff`(prompt)가 둘 다 맞고 결정은 `prompt`인 것을 확인했다. `bash -lc` 스크립트는 이 명령이 쪼개지 않아 heredoc 가설(U-024)은 이것으로 확인할 수 없다.
- U(Opus high): 커밋 7개를 통합했다(`9e549c27`…`0b62d72e`의 cherry-pick). 리뷰는 U 작업자가 띄운 독립 Claude subagent가 두 번 했다(🔴0, 🟡5 중 4개 고침, ⚪). 별도 리뷰 작업자는 띄우지 않았다(지휘자 판단: subagent가 따로 된 맥락에서 `/code-review`를 돌렸고 두 번째에 🔴·🟡이 0이다). `/design-sync`: 6 frame, 62쌍, 차이 60개는 모두 DESIGN.md 'Canvas handoff'에 적었다(패널 경계 1 px, 글 없는 root가 상속한 body 글꼴, 패널 밖에 그린 초안 tile).
- U 🟡4(이어받는 대화의 첫 턴이 실패하면 Edit and resend가 인계 메시지를 사람의 draft로 바꿈): 숨긴다(지휘자 판단, 근거: design '결정 영향' "인계 메시지는 사람의 메시지가 아니라고 prompt와 화면이 모두 밝힌다"). U 수정 1회로 보냈다. design-sync가 찾은 focus 결함은 main에 들어간 적이 없어 POSTMORTEM에 적지 않는다.
- U 수정 1회(`9cbd9934`·`dc797714`·`02b7f551`의 cherry-pick, 끝 `a1f2df23`): 핸드오프 카드로 시작한 턴의 끝 notice에서 Edit and resend를 숨겼다.

## R1 결과(2026-11-06, 지휘자)

이 worktree 빌드(`0f747e68`)를 main checkout의 Electron과 공용 프로필로 띄웠다. 새 CLI(`go build`)를 `DOAN_CLI`로 주었다. probe repo는 `.scratch/r1/repo`(앞 PoC repo 복사)이고 `folders.json`에 잠시 더했다가 되돌렸다(`folders.json`·`ui-state.json`·`canvas-seen.json`을 byte 단위로 같게 되돌림). 대화는 preload API로 시작했고 permission은 allow-once로 답했다. 자료는 `.scratch/runtime-test/canvas-handoff/`(`results.json`, `shots/`, `r1.mjs`, `launch.sh`)에 있다.

| 경우 | 결과 |
|---|---|
| Claude Default | `doan handoff`가 Bash 승인 요청("Hand off new canvas and end work session")으로 보였고 승인 뒤 `handoff.requested` → 턴 done → `started`. 화면이 `r1-claude-default`로 옮겨 가고 focus가 인계 카드("Handed off from probe.html" + Open)에 있었다. Back으로 probe에 돌아왔고 원래 대화에 "Handed off to r1-claude-default.html" + Open 줄이 `requested` 자리에 남았다. 이어받는 대화는 같은 mode로 턴을 마쳤다 |
| Codex Default | 승인 요청이 두 번 보였다. agent는 `printf … \| doan handoff … --message -`를 썼다. 첫 요청은 `doan-handoff.rules`의 `prompt`였고, 승인 뒤에도 sandbox 안에서 실행돼 "Cannot connect to Doan"을 받았다. agent가 escalation을 요청했고 두 번째 승인 뒤 닿았다(Codex rollout `rollout-2026-11-06T10-10-07-…`에서 확인). 그 뒤 이동·카드·이어받는 대화는 Claude와 같다 |
| Claude Full access | 승인 요청 0개. 핸드오프 시작, 이동, 이어받는 대화 mode `bypass` |
| Claude Default + Stop | `handoff.requested`를 본 뒤 interrupt → `handoff.resolved cancelled`, 이어받는 대화 없음, 원래 대화에 "Didn’t hand off to r1-claude-stop.html. The turn didn’t finish."(`ban`) |

- **Codex 두 번 묻기**(사람, 2026-11-06): R1 결과를 사람에게 보였고 사람이 "두 번 묻기 유지"를 골랐다. `prompt` 규칙을 그대로 두고, 첫 승인이 sandbox 안에서 끝나는 점과 agent가 escalation을 고르지 않으면 실패하는 점을 BACKLOG에 적는다. 고르지 않은 것: 안내 문구로 처음부터 escalation을 요청하게 하기, `prompt` 규칙 빼기.
- 확인하지 못한 것: Cursor·Antigravity·Copilot의 핸드오프, Codex Accept edits·Plan, Claude Accept edits·Plan, 실제 앱에서 dialog·first run·글을 쓰던 composer 때의 toast, 10 s 대기 상한. 이들은 unit 테스트로만 확인했다.
- probe 방식의 한계: preload API로 시작한 대화는 renderer 패널이 고르지 않아, 패널은 "New conversation"을 보였다. 원래 대화 줄은 패널에서 그 대화를 골라 확인했다. 사람의 composer로 보낸 흐름은 실제 앱에서 보지 않았다.
