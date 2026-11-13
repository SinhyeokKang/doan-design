# frame-prototype 오케스트레이션

- 원본: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md)
- 체인: [chain-261113-1](../chain-261113-1/chain.md) 링크 2
- 시작 해시: `524ceac8` (origin/develop, 링크 1 병합 `956400be` 포함)
- 통합 브랜치: `feat/frame-prototype`
- conductor: Claude Code. 워커도 Claude만 쓴다(`/agent-eval`의 다른 계열 판정만 AGENTS.md 상시 예외).

## 결정 기록

- 시작 점검 승인(체인 파일 인계 기록): 격리 실제 앱 probe 창이 사용자 작업 중에 떠도 된다. 마지막 통합 전 실제 Claude Code·Codex `/agent-eval`을 돈다. `document` 프리셋이 커져야 하면 다른 문장을 뜻을 유지한 채 줄여 21,600바이트 상한 안에 두고, 줄인 내용을 PR 본문에 적는다. 지원 속성·실행 계약·공유 schema·`v`는 PoC가 정한다.
- conductor 판단 — `canvas-activity-notices`는 이미 develop에 있다(PRODUCT의 canvas notice·`canvasSeen.ts`). 따라서 spec 9는 "프로토타입 응답을 메인 캔버스의 읽음 근거로 쓰지 않는다"를 직접 검증하는 쪽으로 적용한다.
- conductor 판단 — PoC가 정한 지원 조건은 spec 요구를 줄이지 않는다. 파싱 중 프레임 밖에 만든 요소가 숨는 것은 spec 6의 '프레임 내부' 모달 밖의 경우이고, 가이드가 필요한 요소를 프레임 안에 두라고 쓴다. 사용자에게 묻지 않았다. PR 본문에 적는다.
- conductor 판단 — PoC 결론(지원 속성·실행 계약·schema·`v`·응답 없음 시간)은 PoC 워커가 design.md 'PoC가 먼저 정할 구현 계약'에 확정 문장으로 쓴다. 지원 조건이 사용자 요구를 줄이면 사용자에게 묻는다.
- conductor 판단(C 질문) — (1) 메인 창 재생 요청은 선택한 프레임의 `layout` 표시 원문을 크기 힌트로만 보낸다. main이 공용 파서로 읽고 URL은 main이 만든다. 로드 전에 창을 맞추고, 준비 결과의 표시 크기가 다르면 한 번 다시 맞춘다. 드로어 재생은 실행이 보고한 프레임 목록의 크기를, 기록 항목은 저장한 크기를 쓴다. (2) 최소 창 폭에서의 콘텐츠 패널 폭(360에서 패널 여백을 뺀 값)보다 좁은 프레임은 창을 넓혀도 자기 폭으로 가운데 놓는다. (3) live `layout`에서 ID가 비었거나 중복된 프레임의 비활성 이유는 `Select a supported frame to play its prototype.`이다. (4) Back/Forward는 캔버스 행이 없거나 ID가 충돌하거나 루트가 등록 해제된 항목, 그리고 이 창의 그 캔버스 마지막 실행 보고에 없는 프레임을 건너뛴다. 보고가 없으면 재생하고 실행이 판정한다. 근거: spec 5·13·19의 의도 안에서 정하는 구현 세부다.
- G 워커 판단(수용) — 프레임 아닌 요소의 무효 값은 `prototype_not_frame`만 낸다. 프레임의 빈 값은 `invalid_prototype_size`다. 같은 원문의 프레임 아닌 표시가 여럿이면 한 번만 보고한다.
- conductor 판단(M·R 조정) — 메인 창 preload에 `playPrototype`·`onPrototypeClosed`(`prototype:closed`)를 둔다. 프로토타입 창 preload는 `window.doanPrototype`이고 `onSnapshot`(`prototype:snapshot`)을 더한다. 실패·소실로 넘어갈 때 main이 iframe 영역을 `capturePage`로 떠 보내고, 렌더러가 `blob:` 이미지로 바꿔 iframe을 없앤다. electron-vite 설정과 `prototype.html`은 M이, `app/src/renderer/prototype/`는 R이 소유한다. C의 그 밖의 계약 내 선택(경로 기반 요청, 원본 변경 신호, 로딩 중 이탈 시 kill, 창 위치)은 그대로 받는다.
- M 워커 판단(수용) — `fit`의 디스플레이는 생성 때 메인 창의 것, 그 뒤는 프로토타입 창 자신의 것이다. 준비 결과의 크기 재맞춤은 사람이 그사이 창 크기를 바꿨어도 한다. 남은 일: 프로토타입 창 렌더러가 죽으면 빈 창으로 남고, View 메뉴(⌘R·확대)는 프로토타입 창에 포커스가 있어도 메인 창으로 간다. 리뷰에서 다룬다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| P | tasks 1 PoC | `.scratch/poc-*`(커밋 안 함), design.md 'PoC가 먼저 정할 구현 계약' | 없음 | Opus high — 격리·내비게이션 경계와 형식 계약을 정하는 판단이 크다 | 격리 dev 앱 probe 증거, 결론별 통과/실패 기록 | 통합 `a0d25c5f` |
| G | tasks 3 Go·fixture·가이드 | `schema/fixtures/prototype-mark/`, `cli/internal/{canvas,check}`, `cli/internal/cli/skill.md` | P | Sonnet high — 계약이 정해진 파서·검사 두 개와 가이드 한 항목 | `go test ./...`, `go vet ./...`, `node eval/run.ts --self-test` | 통합 `a9328883` |
| C | tasks 3 TS 계약 | 새 순수 모듈(표시 파서·실행 가능 여부·창 상태·기록·요청 검증·창 맞춤·내비게이션 gate), `prototype:*` IPC·preload 타입, `senderAllowed.ts` | P (fixture 테스트는 G 뒤 지연 항목) | Opus high — 수명 경합과 sender 경계 | `npm --prefix app test`, typecheck, lint | 통합 `a3224db1`·`05f05528`·fixture 테스트 `d63fde38` |
| M | tasks 4 main | `app/src/main/`(창·제공/주입·내비게이션·IPC·읽음 분리), `app/src/preload/`, electron-vite 설정 | C | Opus high — sandbox·sender guard·수명 경합 | `npm --prefix app test`, typecheck, lint (격리 앱 검증표는 M·R 통합 뒤 Task) | 통합 `218e66ee`·`74f705e1`, 실제 앱 미검증 |
| R | tasks 4 UI + `/design-sync` | `app/src/renderer/`(도구 바·버블·서랍 메타·프로토타입 창 UI), `styles.css`, DESIGN.md | C (실제 앱 확인은 M) | Opus high — 포커스·상태 오버레이·초안 일치 | `npm --prefix app test`, typecheck, lint (`/design-sync`는 M 통합 뒤 Task) | 진행 |
| V | `/code-review` | 보고만 | M·R | Opus high — 보안 경계 리뷰 | 🔴 0 | 대기 |
| E | tasks 5 `/agent-eval` | `docs/USABILITY-EVAL.md` | 마지막 통합 직전 | Sonnet medium — 정해진 절차 실행 | 스킬 기준 | 대기 |
| D | tasks 6 승격·삭제 | PRODUCT·ARCHITECTURE·DESIGN, 이 디렉터리 | 전부 | conductor | 대조 | 대기 |

## 겹침과 순서

P → (G ∥ C) → (M ∥ R) → V → E → D. G는 Go·fixture만, C는 `app/src`만 써서 겹치지 않는다. C의 fixture 기반 TS 테스트는 G 통합 뒤 새 Task로 보낸다. M과 R은 C가 IPC·preload 타입을 고정한 뒤 병렬로 돈다. preload와 빌드 설정은 M이 소유하고 R은 C의 타입만 쓴다. tasks 5의 `/runtime-test`는 M·R 통합 뒤 한 워커가 맡고, GUI probe는 겹치지 않게 순서를 정한다.
