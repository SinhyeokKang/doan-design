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
| M | task 3의 main 테스트(`conversationScope`, `requests`, `fit`, `windowState`, `notifications`, `senderAllowed`, preload 채널 고정), task 4의 main 순수 함수(1·2·3·6·7·8·10), task 6 전체 | `app/src/main/**`, `app/src/preload/**` | `prototypeWindow.ts`의 `setContentBounds`·`setMinimumSize` 순서는 P 통합 뒤(미룬 항목) | Claude Opus high — 프로토타입 창 role의 범위 검사가 깨지면 재생 캔버스 밖 대화·설정에 닿는다 | `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint` | 대기 |
| R | task 3의 renderer 테스트(`renderer/prototype/conversation.test.ts`, `ConversationThread.test.tsx`의 `stale`), task 4의 renderer 순수 함수(4·5·9·11)와 `answerReached`, task 5 주입 리팩터 | `app/src/renderer/**` 중 `App.tsx`, `renderer/prototype/PrototypeWindow.tsx`·`WindowShell`·`main.tsx`, `styles.css` 밖 | 없음 | Claude Opus high — 여러 컴포넌트의 주입 리팩터가 main 창 동작을 바꾸지 않아야 한다 | `npm --prefix app test`(기존 `CanvasConversationPanel*`·`ProjectOverview*`·`conversationStore*`·`DockedComposer*` green), `npm --prefix app run typecheck`, `npm --prefix app run lint` | 대기 |
| U | task 3·4의 `revealDecision`, task 7 전체, 이어서 task 8(`/design-sync`)·task 9(`/runtime-test`) | `app/src/renderer/**`(M·R 통합 뒤), `docs/DESIGN.md`(task 8). main·preload 결함은 M으로 돌려보낸다 | M·R 통합(P 결과 포함) | Claude Opus high — 포커스·Tab 순서·IME·패널 폭 함정이 POSTMORTEM에 여럿 있다 | task 7: `npm --prefix app test`, `typecheck`, `lint`, `build`. task 8·9는 tasks.md의 명령 | 대기 |
| 리뷰 | 배치별 독립 `/code-review`, 마지막에 통합 diff 전체 한 번 | 보고만 | 각 배치 완료 | M·R: Codex gpt-6-astra medium(다른 계열의 독립 판독), U: Claude Opus high, 통합 전체: Codex gpt-6-astra medium | 보고서 | 대기 |

task 2(`/design-draft`)는 이미 끝났다. task 10은 리뷰 행과 conductor의 최종 `/verify`, task 11은 conductor가 한다. 모든 체크 항목이 한 행에 속한다.

## 겹침과 순서

- P, M, R은 파일이 겹치지 않아 병렬로 돈다. P만 GUI 창을 띄운다. 그 전후에 lead에 `GUI again` / `GUI done`을 알린다.
- U는 M·R 통합 뒤 시작한다. task 8·9의 GUI도 lead에 알린다. task 9의 실제 턴은 공유 로그인 프로필을 제자리에서 쓴다.
- 마지막: 통합 전체 리뷰, `/verify`, 문서 승격, 기능 디렉터리 삭제, PR.

## 진행 기록
