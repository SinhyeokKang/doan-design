# frame-prototype 오케스트레이션

- 원본: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md)
- 체인: [chain-261113-1](../chain-261113-1/chain.md) 링크 2
- 시작 해시: `524ceac8` (origin/develop, 링크 1 병합 `956400be` 포함)
- 통합 브랜치: `feat/frame-prototype`
- conductor: Claude Code. 워커도 Claude만 쓴다(`/agent-eval`의 다른 계열 판정만 AGENTS.md 상시 예외).

## 결정 기록

- 시작 점검 승인(체인 파일 인계 기록): 격리 실제 앱 probe 창이 사용자 작업 중에 떠도 된다. 마지막 통합 전 실제 Claude Code·Codex `/agent-eval`을 돈다. `document` 프리셋이 커져야 하면 다른 문장을 뜻을 유지한 채 줄여 21,600바이트 상한 안에 두고, 줄인 내용을 PR 본문에 적는다. 지원 속성·실행 계약·공유 schema·`v`는 PoC가 정한다.
- conductor 판단 — `canvas-activity-notices`는 이미 develop에 있다(PRODUCT의 canvas notice·`canvasSeen.ts`). 따라서 spec 9는 "프로토타입 응답을 메인 캔버스의 읽음 근거로 쓰지 않는다"를 직접 검증하는 쪽으로 적용한다.
- conductor 판단 — PoC 결론(지원 속성·실행 계약·schema·`v`·응답 없음 시간)은 PoC 워커가 design.md 'PoC가 먼저 정할 구현 계약'에 확정 문장으로 쓴다. 지원 조건이 사용자 요구를 줄이면 사용자에게 묻는다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| P | tasks 1 PoC | `.scratch/poc-*`(커밋 안 함), design.md 'PoC가 먼저 정할 구현 계약' | 없음 | Opus high — 격리·내비게이션 경계와 형식 계약을 정하는 판단이 크다 | 격리 dev 앱 probe 증거, 결론별 통과/실패 기록 | 진행 |
| C | tasks 3 계약 | `schema/`, `cli/internal/{canvas,check,cli,designskill}`, `app/src/formats/`, 새 순수 모듈과 IPC 타입 | P | Opus high — 두 언어가 공유하는 계약과 실행 조건 | `go test ./...`, `npm --prefix app test`, 프리셋 크기 테스트 | PoC 뒤 확정 |
| M | tasks 4 main | `app/src/main/`(창·제공/주입·내비게이션·IPC·읽음 분리), `app/src/preload/`, electron-vite 설정 | C | Opus high — sandbox·sender guard·수명 경합 | `npm --prefix app test`, 격리 앱 검증표 | PoC 뒤 확정 |
| R | tasks 4 UI + `/design-sync` | `app/src/renderer/`(도구 바·버블·서랍 메타·프로토타입 창 UI), `styles.css`, DESIGN.md | C (실제 앱 확인은 M) | Opus high — 포커스·상태 오버레이·초안 일치 | `npm --prefix app test`, `/design-sync` | PoC 뒤 확정 |
| V | `/code-review` | 보고만 | M·R | Opus high — 보안 경계 리뷰 | 🔴 0 | 대기 |
| E | tasks 5 `/agent-eval` | `docs/USABILITY-EVAL.md` | 마지막 통합 직전 | Sonnet medium — 정해진 절차 실행 | 스킬 기준 | 대기 |
| D | tasks 6 승격·삭제 | PRODUCT·ARCHITECTURE·DESIGN, 이 디렉터리 | 전부 | conductor | 대조 | 대기 |

## 겹침과 순서

P → C → (M ∥ R) → V → E → D. M과 R은 C가 IPC·preload 타입을 고정한 뒤 병렬로 돈다. preload와 빌드 설정은 M이 소유하고 R은 C의 타입만 쓴다. tasks 5의 `/runtime-test`는 M·R 통합 뒤 한 워커가 맡고, GUI probe는 겹치지 않게 순서를 정한다.
