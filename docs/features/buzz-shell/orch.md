# buzz-shell orchestration

시작: 2026-10-27. 기준 문서: [spec](./spec.md), [design](./design.md), [tasks](./tasks.md).
시작 커밋: `7a95f49f3ebdddcaecf10e87089ca12a153c5c25`.
통합 브랜치: `feat-buzz-shell`. 기존 main 기반 브랜치와 승인 문서 커밋을 이어간다.

## 결정 기록

- 사용자의 `$orchestrate docs/features/buzz-shell` 호출로 이 체크리스트 구현을 시작한다.
- conductor's call — 이미 승인된 시안과 task 0·1a·2는 다시 승인받지 않는다. 브랜치를 다시 만들거나 기존 커밋을 버리지 않는다.
- conductor's call — task 1b는 코드 전에 문서로 확정한다. 기존 관측 가능한 활동만 사용하고 범위 확대가 필요하면 그 결정만 사용자에게 묻는다.
- conductor's call — Codex 계열만 사용한다. 모델 선택은 이 저장소 orchestrate 스킬의 배치별 지정 규칙을 따른다.
- conductor's call — 전체 runtime·패키지 실행·네이티브 관찰은 한 작업자만 실행한다. 병렬 배치의 테스트는 각 checkout에서 실행한다.
- conductor's call — 지휘자는 배치 코드를 수정하지 않는다. 독립 리뷰의 수정은 소유 작업자에게 돌린다. push와 PR 생성은 통합 완료 후 수행하며 merge하지 않는다.

## 배치와 소유권

| 배치 | task | 파일 소유권 | 선행 | 모델·effort / 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| 승인 근거 | 0, 1a, 2 | 기존 spec·design·tasks | 없음 | 지휘자 / 기존 결정 확인 | 승인 문서와 git 이력 대조 | 완료 |
| A 기술 계약 | 1b | design.md의 기술 연결, tasks.md의 1b | 없음 | Astra medium / 상태 호환성과 관측 한계 판단 | 기존 코드·IPC 대조, 공급원·복원 표 | 대기 |
| B 리소스 | 4 | 폰트 리소스·라이선스, tokens.css, ds/controls.css, 폰트용 공통 CSS와 entry 링크 | 없음 | Sol medium / 승인 값과 로컬 리소스 연결 | typecheck, test, build, package; 실제 로드는 E | 대기 |
| C 상태·창·UI | 3, 5a, 5b, 6 | app의 나머지 상태·main/preload·renderer 및 관련 테스트; B 파일은 통합 이후 필요 시 이관 | A, B | Astra medium / 보호·비동기·복원·포커스 수명 | TDD red→green, typecheck, 5a 실제 창 선행 검증, runtime | 대기 |
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

B에 전체 runtime 실행권을 배정했다. 작업자가 실행권 메시지를 읽고 ack한 것을 transcript에서 확인했다. A는 문서만 수정한다. 독립 리뷰·통합 gate는 아직 실행 전이다.
