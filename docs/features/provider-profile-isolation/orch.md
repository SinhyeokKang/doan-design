# provider-profile-isolation — orch

- 원본: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md). 체인: [chain-261109](../chain-261109/chain.md) 링크 2.
- 시작 hash: `c21530f2`(develop, 링크 1 merge `fad00be9` 포함).
- 통합 브랜치: `feat/provider-profile-isolation`(lead가 만들었다). conductor worktree: `/Users/sinhyeokkang/orca/workspaces/doan-design/provider-profile-isolation-orch`.

## 결정 기록

- Q1–Q6, A–D: design §10에서 이미 정해졌다.
- T0 Keychain 링크·Antigravity 실제 로그인, T5 실제 HOME Antigravity 확인: 사용자가 미리 승인했다(체인 파일 '인계 기록'). 다시 묻지 않는다.
- P0 실패 시 방향, P2 실패 provider 처리, T2a 초안 확인: PoC 결과가 나온 뒤 conductor가 추천과 함께 사용자에게 묻는다.
- 링크 1이 넣은 `account_changed`·`sign_in_changed` 판정(`prepare.ts`)과 `releaseFailed`·`TransportState.running`(`service.ts`·`runners.ts`)은 fence를 얹을 때 그대로 둔다 — conductor 판단, 근거: 체인 파일 '링크 1 merge'.
- model 경계: Claude worker만 쓴다. 체인 파일이 Codex 사용을 허락했지만 이번 링크에서는 쓰지 않는다 — conductor 판단, 근거: batch가 직렬이라 병렬 용량이 필요 없다. Codex를 쓰게 되면 그때 남은 사용량을 확인하고 여기에 적는다.
- **P0 실패 방향(사용자 결정)**: P0에서 macOS가 이미 Seatbelt 안의 프로세스에 두 번째 deny 정책을 거절했다(exit 71). 그래서 Doan fence 안에서 Codex Ask first·Accept edits·Plan의 명령 sandbox와 사람이 켠 Claude Code sandbox가 모든 명령을 실패시킨다. 결정: Cursor·Antigravity·Copilot은 계획대로 바깥 fence를 쓴다. Codex·Claude는 T1에서 provider 자체 sandbox·설정(Codex sandbox 설정, Claude `permissions.deny`·sandbox 읽기 제한)에 Doan의 금지 경로를 넣을 수 있는지 먼저 확인하고, 안 되는 부분은 결과를 보고 사용자에게 다시 묻는다. PRODUCT §3의 "Ask first applies the user's own permission and sandbox settings"는 지킨다.
- **T0 적용(conductor 판단, 근거: design §3.2·§3.3과 Q3·Q6)**: P1이 경로 1로 통과했으므로 Antigravity env는 바꾸지 않고 Q6 막는 분기와 T2a는 없다. P3가 (i)이므로 Antigravity 정책에 profile skill 경로 쓰기 금지를 넣는다.
- **Claude(사용자 결정)**: 턴마다 나눈다. 턴 시작 전에 SDK `resolveSettings`로 Claude sandbox 상태를 읽어, 꺼져 있으면 바깥 fence, 켜져 있으면 flag tier 설정(`sandbox.filesystem` deny와 allow, `allowUnsandboxedCommands:false`)을 쓴다. 판정이 틀려 켜진 것을 꺼짐으로 보면 Bash가 보이는 실패로 끝난다.
- **Codex(사용자 결정)**: 모드로 나눈다. Full access가 아니면 Doan profile의 Codex permission profile deny를 쓰고, Full access면 바깥 fence로 감싼 app-server를 쓴다. 두 쪽을 오갈 때 app-server를 다시 띄우고 `thread/resume`한다. 사람이 승인한 `apply_patch`가 deny 경로에 쓸 수 있는 틈과 experimental API 의존은 Known limits에 적는다.
- Cursor는 P2에서 도구 호출을 보지 못했다(모든 턴이 "Upgrade your plan"). T5에서 다시 시도하고, 그래도 안 되면 미검증으로 남긴다.
- **리뷰 🔴1(사용자 결정)**: 고친다. 바깥 fence가 없는 방식(sandbox 켜진 Claude, Full access가 아닌 Codex)에서는 hook·MCP 같은 보조 프로세스가 sandbox 밖에서 돈다. 그래서 agent가 자기 profile의 provider 설정 파일에 쓰지 못하게 모든 방식에서 막는다.
- **sandbox 켜진 Claude 턴의 저장소 hook·`.mcp.json` 서버(사용자 결정)**: Known limit에 적는다. 중첩 Seatbelt가 거절되므로 Doan이 감쌀 수 없다.
- 리뷰 🟡1–🟡4와 ⚪1·⚪3·⚪6은 리뷰 제안대로 고친다. ⚪5(Codex profile 방식에서 userData 항목 이름이 보임)는 Known limit에 적는다 — conductor 판단, 근거: 결정 A·D의 범위 안이고 내용은 막힌다.
- **D2(사용자 결정)**: Codex profile에서는 승인된 escalated 명령도 네트워크가 없어 `doan` 앱 명령이 앱에 닿지 못했다. Codex는 `network.enabled=true`일 때만 unix socket을 연다. 결정: 두 Doan Codex profile에 `network={enabled=true, unix_sockets={<Doan socket 디렉터리>=allow}}`를 넣는다. 대가: Codex Ask first·Plan·Accept edits의 sandbox 안 명령도 승인 없이 네트워크를 얻는다. 이것을 Known limit에 적고, T7에서 PRODUCT §3 문장을 맞춘다.
- **agent가 심은 저장소 설정(사용자 결정)**: Full access Claude가 저장소 `.claude/` 설정에 sandbox 켜기와 hook을 심으면 다음 턴은 바깥 fence 없이 뜬다. 결정: 이 경우도 저장소 hook의 Known limit에 넣는다. 그 문장은 저장소 `.claude/` 아래 settings·skills·agents·plugin, `.mcp.json`, `enableAllProjectMcpServers`까지 넓힌다.
- 재리뷰 🔴1(profile의 `skills/`·`agents/`·`plugins/`에 hook을 심는 경로): 바깥 fence와 Claude flag 설정에서 이 디렉터리들에 쓰지 못하게 막는다 — conductor 판단, 근거: 사용자가 정한 '🔴1을 고친다'를 지키는 가장 작은 변경이다. D1의 profile 쓰기는 나머지 경로에 남는다.

## batch

batch는 모두 직렬이다. T0와 T1은 둘 다 실제 Antigravity와 `~/.gemini/antigravity-cli/`·Keychain 전후 비교를 다루므로 같이 돌면 측정이 섞인다. T3 스냅숏은 T1의 통과 정책 문장이 있어야 한다. T5는 T4 구현이 있어야 한다.

| batch | 항목 | 파일 소유 | 선행 | model·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| W1 PoC-A | P0, T0(P1·P3) | `.scratch/provider-profile-isolation/`, design.md §8 P0·P1·P3 | 없음 | Opus high — 바이너리 archive 해석과 실제 Keychain을 건드리는 판단, 틀리면 사람의 `agy` 로그인을 망친다 | tasks P0·T0 검증, 실제 상태 전후 비교 | 통합 |
| W2 PoC-B | T1(P2) | `.scratch/provider-profile-isolation/`, design.md §8 P2 | W1, T2의 P0 분기 | Opus high — Seatbelt 정책 평가와 다섯 provider × 모드 판단 | tasks T1 검증, provider × 모드 표 | 통합 |
| conductor | T2 결정 확인, (조건부) T2a 초안 | spec·design·tasks | W2 | — | design §10 남은 확인 필요가 결정으로 바뀜 | 대기 |
| W3 구현 | T3, T4 | `app/src/main/agentAuth/`(새 fence 모듈, `environment.ts`, `manager.ts`), `app/src/main/conversation/`(`prepare.ts`, `service.ts`, `runners.ts`, `acpRunner.ts`)와 각 테스트 | T2 | Opus high — process spawn·fail closed·보안 경계, 링크 1 거절 경로 보존 | `npm --prefix app test`·typecheck·lint, `verify.mjs` | 통합 |
| W4 실제 앱 | T5 | `.scratch/provider-profile-isolation/` | W3 | Opus high — 다섯 provider 실제 턴과 실제 HOME 확인 | `/runtime-test` 보고서, 실제 상태 전후 비교 | 진행 |
| W5 리뷰 | T6 `/code-review` | 없음(보고만) | W4 | Opus high — 독립 리뷰, 보안 경계 diff | 보고서 | 대기 |
| W3 수정 | T6 `/refactor`, `/postmortem` | W3과 같음, `docs/POSTMORTEM.md` | W5 | Opus high(W3 재사용) | 🔴 0, `verify.mjs` | 대기 |
| conductor | T7 승격과 정리 | ARCHITECTURE·PRODUCT·BACKLOG·(DESIGN), feature 디렉터리 삭제 | 전부 | — | tasks T7 grep 두 개 | 대기 |

항목 대응: P0·T0 → W1, T1 → W2, T2·T2a → conductor(T2a 초안을 그리게 되면 새 worker), T3·T4 → W3, T5 → W4, T6 → W5·W3, T7 → conductor.

## 진행 기록

- W1(P0·T0): `aa042e53`을 통합했다. P0 실패(위 결정). P1: 지금의 env로 실제 상태 변화 0, 실제 `antigravity-cli/` 쓰기는 Orca.app이 주기적으로 실행하는 사람의 `agy`가 만든다 → 추천 경로 1(코드 변경 없음). 사람의 `agy` 로그인 유지. P3: (i). 남은 것: dev 앱 + Keychains 링크 조건은 T5에서 본다.
- W2(T1): `1f699b73`을 `a1984624`로 통합했다. 통과 정책 문장은 design §8 P2에 있다. Copilot·Antigravity·Claude(sandbox 꺼짐)·Codex(profile deny, Full access 바깥 fence)가 실제 턴에서 미끼를 막았다. 미검증: Cursor 도구 호출, Copilot minimum 1.0.89, 첨부·MCP·사용량·질문 카드·`doan handoff` 실제 확인(T5로 넘긴다). Antigravity harness 도구 명령이 Stop 뒤 남는 것은 fence와 무관한 기존 동작이다(BACKLOG 후보).
- W3(T2 문서, T3, T4): 6개 commit을 `83cb8bf9..328a1c6f`로 통합했다. tree가 W3의 `4a1d2a04`와 같고, W3가 그 tree에서 `verify.mjs` 통과(354 files / 9869 tests)를 확인했다. conductor 판단: W3의 세부 A(Claude 설정 출처를 직접 읽음), C(첨부 매개변수), D(Codex profile 구성)를 승인했다. B는 userData 전체 deny 대신 턴마다 나열한 형제 항목만 deny하도록 바꿨다(붙여넣은 이미지를 Read 도구로 읽어야 하므로). W3 worker는 수정 라운드를 위해 retain했다.
- W4(T5): `ppi-w4-runtime`에서 시작했다.
- W4(T5): 결함 둘. D1(중간): Claude sandbox 켜짐 턴에서 `denyWrite=<userData>`가 `allowWrite=<profile>`을 이겨 Bash가 자기 profile에 쓰지 못한다. D2(높음): Codex Ask first에서 승인된 escalated 명령이 profile의 `deny`만 받고 다시 연 경로를 잃어 `doan handoff`가 "Cannot read the Doan runtime file"로 실패한다. 나머지 항목은 통과했다. 미검증: 공백이 든 실제 userData 경로의 Claude(사용자 결정으로 공유 userData를 직접 썼다), Claude 다음 메시지 제안, MCP connector(OAuth 필요), Cursor 도구 호출, Codex Plan, Codex·Antigravity Stop, 실제 HOME의 Antigravity 브라우저 로그인(T0 근거로 대신한다). fence와 무관한 관찰 O1–O3은 PR 본문에 적는다. D1·D2 수정은 W3에 fix round 1로 보냈다. W4는 재확인을 위해 retain했다.
- W3 fix round 1: `5d2b68ac..a7b78b24`로 통합했다. Claude sandbox 켜짐 턴과 Codex permission profile이 userData 전체 대신 허용 경로로 가는 길 밖의 나열한 항목만 deny한다. 새 Known limit(design §3.1): Codex server가 뜬 뒤 생긴 항목은 그 server가 살아 있는 동안 deny에 없다, 승인된 Codex escalated 명령은 `runtime.json` 등 deny 밖 userData에 쓸 수 있다, Claude agent가 자기 profile 설정의 `allowWrite`를 넓히면 다음 턴에 새 userData 항목을 만들 수 있다. W4 재확인과 W5 독립 리뷰(Opus high, `ppi-w5-review`)를 함께 시작했다(코드를 바꾸지 않는 두 작업이라 병렬).
- W4 재확인: D1은 고쳐졌다. D2는 남았다. escalated 명령이 `runtime.json`은 읽지만 permission profile 아래에서 unix socket 연결이 EPERM이라 "Cannot connect to Doan"으로 끝난다. Claude sandbox 꺼짐과 Codex Full access 회귀는 통과했다.
- W5 리뷰(`ppi-w5-review/.scratch/review-W5.md`): 🔴1, 🟡4, ⚪6. 정책 문장, fail closed 경로 검사, Codex 재시작과 resume, 링크 1 경로, legacy와 목록 읽기 run은 문제 없다고 봤다.
- W3 fix round 2: 🔴1, D2, 🟡1–4, ⚪1·3·5·6. W4와 W5는 재확인과 재리뷰를 위해 retain했다.
- W3 fix round 2: `8f410ed7..e86d22db`를 `ec84d25a`까지 통합했다. W5 재리뷰(`review-W5-2.md`)는 🟡1·🟡3·🟡4와 ⚪1–3·⚪6이 해결됐다고 봤다. 남은 것: 🔴1(profile의 skills/agents/plugins), 🟡(`index.ts`가 `reusing`을 넘기지 않음, Known limit 문장이 좁음), ⚪ 3개. W3 fix round 3로 보냈다. W4는 fix round 2 트리를 재확인하는 중이다.
