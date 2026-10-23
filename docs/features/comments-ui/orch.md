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
| M | 4 main I/O·IPC·preload·watcher 및 테스트 | C,M1 | Astra medium — 파일 안전성·재시도 | app test/typecheck, go test, reader round trip | 15cb445 통합·최종 독립 리뷰 통과 |
| A | 5 anchor 조회·핀 geometry·overlay 및 테스트 | C; M과 공유 파일 겹치면 직렬 | Astra medium — 문서·viewport 경계 | app test/typecheck/build/e2e | 465d44b 통합·최종 독립 리뷰 통과 |
| U1 | 6 패널 표시 컴포넌트·테스트·스타일 | C,A | Astra medium — 표시 상태·접근성 판단 | app test/typecheck, 실앱은 U2/S | 817bde1 통합·독립 리뷰 통과 |
| U2 | 6 App CRUD·초안·복사·이동 보호와 실제 runtime | M,A,U1 | Astra medium — UI 상태·입력·비동기 경합 | app test/typecheck/build/e2e | ctx_349dc3aada7e 구현 중 |
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

- 지휘 재개: M1 독립 리뷰는 red/yellow 0이며 40개 focused 검사와 증거 검증을 확인했다. M1 세 커밋을 c790b50/95d8ed5/73d9c6d로 통합하고 통합 게이트를 실행한다. R-M1과 A의 종료 보고를 수락하고 터미널을 release했다.
- A 첫 구현은 5202094까지 완료했지만 전체 e2e의 folders after restart가 두 번 실패했다. baseline 결함이라고 단정하지 않는다. 같은 Task를 Astra medium으로 재시도한다 — tooltip/실제 경로와 테스트 경계를 판단해야 한다. 기존 cu-a에서 통합 브랜치를 병합한 뒤 원인을 재현·수정하고 전체 runtime을 재검증한다. app/e2e/runtime.ts 소유권을 A에 해제하며 M1 검사를 보존한다. 실제 Electron 검증 슬롯은 A 단독이다.
- M은 C/M1 API 위에 main 서비스·IPC·preload·hash·watcher를 구현한다. Astra medium — 신뢰 경계·문서 세대·재시도 판단. 소유 범위와 검증은 지휘자 .scratch/comments-ui/briefs/M.md로 고정하며 A의 canvasScript/renderer/runtime 파일과 겹치지 않는다. A의 runtime 종료 전에는 단위·타입 검증을 진행한다.

- M1 통합 HEAD에서 단위 1004개·typecheck·go test/vet 통과. 증거 50개 checksum 일치와 미통합 커밋 없음·clean을 확인한 뒤 cu-m1을 Orca로 삭제하고 목록 부재를 확인했다. 통합 전체 e2e는 A의 M1 포함 재검증에 이어 지휘자가 실행한다. A 재시도 ctx_3dab8d9989a2와 M ctx_f5a7e17510ae 모두 Astra medium 및 turnStart observed 확인.
- R-A 사전 독립 리뷰: Astra medium — 문서/선택 세대·핀 guard 경합 판단. 8e20296..5202094의 고정 커밋만 git show/diff로 읽고 실행·수정하지 않는다. A가 실패 runtime을 수정하는 동안 제품 핀 코드의 추가 결함을 먼저 찾으며, 최종 수정 diff와 실행 증거는 별도 후속 리뷰한다.
- R-A 고정 커밋 리뷰 ctx_485618f15ead 완료: red 0 / yellow 4. 기존 선택에서 다음 선택 명령의 응답보다 anchor가 앞서는 경우, 같은 anchor DOM 교체, 발송 후 새 pin intent/binding 교체, visibility 복구 자식의 가시성 검사를 지적했다. 정적 시나리오이며 실행 재현은 A 수정 배치에서 확인한다. 리뷰 터미널 release 완료.
- A-fix 배치: Astra medium — 비동기 선택/핀 의도 경합의 회귀 판단. 같은 cu-a의 A 소유 파일에서 위 4건을 각각 red→green으로 고정하고 전체 runtime·anchor 검증 후 독립 후속 리뷰한다. brief .scratch/comments-ui/briefs/A-fix.md. 현재 A 재시도 종료를 수락한 뒤 새 Task로 시작한다.
- R-M 배치: Astra medium — main 권한·파일/문서 경계·재시도 감사. M의 최종 고정 HEAD를 읽기 전용 리뷰하고 focused 검사로 보고를 검증한다. brief .scratch/comments-ui/briefs/R-M.md. M 종료 뒤 시작한다.
- M 첫 시도는 31cbbc1까지 커밋·clean 및 1039 tests/typecheck/Go test/vet/build 보고 뒤 인계 파일·worker_done 없이 최종 응답으로 끝났다. transcript 마지막 turn과 인계 부재를 확인한 뒤 worker-stop으로 종료를 확정했다. 같은 Task 재시도는 Sol medium — 코드 변경 없이 API·로그·commit을 정리하는 기계적 인계 복구다. 원래 제품 구현을 재실행하지 않으며 실제 runtime은 여전히 보류다.
- R-M 독립 리뷰 완료: red 0 / yellow 2. 종료 미확인 utility child 뒤 재진입 허용과 무관한 HTML 응답 256개로 활성 문서 기록 퇴출을 probe로 확인했다. M-fix는 같은 cu-m에서 Astra medium으로 수정한다 — 종료 불확실성과 활성 문서 보존·제한된 기록 수명 판단. 지적별 red→green과 U 계약 인계를 요구하며 실제 Electron 슬롯은 M-fix에 배정한다. R-M 터미널은 release했다.
- A 후속 리뷰 첫 시도는 모델 capacity 오류로 작업을 시작하지 못했다. terminal 오류와 done 상태를 확인해 stop한 뒤 같은 Task를 Astra medium으로 재시도했다. ctx_e86eb826af37의 실제 리뷰 착수는 별도 확인한다.

- A 최종 리뷰 ctx_e86eb826af37은 실제 착수 후 red/yellow 0과 focused 201개·typecheck 통과를 보고했다. A 8개 커밋을 465d44b까지 통합했고 지휘자 통합 단위 1015개·typecheck exit 0을 확인했다. A 원본 증거 34개 복사본 일치, clean·git cherry 미통합 없음 확인 뒤 cu-a를 Orca로 삭제하고 목록 부재를 확인했다. A 회고 3건과 기존 선택 경합 재발을 최신 날짜 순으로 기록했다.
- M 인계 복구 ctx_1dc48e71de56 완료·release, 원본 로그 17개와 API 인계 보존. 지휘자가 고정 HEAD 31cbbc1에서 1039개 단위·typecheck exit 0을 직접 확인했다. R-M ctx_8bcd33ac530e는 red 0/yellow 2와 focused 84개·typecheck 통과 후 release했다. M-fix ctx_aec82c0ad123 실제 착수 확인; 리뷰된 A 통합 브랜치를 clean checkpoint에 병합하고 실제 전체 runtime도 검증하도록 배정했다.
- M 실제 앱에서 최초 문서 commentsBegin이 loaded response 검증 실패로 거부됐다. 전체 기존 runtime 통과로 대체할 수 없는 M 차단 게이트로 유지하고 같은 소유 워커가 CDP 응답·문서 연결을 재현·수정한다.
- 지휘 판단 — U를 U1/U2로 분리한다. U1은 M과 무관한 패널·카드·작성기·확인창 표시 컴포넌트와 동작 테스트(tasks 6 부분)를 먼저 구현한다. 새 renderer CommentsPanel 및 제한된 보조 UI/테스트/스타일만 소유하며 기존 App/RightPanel/Controller/main/preload는 편집하지 않는다. Astra medium — 승인 초안의 상태·접근성·표시 조건 판단. 기준 브랜치의 C/A 타입만 사용하고 실제 IPC·초안 전환·통합 runtime은 U2가 M 통합 뒤 맡는다. U1 검증은 red→green unit/typecheck, runtime은 명시적으로 보류한다. Electron 슬롯은 M 전용으로 유지한다.
- M-fix의 실제 최초 문서 실패는 OOPIF process swap 때의 frameDetached 처리로 좁혀졌고 b604aca→cd18a90 회귀/수정 커밋이 추가됐다. R-M 후속 리뷰는 고정 77d909e를 Astra medium으로 읽기 전용 검토한다 — 종료 미확인 루트 차단·응답 보존·swap/실제 detach 경계 판단. 실행 중인 M 최종 runtime과 병렬이며 이후 제품 diff가 생기면 별도 재검토한다. 미도착 실행 증거는 보류로 기록하고 기다리지 않는다.
- M-fix 77d909e에서 최종 1054 tests/typecheck/Go test/vet 및 실제 최초 로드·300 fetch·reload·iframe 제거·전체 runtime exit 0을 확인했다. R-M 후속 리뷰는 기존 두 지적을 해소했지만 옛 OOPIF 세션 detach가 새 소유자의 frame을 retire하는 yellow 1을 mock probe로 발견했다. M-fix2는 Astra medium — 세션 소유권·늦은 이벤트 경합 판단. 같은 cu-m의 inspector와 회귀 테스트를 좁게 수정하고 현재 소유자 실제 detach 무효화는 유지한다. 실제 Electron 슬롯은 M-fix2에 배정한다. 이전 구현·리뷰 터미널은 release했다.
- M-fix2 고정 ce2fa80의 후속 리뷰를 Astra medium으로 병렬 진행한다. 범위는 77d909e..ce2fa80의 inspector 소유권 수정·테스트와 기존 마지막 yellow의 해소다. 기존 승인 영역을 반복 확장 리뷰하지 않고 새 변경이 만든 구체적 문제만 확인한다. 현재 실제 runtime 실행은 M-fix2가 전용 슬롯에서 계속한다.

- M-fix2 ce2fa80의 독립 리뷰는 red/yellow 0이다. 1072 tests·typecheck·build·실제 집중/전체 runtime 통과 증거를 확인했으며 세션 교체 자체는 mock 검증 한계로 남긴다. 구현/리뷰 터미널을 release하고 M 통합을 진행한다.
- U1 8b523a6은 표시 컴포넌트와 16개 테스트를 완료했다. R-U1을 Astra medium으로 배정한다 — 초안 상태·복구·접근성 판단. 41eddc3..8b523a6만 읽기 전용 리뷰하며 실제 Electron과 App 연결은 U2/S 검증으로 남긴다. U1 터미널은 release했고 리뷰 중인 cu-u1은 보존한다.

- M을 15cb445까지 통합하고 지휘자 단위 1072개·typecheck exit 0을 확인했다. U1은 독립 리뷰 red/yellow 0 후 817bde1까지 통합했다. disabled 정규식의 비차단 테스트 보완은 U2가 실제 상호작용 검증과 함께 반영한다.
- U2 배치: Astra medium — 실제 저장 요청·초안·선택/이동 보호·늦은 응답의 상태 경합 판단. C/A/M/U1이 통합된 브랜치에서 시작하며 .scratch/comments-ui/briefs/U.md 소유 범위로 전체 App 연결을 맡는다. 단위/typecheck/build/실제 e2e 및 원래 초안 보존을 검증한다. Electron 슬롯은 U2에 배정한다.
- 지휘 세션 자체에서 capacity 오류가 반복됨을 terminal 출력으로 확인했다. 컨텍스트는 압축됐으며 작업 상태를 커밋/인계에 보존했다. 워커 R-U1은 오류 없이 완료했고 release했다.

- U1 포함 통합 단위 1088개·typecheck exit 0을 확인했다. M/U1의 .scratch 증거 131/8개를 지휘자 evidence/archive에 복사하고 byte checksum 일치를 확인했다. clean·git cherry 미통합 없음·리뷰 종료 확인 후 두 child를 Orca로 제거했으며 worktree 항목 부재를 확인했다. U2 ctx_349dc3aada7e는 실제 App 테스트 작성에 착수했다.

- U2가 Electron 45 clipboard.writeText의 Promise 반환을 M이 await하지 않아 실패에도 copied:true를 반환하는 결함을 발견했다. 설치된 electron.d.ts와 service.ts에서 직접 확인했다. 기존 M 워커는 종료됐으므로 U2 소유 범위를 service.ts의 clipboard 계약·await와 해당 회귀 테스트로 좁게 확대한다. reject 시 성공 금지와 완료 전 응답 보류를 red→green으로 검증하고 독립 U2 리뷰에 포함한다. 다른 M 권한/재시도 규칙은 변경하지 않는다.

- U2 구현 checkpoint 37dfee4에서 R-U2 읽기 전용 리뷰를 병렬 배정한다. Astra medium — 실제 App 상태/이동 보호·늦은 응답·clipboard 완료 경계 판단. 9a997e5..37dfee4 고정 diff만 검토하고 제품 파일을 수정하지 않는다. U2의 실제 Electron 검증 슬롯은 유지하며, 미도착 최종 증거와 이후 diff는 후속 리뷰한다.

- V를 파일 소유와 선행조건에 따라 분리한다. V1은 이미 통합된 main sender·filesystem·append LF 방어를 각각 임시 제거해 의미 있는 red와 복원 green을 검증한다. Astra medium — 방어별 독립 증명의 판단. 별도 child의 scratch 및 필요한 main 회귀 테스트만 소유하며 제품 변경·Electron 실행은 금지한다. U2/R-U2와 병렬이며 UI stale reply·draft target·comments-only no-reload와 최종 전체 게이트는 V2가 U2 통합 뒤 맡는다.

- R-U2 9a997e5..6f92ead 리뷰는 red 1/yellow 2다. schema/fold 허용 날짜의 RelativeTimeFormat 예외, 카드 lifecycle 충돌의 최신 상태 복구 부재, 승인된 삭제 확인창 누락을 발견했다. 기존 집중 190개 통과에도 독립 probe 3개가 실패했다. 현재 U2 Task의 수정 범위로 전달해 red→green 및 실제 App 충돌/삭제 확인을 요구했다. 리뷰 워커는 release했다. 최종 U2 인계·raw 증거 감사는 별도 후속 리뷰로 남긴다.

- V1 완료: IPC handler 6개·sender helper 5개·symlink no-follow 3개·LF 2개가 각각 방어 제거 시 behavioral red, 복원 시 green이다. 최종 focused 148개/typecheck/Go test/vet 통과, 제품 변경·커밋 없음. IPC는 mock, filesystem은 실제 open이나 mkdir는 mock이라는 한계를 유지한다. 증거 85개 byte 일치와 소스 복원 checksum·clean·미통합 없음 확인 후 release 및 cu-v1 제거·목록 부재를 확인했다. V2에 남은 UI 방어 3종 및 실제 통합 검증을 넘긴다.

- U2 리뷰 수정 checkpoint dab5760(제품 수정 6fe80e3, 회귀 22fab02/dab5760)을 R-U2 후속 리뷰에 배정한다. Astra medium — 날짜 렌더링·카드 충돌 재검토·삭제 확인의 정확성 판단. 이전 리뷰 HEAD 6f92ead 이후의 composition 보호 및 실제 App 테스트 추가도 누락 없이 포함한다. 실제 창 최종 검증은 U2가 계속 단독 실행한다.

- R-U2 후속 리뷰 6f92ead..dab5760은 기존 red 1/yellow 2 해소, 새 red/yellow 0이다. 독립 수정 probe 포함 100개 검사 통과. 실제 App 실패 주입과 실제 파일/clipboard 성공 증거를 구분했고 OS-native IME·디자인 실측은 미검증으로 유지한다. 리뷰 터미널 release. U2 전체 runtime 최종 PASS를 관찰했으며 최종 HEAD/exit/인계의 증거 귀속 감사 뒤 통합한다.

- 전체 runtime PASS 뒤 U2가 9c96f3b→721e155를 추가했다. 이동 승인 동안 달라진 목적지 메타데이터를 최신 조회 결과로 적용하는 CanvasController 6줄 수정이다. Astra medium의 독립 delta 리뷰를 배정해 기존 승인 범위를 재검토하지 않고 이 경합 수정·회귀만 확인한다. 최종 증거의 HEAD 귀속도 갱신한다.
