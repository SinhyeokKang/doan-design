# audit-261025 수정 지휘

- 수행일: 2026-10-25
- 시작 커밋: `eb33f92` (앱·CLI·eval 기준 `28615ca`)
- 통합 브랜치: `feat-audit-261025`
- 원본: [코드 감사](report.md), [UX 감사](../ux-audit-261025/report.md)
- Run: `run_d5096c0e0da3`
- 순서: 두 리포트 인수 완료 → audit 근거 검토·수정·검증·병합 → ux-audit 검토·수정·검증·병합. UX 수정 워커는 audit 병합 뒤 시작한다.
- 사용자 승인: 수정 지휘·푸시·병합 및 필요시 Claude 워커 사용. 현재 리뷰 워커는 Codex를 사용한다.

## 결정 및 검토 원칙

- 보고서의 확정 표시는 정적 판단이다. 재현하지 못한 실행 주장을 통과로 바꾸지 않는다.
- 지휘자가 각 항목을 채택·기각·결정 대기·미재현으로 정리한다. 추측에 기반한 수정, 인접 리팩터링, 문서화된 의도의 임의 변경을 금지한다.
- A-M1: 불확실한 저장 요청의 전용 종료 경고를 사용자에게 질문했다. 응답 전에는 해당 동작을 구현하지 않는다.
- A-L15: 저장 후 attempts를 단순 삭제하면 요청 불변성과 중복 저장 방지가 깨질 수 있다. 불변식을 보존할 수 있는지 먼저 검토한다.
- A-L1·A-L9·A-L16 및 UX 결정 항목은 기존 결정과 대조한다. 이미 정해진 동작은 새로 묻지 않는다.
- 런타임·전체 검증·stress는 지휘자가 직렬로 예약한다. 검토 워커는 실행이 필요하면 근거와 최소 재현 절차를 보고한다.

## 배치

| 배치 | 항목·파일 소유권 | 선행 | 모델·effort와 근거 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|
| R-contract | A-M1~M5, A-L1~L3, L6, L9, L10, L14~L16. 소스 읽기와 `.scratch/audit-integration-261025/review-contracts.md`만 작성 | 두 리포트 인수 | Codex gpt-6-astra medium. 저장 불확실성·경로·수명 주기 계약의 독립 판단 | 항목별 근거, 기존 결정, 최소 수정, 검증 방법, 거짓 양성 명시 | 준비 |
| R-harness | A-M6, A-L4~L5, L7~L8, L11~L13, L17~L25. 소스 읽기와 `.scratch/audit-integration-261025/review-harness.md`만 작성 | 두 리포트 인수 | Codex gpt-6-astra medium. 실행 경계·평가 판정·회귀 검증의 독립 판단 | 모든 지정 ID의 판정, 실행 없이 확정할 수 없는 범위 구분 | 준비 |
| C | CLI 경로·init 수정. `cli/` 및 직접 필요한 fixture | R-contract 지휘자 판정 | 미정: 확정 범위에 맞춰 선택 | red→green Go 회귀 테스트, Go test/vet, 필요시 agent-eval | 대기 |
| E | eval 격리·정상 대안 판정. `eval/` | R-harness 지휘자 판정 | 미정 | red→green runner/scenario tests, self-test | 대기 |
| A | 앱 계약·수명 주기 수정. `app/src/` | 리뷰 및 필요한 사용자 결정 | 미정 | red→green 단위 테스트, 통합 runtime | 대기 |
| H | e2e 검증 허점. `app/e2e/` | R-harness 지휘자 판정, A의 테스트 소유권 확정 | 미정 | 하네스 회귀 근거, full runtime의 자체 PASS·exit 0 | 대기 |
| IR | 각 구현 diff 독립 code-review. 소스 수정 금지 | 구현 handoff | 미정 | 실제 커밋·handoff 대조, red 0까지 소유자 수정 | 대기 |
| G | 통합·문서·푸시·병합 | 모든 구현·리뷰 | 지휘자 | `/verify --runtime --eval`, 필요한 실제 agent-eval, 스크린샷 확인 | 대기 |

## 병렬·직렬 및 커버리지

R-contract와 R-harness는 같은 checkout에서 소스를 읽고 서로 다른 scratch 파일만 쓴다. 구현 파일 소유권과 모델은 리뷰 후 확정해 이 문서에 먼저 커밋한다. 구현 워커는 소유 파일이 겹치지 않게 자식 worktree를 사용한다. 이 문서의 R 배치에 A-M1~M6과 A-L1~L25를 모두 배정했다. UX 발견과 중복된 항목의 해결 여부는 UX 단계에 전달한다.

## 실행 기록

- 두 최종 보고서를 인수했고 보고서별 커밋 `024b229`, `eb33f92`를 main에 push했다.
- 코드 수정과 실행 검증은 아직 시작하지 않았다.

### 1차 지휘자 판정 및 C 배치 확정

- R-contract 완료: `ctx_1042149a3a7d`, 독립 리뷰 근거 `.scratch/audit-integration-261025/review-contracts.md`. 보고서를 읽고 지정 14개 ID가 모두 다뤄졌음을 확인했다. 워커는 release했고 새 worktree는 만들지 않았다.
- 채택: A-M2·M3·M4·M5, A-L2·L3·L6·L9·L10·L15. M2·M5는 소스 결함이며 네이티브 런타임 검증은 아직 남았다.
- A-M4: 지휘자가 임시 APFS 디렉터리에서 NFD 파일을 NFC로 지정한 `init --token-css` 실패(exit 2)를 재현했다. NFD 지정은 성공(exit 0). 근거 `cli-normalization-repro.json`.
- A-M6: 지휘자가 임시 저장소에서 Python cwd import 및 Git fsmonitor 실행을 재현했다. `-I`, `core.fsmonitor=false`로 각각 차단됨을 확인했다. 근거 `probes.json`, `git-fsmonitor-repro.json`.
- 기각: A-L16은 PRODUCT의 기존 ‘설정 쓰기 중에도 일반 Cmd+Q 유지’ 결정이다. 종료 대기를 임의로 추가하지 않는다.
- 재현 후 판정: A-L1·L14. A-M1은 사용자 결정 대기.
- A-L9는 ID 누락과 파싱 실패를 동일시한 오류다. 유효한 width가 있으면 캡처를 허용하고, 알 수 없는 원인을 단정하지 않는 안내를 사용한다. 댓글 쓰기 제한은 기존 계약을 따른다. CLI 응답 형식을 늘리지 않는다.
- A-L15는 요청 기록을 지우거나 상한으로 퇴거하지 않는다. 원래 payload/event 및 경고·prefix 판정을 보존하며 파일 전체 baseline만 digest/길이/경고 수로 축약한다. 전체 요청 수의 상한을 보장한다고 보고하지 않는다.

| 확정 구현 배치 | 항목 | 파일 소유권 | 모델·effort | 게이트·상태 |
|---|---|---|---|---|
| C | A-M4, A-L2, A-L3, A-L6의 CLI 설명 | `cli/`만. A-L6은 `cli/internal/cli/skill.md` 설명에 한정하고 JSON schema는 보존 | Codex gpt-6-astra medium. 파일 정체성과 실패 분류·부분 초기화 계약을 함께 보존해야 함 | 재현 회귀 red→green, Go test/vet. 문서의 기존 no-op·경로 격리·오류 규칙 유지. 통합 시 관련 agent-eval. 준비 |

C는 통합 브랜치 커밋에서 새 자식 worktree로 시작한다. 보고서 원문, PRODUCT/ARCHITECTURE/POSTMORTEM 및 orch는 수정하지 않고 문서 후보를 handoff에 적는다. 전체 runtime/verify/실제 agent-eval은 지휘자 예약으로 실행한다.

### 2차 지휘자 판정 및 E·A1·A2·H 배치 확정

- R-harness 완료: `ctx_27b9e66ab4a7`, `.scratch/audit-integration-261025/review-harness.md`. 지휘자가 지정 17개 ID와 소스 근거를 확인했다.
- 채택: A-M6, A-L4·L5·L7·L11·L12·L17~L25. 하네스의 실패 정산·증거 도착 누락과 실제 앱 결함을 구분한다. 실행으로 확인하지 않은 flake나 실제 라운드 오판정을 발생 사실처럼 쓰지 않는다.
- 기각: A-L8은 현재 생산자·소비자 문구가 일치한다. 향후 문구 변경 시 상태가 드리프트할 유지보수 위험이며, 이번에 새 상태 프레임워크를 만들 근거는 아니다.
- 재현 필요: A-L13. 네이티브 드롭이 Add UI를 우회하는지 확인해야 한다. 사용자가 드롭한 파일 권한을 임의 host 접근이나 HTTP serving 범위 위반으로 단정한 설명은 채택하지 않는다.
- A-L7은 위저드가 실제 제공하는 Open Project…를 안내하는 수정만 채택한다. Home 액션을 통째로 붙이거나 전면 모델 통합을 하지 않는다.

| 확정 구현 배치 | 항목 | 파일 소유권 | 모델·effort | 게이트·상태 |
|---|---|---|---|---|
| E | A-M6, A-L4·L21~L25 | `eval/` 전체. 시나리오 task/seed/의도 변경 금지 | Codex gpt-6-astra medium. 실행 경계와 checker false pass/fail 판단 | 실제 helper 회귀 red→green, runner tests, 모든 scenario self-test. 준비 |
| A1 | A-M3, A-L6 앱 설명·L10·L15 | `app/src/main/comments/`, `app/src/main/inspector.ts`와 해당 test, `app/src/renderer/CommentsPanel.tsx`와 해당 test, `app/src/formats/`의 직접 필요한 fixture/test | Codex gpt-6-astra medium. 불확실한 append와 immutable retry 보존 | 실제 service·직렬화 CDP 경로 red→green, app typecheck. 준비 |
| A2 | A-M5, A-L5·L7·L9·L11, 재현 뒤 A-L14 | `Toast.tsx`·`toastState`·`canvasTree`·`onboardingView`·`projectRow`·`ProjectOverview`·`canvasInfo` 및 해당 단위 테스트; `main/thumbnails` 및 해당 test | Codex gpt-6-astra medium. native hide·cache 경합·표시 계약 | targeted red→green, app typecheck, 통합 native runtime. 대기 |
| A3 | A-M1·M2, UX U-1 직접 중복 | `CommentsSession`·`useComments`·`comments/draft`·`CommentsPanel`·main `index`·`comments/transitions` 및 관련 test | Codex gpt-6-astra medium. 미확정 쓰기와 quit 수명 주기 | A1 통합 및 사용자 결정 뒤. 기존 setImmediate teardown 보존. 대기 |
| H | A-L12·L17~L20 및 수용한 앱 동작의 런타임 회귀 | `app/e2e/`만 | Codex gpt-6-astra medium. 시간 초과 정산과 부정 단언의 증거 도착 | 앱 배치 통합 뒤 runtime 실행 예약. 먼저 하네스 회귀 red→green. 대기 |

C·E·A1은 소유 파일이 달라 병렬 가능하다. A2도 별도 파일이지만 가용 워커 자리에 따라 다음 wave로 보낸다. A3는 A1과 CommentsPanel 소유권이 겹치므로 직렬이다. H는 앱 코드의 테스트 변경을 소유하며 full runtime은 다른 실행과 겹치지 않는다. 각 배치가 만든 postmortem 후보는 지휘자가 문서별 커밋으로 통합한다. 기존 리뷰 워커는 구현 소유자로 전환하지 않고 release한다.

### 실행 중 발견

- A-L1 재현(지휘자, 2026-10-25): 실제 Electron 45에서 현 `thumbnailWindow.ts`를 타입만 제거해 임시 앱으로 실행했다. 정상 캔버스는 캡처되고, 정상 외곽 문서 안의 iframe 404는 전체 미리보기를 unavailable로 만들었다. 직접 캔버스 404도 unavailable이었다. 끝나지 않는 이미지가 있는 작업은 약 8.1초 후 캡처됐고 다음 정상 작업도 성공했다. 이전 작업의 실패 오염은 이 probe에서 재현되지 않았다. 실제 사용자 상태 불변 검사를 통과했다. 근거 `.scratch/audit-integration-261025/thumbnail-probe.{mjs,json}`. nested 실패가 외곽 미리보기를 막아야 하는지는 기존 문서가 명확히 정하지 않아 아직 수정하지 않는다. 첫 두 probe 준비는 TS/esbuild API 부재로 실행 전에 실패했고, Node 내장 타입 제거로 probe를 실행했다.
- E 워커가 실제 judgeMaterial Git 호출에서 clean filter 실행도 임시 marker로 재현했다. 같은 post-agent 경계의 좁은 방어를 추가하도록 지시했다. 완전한 sandbox라고 보고하지 않는다.
- 실행 워커: C `ctx_64080f504c8e` (`audit-cli-261025`), E `ctx_2a1afc30c998` (`audit-eval-261025`), A1 `ctx_e2c78120d993` (`audit-comments-261025`). 요청 모델과 effective 모델 모두 gpt-6-astra medium, turn_start 관찰 완료.

### C·A1 handoff와 리뷰 예약

- C 작업 완료: 원본 `aee3635`, `9990e65`, `4643743`; 통합 후보 `6b0af1a`, `6aae16e`, `0cae486`. repo/cli package tests와 Go vet 통과 근거를 인수했다. 독립 리뷰 전이므로 수용 완료가 아니다. 증거는 `.scratch/audit-integration-261025/C-evidence/`에 복사했다.
- C 워커는 즉시 새 A2 Dispatch `ctx_e194a72b35c6`로 재사용했다. 같은 process incarnation과 기존 Astra medium 설정을 유지하며, reuse receipt의 모델 필드는 null이다. `audit-cli-261025` child에서 C 이후 A2 파일만 수정한다.
- A1 작업 완료: 원본 `af812bc`, `a276ac4`, `a14739a`, `2d4a9cb`. 소유한 6개 파일만 변경했고, 수정된 테스트를 원래 구현에 다시 대조한 10개 red와 관련 417개 테스트·typecheck green을 인수했다. 실제 CLI 바이트 입력 3건 대조도 인수했다. 통합 runtime와 독립 리뷰는 미완료다. 증거는 `A1-evidence/`에 복사했다.
- IR-C 모델: Codex gpt-6-astra medium. A1 구현 워커를 독립 CLI 리뷰에 즉시 재사용한다(자기 구현을 리뷰하지 않음). 대상은 C diff뿐이며 소스 수정·실행 금지, `.scratch/review-C.md`만 작성한다. 특히 hard-link publication의 파일시스템 제약, 경로 정체성, 실패 복구와 기존 init 계약을 검토한다.
- E가 전체 runner tests → self-test 슬롯을 사용 중이다. 다른 full/runtime/stress 실행은 예약하지 않았다.
