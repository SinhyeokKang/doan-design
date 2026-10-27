# buzz-shell orchestration

시작: 2026-10-27. 기준 문서: [spec](./spec.md), [design](./design.md), [tasks](./tasks.md).
시작 커밋: `7a95f49f3ebdddcaecf10e87089ca12a153c5c25`.
통합 브랜치: `feat-buzz-shell`. 기존 main 기반 브랜치와 승인 문서 커밋을 이어간다.

## 결정 기록

- 사용자 변경 지시(2026-10-27): 전체 e2e는 배치마다 실행하지 않고 최종 통합 뒤 한 번 실행한다. 배치 리뷰 전 전체 runtime gate도 이에 따라 뒤로 옮긴다. 사용자가 작업 중이므로 task 5a를 포함한 화면을 띄우는 네이티브 확인도 마지막으로 미룬다. 중간에는 단위 테스트·타입 검사·빌드만 한다. 이미 시작한 B runtime은 안전하게 종료하고 미완료 근거로 보존한다. 5a 미검증 상태로 UI를 구현하되 최종 검증에서 재질 지원 여부와 회귀를 확인한다.
- 사용자의 `$orchestrate docs/features/buzz-shell` 호출로 이 체크리스트 구현을 시작한다.
- conductor's call — 이미 승인된 시안과 task 0·1a·2는 다시 승인받지 않는다. 브랜치를 다시 만들거나 기존 커밋을 버리지 않는다.
- conductor's call — task 1b는 코드 전에 문서로 확정한다. 기존 관측 가능한 활동만 사용하고 범위 확대가 필요하면 그 결정만 사용자에게 묻는다.
- conductor's call — Codex 계열만 사용한다. 모델 선택은 이 저장소 orchestrate 스킬의 배치별 지정 규칙을 따른다.
- conductor's call — 전체 runtime·패키지 실행·네이티브 관찰은 한 작업자만 실행한다. 병렬 배치의 테스트는 각 checkout에서 실행한다.
- conductor's call — 지휘자는 배치 코드를 수정하지 않는다. 독립 리뷰의 수정은 소유 작업자에게 돌린다. push와 PR 생성은 통합 완료 후 수행하며 merge하지 않는다.
- conductor's call — 1b의 활동 후보는 검증된 shell check 연관 시각과 식별 가능한 대화 activity 이벤트(read/edit/command/other)다. 관측된 작업이며 성공한 파일 수정의 증거는 아니다. 메시지·사용자 입력·turn/permission/archive 시각은 제외한다. 등록된 정규화 root만 대상으로 하고 기존 기록 검증을 유지한다. 원문은 renderer에 노출하지 않는다.
- conductor's call — 제거는 탐색 메모리를 비운다. 명시적 재등록/Undo 시 기존 활동을 다시 조회할 수 있으며 별도 제거 cutoff 저장소는 만들지 않는다. 승인된 최근 활동 복원과 기존 제거 계약에 맞춘 최소 구현이다. 정확한 공급원·누락 범위·호환성은 A의 기술 계약에서 검증한다.

## 배치와 소유권

| 배치 | task | 파일 소유권 | 선행 | 모델·effort / 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| 승인 근거 | 0, 1a, 2 | 기존 spec·design·tasks | 없음 | 지휘자 / 기존 결정 확인 | 승인 문서와 git 이력 대조 | 완료 |
| A 기술 계약 | 1b | design.md의 기술 연결, tasks.md의 1b | 없음 | Astra medium / 상태 호환성과 관측 한계 판단 | 기존 코드·IPC 대조, 공급원·복원 표 | 대기 |
| B 리소스 | 4 | 폰트 리소스·라이선스, tokens.css, ds/controls.css, 폰트용 공통 CSS와 entry 링크 | 없음 | Sol medium / 승인 값과 로컬 리소스 연결 | typecheck, test, build, package; 실제 로드는 E | 대기 |
| C 상태·창·UI | 3, 5a, 5b, 6 | app의 나머지 상태·main/preload·renderer 및 관련 테스트; B 파일은 통합 이후 필요 시 이관 | A, B | Astra medium / 보호·비동기·복원·포커스 수명 | TDD red→green, typecheck, 5a 실제 창 선행 검증, runtime | 대기 |
| H 검증 입력 경로 | 7, 8의 기존 harness 적응 | app/e2e/**만 | C의 UI 입력 계약 | Astra medium / 기존 행동 검증을 유지하며 제거된 탐색 UI 대체 | 정적 경로 대조·harness unit, 실제 실행은 최종 통합 | 진행 |
| R 독립 리뷰 | 8의 배치 리뷰 | 보고서만 .scratch/ | 각 배치 완료 | Astra medium / 계획 대비 동작과 누락 검토 | /code-review 및 handoff 근거 대조 | 대기 |
| F 수정 라운드 | 8의 수정·postmortem | 해당 배치 소유 파일, 필요 시 POSTMORTEM.md | R | Astra medium / 원인과 회귀 판단 | 실패 재현→수정→관련 runtime, 재리뷰 | 필요 시 |
| E 실측·회귀 | 7, 7b, 8의 통합 검증 | app/e2e의 관련 검증, .scratch/design-sync/buzz-shell/, DESIGN.md 실측 | C 통합 | Astra medium / 실제 창과 보호·포커스 검증 | /design-sync, /runtime-test, presentation dev/prod, 패키지 오프라인 로드 | 대기 |
| I 최종 통합 | 8 최종 gate | 통합 커밋·orch.md | E, R, F | 지휘자 / 통합 HEAD 증거 | verify.mjs --runtime, harness 변경 시 별도 unit test | 대기 |
| D 문서 승격 | 9 | PRODUCT.md, ARCHITECTURE.md, DESIGN.md, 부모 문서의 해당 상태, 자식 문서 삭제 | I | 지휘자 / 구현·실측 근거 승격 | 문서/코드 대조·링크 검사 | 대기 |

모든 체크박스 0·1a·1b·2·3·4·5a·5b·6·7·7b·8·9를 위 표에 배정했다.

## 실행 순서와 충돌

A와 B는 파일이 겹치지 않아 별도 Orca child worktree에서 병렬 진행한다. B는 전체 runtime을 실행하기 전에 지휘자와 실행권을 조율한다. A·B를 독립 리뷰하고 통합한 뒤 C를 시작한다. C는 task 3과 5a를 먼저 완료하고 5b·6을 진행한다. E는 통합된 C 위에서 수행한다. E와 C의 수정 라운드는 같은 파일을 동시에 수정하지 않는다.

각 작업자는 `feat-buzz-shell`을 base로 생성한다. 완료 시 커밋·명령 결과·미완료 항목을 `.scratch/handoff-<batch>.md`에 남긴다. 작업자는 push/PR·feature 삭제를 하지 않는다. 검증 실패나 사용자 결정이 생기면 근거와 함께 보고하며 통과로 간주하지 않는다.

## 검증과 정리 근거

Run: `run_91e67e2980b4`.

| 배치 | Dispatch | child worktree | 시작 증거 |
|---|---|---|---|
| A | `ctx_a898a29214ae` | `buzz-shell-contract` | `turnStart: observed`, effective Astra medium, 문서 읽기 확인 |
| B | `ctx_d33951f7e060` | `buzz-shell-resources` | `turnStart: observed`, effective Sol medium, 리소스 조사 확인 |

B에 배정했던 전체 runtime은 사용자 지시에 따라 중단했다. 실제 상태 보존과 소유 프로세스 종료를 B handoff에서 확인했으며 전체 PASS로 간주하지 않는다. 추가 native 실행권은 없다.

- A: `2a16192`, `a949aa5`. 기술 계약과 task 1b 완료, 소스 대조 30개와 diff 검사 통과. 독립 R-A(`ctx_de3e5cf68388`, Astra medium)가 검토 중이다. A 작업자는 release 완료, worktree는 리뷰가 사용하므로 보존한다.
- B: `88cba80`. 테스트 3,307개·typecheck·build·package 및 원본/빌드/ASAR 자산 바이트 대조 통과. 실제 폰트 로드·네이티브·전체 e2e는 최종 단계로 이관했다. 독립 R-B(`ctx_c9910a62d7b7`, Astra medium)가 검토 중이다. worktree는 리뷰가 사용하므로 보존한다.
- handoff와 검증 로그는 지휘자 `.scratch/buzz-shell-orch/evidence-A/`, `evidence-B/`에 복사했다. 아직 통합 gate를 실행하지 않았다.
- R-B: 🔴0·🟡0. B를 `f6ae879`로 통합했다. B/R-B 작업자 release와 증거 복사·대조를 완료했고 Orca에서 `buzz-shell-resources`를 제거했다. 목록에서 child id가 사라진 것을 확인했다.
- R-A: 🔴0·🟡2. 참조된 history 누락 상태와 selectedAt의 유효 Date 범위를 보완한다. F-A는 Astra medium으로 문서만 수정한다(기존 경계의 정확성 판단). 구현과 native 검증은 실행하지 않는다.
- F-A `80e27b9`의 두 경계 보완을 지휘자가 diff와 handoff로 확인했다. A/F-A를 `33e158f`, `f166e01`, `f482cbe`로 통합했다. 원 작업자와 리뷰·수정 작업자는 모두 release 완료했고 증거를 복사한 뒤 `buzz-shell-contract`를 Orca로 제거했다.
- C: `ctx_f8a26166a0a5`, task `task_9dba28cd37a0`, child `buzz-shell-ui`. 통합 `f482cbe`에서 시작했고 `turnStart: observed`, effective Astra medium을 확인했다. brief 맨 위에 사용자 native/e2e 유예를 명시했다. task 3·5a의 옵션 구현·5b·6을 맡고 실제 5a 검증은 E로 이관한다.
- C가 app/e2e의 변경 없음과 소유권 해제를 확인했다. H에 해당 디렉터리만 맡겨 병렬로 기존 입력 경로를 갱신한다. C는 app/src만 수정하며 H를 기다리지 않는다. H도 GUI/e2e를 실행하지 않는다.
- C는 `fe9095b`에서 완료 보고했다. 타입·3,339개 단위 테스트·빌드가 통과했고 GUI는 실행하지 않았다. R-C(`ctx_5f5b202ca9cd`, Astra medium)는 🔴0·🟡3을 보고했다: 디스크에서 삭제된 root의 history 건너뛰기, 같은-root Overview 전에 source view 기억, 비선택 오류 root의 복구 진입. C handoff와 로그를 evidence-C에 보존했다.
- F-C는 같은 C 작업자를 새 Task로 재사용해 세 문제의 red→green과 POSTMORTEM 기록을 맡긴다. 모델은 기존 Astra medium을 유지한다. R-C는 release 완료이며 worktree는 수정에 필요해 보존한다.
- H(`ctx_d61be53ff58d`, Astra medium)는 `127d441`로 18개 e2e 파일을 변경했다. 비GUI harness 54개·TS 36개 구문 검사가 통과했고, 의존성이 없어 typecheck는 실행하지 못했다. GUI 미실행이다. H를 release하고 R-H(`ctx_a7272a231d5b`, Astra medium)가 고정 diff와 C의 실제 UI를 대조한다.
- F-C는 `4a96b81`과 회고 `9320ebf`로 세 문제를 수정했다. 단위 테스트 3,346개·타입·빌드 통과, GUI 미실행이다. F-H는 R-H의 최종 두 지적을 `040e322`로 수정했고 harness 61개·구문 검사 통과, 타입·runtime은 통합 뒤 확인한다. 두 수정 작업자는 release했다.
- RF는 Astra medium의 독립 정적 재리뷰다. 목적지 소유권과 공개 UI 검색 식별을 판단해야 하므로 같은 모델을 선택했다. C/H 고정 커밋과 최종 handoff를 대조하며 tracked 파일과 GUI를 건드리지 않는다. 지휘자는 두 배치를 통합하고 최종 검증을 준비한다.
- C/F-C와 H/F-H를 `405cf5b`까지 충돌 없이 통합했다. 통합 typecheck와 harness 61개가 통과했다. EP는 Astra medium으로 실측 스크립트와 요구사항별 확인 경로만 준비한다. 실제 창 실행 시점은 사용자가 작업 중임을 알려 확인 중이며, 답변 전에는 모든 GUI 실행을 보류한다.
