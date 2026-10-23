# comments-ui — 작업 순서

`spec.md`의 Q1–Q9을 적용한다. 현재 단계는 문서 계획이다. 구현은 `/feature-review` → `/design-draft`와 사용자 확인 → `/orchestrate` 또는 합의된 구현 흐름으로 진행한다. 아래 commit은 구현 때의 경계이며 이번 `/feature`가 실행하지 않는다.

## 0. 입력·다중 대상 PoC와 문서 검토

- `/feature-review`로 명세·안전한 writer·문서/hash 결합·초안 이동 보류를 교차 검토한다.
- 구현 브랜치의 임시 fixture로 design §8의 입력 보류와 다중 대상 성능 PoC를 실행한다. 100/1,000개 대상, scroll/resize/mutation 각 100회, p95 50/200ms 기준과 누락·stale 반영 0건을 실행 전에 고정한다. 기존 hover/selection seq·iframe 경계·IME·키보드·Alt 동작을 보존한다. 미달하면 설계를 재검토하며 제품 구현을 진행하지 않는다.
- canvas bytes hash와 열린 문서 세대를 연결한다. 동일 URL reload·HEAD·canvas fetch의 응답이 겹쳐도 열린 문서의 전달 바이트 hash가 맞아야 한다. 응답 도중 파일 변경은 create 거부, 이전 문서 지연 응답은 새 hash에 영향 없음이 통과 조건이다.
- writer PoC는 `.doan` symlink 교체 후 디렉터리 생성·기존 파일 open·새 파일 생성 각각에서 symlink가 가리키는 다른 외부 파일과 디렉터리가 그대로인지 확인한다. 검증한 원래 객체 자체의 외부 이동은 2026-10-23 사용자 승인에 따라 제외한다. 안전한 mkdir 경로가 없으면 파일 open 보호만으로 통과시키지 않는다.
- 초안 확인 전에는 위 임시 실험만 수행하고, 제품 기능 구현은 task 1의 사용자 초안 확인 뒤 진행한다.
- 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run build`, `npm --prefix app run e2e`. 실험 자체의 별도 실행 명령이 필요하면 command undecided — needs user confirmation; 기존 runtime suite 안의 임시 fixture로 우선 검증한다.

── commit: 검토된 feature 문서와 PoC 결론(제품 결정은 해당 문서 승격 시 영어로 기록) ──

## 1. 디자인 초안과 사용자 확인

- design의 필수 상태를 초안에 담고 기존 280px 패널·토큰과 함께 검토한다. pin 겹침과 미저장 이동 확인 동작까지 그린다.
- 검증: `go run ./cli/cmd/doan ls --repo . --json`, `go run ./cli/cmd/doan check --repo . --json`; 사용자가 앱에서 초안을 확인하기 전 구현하지 않는다.

── commit: design draft ──

## 2. 공유 형식과 fixture

- v1 유지 여부를 재확인하고 기존 create/edit/delete/resolve/reopen·fold fixture를 재사용한다. 앱 작성 결과와 Go 읽기가 같아야 하는 Unicode·동일 밀리초·중복·마지막 LF 없음 사례를 추가한다.
- 검증: `go test ./...`, `npm --prefix app test`. 형식 변경이 필요해지면 독자 확장하지 않고 명세를 다시 결정한다.

── commit: schema-compatible fixtures/tests ──

## 3. 순수 함수 /tdd → 구현

- 목록 projection, target matching, event preparation, draft transition, pin projection, outdated, copy text의 인터페이스와 실패 조건을 고정한다.
- 열린/해결 목록·scope, 충돌/삭제, hash unknown, 저배율·클립, 특수문자 복사, 지연 응답으로 전환 실패를 검사한다. 같은 DOM을 가리키는 프레임·요소 코멘트는 핀과 Selection/Open 목록에 같은 수로 나오며 자식은 제외한다.
- 시간 계산은 빈 파일·now가 더 큰 경우·미래 maxAt·밀리초 절삭·불가능 날짜·연도 끝 overflow를 검사한다. fold에 남지 않은 허용 이벤트도 maxAt에 포함한다. 기대값은 `max(truncateUTCms(now), maxAt + 1ms)`이고 빈 파일은 절삭한 now다.
- 검증: `npm --prefix app test`, `npm --prefix app run typecheck`; 새 행동 테스트는 구현 전 red를 확인한다.

── commit: tests → pure implementation ──

## 4. main I/O·IPC·watcher

- 안전한 파일 읽기/생성/단일 append, git 작성자 조회, hash, 재시도 id, preload 좁은 API와 main-frame 검증을 구현한다.
- 코멘트 수가 같아도 갱신되는 watcher를 연결하고 servedRev·iframe reload와 분리한다. 손상 줄·미지원 버전·권한·부분 쓰기·stale 요청을 사용자 오류로 전달한다.
- append 성공 직후 응답 유실 → 동일 request id 재시도에서 create 이벤트와 코멘트가 각각 하나인지 검사한다. 동일 요청의 다른 payload 거부, 확정 이벤트의 at/by/body 불변, partial write·동일 event id 충돌·확인 불가 시 추가 기록과 성공 표시가 없는지를 검사한다.
- canvas id 누락·오류·중복은 쓰기 불가, 다른 root의 동일 canvas id는 정상 분리됨을 검사한다. width 오류만 있을 때 기존 코멘트 수정·해결은 가능하고 신규 create는 거부한다.
- 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `go test ./...`; 임시 repo에서 app 이벤트를 기존 Go reader/fold가 읽고 CLI resolve를 app fold가 읽는 round trip, 외부 파일 불변, 마지막 LF, concurrent append, symlink 교체와 대소문자 충돌을 검사한다.

── commit: I/O and IPC ──

## 5. 캔버스 위치 조회·핀

- 독립 request/generation으로 여러 anchor를 조회한다. 유일 대상·위치 없음·현재 viewport를 구분하고 overlay 그룹 핀과 키보드 접근을 구현한다.
- 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run build`, `npm --prefix app run e2e`; scale 0.05/0.25/1/4, pan/inner scroll, reload/old iframe, 중복 id, 대기 선택과 pin 조회 응답 교차, 포커스 이동을 실제 창에서 확인한다.

── commit: anchor geometry and pins ──

## 6. 패널 CRUD·초안 보호·복사

- Q1 목록 전환, 세 종류 target 생성, Open/Resolved, 카드 동작, 이름 미설정, 외부 충돌, Q3 이동 보호를 구현한다.
- Q6의 두 복사 범위·Copied/오류, 빈 목록과 resolved 단일 복사 비활성을 연결한다. copy는 agent 실행을 하지 않는다.
- 편집 중 DOM 대상이 사라져도 기존 comment id 수정은 가능하고 신규 create는 불가한지 검사한다. 프로젝트 닫힘·코멘트 삭제·본문 충돌은 별도로 거부한다. width 오류에서도 전체 목록의 기존 관리 기능과 열린 코멘트 복사를 유지하고 새 작성·핀은 비활성화한다.
- Esc·빈 공간·수동 Reload·제어 가능한 Alt 링크 탐색·일반 종료에 Q3를 적용한다. 확인창 Esc는 계속 작성이며 포커스가 작성기로 돌아온다. 이름 설정 뒤 Retry, 충돌 뒤 최신 상태 다시 읽기, 기록 확인 전 중복 저장 차단을 실제 입력으로 확인한다.
- 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run build`, `npm --prefix app run e2e`; 실제 작성/수정/삭제/해결/재열기, 이동 시 저장 실패/버리기/취소, 숨김·종료, clipboard 내용·원래 clipboard 복원, HTML처럼 생긴 본문의 텍스트 렌더링을 확인한다.

── commit: comment UI ──

## 7. 통합·회귀·독립 리뷰

- 임시 repo/userData/DOAN_RUNTIME으로 인간 작성 → CLI 읽기 → CLI 해결 → 앱 재열기 흐름을 검증한다. 실제 에이전트 호출과 전역 설정 변경은 필요하지 않다.
- 경계 방어를 하나씩 제거해 해당 검사가 red인지 확인한다: sender, 파일 경계, append LF, stale reply, draft target, comments-only no-reload. 묶음 mutation 결과를 개별 증명으로 보고하지 않는다.
- 검증: `go test ./...`, `go vet ./...`, `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run build`, `npm --prefix app run e2e`; screenshots를 열고 확인한 뒤 `/code-review`, 결함은 red→green 수정과 `/postmortem`으로 남긴다.

── commit: integration regressions; 문서별 postmortem ──

## 8. design-sync

- 승인된 초안과 실앱의 computed style을 상태·자식별로 측정한다. 의도적인 차이와 미검증 상태를 분리하고 같은 독립 리뷰어로 후속 검토한다.
- 검증: `node .scratch/design-sync/comments-ui/measure.mjs`, `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run build`, `npm --prefix app run e2e`; 미분류 차이 0, 측정 누락 명시. 첫 구현 전 핀/오류/초안 확인창도 포함한다.

── commit: 필요한 수정 → docs/DESIGN.md ──

## 9. 승격

- PRODUCT에 #7 완료, Q1–Q9과 실제 구현 결과·한계·날짜·이유를 영어로 승격한다. Q7의 width 오류 정책, Q8의 목록/핀 그룹 일치, Q9의 사전 성능 검증과 실측 한계를 빠뜨리지 않는다.
- ARCHITECTURE §2의 앱 writer, §3 핀/독립 메시지, §7 preload, §13 comments invalidation을 갱신한다. v1·open-only CLI/MCP·서빙 경계 유지 여부를 명시한다.
- DIRECTORY·DESIGN·runtime-test 스킬과 지속 사용할 명령이 달라졌다면 AGENTS를 갱신한다. 불필요한 운영 문서는 만들지 않는다.
- spec 완료 조건 12개를 각각 구현·테스트·측정 근거에 대응시키고, 승격 후 `docs/features/comments-ui/`를 삭제한다.
- 검증: 문서 검토로 Q1–Q9·writer·pins·outdated·copy·미검증 범위의 누락과 충돌이 없고 기능 디렉터리가 삭제됐는지 확인한다. 최종 코드에서 `go test ./...`, `go vet ./...`, `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run e2e`가 통과해야 한다.

── commit: 문서마다 분리 → feature 문서 삭제 ──

구현 브랜치의 push·PR은 `/orchestrate`의 마지막 단계다. 이번 `/feature`는 세 문서만 main에 commit·push한다.

## 문서 리뷰 기록 — 2026-10-23

제품·기술·QA·UX/UI 네 관점의 읽기 전용 리뷰를 진행했다. 사용자가 정합성 수정 일괄 반영과 별도 추천안 Q7–Q9를 승인했다. create/edit 저장 조건, 시간식, immutable 재시도, writer/hash PoC, 캔버스 자격 검사, 입력 보호·복구, 그룹 기준과 성능 게이트를 반영했다. 기술·QA 후속 검토에서 기존 지적 해소를 확인했다. 코드·빌드·테스트는 실행하지 않았으며 task 0 PoC와 실제 UI 검증은 남아 있다.
