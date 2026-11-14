# cli-remove — orch

- 계획 원본: [tasks.md](./tasks.md), [spec.md](./spec.md), [design.md](./design.md). `/feature`와 `/feature-review`를 거쳤고, 새 화면이 없어 초안이 없다.
- 시작 해시: `f01ae5f16` (origin/develop과 같다).
- 통합 브랜치: `feat/cli-remove`. lead가 만들었고 conductor는 브랜치를 바꾸지 않는다.
- 워커 모델: Claude만 쓴다(모델 계열을 넘지 않는다).

## 결정 기록

| # | 내용 | 근거 |
|---|---|---|
| 1 | 구현을 배치 하나(B1)로 둔다 | conductor 판단. 변경 전체가 v7 소켓 계약 하나이고, 요청·답 모양을 Go와 TS가 같은 fixture로 고정한다. Go/TS로 나누면 한쪽이 다른 쪽 스키마를 기다리고, runtime probe에는 둘 다 필요하다 |
| 2 | B1이 tasks 1–5를 `/ship bypass`로 하고 push 직전에 멈춘다. 문서 승격(5)도 B1이 한다 | conductor 판단. ARCHITECTURE 새 절(분기 순서, 기한, 답)은 구현한 쪽이 가장 정확히 쓴다. conductor는 리뷰와 통합 때 확인한다 |
| 3 | `/agent-eval`은 하지 않는다 | lead 지시와 spec 결정 4. guide와 스킬 스텁이 바뀌지 않는다. PR 본문에 이유를 적는다 |
| 4 | 미리 물을 사용자 결정은 없다 | spec·design이 판단할 점을 모두 정했다. 구현 중 생기면 하나씩 묻는다 |
| 5 | `doan remove`에서 `unsupported_version`도 앱의 Remove from Doan을 안내한다(R1 🟡1) | conductor 판단. PRODUCT §5 'Problem states'의 Config error에 버전 미지원이 들고, item 10이 Config error를 앱으로 보낸다 |
| 6 | 준비 중 거부 문장을 "Doan is still loading a project. Try again shortly."로 바꾸고, 모든 루트를 기다리는 동작은 둔다(R1 🟡2) | 사용자 결정. 방금 추가된 워크트리는 읽기 전에는 그룹을 알 수 없어 "this project"가 사실과 다를 수 있다 |
| 7 | 메뉴 Remove from Doan이 숨겨진 자동 등록 루트를 남기는 빈틈은 BACKLOG에 적고 고치지 않는다(R1 ⚪3) | conductor 판단. 이 기능 전부터 있던 메뉴 동작이고 범위 밖이다 |

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| B1 | tasks 1–5 | `cli/`, `schema/`, `app/src/`, README, `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/BACKLOG.md`, `docs/features/cli-remove/` 삭제(orch.md 제외) | 없음 | Opus high. CLI·형식·main·renderer에 걸치고 main의 판단 순서, 기한, 멱등 정리를 틀리면 목록이 조용히 어긋난다 | tasks 1–5의 각 검증, `node .agents/skills/verify/scripts/verify.mjs` PASS, probe 완료 줄 | 완료(`eea202436`, 후속 `57665e9af`, 수정 라운드 1 `2b53ff798`) |
| R1 | B1 diff 독립 리뷰(task 4의 conductor 측) | 없음(보고만) | B1 | Opus high. 계약과 상태 정리의 경합을 판단해야 한다 | `/code-review` 보고서, 🔴 0 | 완료(🔴 0, 🟡 2, ⚪ 6) |
| 통합 | cherry-pick, task 6 `/verify`, push, PR | orch.md | R1 🔴 0 | conductor | verify PASS | 대기 |

- tasks.md의 체크 항목: 1·2·3·4·5 → B1(4의 독립 리뷰는 R1), 6 → 통합. 주인 없는 항목은 없다.
- 파일 겹침: 배치가 하나라 병렬 충돌이 없다. orch.md는 conductor만 쓰고, B1은 마지막에 `docs/features/cli-remove/`를 지울 때 orch.md를 남긴다. conductor가 PR 직전에 orch.md를 지운다.

## 리뷰·검증 기록

- B1(`b502689bf..eea202436`): 커밋 8개. `/verify` PASS(`eea202436`). task 3 probe exit 0, 12개 통과, `conversation_running` 미검증 1개. 계획과 다른 점: busy 판단 순서(첫 실행·대화상자·잠긴 페이지를 로딩보다 먼저), 메뉴 상태의 `projectSettings` 플래그, problem-root `nextSteps`를 `remove.go`에서 처리, `afterRemoved`에서 `cancelRestore` 제외, `runtime.work.test.ts`의 `v: 7`도 `v: 8`로 이동. R1이 판단한다.
- B1 후속(`57665e9af`): `--use-mock-keychain`으로 격리 앱을 띄워 `conversation_running`을 실제 앱에서 확인했다. 턴이 도는 동안 exit 5이고 목록이 그대로였고, 턴이 끝난 뒤 exit 0이었다. 실제 `doan Safe Storage` 항목의 cdat/mdat는 그대로였다. 스위치 효과를 확인하는 대조 실행에서 고유 이름의 probe 항목이 로그인 Keychain에 생겼고 워커가 지웠다. BACKLOG의 미검증 줄을 지웠다.
- R1(`.scratch/review-R1.md`): 🔴 0, 🟡 2(`unsupported_version` 안내, loading 문장의 범위), ⚪ 6. 결정 5–7. 수정 라운드 1을 B1에 보냈다: 🟡1·🟡2, ⚪1(`forgetRemoved` 조건), ⚪2(동등성 테스트 범위), ⚪3(BACKLOG). ⚪4–6은 고치지 않는다.
- 수정 라운드 1(`554a90446..2b53ff798`): fix 1개, PRODUCT·ARCHITECTURE·BACKLOG 각 1개. `/verify` PASS(`2b53ff798`). probe 13개 통과(다른 프로젝트를 읽는 중이면 새 문장으로 exit 5), 대화 probe 6개 통과. 전체 앱 테스트 첫 실행에서 이번 변경과 무관한 `watch.test.ts` 하나가 실패했고, 단독 3회와 전체 재실행에서 통과했다. conductor가 diff를 읽고 받아들였다.
