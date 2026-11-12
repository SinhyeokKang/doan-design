# claude-turn-end — orch

원본: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md) · 체인 [chain-261112](../chain-261112/chain.md) 링크 2

- 시작 hash: `8e9c33e9` (origin/develop, PR #177 병합 뒤)
- 통합 브랜치: `feat/claude-turn-end` (lead가 만들었다)
- 끝: `feat/claude-turn-end` push와 develop 대상 PR. 병합하지 않는다. 링크 1(`canvas-svg-sprites`) PR이 먼저 병합된다.

## 결정 기록

1. PoC(tasks 1)는 설치된 Claude CLI의 기존 로그인으로 돈다. 세션 기록은 실제 `~/.claude/projects/` 아래 임시 cwd 이름의 디렉터리에 남는다(사용자, 체인 시작 점검 3).
2. `/runtime-test` 로그인(tasks 9)은 실제 HOME, 임시 `DOAN_RUNTIME`·repo, 계속 쓰는 userData `/Users/sinhyeok/code/doan-design/.scratch/provider-profile/userData`를 쓴다. probe마다 로그아웃하지 않고, 병합 전에 lead가 로그아웃하고 지운다(사용자, 체인 시작 점검 4). design.md '실제 앱 확인의 로그인'과 tasks 9를 이 규칙으로 고쳤다.
3. Claude 2.1.284가 첫 프롬프트 uuid를 echo하지 않거나 `background_tasks_changed`를 보내지 않으면 최소 버전을 올릴지 사용자에게 묻는다. 미리 정하지 않았다(사용자, 체인 시작 점검 5).
4. 사용자가 일하는 중에 격리 앱 창이 뜰 수 있다(사용자, 체인 시작 점검 6).
5. 워커는 Claude만 쓴다. 모델 계열을 넘지 않는다(체인 상시 권한).
6. A(PoC)와 C(tasks 3–6)는 같은 워커가 같은 worktree에서 이어서 한다. PoC에서 본 원시 프레임과 fixture가 테스트와 구현의 근거라서 맥락을 잇는다(conductor 판단).
7. tasks 10의 문서 승격은 conductor가 한다. 같은 항목의 `runners.ts` `TURN_USAGE_MS` 주석은 코드라서 C가 tasks 5에서 고친다(conductor 판단 — conductor는 batch 코드를 고치지 않는다).
8. tasks 9는 통합 뒤 새 워커 E가 통합 HEAD에서 돈다(conductor 판단 — `/orchestrate` §4의 통합 검증을 워커 결과가 아닌 결합 결과로 한다).
9. PoC의 실제 상태 비교는 글자 그대로는 통과하지 못했지만 받아들인다(conductor 판단). `~/.claude.json`은 CLI가 시작할 때 캐시 키를 다시 써서 바뀌었다. 사용자가 승인한 기존 로그인을 쓰는 한 이 쓰기는 피할 수 없다. `~/.claude/projects/`에서 PoC 밖의 변화는 같은 시간에 돈 다른 Claude 세션의 것이고, 그 안에 PoC 세션 id는 없다. 1e 실행 3의 차이는 사용자의 Doan.app이 쓴 것이다.
10. tasks 3의 renderer 테스트(`backgroundLine`, `turnStatus` `stopping`, `homeRun.ts` 창, 실패 문구와 strip, Stop·포커스, `sending` 정리)는 D가 먼저 red로 쓰고 구현한다. C가 쓰면 tasks 6의 verify가 D 전까지 red가 되기 때문이다. `prompt_unread` 때문에 renderer typecheck가 깨지면 C가 spec 문구로 최소 항목만 더한다(conductor 판단).
11. `PROMOTION_SETTLE_MS`는 60회 전체 최댓값 기준 5572ms로 둔다. 3초 간격 실행만 쓰면 4227ms지만, 1.5초 간격의 연속 쓰기도 실제로 일어난다(conductor 판단 — design의 '최댓값 × 1.5' 규칙).
12. 백그라운드 프로세스는 CLI 그룹 밖의 자기 그룹에서 돈다(PoC d). 그래서 백그라운드 집합이 비어 있지 않은 그룹은 모든 경로에서 SIGTERM을 먼저 받는다. 즉시 SIGKILL은 집합이 빈 경우(제안만 남음, 자발적 모델 호출 막기)에만 쓴다. design 2절의 결정 규칙 그대로이고, 테스트로 고정한다(conductor 판단).
13. 두 버전 모두 작업이 끝난 뒤 스스로 모델을 부르므로(2.1.322 셸·에이전트, 2.1.284 에이전트), design 5절의 막기가 범위에 들어간다(design 조건 그대로).
14. D는 C 리뷰를 기다리지 않고 C의 브랜치(`d8252b5a`)에서 시작한다. C의 수정 회차는 main 쪽만 바꾸므로 D와 파일이 겹치지 않는다. 수정이 IPC나 목록 필드 모양을 바꾸면 D에 알린다(conductor 판단 — renderer가 C의 필드를 써야 해서 feat 통합까지 기다리면 리뷰 시간만큼 늦어진다).
15. archive와 앱 종료에서 기록에서 찾은 Send now 메시지는 큐로 돌아가지 않기만 하고, 스레드에는 남지 않을 수 있다. spec 완료 조건 4와 design §4를 이렇게 좁혔다(사용자, R-C 판정 1).
16. 백그라운드 그룹이 쥔 세션을 terminal continue로 고르면 기존 `session_in_use` 거부로 둔다. "elsewhere" 문구 문제는 BACKLOG에 남긴다. design §5를 이렇게 좁혔다(사용자, R-C 판정 3).

## batch

| batch | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| A | tasks 1 PoC | `.scratch/claude-turn-end/`(커밋 안 함), tasks.md 'PoC 결과', design.md `PROMOTION_SETTLE_MS` 값과 기록 필드 | 없음 | Opus high — 실제 CLI 프레임을 해석해 멈춤 조건을 판정해야 하고, 틀리면 이후 설계 전체가 틀린다 | tasks 1 '확인': 스크립트 로그와 'PoC 결과' 수치 일치, 실제 상태 비교 통과 | 끝. 통합 `50c034f6`, `ff3c3f0b`. 멈춤 조건 없음. 실제 상태 비교는 글자 그대로는 통과하지 못했다(결정 9) |
| B | tasks 8 노티스 버튼 세로 가운데 | `app/src/renderer/ds/surfaces.css`, `app/src/renderer/ds/controls.test.ts`, `.doan/canvases/claude-turn-end.html`(override 줄 삭제만), `.doan/ds/notice.html`, `docs/DESIGN.md` 'Notices'·'Conversation strip' | 없음 | Sonnet high — 규칙 한 줄과 문서의 기계적 변경이지만 실제 앱 probe 단계가 많다 | tasks 8 '확인': app test 녹색, 두 줄 Home strip의 버튼 세로 가운데·아이콘 첫 줄, 한 줄 노티스 높이 44 px | 구현 끝(`447b5a38..d5560ae3`, verify PASS, probe: 두 줄 strip 버튼 중심 차이 0 px·아이콘 첫 줄·한 줄 44 px). probe는 실제 마크업을 주입했고 대화를 만들지 않았다. 통합 `083ea685..35b88318`, 수정 1회. worktree 정리 끝(브랜치 `SinhyeokKang/cte-b` `b0296ce9` 유지) |
| C | tasks 3–6 (+ tasks 10의 `TURN_USAGE_MS` 주석) | `app/src/main/conversation/**`(fixtures 포함), preload, 로그아웃·Restart to Update·프로젝트 Remove의 `stop_required` 계산. renderer는 `prompt_unread` 최소 항목만(결정 10) | A | Opus high — 프로세스 그룹 정리, 예약 해제 순서, 보류한 종료의 동시성. 틀리면 POSTMORTEM 2026-10-27·10-28 회귀가 다시 난다 | 각 tasks의 '확인', `node .agents/skills/verify/scripts/verify.mjs` PASS | 통합 `205afe05..ffe04bf7`, `9968ca45`, 수정 2회(`1b2351be`, `71bdf2db`). 통합 HEAD `9968ca45` verify PASS(10568건). 통합 HEAD(B+C) verify PASS(앱 테스트 386 파일·10536건). 워커와 `cte-a`는 E·R-D의 main 쪽 지적에 대비해 남긴다 |
| D | tasks 7 스레드 UI + `/design-sync`, tasks 3의 renderer 테스트(결정 10) | renderer 스레드 UI(`backgroundLine`, `turnStatus.ts`, `homeRun.ts`, `threadItems.ts`, `ConversationThread.tsx`, `conversationStrip.ts`, 관련 CSS), `docs/DESIGN.md` 백그라운드 줄 측정값 | B 통합, C 구현 끝(결정 14) | Opus high — 포커스 이동, Stop 경합, `sending` 항목 정리(POSTMORTEM 2026-11-05)와 초안 측정 | app test 녹색, `/design-sync` 측정 통과 | 구현 끝(`fa8262a6..3a369258`, verify PASS, `/design-sync` 56/56 행 일치와 실제 앱 동작 확인 9건 통과). Home strip의 `prompt_unread`는 실제 앱에서 띄우지 못했다(단위 테스트로 고정). 통합 `70f84fd3..e3e795a8`, 수정 0회. 워커 해제. `cte-d`는 C 수정 2회차가 그 probe를 쓰므로 그 뒤 지운다 |
| E | tasks 9 `/runtime-test` | `.scratch/`의 probe만 | C, D 통합, lead의 '[lead] screen back' | Opus medium — 정해진 probe를 실제 앱에서 재고 수치를 완료 조건과 대조한다 | probe 수치가 spec 완료 조건 1–5를 만족, 실제 상태 비교 통과 | 대기 |
| R-B · R-C · R-D | 각 batch `/code-review` | 없음(보고만) | 각 batch | R-B Sonnet medium, R-C Opus high, R-D Opus high — diff 난이도에 맞춘다 | `/code-review` 보고 | 대기 |
| Z | tasks 10 문서 승격과 삭제 | PRODUCT, ARCHITECTURE, BACKLOG, DESIGN, DIRECTORY, `docs/features/claude-turn-end/` | 구현 통합. E에 기대는 BACKLOG 'Not verified'와 디렉터리 삭제는 E 뒤 conductor | Opus high 워커가 초안을 쓰고 conductor가 검토한다 — 승격할 규칙이 많고 코드와 대조해야 해서 conductor 맥락을 아낀다 | 문서 diff 검토, verify PASS | 승격 통합 `c9dfd8e9..56f65b47`(conductor가 diff 검토, 워커 verify PASS). 워커·`cte-z` 정리 끝. 남은 것: E에 기대는 BACKLOG 'Not verified', 디렉터리 삭제 |

tasks 2(`/design-draft`)는 lead 단계에서 끝났다(`8de3b646`, `6b7faccf`).

## 파일 겹침과 순서

- A와 B는 파일이 겹치지 않아 병렬로 돈다.
- C는 A의 PoC 결과를 conductor가 검토한 뒤 같은 워커에 새 Task로 보낸다. B와 파일이 겹치지 않아 B와 병렬로 돌 수 있다.
- D는 B(`surfaces.css`, DESIGN.md)와 C(목록 필드, renderer stub과 테스트)를 통합한 뒤 시작한다.
- E는 C·D 통합 뒤, Z는 E 뒤다.
- 화면 알림(lead 요청): 이 링크의 마지막 GUI probe(실제 앱 창, `/design-sync`, `/runtime-test`, OS 입력)가 끝나고 더 열 창이 없으면 lead 터미널에 `[conductor claude-turn-end] GUI done`을 한 번 보낸다. 그 뒤 수정 회차가 다시 화면을 쓰면 시작 전에 `[conductor claude-turn-end] GUI again`을 보낸다. 현재: D의 `/design-sync`와 E가 남았다.
- GUI probe: B·D·E의 실제 앱 창은 서로 겹치지 않게 순서대로 띄운다. 링크 1의 probe와 같은 순간에 겹치면 PR 본문에 남긴다.

## 리뷰와 수정 기록

- R-B(Sonnet medium): 🔴 0 / 🟡 3 / ⚪ 2. 🟡: DESIGN.md 'Moved line alignment'(606)과 592행의 "top-aligned"가 옛 규칙, `controls.test.ts:27` 주석이 옛 규칙, 공통 규칙이 ProjectSettings 노티스와 composer·BuddyPicker Retry의 줄바꿈 경우에도 닿는다.
  - 마지막 🟡는 conductor 판단으로 의도대로다(tasks 8 '모든 노티스에 적용', 스레드 노티스만 제외). DESIGN 'Notices'에 적고, 줄바꿈 경우를 probe에 더하게 했다.
  - ⚪(`.doan/ds/notice.html` 한 줄 샘플)은 고치지 않는다.
  - 수정 1회차(`688477aa`, `b0296ce9`)로 🟡 셋을 고쳤다. 줄바꿈 probe: Project Settings reason 노티스 64 px·중심 차이 0(이전 −10), composer Retry 300 px 폭 104 px·0(이전 −30), buddy Retry 84 px·0(이전 −20). 수정이 문서와 주석뿐이라 conductor가 diff를 직접 보고 재리뷰는 하지 않았다.
  - B의 첫 verify가 건드리지 않은 `src/main/watch.test.ts` 타이밍 테스트에서 한 번 실패했고, 다시 돌려 PASS했다(POSTMORTEM의 watch.test.ts 후속 항목과 같은 영역).
- R-C(Opus high): 🔴 0 / 🟡 4 / ⚪ 8, 사용자 결정 2(결정 15, 16).
  - 🟡: failed 턴 뒤 자발적 모델 호출을 막지 않음, Doan이 보낸 SIGTERM 정지 중에도 빈 집합 kill이 나가 CLI의 SIGTERM 처리를 끊음, 종료 이벤트보다 그룹 소멸이 먼저 오면 기록을 찾지 않음, ambient 작업이 정리 결정에서 빠짐.
  - 수정 1회차로 🟡 넷과 ⚪ 1·2·5를 C에 보냈다. ⚪ 3(단수 `user_message_uuid`), 6(거부된 send도 그룹을 끝냄), 8(Remove는 기다리지 않음)은 Z가 승격 문서에 반영한다.
  - E probe에 SIGTERM을 잡는 백그라운드 작업(`trap '' TERM; sleep 30` 같은) 경우를 더한다(R-C 🟡2·4 확인).
  - 수정 1회차(`1b2351be`): 🟡 넷과 ⚪ 1·2·5를 고쳤다. 수정 전 소스로 돌리면 새 테스트 74개 중 6개가 실패하고, 수정 뒤에는 모두 통과한다. IPC와 `ConversationSummary` 모양은 바뀌지 않았다. diff가 작고 리뷰 지적만 고쳤으므로 conductor가 diff를 직접 확인했고, 재리뷰는 하지 않았다.
- D가 찾은 main 쪽 문제 두 가지를 C 수정 2회차로 보냈다.
  - 🟡: 프로젝트 턴 끝의 큐가 나가는 동안에도 `backgroundChanged`가 `background`를 세워, 줄이 큐 위에 잠깐 보인다.
  - 조사: 격리한 빌드 앱의 종료가 가끔 멈춘다(6회 중 4회). develop `c0d99ed4`와 C 브랜치에서 비교해, C 브랜치에서만 멈추면 원인을 고친다.
- R-D(Opus high): 🔴 0 / 🟡 1 / ⚪ 3. renderer에는 고칠 🔴·🟡가 없다.
  - 🟡: D가 찾은 main 쪽 깜박임이 캔버스 대화의 큐에서도 난다(`submit`이 `previousExit` 뒤에야 busy를 세움). C 수정 2회차에 캔버스 테스트를 더했다.
  - ⚪ 1: 프로젝트 대화에서 판정 창 안에 보낸 send는 그룹을 먼저 끝내므로, 줄이 사람의 메시지보다 최대 `PROMOTION_SETTLE_MS` 먼저 사라진다. Z가 PRODUCT 문구에 반영한다.
  - ⚪ 2(호스트 Stop 배선의 단위 테스트 없음)는 `/design-sync` probe로 확인했으니 고치지 않는다.
  - ⚪ 3(다크 모드 미확인)은 초안 선택 5가 light only라 범위 밖이다.
- C 수정 2회차(`71bdf2db`): 프로젝트·캔버스 턴 끝의 큐가 나갈 때 백그라운드 줄을 세우지 않는다(테스트 2건 red → green). `service.handoff.test.ts`의 시간 의존 flake도 Date를 가짜로 바꿔 고쳤다. diff를 conductor가 직접 확인했다.
  - 격리 빌드 앱의 종료 멈춤은 develop `c0d99ed4`에서도 났다(6회 중 1회, 8초 넘음). 이 브랜치에서는 6회 모두 0.4초 안에 끝났다. 이 기능 이전부터 있던 문제라 고치지 않고 PR 본문에 남긴다.
- 화면 중지(lead, 2026-11-13): 사용자가 화면을 끈다. '[lead] screen back' 전까지 GUI probe를 시작하지 않는다. 중지 시점에 돌던 probe(C의 종료 비교)는 끝났다. 남은 GUI 단계는 E 하나다.
