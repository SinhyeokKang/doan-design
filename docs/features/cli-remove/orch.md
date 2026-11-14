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

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| B1 | tasks 1–5 | `cli/`, `schema/`, `app/src/`, README, `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/BACKLOG.md`, `docs/features/cli-remove/` 삭제(orch.md 제외) | 없음 | Opus high. CLI·형식·main·renderer에 걸치고 main의 판단 순서, 기한, 멱등 정리를 틀리면 목록이 조용히 어긋난다 | tasks 1–5의 각 검증, `node .agents/skills/verify/scripts/verify.mjs` PASS, probe 완료 줄 | 대기 |
| R1 | B1 diff 독립 리뷰(task 4의 conductor 측) | 없음(보고만) | B1 | Opus high. 계약과 상태 정리의 경합을 판단해야 한다 | `/code-review` 보고서, 🔴 0 | 대기 |
| 통합 | cherry-pick, task 6 `/verify`, push, PR | orch.md | R1 🔴 0 | conductor | verify PASS | 대기 |

- tasks.md의 체크 항목: 1·2·3·4·5 → B1(4의 독립 리뷰는 R1), 6 → 통합. 주인 없는 항목은 없다.
- 파일 겹침: 배치가 하나라 병렬 충돌이 없다. orch.md는 conductor만 쓰고, B1은 마지막에 `docs/features/cli-remove/`를 지울 때 orch.md를 남긴다. conductor가 PR 직전에 orch.md를 지운다.

## 리뷰·검증 기록

(진행하며 적는다)
