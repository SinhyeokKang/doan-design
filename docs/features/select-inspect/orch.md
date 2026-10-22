# select-inspect — orch

정본: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md). 이 문서는 배치 배정과 진행만 적는다.

- 시작 해시: `f718e54`(main)
- 통합 브랜치: `feat-select-inspect`
- 지휘: Claude Code(Opus 5.5)
- 워커 위치: 배치마다 Orca `new-child` 워크트리(통합 브랜치에서 갈라짐). 브리프는 `.scratch/briefs/<배치>.md`(지휘 체크아웃, 절대 경로로 넘김), 인계는 각 워크트리의 `.scratch/handoff-<배치>.md`.

## 결정 로그

| 날짜 | 결정 | 근거 |
|---|---|---|
| 2026-10-22 | task 0의 `.scratch` 명령(`npm install` · Electron 실행 · `go run` · `go build`)을 모두 허용한다 | 사용자(`/orchestrate … task 0 모두 허용`) |
| 2026-10-22 | task 1 초안의 피드백과 확정은 지휘자가 한다. tasks.md task 1과 `/design-draft` 4단계의 "사용자 확정"을 대신한다 | 사용자(`/orchestrate … 지휘자가 피드백 및 결정까지 진행해`) |
| 2026-10-22 | task 0은 지휘자가 아니라 Claude 워커 둘이 나눠 한다(P2: PoC 2, P6: PoC 6 소켓 절반 + 입력 확인). PRODUCT §6 기록은 지휘자가 인계를 보고 쓴다 | 지휘자 판단 — tasks.md '진행'은 지휘자 직접이었지만, PoC 코드는 `.scratch`라 배치 코드 금지와 무관하고, 세 확인을 병렬로 돌려 지휘 맥락을 아낀다 |
| 2026-10-22 | task 1(초안)은 task 0과 병렬로 돌린다. PoC 결과가 보이는 동작(⌥ 안내, 알 수 없음 상태)을 바꾸면 초안 수정으로 넘긴다 | 지휘자 판단 — 초안은 PoC 결과 대부분과 무관하고, 직렬이면 한 파가 늘어난다 |
| 2026-10-22 | 초안 워커는 Codex `gpt-6-astra` medium이다. 그 밖의 구현 · 리뷰 워커는 Claude다 | PRODUCT §7(2026-10-22, #6 모델 경계 허용), tasks.md '진행' |
| 2026-10-22 | `Selection` 등 공유 TS 타입은 S(`app/src/formats/`)가, preload `setSelection`은 R이, IPC `selection:set` 처리는 M이 맡는다 | 지휘자 판단 — M과 R이 같은 파일을 건드리지 않고 병렬로 돌게 하려는 것 |
| 2026-10-22 | task 9(실제 에이전트 확인)는 지휘자가 하고, Codex 호출 때마다 사용자에게 허락을 받는다 | tasks.md task 9, AGENTS.md 'Commands' |

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델 · effort (이유) | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| P2 | task 0 PoC 2 | `.scratch/poc2-inspect/` | — | Claude Opus high (인스펙터 방식이 여기서 정해지고, 틀리면 task 6을 다시 짠다) | 사례마다 결과 · 버전 · 날짜가 인계에 있음, 스크립트 방식 대 CDP 비교 | 대기 |
| P6 | task 0 PoC 6 소켓 절반 + 입력 확인 | `.scratch/poc6-socket/` · `.scratch/poc-input/` | — | Claude Opus medium (관찰이 주이고 판단은 적지만, 실제 창 · 실제 키 입력에서 오판하면 Q1을 다시 묻게 된다) | 기준 항목마다 결과가 인계에 있음 | 대기 |
| D | task 1 초안 | `design/select-inspect.html`(필요하면 `design/` 아래 새 공유 파일) | — | Codex gpt-6-astra medium (상태 · 문구 · 배치 판단이 많고, 틀리면 구현과 `/design-sync`가 모두 어긋난다) | tasks.md task 1 검증(`doan check` 오류 0, 프레임 id 8개), 지휘자 확정 | 대기 |
| S | task 2 · task 3의 공유 타입 | `schema/` · `app/src/formats/` · `cli/internal/formats/` | P6(런타임 · 소켓 형식이 PoC로 바뀔 수 있음) | Claude Sonnet high (스키마 · 로더는 기계적이지만 교차 파일 `$ref`가 두 언어에서 같아야 한다) | `go test ./...` · `go vet ./...` · `npm --prefix app test` · `typecheck` | 대기 |
| G | task 3(Go) · task 4 | `cli/` | S | Claude Opus medium (오류 매핑과 시간 초과가 계약이다) | task 4 검증 | 대기 |
| M | task 3(main) · task 5 | `app/src/main/`(`canvasScript.ts` 제외) | S | Claude Opus high (소켓 보안, 파일 권한, 수명주기) | task 5 검증 | 대기 |
| R | task 3(스크립트 · 렌더러) · task 6 · task 7 · preload `setSelection` | `app/src/main/canvasScript.ts`와 테스트, `app/src/renderer/`, `app/src/preload/` | S · P2 · D(task 7만; 나머지를 먼저 하고 미룸) | Claude Opus high (메시지 순서 · 오래된 메시지, 입력 가로채기, React 경계) | task 6 · 7 검증 | 대기 |
| E | task 8 | `app/e2e/` | G · M · R | Claude Opus high (변형 증명, 실제 창 타이밍) | `npm --prefix app run e2e` 통과, 변형 표 | 대기 |
| 9 | task 9 | `docs/PRODUCT.md` §6 | E | 지휘자 | task 9 검증 | 대기 |
| Y | task 10 `/design-sync` | `app/src/renderer/` · `docs/DESIGN.md` · `.scratch/design-sync/` | E · D 확정 | Claude Opus high (측정 · 수정 반복) | task 10 검증 | 대기 |
| 문서 | task 11 | `docs/` · `AGENTS.md` · `.agents/skills/runtime-test/` · `docs/features/select-inspect/` | Y · 9 | 지휘자 | task 11 검증 | 대기 |
| 리뷰 | 배치마다 diff | 보고만 | 각 배치 | Claude — S · G: Sonnet high, M · R · E · Y: Opus high, D: Opus medium | 🔴 0 | — |

tasks.md의 task 0–11은 모두 위 한 행 이상에 속하고, 주인 없는 항목은 없다. task 3은 언어와 위치에 따라 S · G · M · R로 나뉜다.

## 순서와 겹침

- 1파: P2 ∥ P6 ∥ D. 파일이 겹치지 않는다.
- 2파: P6 결과를 반영한 뒤 S.
- 3파: S 통합 뒤 G ∥ M ∥ R. 파일이 겹치지 않는다(`canvasScript.ts`는 R, 나머지 `app/src/main/`은 M, preload는 R). R의 task 7은 D 확정 뒤에 한다.
- 4파: G · M · R 통합 뒤 E. 5파: E 뒤 task 9(지휘자)와 Y. 그 뒤 문서.

## 진행 기록
