# canvas-open-offer — design

## 영향 범위

| 구성 요소 | 변화 |
|---|---|
| CLI (Go) | 새 명령 `doan open <canvas path> [--frame <id>] [--json]`(`cli/internal/cli/open.go`, 순수 규칙은 `open_rules.go`). 루트는 다른 저장소 명령처럼 `--repo` 또는 위로 찾은 `.doan/config.json`의 디렉터리다. 경로는 `work_rules.go`의 `workTarget`을 셸에서 불러 확인한다. 앱 소켓으로 요청을 보내고 앱의 결과를 돌려준다. `run.go`의 runtime 경로 해석(`active`·`work`·`onboarding`만)과 `onboardingRuntime` 분기에 `open`을 더하고, `args.go`에 `--frame`을 더한다. 새 결과 코드가 없으므로 `envelope.go`의 `ExitCode`는 그대로다 |
| bootstrap | `onboarding.go`의 launch/poll 루프(`onboardingStart`·`callOnboarding`)를 v2 응답 읽기에서 떼어 `attempt(deadline) → (reply, failure, launchable)`을 받는 함수로 뽑는다. `onboarding start`와 `doan open`이 함께 쓴다. `not_ready` 응답도 "아직"으로 보고 같은 시간 안에서 다시 시도한다 |
| 앱 소켓 | 새 버전 `app-socket.v4`(open). v1(active)·v2(onboarding)·v3(work)는 그대로다. main은 `v: 4`를 v3와 같은 순서로 다룬다(`runtime.ts:91-97`): schema → token → 등록 루트. 그 뒤에 준비 판정과 목록 판정, renderer 판정이 온다 |
| App main | `deepLinks.ts`에서 `resolveOpenLink`를 `parseOpenLink` + `resolveOpenTarget(link, entries)`로 나눈다. 링크와 v4가 `resolveOpenTarget`을 함께 쓴다. v4는 준비 전(`openLinksReady()`가 아니거나 대상 루트가 loading)이면 `not_ready`로 바로 답한다. 목록 판정을 통과하면 요청 id와 함께 renderer에 보내고, renderer의 결과를 받아 응답한다. renderer 응답에는 소켓 deadline 안의 timeout이 있다. timeout이면 `busy`로 답하고, 늦게 온 renderer 결과는 버린다 |
| Renderer | `App.tsx`의 `openLink`(957-971)에서 판정 부분을 helper로 뽑는다. 링크와 v4가 함께 쓴다. v4 요청은 결과(`opened`+프레임 찾음 여부 / `busy`+이유 / `canvas_not_found`)를 main으로 돌려준다. 결과는 이동을 결정한 시점에 보내고, 캔버스 로드가 끝나기를 기다리지 않는다. v4 거절이면 토스트를 띄우지 않는다 |
| 가이드 (`skill.md`, `skill_test.go`) | 규칙 J와 Commands의 `doan work done`·새 `doan open` 설명 |
| 에이전트 설정 | Claude Code 허용 규칙에 `Bash(doan open *)`을 더한다(`CLAUDE_ALLOW_RULES`, `app/src/main/agentSetup/plan.ts`). 기존 merge가 빠진 규칙만 더하므로 이미 설정된 사람은 다음 실행 때 채워진다. About의 링크 설정 파일 안내(`notice.ts:79`)도 세 규칙을 든다. Codex 규칙은 모든 `doan` 명령을 이미 허용하므로 그대로다 |
| 앱 턴 프롬프트 | `app/src/main/conversation/prompt.ts`에 한 줄을 더한다. 이 대화는 Doan 안이므로 캔버스를 열어 줄지 묻지 않으며, 이 줄이 Doan 가이드의 제안 규칙보다 우선한다는 내용이다 |
| eval | 다음을 바꾼다.<br>- W3 → W3b(제안 기준 rubric, `doan open` 호출 없음 automatic check)<br>- 새 시나리오 W4(사람이 처음부터 열어 달라고 할 때)<br>- 가짜 소켓(`eval/lib/socket.ts`)의 v4 지원과 v4 교환을 돌려주는 accessor(`eval/lib/types.ts`, `context.ts`)<br>- R8 → R8b: 턴 프롬프트가 바뀌므로 ARCHITECTURE §14의 시나리오 버전 규칙을 따른다. `doan open` 호출 없음 automatic check를 더한다<br>- 실제 실행 workspace의 Claude 허용 규칙은 `eval/lib/workspace.ts:79`가 `CLAUDE_ALLOW_RULES`를 import하므로 자동으로 따라온다 |

## 동작

- **가이드 규칙 J(새 문구 방향)**: spec 완료 조건 5를 영어로, 예산 안에서 짧게 쓴다. 문구는 의도만 정하고 고정 문장을 주지 않는다. 사람이 링크를 달라고 하면 `doan work done`이 돌려준 `links`를 준다.
- **`doan open` 응답**: 성공하면 `{opened: true, frame: "found" | "missing" | "none"}`이다(이름은 /tdd에서 확정). 실패는 ARCHITECTURE §12의 기존 코드를 쓴다. message와 nextSteps는 Go가 코드별로 만들고, 앱의 토스트 문구를 가져오지 않는다. 앱이 이유를 넘길 때는 onboarding처럼 `withoutSecrets` 필터를 거친다.

| 상황 | 코드 / exit | 앱에서 보이는 것 | 에이전트의 한 줄 |
|---|---|---|---|
| 열림 | `opened` / 0 | 다이얼로그를 닫고, 창을 앞으로, 캔버스를 열고 프레임 강조 | 무엇을 열었는지 |
| 없는 프레임 | `opened`(frame missing) / 0 | 창을 앞으로, 캔버스만 | 캔버스만 열었다고 |
| 이미 열린 같은 캔버스 | `opened` / 0 | 창을 앞으로, 프레임 강조 | 무엇을 열었는지 |
| 경로·frame 형식 오류 | `usage_error` / 2 | 없음(앱에 묻지 않음) | 보통 보이지 않음(에이전트가 고쳐 다시 실행) |
| 파일 없음 | `canvas_not_found` / 2 | 없음(앱에 묻지 않음) | 그 캔버스를 찾지 못했다고 |
| 등록되지 않은 루트 | `project_not_open` / 3 | 없음 | 그 폴더 이름과 함께 Add Projects로 더한 뒤 다시 부탁하라고 |
| 목록에 없는 캔버스 | `canvas_not_found` / 2 | 없음 | 그 캔버스를 찾지 못했다고 |
| 잠긴 페이지·거부하는 다이얼로그·first run | `busy` / 5 | 없음 | 무엇을 끝낸 뒤 다시 부탁하라고(first run이면 "Finish Doan's first run") |
| 이미 떠 있는 앱이 시간 안에 준비되지 않음 | `busy` / 5 | 없음 | Doan이 아직 열리는 중이니 잠시 뒤 다시 부탁하라고 |
| 앱이 꺼져 있고 bootstrap이 시간 안에 준비되지 못함 | `app_launch_failed` / 3 | 앱이 늦게 뜰 수 있으나 이동하지 않음 | Doan을 열지 못했다고 |
| 앱 밖의 CLI이거나 `DOAN_RUNTIME` 설정 | `app_not_running` / 3 | 없음 | §12의 복구 순서 |
| 오래된 앱(v4를 모름) | `app_protocol_mismatch` / 3 | 없음 | Doan을 업데이트하라고 |

- **준비 전 요청**: 앱은 요청을 붙잡지 않고 `not_ready`로 바로 답한다. CLI는 bootstrap 제한 시간 안에서 다시 보낸다. 그 사이 사람이 다른 캔버스로 갔어도, 준비된 뒤 도착한 요청은 새 요청이므로 이동한다(POSTMORTEM 2026-10-25 'Delayed startup restoration replaced newer navigation'의 "그 뒤의 이동이 대체한다"와 맞는다. 요청은 restore 뒤에 처리된다).
- **동시 요청**: 요청마다 id가 있고 각자 renderer 결과를 받는다. renderer는 도착 순서대로 처리하므로 마지막 요청의 캔버스가 남는다. `openLinkQueue`(마지막 URL 하나만 남김)는 v4에 쓰지 않는다.
- **다이얼로그 닫기**: v4도 링크처럼 취소할 수 있는 다이얼로그를 닫는다. 요청이 사람에게서 왔기 때문이다. `App.tsx:954-956`의 주석("A link only ever comes from a person's click")을 "링크나 사람이 부탁한 `doan open`"으로 고친다.
- **앱이 꺼져 있을 때**: `onboarding start`의 bootstrap을 재사용한다(2026-11-03 user).
  - 첫 시도에서 앱이 없고 `DOAN_RUNTIME`이 설정되지 않았으면, 앱 안에 든 CLI가 자기 `.app`을 한 번 열고 정해진 시간만큼 기다린다. 그동안 요청을 다시 보내며, `not_ready`도 "아직"으로 본다. 시간이 다하면 `app_launch_failed`다.
  - 앱 밖의 CLI이거나 `DOAN_RUNTIME`이 설정된 경우(빈 값 포함)에는 앱을 열지 않고 `app_not_running`이다. 상대 경로 `DOAN_RUNTIME`은 `active`·`work`처럼 `usage_error`다.
  - runtime이나 소켓에 권한이 거부되면 앱을 열지 않는다. ARCHITECTURE §4 'Bootstrap'의 신뢰 조건을 그대로 따른다.
- **앱 대화**: `DOAN_APP_CONVERSATION`이 있는 Doan 안의 대화에서는 턴 프롬프트가 제안을 막는다(2026-11-03 user). 사람이 이미 Doan에 있고, 앱 안의 이동은 `agent-reply-chips`의 칩이 맡기 때문이다. 사람이 앱 대화에서 먼저 열어 달라고 하면 `doan open`은 그대로 동작한다. 화면과 대화 패널이 그 캔버스로 넘어가고, Back으로 이전 화면에 돌아갈 수 있다. 앱 대화는 `DOAN_RUNTIME`이 주입되므로(`conversation/environment.ts:9`) 앱을 띄우지 않고 자기 앱에만 닿는다.
- **`links`**: `doan work done`의 응답은 바꾸지 않는다(2026-11-03 user). 가이드에는 사람이 링크를 달라고 할 때만 `links`를 주라고 적는다.

## 순수 함수로 뺄 부분 (/tdd 대상)

1. Go `openRequest(root, resolvedPath, frame)`(`open_rules.go`): 해석된 경로의 캔버스 경로 형식 검사, frame 검사(비어 있음·제어 문자·길이), v4 요청 생성. `workTarget`은 `EvalSymlinks`·`Lstat`을 쓰므로 셸에서 부른다.
2. Go `openReply(line)`: v4 응답 검증과 CLI 결과·exit code 변환. 오래된 앱의 v1 refusal(`bad_request`)은 `app_protocol_mismatch`, `not_ready`는 재시도 신호다.
3. TS `resolveOpenTarget(link, entries)`(`deepLinks.ts`): 링크와 v4가 함께 쓰는 등록 루트·목록 판정. `resolveOpenLink`는 `parseOpenLink` + 이 함수가 된다.
4. TS renderer 판정 helper: 다이얼로그 cancel 결과, `locked()`, first run, 목록 재확인으로 `opened` / `busy`+이유 / `canvas_not_found`를 정한다. `openLink`와 v4가 함께 쓴다.
5. 공유 fixture `schema/fixtures/app-socket-v4/`: 요청·응답의 정상, 각 거절, `not_ready`, 버전 불일치, 오래된 앱의 v1 refusal. Go와 TS가 같은 파일을 읽는다.

## 포맷 변경

- 새 schema `schema/app-socket.v4.schema.json`과 fixture `schema/fixtures/app-socket-v4/`. `frame`에는 `minLength`·`maxLength`·제어 문자를 막는 pattern을 값으로 적어 Go와 TS가 같은 규칙을 쓴다. 기존 v1–v3의 `v`는 바뀌지 않는다. v1 전용 reader가 `app-socket/`을 glob하므로 fixture는 별도 디렉터리에 둔다(ARCHITECTURE §11 'Onboarding and work sockets').
- 등록 위치: `schema/embed.go`, `cli/internal/formats/validate.go`, `app/src/formats/validate.ts`·`types.ts`.
- CLI 응답: envelope은 바뀌지 않는다. `doan open`의 `result` 모양은 다른 명령처럼 schema 없이 ARCHITECTURE §12에 적는다. `doan work done`의 `{delivered, links, skipped}`는 바뀌지 않는다.

## 컨벤션 영향

ARCHITECTURE §1 'Conventions'의 캔버스 규칙과 `doan check`는 바뀌지 않는다. 가이드 규칙 J(에이전트 규칙)가 바뀐다.

## 결정 영향

- **링크의 보안 경계를 그대로 지킨다.** `doan open`은 등록된 루트의 목록에 있는 캔버스로 이동만 한다(ARCHITECTURE §7 'Deep links' 'Security boundary'). 소켓은 같은 사용자의 토큰이 필요하므로 웹 페이지보다 좁은 입구다.
- **앱을 여는 명령**: 지금은 `onboarding start`만 앱을 연다(PRODUCT §5 item 0 첫 실행 줄, item 10, ARCHITECTURE §4 'Bootstrap', §12). `doan open`도 같은 bootstrap으로 앱을 열게 되므로 이 규칙이 바뀐다(2026-11-03 user). 에이전트는 사람이 열어 달라고 했을 때만 이 명령을 실행하므로, 에이전트가 마음대로 앱을 띄우는 길은 생기지 않는다.
- **사용자 설정 파일**: Doan이 `~/.claude/settings.json`에 더하는 규칙이 둘에서 셋이 된다(PRODUCT §5 item 0 'Agent setup'). 다른 바이트를 건드리지 않고 빠진 규칙만 더한다는 규칙은 그대로다.
- **에이전트가 앱을 움직이는 일**: PRODUCT §3 Out of scope 4는 Doan이 에이전트 작업을 시작하는 일만 막는다. `doan open`은 사람이 요청했을 때만 실행하고 에이전트를 깨우지 않으므로 이 항목에 걸리지 않는다. 승격 때 그 항목의 "a `doan://` link only moves"에 `doan open`을 더한다.
- git 작업, 서비스 범위, sandbox iframe, append-only events, 토큰 처리에는 영향이 없다.

## PoC 의존

없다. 소켓 버전 추가(v2·v3), deep link 처리, 앱 실행(onboarding bootstrap)이 모두 출하된 경로다. 새로 생기는 것은 main↔renderer 요청-응답 IPC뿐이다.

## 다른 feature와의 관계

- `agent-reply-chips`는 "규칙 J는 바꾸지 않는다", "J의 `doan://open` 링크는 앱 스레드에서 평문"을 전제로 한다(agent-reply-chips/spec.md). 두 feature 모두 `prompt.ts`에 줄을 더한다. 나중에 merge되는 쪽이 두 줄을 합치고, 상대 feature 문서의 전제를 고친다. 칩도 renderer 판정 helper와 거절 처리를 함께 쓸 수 있다.

## POSTMORTEM 인용

- **2026-10-29 'Codex cut the middle out of the doan guide and kept its end marker'**: 규칙 J와 `doan open` 설명을 더할 때 가이드 출력 예산 테스트(`skillOutputBudget`, 21,600 B)를 지킨다. `skill.md`만 18,931 B이고 preset 줄과 bundle note가 더해지므로, 쓰기 전에 현재 출력 크기를 측정한다. 줄이는 쪽이 낫다.
- **2026-11-02 'Evaluation unit checks inherited the real session-recording runtime'**: `doan open`을 부르는 eval fixture는 모두 절대 경로의 임시 `DOAN_RUNTIME`을 쓴다. 실제 Doan이 움직이면 안 된다. eval workspace는 항상 절대 경로 `DOAN_RUNTIME`을 두므로(`workspace.ts:65`) 패키지된 bundled CLI도 앱을 띄우지 않는다.
- **2026-10-24 'Agent shells bypassed the evaluation runner's packaged CLI'**: 새 시나리오도 에이전트 셸이 패키지 CLI를 쓰는지 증거를 남긴다.
- **2026-10-25 'A new link state silently removed replacement-guard coverage'**: 판정을 나누고 거절 이유를 더할 때 기존 deep link 거절 fixture가 그대로 지켜지는지 확인한다.
- **2026-10-25 'Delayed startup restoration replaced newer navigation'**, **'A toast's Open was dropped while its project was still loading'**: bootstrap 직후 요청은 restore와 첫 읽기 전에 도착한다. 준비 전에는 `not_ready`로 답하고, loading 중인 루트를 `canvas_not_found`로 오판하지 않는다.
- **2026-10-30 'Timing tests failed under machine load'**: bootstrap과 renderer timeout 테스트는 주입 clock이나 held promise를 쓰고, 테스트 제한을 내부 대기보다 넉넉히 둔다.

## 결정 (2026-11-03 user)

1. 앱이 꺼져 있으면 `doan open`이 onboarding bootstrap으로 앱을 연다.
2. Claude Code 허용 규칙에 `Bash(doan open *)`을 더한다.
3. 앱 대화에서는 턴 프롬프트로 제안을 막는다. 사람이 먼저 부탁하면 `doan open`은 동작한다.
4. `doan work done`의 `links`를 남긴다.
5. 응답은 renderer가 이동을 결정한 뒤에 보낸다(`opened`가 실제 결과다).
6. 준비 전 요청은 `not_ready`로 바로 거절하고 CLI가 다시 시도한다.
7. 거절이면 앱은 창을 가져오지도 토스트를 띄우지도 않는다. 에이전트만 알린다.
