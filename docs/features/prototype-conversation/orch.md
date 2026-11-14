# prototype-conversation — orch

계획 원본: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md). 체인: [chain-261113-3](../chain-261113-3/chain.md) 링크 3(마지막 링크).

- 시작 hash: `10d6ed84`(origin/develop, 링크 1a #189·1b #190·2 #191 병합 뒤)
- 통합 브랜치: `feat/prototype-conversation`(lead가 만들었다), conductor worktree `prototype-conversation-orch`
- conductor: Claude Code(Opus). 체인 상시 권한으로 Codex 워커를 Claude 워커와 함께 쓴다. 이 링크는 `/agent-eval`을 하지 않는다(체인 '운영 메모').
- Codex 사용량: 링크 시작 때 주간(`window_minutes: 10080`) 39% 사용(Orca `CODEX_HOME`의 2026-11-14 rollout 기준).
- 시작 점검(lead가 받은 사용자 승인): 격리 dev 앱 창 허용. tasks 1의 검증 명령은 `node .scratch/prototype-conversation/probe.mjs`(스크린샷 포함).
- 로그인 프로필: `/Users/sinhyeok/code/doan-design/.scratch/provider-profile/userData`(Claude Code·Codex 연결). 실제 턴이 필요한 probe는 이 프로필을 제자리에서 쓰고 상태 파일을 백업·복원한다(복사본은 Keychain 로그인을 잃는다). 로그아웃·삭제는 lead가 병합 전에 한다.

## 결정 기록

새 제품·범위 결정은 없다. spec '결정' 1–18이 정해 두었다.

- conductor 판단 — design.md를 develop과 맞췄다. `PrototypeView`에 `root`·`path`가 이미 있어 `target` 대신 `canvasId?`와 패널 상태만 더한다. 나머지(R 104 → 140, `--pw-right`, `.pw-right`의 [토글, Export], 토스트 호스트와 `onWindowVisible`, `prototypeCaptureRect`의 `sideColumn`, `PROTOTYPE_WINDOW_REQUESTS`, `answerReached`의 `stale` 처리)는 design과 맞았다.
- conductor 판단 — 배치를 파일 소유로 P(PoC), M(main·preload), R(renderer 순수 함수와 주입 리팩터), U(UI, App, 실제 앱 확인)로 나눈다(아래 표). 근거: tasks 3·4가 main과 renderer에 걸치고, 그 둘의 파일이 겹치지 않는다.
- conductor 판단 — P, M, R을 함께 시작한다. M·R의 순수 함수, 범위 검사, 주입 리팩터는 PoC 결과와 무관하다. PoC 결과에 걸린 것(창을 넓히는 호출 순서, 포커스 지키기 방법, 그 partition에서 패널 부품이 도는지)은 `prototypeWindow.ts`의 크기 호출(M의 미룬 항목)과 U에만 있다. PoC가 실패하면 design.md를 고치고 해당 배치를 멈춘다.
- conductor 판단 — `revealDecision`(순수 함수 12)과 그 테스트는 R이 아니라 U가 맡는다. 근거: main이 main renderer에 보내는 reveal 요청 모양을 M이 정하므로, App 쪽 판정은 M 통합 뒤에 둔다.
- conductor 판단 — M과 R의 경계 계약: 프로토타입 preload의 대화 호출은 `window.doan`(preload/index.ts)의 같은 메서드 이름과 signature를 쓴다. R은 `ConversationCalls`를 `window.doan` 타입의 부분집합으로 정의하고, U가 `window.doanPrototype`이 그 타입에 맞는지 typecheck로 확인한다.
- conductor 판단 — tasks 10(`/code-review` → `/refactor` → `/verify`)은 배치별 독립 리뷰, 통합 diff 전체 리뷰 한 번, 통합 HEAD의 최종 `/verify`로 한다. tasks 11(승격·삭제)은 conductor가 문서 커밋으로 한다(/orchestrate §4 docs-freshness).

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| P | task 1(PoC). 관찰은 tasks.md task 1과 design.md 'PoC 의존'에 적는다 | `.scratch/prototype-conversation/`, `docs/features/prototype-conversation/{tasks,design}.md`의 PoC 부분. 앱 소스를 임시로 고쳐도 커밋하지 않는다 | 없음 | Claude Opus high — IME 조합·포커스와 창 크기 순서는 판정에 판단이 필요하고, 틀리면 U의 설계가 바뀐다 | `node .scratch/prototype-conversation/probe.mjs` exit 0과 스크린샷 | 대기 |
| M | task 3의 main 테스트(`conversationScope`, `requests`, `fit`, `windowState`, `notifications`, `senderAllowed`, preload 채널 고정), task 4의 main 순수 함수(1·2·3·6·7·8·10), task 6 전체 | `app/src/main/**`, `app/src/preload/**`, R을 140으로 바꾸는 `styles.css`의 `--pw-right` 한 줄(두 값을 묶는 테스트가 있다) | `prototypeWindow.ts`의 `setContentBounds`·`setMinimumSize` 순서는 P 통합 뒤(미룬 항목) | Claude Opus high — 프로토타입 창 role의 범위 검사가 깨지면 재생 캔버스 밖 대화·설정에 닿는다 | `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint` | 대기 |
| R | task 3의 renderer 테스트(`renderer/prototype/conversation.test.ts`, `ConversationThread.test.tsx`의 `stale`), task 4의 renderer 순수 함수(4·5·9·11)와 `answerReached`, task 5 주입 리팩터 | `app/src/renderer/**` 중 `renderer/prototype/PrototypeWindow.tsx`·`WindowShell`·`main.tsx`, `styles.css` 밖. `App.tsx`·`ProjectOverview.tsx`는 호출 객체를 넘기는 배선만 | 없음 | Claude Opus high — 여러 컴포넌트의 주입 리팩터가 main 창 동작을 바꾸지 않아야 한다 | `npm --prefix app test`(기존 `CanvasConversationPanel*`·`ProjectOverview*`·`conversationStore*`·`DockedComposer*` green), `npm --prefix app run typecheck`, `npm --prefix app run lint` | 대기 |
| U | task 3·4의 `revealDecision`, task 7 전체, 이어서 task 8(`/design-sync`)·task 9(`/runtime-test`) | `app/src/renderer/**`(M·R 통합 뒤), `docs/DESIGN.md`(task 8). main·preload 결함은 M으로 돌려보낸다 | M·R 통합(P 결과 포함) | Claude Opus high — 포커스·Tab 순서·IME·패널 폭 함정이 POSTMORTEM에 여럿 있다 | task 7: `npm --prefix app test`, `typecheck`, `lint`, `build`. task 8·9는 tasks.md의 명령 | 대기 |
| 리뷰 | 배치별 독립 `/code-review`, 마지막에 통합 diff 전체 한 번 | 보고만 | 각 배치 완료 | M·R: Codex gpt-6-astra medium(다른 계열의 독립 판독), U: Claude Opus high, 통합 전체: Codex gpt-6-astra medium | 보고서 | 대기 |

task 2(`/design-draft`)는 이미 끝났다. task 10은 리뷰 행과 conductor의 최종 `/verify`, task 11은 conductor가 한다. 모든 체크 항목이 한 행에 속한다.

## 겹침과 순서

- P, M, R은 파일이 겹치지 않아 병렬로 돈다. P만 GUI 창을 띄운다. 그 전후에 lead에 `GUI again` / `GUI done`을 알린다.
- U는 M·R 통합 뒤 시작한다. task 8·9의 GUI도 lead에 알린다. task 9의 실제 턴은 공유 로그인 프로필을 제자리에서 쓴다.
- 마지막: 통합 전체 리뷰, `/verify`, 문서 승격, 기능 디렉터리 삭제, PR.

## 진행 기록
- Run `run_5d7cc862a3b3`. P(`ctx_020a88944e06`, worktree `pcv-p`), M(`ctx_fc3d827698c9`, `pcv-m`), R(`ctx_cc4a43ae2c10`, `pcv-r`)를 `b04ca1dc`에서 시작했다. 모두 Claude Opus high(`launch` 확인). lead에 P의 `GUI again`을 알렸다.
- R 완료(`a9eaa8bb..10f1462f`) → `62284160..d76bd1f0`로 통합. R 보고: test 11911개, typecheck, lint(경고 80/80) 통과. 계획과 다른 점: target에 `lost?: "gone" | "duplicate"`, `playingFrameChip(view, last)`, `withPlayingFrame`이 칩 뒤에 공백 하나. `revealDecision`은 계획대로 U 몫이다.
- conductor 판단 — R이 남긴 계약 공백을 M에 보냈다(`msg_88a65c855399`): 프로토타입 preload가 R의 호출 객체 타입 전체를 같은 이름으로 낸다(`scheduledMessages`, `designSkills`, `onAgentAuth` 포함). `onAgentAuth`는 계정 정보(email 등)를 뺀 snapshot만 준다. view가 target 캔버스 행의 사라짐·ID 겹침을 구분해 알린다. 본체가 받는 `entry`는 target root의 `FolderEntry`만 좁은 읽기로 준다. 근거: 캔버스 행은 대화가 아니므로 design '범위 검사'가 지키는 것(다른 캔버스 대화, 프로젝트 대화, 삭제, email, 설정 쓰기)에 닿지 않는다.
- R 리뷰: Codex gpt-6-astra medium(`ctx_ff7a9e592159`, worktree `pcv-rr`).
- P 완료(`8c38b98b`) → `c6aa81ae`로 통합. probe exit 0, 29 checks, 스크린샷 13장(P 보고, 결과는 design.md 'PoC 의존'). design이 바뀐 곳 둘: 포커스 지키기는 `inert`가 아니라 포커스 되돌리기이고, 대화 열에 포커스가 있을 때 만들어진 run이 보이고 1초 뒤까지만 되돌린다(사람의 프레임 클릭과 스크립트 `focus()`를 host가 구별하지 못해서다). 패널을 연 동안의 최소폭은 `min(640, 작업 영역 폭)`이다.
- conductor 판단 — PoC의 두 설계 변경을 받아들인다. 근거: design이 방법을 PoC에 맡겼고("방법은 PoC에서 정한다"), 최소폭 자르기는 spec 결정 4의 "작업 영역 폭까지만 넓힌다"를 따른다. 남는 한계: 새 run이 보이고 1초가 지난 뒤 캔버스가 부르는 `focus()`는 막지 않는다. PR 본문에 적는다.
- task 1의 체크는 비워 둔다. 작업 영역이 640보다 좁은 실제 화면과 macOS 실제 한국어 입력기는 보지 못했다. 실제 입력기는 task 9에서 본다.
- M에 창 넓히기 순서(미룬 항목)를 보냈다(`msg_9fd6b70c6aa4`). lead에 `GUI done`을 알렸다. P 워커를 release하고 worktree `pcv-p`를 지웠다(브랜치 `SinhyeokKang/pcv-p` `8c38b98b` 유지). probe와 스크린샷은 conductor `.scratch/prototype-conversation/`에 복사했다.
- R 리뷰 1회차(Codex): 🔴 0, 🟡 1(현재 목록에 제목 없는 프레임 행이 있어도 `playingFrameChip`이 이전 제목을 붙인다), ⚪ 2(headless 테스트가 기존 대화 전송·큐와 첨부 해제 경로를 `window.doan` 없이 실행하지 않는다 / 두 worktree 사이 목록 귀속은 U host가 맞춘다). 계획과 다른 점 다섯은 모두 수용. 🟡1과 ⚪1을 R-fix1(`ctx_0bca00c8a5f7`)로 보냈다. ⚪2는 U 브리프에 넣는다.
- conductor 판단 — M이 `PrototypeView`의 새 필드(`panel`, `canvasRow`)와 R 140 때문에 깨지는 renderer 테스트 fixture 네 파일(`tooltip.describedby.test.tsx`, `PrototypeWindow.test.tsx`, `WindowShell.test.tsx`, `view.test.ts`)을 고치게 했다. 근거: M이 가진 계약 변경의 직접 결과이고, renderer 소스는 바꾸지 않는다.
- R-fix1 완료(`df89de8b`, `70530d84`) → `bebffd16`, `3a83ef56`으로 통합. 회귀 테스트가 red 뒤 green이고, test 11914개, typecheck, lint 통과(R 보고). R 리뷰 2회차를 같은 Codex 리뷰어에 보냈다.
- R 리뷰 2회차(Codex): 🟡1·⚪1 해결, 새 결함 없음. R 완료. R 워커를 release하고 worktree `pcv-r`를 지웠다(브랜치 `SinhyeokKang/pcv-r` `70530d84` 유지). handoff와 리뷰 보고서는 conductor `.scratch/`에 복사했다. 리뷰어(`pcv-rr`)는 M 리뷰에 다시 쓴다.
- M 완료(`6bb05a85..fa69e60e`) → `ed13b721..b712117a`로 통합. M 보고: test 11976개, typecheck, lint 통과, 미룬 항목 없음(PoC 순서 반영). 계획과 다른 점: `prototypePanelFit`을 새 함수로 둠, `conversationHandler`는 boolean에 `rows`만 더함, reveal 종류에 `handoff` 추가, 좁은 읽기는 `onAgentAuth`·`getWork`·`onWorkChanged`(같은 이름)와 `readComposerSettings`·`readTargetEntry`(새 이름), view에 `canvasRow`, 창이 닫힐 때 첨부는 `remove`만(큐 메시지의 재확인 때문). 실제 앱 확인은 U의 task 9로 넘어간다.
- M 리뷰: Codex gpt-6-astra medium(같은 리뷰어 `pcv-rr`, `ctx_2df4d51678da`). 통합 HEAD `b712117a`에서 conductor가 `/verify`를 돌린다.
- 통합 `/verify`(`b712117a`)가 typecheck에서 실패했다. 병렬로 만든 R의 view fixture(`conversation.test.ts`)에 M이 필수로 만든 `panel`·`canvasRow`가 없었다. conductor가 통합 커밋으로 fixture 두 필드를 더했다(test 27개 통과, typecheck 통과). `/verify`를 다시 돌린다.
- U(`ctx_3be22563ff7e`, worktree `pcv-u`, Claude Opus high)를 `bfcd64ab`에서 시작했다. 첫 Task는 task 7과 `revealDecision`이다. task 8·9는 리뷰 뒤 새 Task로 보낸다.
- M 리뷰 1회차(Codex): 🔴 0, 🟡 5, ⚪ 1. 🟡: (1) 큐에서 돌아와 main 창이 가져간 첨부도 프로토타입 창을 닫으면 지우고, 다른 창의 첨부 id를 remove·recheck·release할 수 있다 (2) `prototype:showing`이 범위 밖 대화 id를 받아 그 대화의 알림을 숨긴다 (3) 열린 패널의 폭 변경을 main이 창 폭으로 자르지 않아 view와 캡처에 잘못된 폭이 들어간다 (4) 늦은 ui-state 읽기가 새 Last used push 뒤에 예전 값을 보낸다 (5) 통합 typecheck 실패(이미 `bf2ee612`로 고침). ⚪: 최소폭이 낮아지는 맞춤에서 bounds를 먼저 주면 이전 최소폭에 막힌다. 계획과 다른 점은 close 때 remove만 하는 것(부분 수용) 말고 모두 수용. 1–4와 ⚪1을 M-fix1(`ctx_2a1d8fc94e2b`)로 보냈다.
- 통합 `/verify`(`bfcd64ab`, P·R·M과 fixture 수정): PASS(verify-tests, runtime-support, go-test, go-vet, typecheck, lint, app-test 12012개, build).
- M-fix1 완료(`1755d628`, `7e85a641`) → `8b0b879e`, `691faedf`로 통합. 첨부·showing·composer 설정을 Electron 없는 모듈로 꺼내 handler 경계에서 시험하고, 각 회귀 테스트가 red 뒤 green이다(M 보고: test 11996개, typecheck, lint, M 브랜치 기준). POSTMORTEM에 창별 첨부 소유 항목과 2026-10-26 recurrence를 더했다. M 리뷰 2회차(`ctx_8cc698d9aa06`)를 보냈고, U에 M-fix1의 동작 변화를 알렸다.
- M 리뷰 2회차(Codex): 🟡3·🟡4·⚪1 해결, 🟡1은 부분 해결. 새 🟡 2: (1) 큐 메시지가 다음 턴에 첨부를 되돌려 받은 뒤 전송 준비 중에 프로토타입 창을 닫으면 그 첨부를 지워 전송이 실패한다 (2) 소유권 검사가 첨부 세 채널에만 있어, 프로토타입 창이 main 창이 가져간 첨부 id를 자기 대화의 queue·send에 실으면 main 초안이 깨진다. 지운 sent id를 다른 창이 다시 가져갈 수도 있다. ⚪ 1: A→B→A Play에서 새 보고 없이 예전 showing이 다시 유효해진다. 통합 HEAD `185c88f8`에서 test 12032개, typecheck, lint 통과(리뷰어 실행).
- conductor 판단 — M-fix2(`ctx_bfdc630e3844`)에 소유권 모델을 정해 보냈다: 소유권은 창의 초안 소유권이고, 대화 요청이 첨부를 쓰면 그 id는 창 소유에서 빠져 서비스가 갖는다. 프로토타입 role은 지금 자기가 가진 id만 쓸 수 있고 등록되지 않은 id는 거절한다(main 창은 지금 그대로 둬서 capture와 서비스 재발급이 깨지지 않는다). target이 바뀌면 showing 기록을 지운다. 근거: 창마다 따로인 초안과 큐 보존이라는 spec 결정 안에서 가장 좁게 고치는 길이다.
- M-fix2 완료(`526b4569`, `2972e9f8`) → `848f66c9`, `70bdbff7`로 통합. 정한 소유권 모델대로 고쳤고, 각 회귀 테스트가 red 뒤 green이다(M 보고: test 12038개, typecheck, lint. `onboarding/clone.test.ts` 한 번 flaky 실패 뒤 재실행 통과). M 리뷰 3회차를 보냈다.
- M 리뷰 3회차(Codex): 이전 🟡 2건과 ⚪ 1건 해결, 새 지적 없음. M의 원래 범위는 끝났다.
- U 첫 Task 완료(`d063e179..eacf2f3f`) → `81748b2f..9b2f2c61`로 통합(POSTMORTEM 충돌은 같은 날 두 항목을 모두 두어 풀었다). U 보고: test 12101개, typecheck, lint, build 통과. `window.doanPrototype`이 R의 호출 객체 타입에 맞는지 타입 테스트로 고정했다. 스스로 리뷰에서 잡은 초안 옮기기 경합을 고치고 POSTMORTEM에 적었다. GUI는 띄우지 않았다. 계획과 다른 점: 새 대화 상태의 초안은 새 현재 대화로 옮기지 않는다(spec 결정 14는 "앞 대화"의 초안만 옮긴다), 목록 읽기가 한 번 성공한 뒤 실패하면 마지막 목록을 유지한다, 막힌 reveal의 dialog 이유는 초안 문구를 쓴다.
- 사용자 결정 — 프로토타입 창에 '그리기 중인 프로젝트 대화' 알림과 Open을 보이기 위해, main 창 renderer가 계산한 그 대화의 id 하나만 main을 거쳐 프로토타입 창에 보낸다. 그 대화의 내용은 보이지 않는다(spec 결정 7을 지키고, 범위 경계에서 넘어가는 것은 id 하나뿐이다). M3(`ctx_8e59d847cbf6`)에 main·preload 부분을 보냈다. App과 프로토타입 host의 배선은 U가 다음 Task에서 한다.
- U 리뷰: Claude Opus high(`ctx_b7cbe36f0ae1`, worktree `pcv-ru`). 통합 HEAD `9b2f2c61`에서 conductor가 `/verify`를 돌린다.
- 통합 `/verify`(`9b2f2c61`)가 go-test에서 실패했다: `cli/internal/cli`가 10분 제한을 넘었다(워커 셋이 테스트를 함께 돌리던 때). 이 feature는 Go 코드를 바꾸지 않았다. 같은 패키지를 다시 돌려도 load average 50 안팎에서 다시 제한을 넘었고, 멈춰 있던 `TestInitAndEmptyCommands` 하나는 혼자 12초에 통과했다. 부하 탓으로 보지만 확인하지 못했다. 그 뒤 단계(typecheck, lint, app-test, build)는 이 실행에서 돌지 않았으므로 마지막 `/verify`에서 본다.
- U 리뷰 1회차(Claude Opus): 🔴 1(재생 프레임이 있으면 턴이 도는 동안 빈 필드에서 Stop 대신 꺼진 Queue가 보여 프로토타입 창에서 턴을 멈출 수 없다), 🟡 5(provider 없는 Settings 동작이 아무 일도 하지 않는다 / 승격 알림이 프로토타입 창에 나타나지 않는다 / 거절 줄의 "Start a new conversation"이 범위 밖 새 대화를 만들고 초안을 숨긴다 / 주석이 feature 문서를 가리킨다 / 아래 사용자 결정 1), ⚪ 6. 리뷰어의 전체 test 실패 6건은 U가 바꾸지 않은 네 파일이고 부하 탓으로 보인다(단독 재실행에서 3건 남음: `cli.test.ts`, `shell.test.ts`, `quickOpen.test.ts`). 마지막 `/verify`에서 본다.
- 사용자 결정(U 리뷰에서 올라온 셋): D1 접힌 패널은 돌아온 큐를 가져가지 않는다(열린 패널만). D2 새 대화 상태에서 쓰던 초안도, 이 창의 시작이 진행 중이 아니면 새 현재 대화로 옮긴다. D3 승격 알림도 '그리기 중' 알림처럼 대화 id만 중계해 프로토타입 창에 보인다.
- M3 완료(`e0283b28..f776cb2d`) → `d5265e89..930eacbe`로 통합. M 보고: 관련 테스트 830개, typecheck, lint, 전체 test 12140개 통과(부하 속 첫 실행의 타이밍 실패는 단독 재실행에서 통과).
- M4(`ctx_54f19431437b`): 승격 알림 중계와 provider 없는 settings reveal의 main 쪽. U2(`ctx_69d5efd3d5ff`): U 리뷰 수정, D1·D2, 그리기 중 중계 배선. 승격 알림과 provider 없는 settings의 renderer 쪽은 M4 뒤로 미뤘다.
- U2 완료(`6a805701..2c85584d`) → `e4c5047c..d70cae5a`로 통합. U 리뷰 1회차의 🔴1, 🟡3·4, ⚪1–6과 D1·D2, 그리기 중 중계 배선(D3)을 고쳤고 새 경우마다 red를 먼저 봤다(U 보고: typecheck, lint, build 통과, 전체 test는 `shell.test.ts` 한 건 말고 통과).
- M4 완료(`e5dbf61e..53cfb9de`) → `4acad13e..c2797e81`로 통합. 승격 알림의 출처는 main이 직접 받는 `conversation.bound` 이벤트이고, id만 `readPromoted`·`onPromoted`로 간다. reveal의 settings에서 provider를 생략할 수 있다. `App.tsx` 한 줄은 conductor가 허락했다. 통합 HEAD `c2797e81`에서 typecheck 통과.
- `shell.test.ts` "setting up the same folder again…"는 이 feature 전 커밋 `10d6ed84`에서도 두 번 다 실패했다(14.6초에 실패 한 번, 20초 시간 초과 한 번). 실제 Go CLI와 git을 부르는 기존 테스트의 문제이고 이 feature의 회귀가 아니다. PR 본문에 적는다.
- U3(`ctx_594e04e4cad1`): 승격 알림과 provider 없는 Settings의 renderer 쪽, 이어서 task 8(`/design-sync`)과 task 9(`/runtime-test`). lead에 `GUI again`을 알렸다. 실제 턴은 공유 로그인 프로필을 제자리에서 쓰고 상태 파일을 백업·복원한다.
- 리뷰: U 2회차(Claude Opus, `ctx_ca925c1496cd`), M 4회차(M3+M4, Codex, `ctx_a314b63e3802`).
- M 리뷰 4회차(M3+M4, Codex): 🟡 1(캡처 중에 A→B→A가 합쳐지면 main이 target이 같다며 target push를 건너뛰어 main 창이 그리기 중 id를 다시 보고하지 않고, 알림이 사라진 채 남는다), ⚪ 1(보고에 세대가 없어 이전 A의 보고를 새 A의 것으로 받는다). 프로젝트 대화 내용이 프로토타입 창에 가는 경로는 없었다. 전체 test는 부하(load average 39–103) 속에서 20건 실패, 단독 재실행 뒤 7건 남음(`cli.test.ts` 1, `shell.test.ts` 2, `doanyRender.test.ts` 4). 원인은 확정하지 못했다. 워커가 쉴 때 base와 비교한다. 🟡1과 ⚪1을 M5로 보냈다(세대 왕복 때문에 `App.tsx`의 중계 effect도 M이 고친다, conductor 판단).
