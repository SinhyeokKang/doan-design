# 보드 클릭·모션 안내 — orch

- 원본: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md)
- chain: [chain-261128-1](../chain-261128-1/chain.md) 링크 2(병렬 그룹)
- 시작 hash: 7ffe758fa (origin/develop, canvas-message PR #430 머지 뒤)
- 통합 브랜치: `feat/board-motion-guide` (lead가 만들었다)

## 시작 실측

- guide 출력(번들 줄 166 B 포함): plain 21,807 B, `--json` 21,996 B. 예산 22,000 B라 `--json` 여유가 4 B다(design의 실측과 같다).
- Codex 주간 사용량: 16% 사용(rollout `rate_limits` window 10080, 2026-11-28).

## 결정 기록

- 사용자에게 새로 물을 결정은 없다. spec '확정한 결정'이 범위를 정했다.
- guide 규칙의 자리: 컨덕터 판단 — design이 "구현에서 예산을 보고 정한다"고 했으므로 B 워커가 정하고 리뷰에서 본다.
- W13 회귀: 컨덕터 판단 — W13의 `canvas_animated` 검사는 `data-doan-prototype` 표시와 무관하게 `@keyframes`·`animation`만 보므로, 새 규칙(한 번 도는 모션은 프로토타입)과 충돌하지 않는다. judge가 프로토타입으로 옮긴 hero를 감점하면 E가 보고하고 컨덕터가 rubric을 다시 본다.
- Codex 모델: `models_cache.json`의 최신인 `gpt-6.2-astra`(판단), `gpt-6.2-sol`(기계적)을 쓴다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| A | T1, T1a | `eval/scenarios/W15/**`, W15를 등록하는 데 필요한 `eval/` 파일, `docs/usability-eval/rounds-2026-11.md`(baseline 회차) | 없음 | Claude Opus high — 프로토타입 표시 없는 영역을 정적으로 가리는 check가 판단을 많이 요하고, 실제 에이전트 baseline 회차를 돌린다 | `node --test 'eval/**/*.test.ts'`, `node eval/run.ts --self-test --scenarios W15`, baseline 회차 기록 | 진행 |
| B | T2 | `cli/internal/cli/skill.md`, `skill_test.go`, `cli/internal/designskill/presets/animate.md`, `delight.md`, `designskill_test.go` | 없음(C 결과에 따라 `:hover` 문장 조정) | Claude Opus high — 4 B 여유에서 문장을 줄이며 조건·예외를 지켜야 한다(postmortem 2026-10-29) | `go test ./...`, `go vet ./...`, `rg -n -i 'replay control\|visible trigger' cli/internal/designskill/presets` 비어 있음 | 통합 ea408c619..9a5563c2e, worktree 정리 |
| C | T1b | `.scratch/`만 | 없음 | Claude Sonnet medium — 짧은 실기 probe, 판단 적음 | Select·Hand의 `:hover` computed style 관측값이 `.scratch/`에 있다 | 완료, worktree 정리 |
| RA | A 리뷰 | 없음(보고만) | A | Codex gpt-6.2-astra medium — 다른 계열의 독립 판단 | `/code-review` 보고 | W15 완료(🔴3 🟡5 ⚪1), W16 대기 |
| RB | B 리뷰 | 없음(보고만) | B | Codex gpt-6.2-astra medium — 다른 계열의 독립 판단 | `/code-review` 보고 | 완료(🔴0 🟡5 ⚪1) |
| E | T3 | `docs/usability-eval/rounds-2026-11.md`(회차) | A·B 통합 | Claude Opus medium — eval 회차 실행과 판정 기록 | W15 양쪽 통과, 회귀 없음, 회차 기록 | 대기 |
| 컨덕터 | T4, 통합 `/verify --eval` | `docs/ARCHITECTURE.md`, `docs/USABILITY-EVAL.md`, 기능 디렉터리 삭제 | E | — | ARCHITECTURE §1에 규칙, 기능 디렉터리 없음 | 대기 |

## 겹침과 순서

- A·B·C는 파일이 겹치지 않아 병렬이다. A의 baseline은 B가 들어가기 전의 guide로 돌아야 하므로, A worktree에는 B를 넣지 않는다.
- E는 A·B를 통합한 `feat/board-motion-guide`에서 새 child worktree로 돈다. `rounds-2026-11.md`는 A가 먼저 쓰고 E가 이어 쓴다(직렬).
- 실기 GUI probe(C)는 링크 2의 다른 컨덕터들과 Orca mail로 시간을 맞춘다.

## Codex 사용 범위

- RA, RB(리뷰, gpt-6.2-astra medium). 실제로 쓴 범위는 끝날 때 갱신한다.

## 진행 기록
- Run `run_637f9610c7ca`. A `ctx_59d645b798ef`(bmg-A, Opus high), B `ctx_f94aee5df671`(bmg-B, Opus high), C `ctx_043b4ad33a1a`(bmg-C, Sonnet medium)를 시작했다.
- `/agent-eval` 범위(사용자 지시, lead 전달): "이번 board motion guide도 전체 eval 말고 필요한 부분만", 이어서 "대신 시나리오 범위를 넉넉하게 잡으라고 전달". 전체 회차는 돌리지 않는다. tasks의 범위(W15 baseline, 그 뒤 W15·W13·D5·W7·W8·W11·W12)를 모두 지키고, 바뀐 guide 문장이나 animate·delight preset을 읽을 수 있는 시나리오, 모션이나 프로토타입을 그리는 시나리오를 E가 찾아 더한다. 애매한 시나리오는 빼지 않는다. 고른 범위와 이유를 회차 기록과 PR 본문에 적는다.
- C 완료(T1b): 격리된 실제 앱에서 Playwright 포인터 이동으로 확인했다. Select에서는 `:hover`가 동작한다(`rgb(200,200,200)` → `rgb(255,0,0)`, 포인터 아래 대상은 캔버스 iframe). Hand에서는 동작하지 않는다(대상이 `drag-layer`). 반복 `@keyframes`는 두 도구에서 모두 돈다. 컨덕터가 `select-during.png`를 열어 빨간 상태를 확인했다. 따라서 "Select 도구에서 `:hover`" 안내를 그대로 쓴다. 덤 관측: Select에서 포인터가 캔버스 밖으로 나가도 hover가 풀리지 않았다(Playwright 이동의 한계일 수 있어 확인하지 않았다). 증거는 컨덕터 checkout의 `.scratch/runtime-test/board-hover/`, `.scratch/handoff-C.md`. worker를 release했고 worktree `bmg-C`를 지웠다(브랜치 `SinhyeokKang/bmg-C`는 28b65ac7b에 남아 있다).
- B 완료(T2): 커밋 4439aea81·4d1de550f·169b2a258·f622c0d53(bmg-B). 보드 규칙을 rule F에 합쳤고, 10개 문장을 줄여 `--json` 21,985 B(여유 15 B), plain 21,796 B다. 줄인 문장은 `TestSkillGuideShortenedLinesKeepConditions`가 고정한다. 열기 제안은 guide 표기에 맞춰 `doan open <canvas path> --frame <id> --prototype`로 썼다(컨덕터 판단으로 받아들임 — guide와 같은 표기). RB(Codex gpt-6.2-astra medium, `ctx_f894c72494a4`)가 bmg-B에서 리뷰한다.
- RB 완료: 🔴 0, 🟡 5, ⚪ 1(`.scratch/review-RB.md`). 🟡 5건을 B에 fix round 1로 보냈다(follow-up `ctx_8db613bde097`). ⚪(캐시·창 상태 위치 삭제)는 에이전트가 할 일이 없는 사실이라 받아들인다(컨덕터 판단).
- A 완료(T1·T1a): 커밋 8b9990710·295b228c7·9d1f73a01. W15 baseline `board-motion-baseline-261128`에서 Claude Code와 Codex 모두 대상 프레임에 `data-doan-prototype`을 붙이고 클릭을 그 안에 만들었다. 자동 검사는 모두 통과했고 judge가 둘 다 partial로 판정했다(답변에 Play할 프레임과 `--prototype` 열기 제안이 없다). 계획이 예상한 보드 클릭 트리거는 나오지 않았다.
- 사용자 결정: "W16 추가". W15(클릭 요청 → 프로토타입과 Play 안내)는 그대로 두고, 클릭을 말하지 않는 모션 요청 W16을 더해 baseline을 다시 돌린다. 사용자가 보고한 재생 버튼은 모션 요청에서 animate preset의 'replay control' 문장 때문에 생긴 것으로 보기 때문이다. A에 follow-up으로 보냈다. 최종 회차(E)는 W15·W16에 회귀 세트를 더해 돈다.
- RA(Codex gpt-6.2-astra medium, `ctx_4230f6c67f14`)가 bmg-A에서 W15를 리뷰한다. W16은 A가 끝나면 RA follow-up으로 리뷰한다.
- B fix round 1 완료: RB 🟡 5건을 232792f91·92e636d7b·8d0c97f6c·c29d2ac4b로 고쳤다. 새로 줄인 문장 2개(옛 디렉터리 줄, 규약 12 첫머리)도 테스트로 고정했다. guide `--json` 21,996 B(여유 4 B), plain 21,807 B. 컨덕터가 diff를 읽어 확인했다. B 커밋 8개를 통합했다(ea408c619..9a5563c2e). 통합 HEAD에서 `go test ./cli/...`와 `go vet ./...`가 통과한다. worker를 release했고 worktree `bmg-B`를 지웠다(브랜치는 c29d2ac4b에 남아 있다).
- RA 완료(W15): 🔴 3, 🟡 5, ⚪ 1(`.scratch/review-RA.md`). 🔴는 스크립트 귀속이 이벤트 대상이 아니라 스크립트 전체를 본다는 것, CSS 선택자의 이름만 보고 귀속한다는 것, 보조 평면 문자(이모지)에서 프레임 위치가 어긋난다는 것이다. RA가 남긴 사용자 결정(T1a 완료 조건)은 사용자의 "W16 추가" 결정으로 답이 났다. A가 W16 baseline을 마치면 수정 task로 보낸다.
- W16 check 범위(A의 질문, 컨덕터 판단): `motion_shown`은 seed 밖의 모션이 어디든 있으면 통과한다. 보드에 한 번 도는 모션은 자동 검사를 통과하고 judge가 partial로 판정한다. 정지 상태만 그리면 check에서 실패한다. 보드 클릭 트리거는 공통 detector로 실패한다. brief대로 check를 엄격히 하면 rubric의 partial 줄이 쓰일 일이 없기 때문이다.
- A W16 완료: 커밋 998064756·be23c89d5·6b1b52161·dfde783f0. W16 baseline `board-motion-baseline-w16-261128`에서 Claude Code는 fail이었다(표시 없는 대상 프레임에 클릭 토글, `no_board_click_trigger`). 사용자가 보고한 문제가 재현됐다. Codex는 partial이었다(프레임에 표시는 했으나 Play할 프레임과 `--prototype` 열기 제안이 없다). W15·W16은 `boardChecks`를 함께 쓴다. RA 수정(🔴 3, 🟡 5)과 저장된 baseline 결과의 재검사를 A에 fix round 1로 보냈다(`ctx_9b54558b4f25`).
- A fix round 1 완료: 24120258d·d8aed14eb·4a2d63ac9·b4a3c6082. 새 `eval/scenarios/W15/board.ts`가 스크립트를 수신 대상 기준으로, CSS 상태를 실제 요소 기준으로 귀속한다. 프레임은 원문끼리 비교하고, template를 건너뛰며, `@import` 체인을 따라간다. W15 baseline 기록 정정은 agent-eval 절차대로 USABILITY-EVAL 'Documentation corrections'에 적었다(A의 파일 범위 밖이지만 절차가 정한 자리라 받아들임). 저장된 baseline 캔버스 4개를 다시 검사한 결과가 기록과 같다.
- RA2(같은 Codex 리뷰어의 재검토, `ctx_08e844876f3f`) 완료: 🔴 3, 🟡 4, ⚪ 1(`.scratch/review-RA2.md`). 컨덕터 판단: 정적 detector는 완전할 수 없으므로 fix round 2를 마지막 detector 수정으로 한다. 실제 에이전트가 쓸 법한 경우(인라인 transition, target으로 거른 위임 클릭, `:is()`·CSS 중첩, 주석 속 코드, 아무 요소에도 맞지 않는 상태 규칙)만 고치고, 확신할 수 없으면 자동으로 실패시키지 않고 judge에 넘긴다. 드문 경우(블록 사이의 같은 변수 이름, 값을 읽기만 하는 코드, `animation:none`)는 rubric에 한계로 적는다. A에 보냈다(`ctx_c4e5cdfe906f`).
- RA2 전체 eval 테스트에서 R8d가 두 번 실패했다(`spawnSync /usr/bin/env ETIMEDOUT`, 이번 diff 밖). 부하 탓인지 통합 `/verify --eval`에서 확인한다.
