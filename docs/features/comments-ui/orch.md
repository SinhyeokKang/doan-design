# comments-ui — orchestration

- 시작: `741d938` (main), 2026-10-23
- 통합 브랜치: `feat-comments-ui`
- 입력: [spec.md](spec.md), [design.md](design.md), [tasks.md](tasks.md)
- 지휘자는 배치 코드를 수정하지 않는다. Codex 워커만 사용한다. 종료는 브랜치 push와 PR이며 병합하지 않는다.

## 결정 기록

- Q1–Q9: 사용자의 기존 승인 유지. 복사는 단일 열린 코멘트와 현재 캔버스의 열린 코멘트 전체 두 범위다.
- 지휘 판단 — tasks 0/1: 초안과 독립 PoC를 먼저 병렬 진행한다. 임시 실험 외 제품 구현은 PoC 통과와 사용자 초안 확인 전 금지한다.
- 지휘 판단 — 파일 충돌 방지: PoC는 각 워크트리의 임시 실험이며 제품 코드로 통합하지 않는다. 실제 구현은 공통 계약을 먼저 통합한 뒤 파일 소유 범위를 재확인한다.
- 초안 최종 확인: 이번 라운드는 사용자가 지휘자에게 위임했다. 지휘자 검증 후 확정한다.

## 배치와 검증

| 배치 | tasks 항목·소유 파일 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|
| P-W | 0 writer PoC; 임시 fixture, handoff만 | 없음 | Astra medium — 파일 경계·경합 판단 | app test/typecheck/build/e2e 중 실험 관련 게이트, 외부 파일·디렉터리 불변 | 실패: mkdir 외부 변경 |
| P-H | 0 hash·문서 세대 PoC; 임시 fixture, handoff만 | 없음 | Astra medium — 응답/문서 경합 | app test/typecheck/build/e2e, 전달 bytes·세대 불일치 차단 | PoC 통과 |
| D | 1 design/comments-ui.html | 문서 리뷰 완료 | Astra medium — 기존 화면 보존·상태 표현 | doan ls/check, 지휘자 위임 확인 | 1차 리뷰 수정 중 |
| P-I | 0 입력 보류·다중 대상 성능; 임시 fixture, handoff만 | 첫 wave 자원 반환 | Astra medium — 입력 경계·실측 | design §8 사전 기준 전부, 실제 창 | 진행 중 |
| F | 2 공유 v1 fixture·Go/TS 테스트 | PoC 및 초안 승인 | Sol medium — 기존 형식 사례 확장 | go test, app test | 대기 |
| C | 3 순수 함수와 테스트, 신규 shared 모듈 | F | Astra medium — 상태·시간·타겟 계약 | red→green, app test/typecheck | 대기 |
| M | 4 main I/O·IPC·preload·watcher 및 테스트 | C | Astra medium — 파일 안전성·재시도 | app test/typecheck, go test, reader round trip | 대기 |
| A | 5 anchor 조회·핀 geometry·overlay 및 테스트 | C; M과 공유 파일 겹치면 직렬 | Astra medium — 문서·viewport 경계 | app test/typecheck/build/e2e | 대기 |
| U | 6 패널 CRUD·초안·복사 및 테스트 | M,A | Astra medium — UI 상태·입력 보호 | app test/typecheck/build/e2e | 대기 |
| V | 7 통합 회귀·개별 mutation·runtime | U | Astra medium — 독립 경계 검증 | go test/vet, app test/typecheck/build/e2e, screenshot 확인 | 대기 |
| R | 각 구현 배치 독립 리뷰, 결함은 원 소유자 수정 | 해당 배치 | Astra medium — 계획·증거·정확성 검토 | code-review, 🔴 0까지 반복; 결함 postmortem | 대기 |
| S | 8 design-sync·필요한 수정·DESIGN | V,R | Astra medium — 상태별 측정·독립 재검토 | 측정 및 app test/typecheck/build/e2e | 대기 |
| Z | 9 문서 승격·완료 조건 12개 대응·feature 문서 삭제 | S,R | 지휘자 — docs freshness | 최종 go test/vet, app test/typecheck/e2e, 문서 검토 | 대기 |

모든 tasks 0–9는 위 행에 대응한다. 세부 구현 파일은 선행 계약 확정 후 해당 배치 착수 전에 이 표와 brief에서 고정한다. 겹치는 파일은 동시에 편집하지 않는다. 리뷰는 읽기 전용이며 결함 수정은 소유 워커가 맡는다.

## 통합·정리

완료 보고와 실제 증거를 대조하고 Dispatch를 즉시 재사용 또는 release한다. 통합 후 git cherry의 미통합 `+`가 없고 작업 트리가 깨끗한지 확인한다. 필요한 handoff·실측 자료를 지휘자 `.scratch/comments-ui/`로 복사·검증한 뒤 Orca worktree rm으로 카드까지 삭제하고 목록에서 부재를 확인한다. 리뷰 의존성이 있는 워크트리는 의존성이 해소될 때까지 보존 사유를 기록한다.

## 진행 기록

- 2026-10-23: 문서 리뷰 완료와 clean main을 확인했다. 첫 wave 착수 준비.

- Run: `run_3cf07931b2b9`. P-W `ctx_81610878cda0`, P-H `ctx_a5cdf9dfa437`, D `ctx_857ba79199fb`. 세 워커 모두 Astra medium 실행과 turnStart observed를 확인했다.

- 지휘 판단: 초안의 기존 필수 상태를 17개 frame으로 식별했다. 기능 변경이 없는 id·width와 세부 문구는 초안 제안이며 최종 사용자 확인 대상이다. Orca 자식 브랜치는 feat-comments-ui의 격리 작업 브랜치로 사용한다.

- 2026-10-23 사용자: design-draft 워커 결과는 지휘 세션이 직접 리뷰한다. 상태 대응·기존 화면/토큰·실앱 표시를 검토하고 결함을 원 워커에게 수정시킨 뒤 사용자 초안 확인으로 넘긴다.

- 2026-10-23 사용자 후속 지시: 이번 라운드의 사용자 초안 리뷰를 생략하고 지휘자가 직접 최종 컨펌한다. 앞선 사용자 확인 게이트를 이번 comments-ui 라운드에 한해 대체한다. 스킬의 일반 사용자 확인 규칙은 유지한다. 지휘자 리뷰·실앱 검증·수정 해소 및 PoC 통과 후 다음 구현 배치로 진행한다.

- P-W 완료: Node/Electron에서 mkdir 경쟁 실패, O_NOFOLLOW_ANY 기존/신규 open 보호 통과. 전체 테스트 915개·typecheck·e2e 통과는 PoC 관찰의 재현일 뿐 writer 게이트 통과가 아니다. 증거 `.scratch/comments-ui/evidence/P-W/`를 검토했다. 앱 전용 Go mkdir helper 설계 질문을 사용자에게 전달했다.
- P-W 터미널을 P-I `ctx_e4287dbfd7ac`에 즉시 재사용했고 turnStart observed를 확인했다. cu-pw 워크트리는 P-I 실험 때문에 유지한다.

- P-H PoC 통과: 응답별 bytes hash와 CDP document loader 연결, HEAD/fetch/reload 경합, old reply, stream mutation의 create 선행조건 거부를 검증했다. 제품 전체 수명주기·writer 통합은 아직 미검증이다. handoff와 재현 patch의 복사본 일치를 확인한 뒤 release 및 Orca cu-ph 삭제, 목록 부재를 확인했다.
- D 초안 `4ffba61` → 통합 `f589c41`. 지휘자가 실제 앱에서 17개 frame으로 이동하고 screenshot을 확보했다. 같은 앱 서빙 URL을 별도 sandboxed Electron 창에서 원래 크기로 캡처해 17개 상세 이미지를 모두 직접 검토했다. 가로 overflow 0, 실제 folders/runtime fingerprint 불변. 증거 `.scratch/comments-ui/review/`.
- 지휘자 1차 리뷰: width 오류의 활성 작성 버튼, Open 1인데 비활성 전체 복사, 빈 목록 count/작성 버튼 모순, 저장 성공과 확인 실패 혼합 타일, 작성 진입 대상 모호함, 읽기 미확정 count, 이름 미설정의 기존 카드 상태 누락을 발견했다. D-fix `ctx_5130422e414e`를 원 소유 워크트리에 배정했다. Astra medium과 turnStart observed를 확인했다. 초안 컨펌은 수정 재검증 뒤에 한다.
