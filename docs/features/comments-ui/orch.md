# comments-ui — orchestration

- 시작: `741d938` (main), 2026-10-23
- 통합 브랜치: `feat-comments-ui`
- 입력: [spec.md](spec.md), [design.md](design.md), [tasks.md](tasks.md)
- 지휘자는 배치 코드를 수정하지 않는다. Codex 워커만 사용한다. 종료는 브랜치 push와 PR이며 병합하지 않는다.

## 결정 기록

- Q1–Q9: 사용자의 기존 승인 유지. 복사는 단일 열린 코멘트와 현재 캔버스의 열린 코멘트 전체 두 범위다.
- 지휘 판단 — tasks 0/1: 초안과 독립 PoC를 먼저 병렬 진행한다. 임시 실험 외 제품 구현은 PoC 통과와 사용자 초안 확인 전 금지한다.
- 지휘 판단 — 파일 충돌 방지: PoC는 각 워크트리의 임시 실험이며 제품 코드로 통합하지 않는다. 실제 구현은 공통 계약을 먼저 통합한 뒤 파일 소유 범위를 재확인한다.
- 초안 최종 확인: 2026-10-23 사용자의 위임에 따라 지휘자가 `14de60c` 초안을 검증하고 확정했다.

## 배치와 검증

| 배치 | tasks 항목·소유 파일 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|
| P-W | 0 writer PoC; 임시 fixture, handoff만 | 없음 | Astra medium — 파일 경계·경합 판단 | app test/typecheck/build/e2e 중 실험 관련 게이트, 외부 파일·디렉터리 불변 | 승인된 객체 경계의 PoC 통과 |
| P-H | 0 hash·문서 세대 PoC; 임시 fixture, handoff만 | 없음 | Astra medium — 응답/문서 경합 | app test/typecheck/build/e2e, 전달 bytes·세대 불일치 차단 | PoC 통과 |
| D | 1 design/comments-ui.html | 문서 리뷰 완료 | Astra medium — 기존 화면 보존·상태 표현 | doan ls/check, 지휘자 위임 확인 | 수정 재검증·최종 컨펌 완료 |
| P-I | 0 입력 보류·다중 대상 성능; 임시 fixture, handoff만 | 첫 wave 자원 반환 | Astra medium — 입력 경계·실측 | design §8 사전 기준 전부, 실제 창 | PoC 통과, 아래 한계 명시 |
| F | 2 공유 v1 fixture·Go/TS 테스트 | PoC 및 초안 승인 | Sol medium — 기존 형식 사례 확장 | go test, app test | bd05032 통합·리뷰 통과 |
| C | 3 순수 함수와 테스트, 신규 shared 모듈 | F | Astra medium — 상태·시간·타겟 계약 | red→green, app test/typecheck | 4fa6151 통합·독립 리뷰 통과 |
| M | 4 main I/O·IPC·preload·watcher 및 테스트 | C,M1 | Astra medium — 파일 안전성·재시도 | app test/typecheck, go test, reader round trip | 대기 |
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

- D-fix `67beacf` → 통합 `14de60c`. 지휘자가 diff와 변경된 상태 이미지를 직접 다시 검토했다. 실제 앱에서 17개 frame 재탐색, 상세 렌더링 가로 overflow 0, 사용자 데이터 fingerprint 불변을 확인했다. 버튼 조건·읽기 count·복구 상태 분리·기존 카드의 이름 제한이 수정됐다. 이 초안을 최종 컨펌한다. 이는 정적 UI 설계 승인이고 CRUD·입력 동작이나 design-sync 통과 주장은 아니다.
- 확정한 초안 배치: 280px 패널, 기존 Inspector 자식 스타일 유지 및 278px 독립 스크롤 영역, 24px 화면 크기 핀, 410px 대화상자. Canvas의 생성 진입은 New canvas comment, Selection은 New selection comment이며 목록 범위 전환은 기존 초안 대상을 바꾸지 않는다. 확인 전 불명확한 저장의 원래 payload는 읽기 전용이고 pending request를 유지한다.

- P-I 완료: 실제 Electron 임시 prototype에서 create/edit 각각 8개 이동 경로의 보류·취소·저장 실패·원래 대상 저장 후 전환과 두 모드의 실제 종료를 확인했다. 실제 이전 selection/hover 응답과 독립 핀 generation 교차를 검사했다. 최종 600회 측정의 p95는 100개 대상 scroll/resize/mutation 각각 18.1/18.5/18.2ms, 1,000개는 16.9/19.2/18.4ms였다. 누락·stale 반영 0, stale drops 660이며 guard 제거 음성 대조는 stale 반영 1건을 검출했다.
- P-I 한계: 저장은 메모리 prototype이며 제품 JSONL·IPC·최종 UI·일반 캔버스 성능 검증이 아니다. IME는 CDP composition만 검증했고 native OS IME와 Discard 분기는 구현 단계에 남는다. 전체 기존 e2e와 prototype의 선행 실행은 통과했고, 마지막 실행은 이미 통과한 기존 suite를 제외한 focused PoC였다. 원본 코드 3개를 복원했고 새 제품 코드 commit은 없다.
- P-I handoff·재현 patch·원자료를 `.scratch/comments-ui/evidence/P-I/`에 보존하고 patch와 원자료의 복사본 일치를 확인했다. D/D-fix/P-H/P-I 터미널을 모두 release했고 cu-draft/cu-ph/cu-pw를 Orca로 삭제했다. Orca 목록에 지휘자 루트만 남으며 reclaimable 터미널은 없다.
- 현재 중단점: writer mkdir 경쟁 실패로 제품 구현 F 이후는 시작하지 않았다. 사용자에게 앱 전용 Go mkdir helper 도입을 추천하고 답변을 기다린다. 공개 CLI/MCP 코멘트 쓰기는 확장하지 않는 안이며, helper 설계 확정 후 별도 경합 PoC를 통과해야 한다. 이번 브랜치는 아직 push/PR하지 않았다.

- 2026-10-23 사용자 재시도 요청: P-W를 같은 Task의 새 Dispatch로 재시도한다. Astra medium으로 기존 Node/Electron API의 대안을 독립 검토하고 같은 디렉터리·파일 경합 기준을 검증한다. 새 helper 도입 승인으로 해석하지 않는다. 실험 소유 범위는 격리 워크트리의 임시 fixture와 증거이며 제품 구현은 계속 대기한다.

- P-W 재시도 `ctx_8d04ca03c0d7`: Astra medium과 turnStart observed를 확인했다. 기존 Electron utilityProcess에서 단발 작업의 cwd를 안전하게 연 디렉터리 fd와 bigint dev/ino로 대조하고 한 단계 상대 mkdir을 수행했다. 지휘자가 소스를 직접 검토하고 bigint 비교 및 실제 생성 위치 assertion을 보강시켰다.
- P-W2 결과: 49개 결정적 관찰에서 원래 디렉터리를 내부에 옮긴 뒤 외부 symlink로 교체하는 경우는 외부 불변을 유지했다. 누락된 .doan/comments 생성, 기존·신규 파일의 no-follow open, 검증 제거 음성 대조를 확인했다. 원래 디렉터리 자체를 외부로 옮긴 뒤 mkdir하는 추가 사례는 외부 항목을 생성했다. 공격자의 이동 직후와 writer 실행 후를 비교했으므로 이동 자체를 writer 변경으로 센 결과가 아니다. 전체 writer 게이트는 실패로 유지한다.
- 실행 범위 정정: 로그의 runtime-test PASS는 기존 전체 suite 통과가 아니라 임시 writer PoC의 focused 실행이다. build·typecheck와 실제 사용자 데이터 fingerprint 불변을 확인했다. 최초 40개, 최종 49개 관찰이며 제품 writer·패키징·IPC는 미검증이다.
- 다음 추천은 새 Go helper 도입이 아니다. 검증한 원래 디렉터리 객체를 쓰기 권한의 경계로 삼고, 그 객체 자체가 외부로 이동되는 경우를 보장 범위에서 제외할지 결정해야 한다. 이 경우에도 symlink가 가리키는 다른 외부 디렉터리로 쓰기가 새는 것은 금지한다. 현재 design §8의 외부 불변 조건을 바꾸는 결정이므로 아직 채택하지 않았다. mkdirat도 열린 디렉터리 객체를 기준으로 하므로 그것만으로 이동 문제를 해결하지 못한다는 것은 API 의미에 따른 추론이며 Go 실측 결과는 아니다.
- P-W2 handoff와 증거를 `.scratch/comments-ui/evidence/P-W2/`에 보존하고 복사본 hash 일치를 확인했다. tracked 변경과 미통합 commit이 없음을 확인한 뒤 worker-release와 Orca 자식 워크트리 삭제를 수행했다. 제품 코드 변경·push·PR은 없다.

- 2026-10-23 사용자 승인: 원래 검증한 디렉터리 객체 자체의 외부 이동은 보장 범위에서 제외하고, symlink가 가리키는 다른 외부 객체로 쓰는 것은 금지한다. 기존 Electron 단발 utilityProcess 방식으로 진행한다. P-W2 증거는 이 경계에서 PoC를 통과하며 과거의 더 넓은 기준에서 실패한 기록은 그대로 남긴다.
- F 착수: schema/fixtures/fold 및 필요 시 기존 Go/TS fixture runner 테스트만 소유한다. Sol medium, go test/app test로 v1 호환성을 확인한다. R-PW는 Astra medium 읽기 전용으로 승인된 경계와 P-W2 증거의 일치 및 구현 필수 조건을 독립 검토한다. 두 배치는 코드 소유가 겹치지 않는다. R-PW 통과 전 writer 제품 구현은 시작하지 않는다.

- R-PW `ctx_8e53e5671135` 통과: 원자료 49개와 checksum 23개 일치를 확인했고 차단 결함 0개다. 단발 IPC·종료·각 단계 재검증 등 운영 필수 조건을 `.scratch/comments-ui/evidence/R-PW/handoff-CU-R-PW.md`에 보존했고 M/V가 따른다. 검토 터미널을 release했다.
- R-F: Astra medium, v1 교차 언어 fixture의 의미와 검증 주장을 독립 검토한다. 읽기 전용이며 `69b0e3f`를 대상으로 한다. F 통합 뒤 C는 app/src/comments/의 신규 순수 모듈과 테스트만 소유한다. C 모델은 Astra medium이며 판단이 필요한 시간·초안·대상 계약을 담당한다.

- F `69b0e3f` → `bd05032` 통합. R-F red/yellow 0개이며 통합 HEAD에서 Go 전체·앱 915개·typecheck 통과했다. 호환성 fixture라 TDD red는 대상 아님을 명시했다. handoff/증거 hash 일치·clean·git cherry 미통합 없음 확인 뒤 F/R-F release 및 cu-f의 Orca 카드 삭제·목록 부재를 확인했다. C는 확정 brief의 app/src/comments/ 순수 모듈과 테스트를 구현한다.

- M1 분리: tasks 4의 안전한 디렉터리/파일 I/O 기반을 C와 병렬 구현한다. 소유는 신규 app/src/main/comments/의 filesystem·mkdir child·wrapper와 테스트, app/electron.vite.config.ts의 child 번들 entry, 기존 e2e harness에 연결하는 파일 경계 검사다. Astra medium — 단발 프로세스·파일 경합 판단. R-PW 검토 통과가 선행이며 event 준비·author/hash·재시도·preload·renderer는 후속 M에 남긴다. C의 순수 모듈과 파일이 겹치지 않는다.

- C 구현 보고: 테스트 `3871df6/a887716/f9a899f`, 구현 `ca7ef96`. 964개 테스트·typecheck·기존 전체 e2e 통과이며 UI 연결 완료를 뜻하지 않는다. R-C는 Astra medium 읽기 전용, 시간·충돌·초안·clip 경계를 검토한다. 소유는 보고서뿐이며 cu-c의 고정 commit 범위를 읽는다.

- C 통합 HEAD `4fa6151`: 964개 테스트·typecheck·전체 e2e 통과. R-C red/yellow 0개이며 별도 49개 집중 테스트도 통과했다. C/R-C release, 증거 복사 일치·clean·git cherry 확인 후 cu-c를 Orca로 삭제했고 목록 부재를 확인했다.
- M1 보고 HEAD `ecd44c0`(테스트 `6b0017b/55ab9e3`): 955개 테스트·typecheck·Go test/vet·파일 경계 66개를 포함한 전체 e2e 통과. R-M1은 Astra medium으로 경합·단발 프로세스·실패 정산과 실제 증거를 독립 리뷰한다. 제품 연결은 아직 없다.
- A 착수: C를 선행으로 main/canvasScript·renderer/CanvasController/canvasMessage 및 신규 anchor/pin 모듈·테스트를 소유한다. Astra medium — 문서·좌표·독립 요청 경계 판단. e2e/runtime.ts는 M1 수정 가능성이 남아 있어 지휘자의 별도 소유권 해제 전에는 편집하지 않는다. A는 독립 코드를 먼저 끝내고, 해제가 안 되면 runtime 연결만 deferred로 보고한다. M1 소스·main IPC/hash·App/RightPanel CRUD는 수정하지 않는다.
