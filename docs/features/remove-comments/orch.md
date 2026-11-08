# remove-comments — orch

계획 원본: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md). 이 문서는 진행 상태와 conductor의 판단만 적는다.

- 시작 해시: `03eda4bb` (origin/develop)
- 통합 브랜치: `feat/remove-comments` → PR base `develop`. 병합하지 않는다(lead 세션이 리뷰·병합).
- 모델 경계: worker와 리뷰어는 Claude만. T10 `/agent-eval`은 Claude Code·Codex를 함께 돌리는 상시 예외다.

## 결정 로그

D1–D8은 feature 문서에서 사용자가 승인했다. 아래는 실행 중 conductor가 정한 것이다.

- **O1. 규칙 글자 인용의 담당.** T3 검증의 `rg` 범위(`cli app/src eval .agents docs/ARCHITECTURE.md`)는 B2·B3·B4 파일까지 걸친다. B1은 `cli/`와 `app/src/main/conversation/prompt.ts`·`prompt.test.ts`(B2가 건드리지 않는 파일)를 고치고, `eval/scenarios/R8d/`는 B3, `.agents/`와 ARCHITECTURE는 B4가 고친다. 남은 인용은 B4 T9에서 같은 `rg`로 다시 확인한다. — conductor's call: tasks.md 파일 소유와 병렬 순서를 지키기 위해.
- **O2. `app/src/formats/types.ts`.** B1은 fold 삭제로 고아가 된 타입만 지우고, `Comment`·`Target`과 나머지 코멘트 타입은 B2가 `projection.ts`를 정리할 때 지운다. — conductor's call: design '앱' 문장.
- **O3. 감시 방식.** Orca가 `worker_done`·`question`·`escalation`(stopReason 포함)으로 conductor를 깨운다. 별도 polling 스크립트는 돌리지 않는다. — conductor's call: Orca 버전 맞춤 가이드가 polling 스크립트를 금지한다(`check`가 메일을 가져가 깨움이 사라진다).

- **O4. 옛 규칙 C·E의 코멘트와 무관한 절반을 살린다.** D3대로 C·E를 지우면서 "가리키는 말은 `doan active`로 대상을 찾는다"와 "편집 뒤 `doan check`를 통과시킨다"가 함께 빠졌다(B1 리뷰 🔴). 새 규칙을 늘리지 않고 A와 E 안에 넣고 테스트로 고정한다. — conductor's call: PRODUCT 'Loop' 5와 spec '사용자'가 이미 이 동작을 말하므로 새 결정이 아니고, D3의 A–E 개수도 지킨다.
- **O5. `app/src/formats/canvasPath.test.ts:30`은 T9 `rg` 예외다.** `.doan/comments/…`가 캔버스 경로가 아님을 재는 남은 메타데이터 예시이고, D1(남은 파일 무시)을 지킨다. — conductor's call.
- **O6. H2·H3·R4·W2는 새 id(`H2b`·`H3b`·`R4b`·`W2b`)를 받는다.** 코멘트 시드가 빠지고 R4·W2는 프롬프트, W2는 check도 바뀌었다. ARCHITECTURE §14 "task, seed, intent가 바뀌면 새 id" 규칙을 따른다. 새 id는 이전 라운드 기준선이 없으므로 T10의 "나빠짐" 비교 대상에서 빠지고, 첫 라운드가 기준선이 된다. — conductor's call: 문서에 적힌 규칙이고 D5와 어긋나지 않는다(D5는 무엇을 재는지만 정했다).
- **O7. `ToolCalls.patches`와 focus `"injection"`을 지운다.** R3 은퇴로 소비자가 없어졌고 D5는 대체 시나리오를 만들지 않는다. — conductor's call: AGENTS "내 변경이 만든 고아만 제거", 확장 대비 금지.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| B1 | T1–T3 | `cli/`, `schema/`, `app/src/formats/`(fold·validate·고아 타입), `app/src/brand/candidates.ts`, `app/src/main/conversation/prompt*.ts`, `eval/lib/socket.ts`, `eval/lib/workspace.test.ts`, `eval/scenarios/H6`·`H7`·`H8` | 없음 | Opus high — 스키마·CLI의 깨지는 변경과 에이전트가 읽는 가이드를 출력 예산 안에서 다시 쓴다 | `go test ./...`, `go vet ./...`, `npm --prefix app test`, `node --test 'eval/lib/*.test.ts'`, `verify.mjs`(--eval 없이) | 통합(`fd840a04`), 리뷰 1회 |
| B2 | T4–T7 | `app/src/`(B1 소유 제외), `.doan/canvases/canvas-row-menu.html`·`doan-shell.html`·`local-doan-files.html` | B1 통합 | Opus high — 공용 앵커·문서 바인딩 모듈 이동(D4), Trash IPC 변경, 격리 앱 runtime-test | typecheck·lint·`npm --prefix app test`, `doan check`, T7 runtime-test 증거 | 진행 중 |
| B3 | T8 | `eval/`(B1 소유 제외) | B1 통합 | Sonnet high — 시나리오 은퇴와 시드 정리가 대부분 기계적이지만 단계가 많고 self-test를 통과해야 한다 | `node --test 'eval/**/*.test.ts'`, `node eval/run.ts --self-test` | 통합(`9778ee45`), 리뷰 중 |
| B4 | T9–T12 | `docs/`, `README.md`, `AGENTS.md`, `.agents/skills/`, 루트 `.gitattributes`, `docs/features/remove-comments/` 삭제 | B2·B3 통합 | conductor | T9 `rg`, T10 agent-eval 라운드, T11 `verify.mjs --eval` | 대기 |

리뷰: B1·B2 diff는 Opus medium, B3 diff는 Sonnet high 독립 리뷰 worker가 `/code-review`로 본다.

## 겹침과 순서

- B1 → {B2 ∥ B3} → B4. B2와 B3은 파일이 겹치지 않는다(`app/src`·`.doan/canvases` 대 `eval/`).
- B1이 `app/src/formats/`와 `eval/` 일부를 먼저 고치므로 B2·B3은 B1 통합 뒤에 시작한다.
- B1·B2 통합 HEAD의 `/verify`는 `--eval` 없이, B3 통합 뒤부터 `--eval`로 돌린다.

## 진행 기록

- B1: worker `ctx_04722172bf54`(worktree `rc-b1`) 커밋 4개를 `44432c82..1fef906b`로 cherry-pick했다. 통합 HEAD 트리가 worker가 `verify.mjs`(--eval 없이)를 통과시킨 `e3bddb2a`와 같아서 그 증거를 쓴다. 가이드 20,492 B → 18,463 B. eval 시나리오 테스트 23건(H1·H2·H4·R1·R3·R6b·R7b)은 B3 대상이라 실패한 채로 넘어간다. 리뷰 worker `ctx_315d6341f96c`(Opus medium)를 B2·B3과 병렬로 띄웠다. 리뷰 수정은 B1 소유 파일에만 생기므로 B2·B3을 막지 않는다. 리뷰 결과 🔴 1(O4)·🟡 1(`ls`의 무효·중복 id 테스트 손실)·⚪ 6. ⚪ 4건(exit 2 중복, args_test 플래그 이름, viewer 주석, layout·critique 프리셋 문장)도 함께 고치고, root skip(⚪2)은 그대로 둔다. 수정 1차(`ctx_6ddda88acb61`)를 `66aba2d0`·`fd840a04`로 통합했다. conductor가 diff를 직접 확인했다(🔴·🟡 해소, 가이드 18,576 B). worker는 `verify.mjs`(--eval 없이)를 통과시켰고, 통합 HEAD의 코드 트리는 worker의 `135feec4`와 같다. 리뷰 worker는 release하고 worktree `rc-r-b1`을 지웠다(브랜치에 고유 커밋 없음). B1 worker는 T10에서 가이드 수정이 생길 수 있어 남겨 둔다.
- B2: worker `ctx_46a1c3ae4804`(Opus high, `rc-b2`). B3: worker `ctx_d0cd2f322c80`(Sonnet high, `rc-b3`).
- B1 handoff가 남긴 다른 배치 항목: 앱 `ATTRIBUTE_LINES`(B2), R8d 규칙 글자와 "as H6 does" 주석(B3), `eval/lib/work.ts:9`·design-draft 스킬·ARCHITECTURE의 규칙 글자, `prompt.ts`의 "output budget" 주석과 ARCHITECTURE §7 같은 문장(B4). `app/src/formats/canvasPath.test.ts:30`은 남은 메타데이터 예시라 T9 `rg` 예외로 본다.
- B3: worker `ctx_d0cd2f322c80`의 `e43443a0`을 `9778ee45`로 통합했다. worker는 `verify.mjs --eval`을 통과시켰다. 통합 HEAD(B1 수정 포함)에서 conductor가 `node --test 'eval/**/*.test.ts'`(272 pass)와 `node eval/run.ts --self-test`(`self-test PASS (35 scenarios)`, exit 0)를 다시 돌렸다. 계획과 다른 점: B1 소유 `eval/lib/workspace.test.ts`가 은퇴한 R6b 시드를 읽어서 B3이 D2b 시드로 바꿨다(단언은 그대로). 시드 `.gitattributes` 17개는 union 줄만 있어서 파일째 지웠다. W2는 `element_ids_preserved`(시드의 모든 `data-doan-id`가 남는지)로 바꿨다. 리뷰 worker `ctx_72ef30634825`(Sonnet high).
- B4 T9(진행 중): PRODUCT, ARCHITECTURE, README, AGENTS, BACKLOG, 개발 스킬, 루트 `.gitattributes`를 고쳤다. PRODUCT §5 item 5는 번호를 지키려고 "No comments" 항목으로 바꿔 D1(남은 `.doan/comments/` 무시)을 현재 규칙으로 적었다. ARCHITECTURE §2는 비웠고, `.gitattributes` 규칙은 §12 'Storage'로, 데이터 규칙은 §3 'Selection and inspector' Untrusted text로 옮겼다. B2에 걸린 부분(§3 Document origin 경로, §7 Canvas row menu IPC의 Trash, DIRECTORY, DESIGN, audit 스킬의 `app/src/comments`)은 B2 통합 뒤에 고친다. 코드 주석 두 곳(`prompt.ts:48`의 출력 예산 문장, `eval/lib/work.ts:9`의 규칙 글자)은 B1 worker에 보냈다(`ctx_876be7376da3`).
- B3 리뷰(`ctx_72ef30634825`, Sonnet high): 🔴 0, 🟡 2(W2가 옮긴 캔버스에서 seed를 못 읽는 거짓 실패, `patches` 고아), ⚪ 7. 수정 1차를 B3 worker에 보냈다(`ctx_7e7737a1ccb8`): 🟡 2건, ⚪ 3건(H3 rubric "approval", value-flag `agent`, focus `injection`), O6 id 변경. 리뷰 worker는 release하고 `rc-r-b3`을 지웠다. 리뷰가 본 self-test 1회차 실패는 B2 worker의 셸 `doan check`가 같은 순간 실제 `sessions.jsonl`에 쓴 탓이었고 2회차는 통과했다.
- B1 후속(`ctx_876be7376da3`): 코드 주석 2곳을 `21bd74b4`로 통합했다.
