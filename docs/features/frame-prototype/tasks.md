# 단일 프레임 프로토타입 작업

## 검증표

| 경계 | 확인할 결과 |
|---|---|
| 지원·선택 | 표시 없음/잘못된 표시/요소 선택/중복·소실 ID/빈 목록은 실행 불가. 서랍은 이동+선택만 하고 재생하지 않음 |
| viewport·입력 | 창 크기와 innerWidth/innerHeight/media query 일치, 보드 자동 높이 없음, Tab·V/H·Space·Esc 콘텐츠 전달, 입력·모달·스크롤·모션·상대 자산 동작 |
| 창 수명 | 메인 화면 이동·숨김에도 유지, 같은 대상은 활성화·상태 유지, 다른 대상은 프레임 크기로 변경·상태 초기화, ⌘W는 프로토타입만 닫고 Quit은 전체 종료 |
| 경합·정체성 | A 로딩 중 B 실행, 재로드 중 지원 제거, 소실·복구, 닫은 뒤 늦은 응답, 다른 worktree의 같은 ID를 구별 |
| 거부 경계 | 링크·location·중첩 frame 내비게이션, 팝업·다운로드·native submit, 위조/다른 루트 실행 요청 거부. fetch는 기존 정책 유지 |
| 메인 상태 | 프로토타입 열람·실패·조작이 메인 선택·초안·읽음 기록·설정·첨부를 바꾸지 않음 |
| 읽음 분리 | `canvas-activity-notices` 병합 뒤라면 미읽음 캔버스를 프로토타입으로만 열고 원본을 바꿔 자동 재로드해도 Dot·공유 읽음 기록이 그대로이고, 메인 캔버스에서 열었을 때만 읽음 처리됨 |
| 피드백·포커스 | 로딩/Retry/Close/소실 안내, 자동 복구 시 비활성 유지, 버블 소실·창 닫기 포커스, 버튼 키보드·비활성 이유 |

## 작업 순서

- [ ] 1. 2번의 프레임 선택 계약을 확인하고, 격리 앱 PoC로 설계의 종료 조건과 검증표를 조사한다. 지원 속성·runtime-only 프레임·식별자·가이드·형식 버전을 고정한다. 검증: `DOAN_CLI=<abs path to doan> npm --prefix app run dev -- -- --user-data-dir=<tmp>`; AGENTS.md의 HOME·SHELL·에이전트 설정 격리를 적용한다. 미검증 구성을 지원으로 표시하지 않는다.
- [ ] 2. `/feature-review` 후 도구 바·서랍 메타·크기 버블·프로토타입 로딩/실패/소실 초안을 `/design-draft`로 작성해 사용자 확인을 받는다. 검증: `doan check --repo . --json`, `doan ls --repo . --json`.
- [ ] 3. 관례와 필요한 schema·TS/Go fixture를 먼저 고정하고 순수 실행 조건·창 수명·요청 검증을 `/tdd`로 작성한다. 검증: `go test ./...`, `npm --prefix app test`. **계약 커밋 경계**.
- [ ] 4. sandbox 창·제공/주입·실행·재로드·복구를 구현한 뒤 UI를 연결한다. 검증: `npm --prefix app test`, 작업 1의 격리 앱에서 검증표 전체를 확인한다. 기존 캔버스 gate 통과만으로 프로토타입의 이동 금지를 검증했다고 하지 않는다. **구현 커밋 경계**.
- [ ] 5. `/design-sync`·`/runtime-test`·`/code-review`와 가이드/검사 변경에 대한 `/agent-eval`을 수행한다. 검증: `npm --prefix app run package`, `node eval/run.ts` 및 `node .agents/skills/verify/scripts/verify.mjs`. 실제 agent-eval의 계정·환경 조건은 해당 스킬을 따른다. 기존 시나리오 통과와 새 opt-in 작성·읽기 계약의 실제 에이전트 증거를 구분하고 후자가 없으면 미검증으로 남긴다. 시나리오를 자동으로 늘리지는 않는다.
- [ ] 6. PRODUCT·ARCHITECTURE에 구현된 지원 계약·UI·수명·격리 규칙을 영문 승격하고 이 디렉터리를 삭제한다. PRODUCT §3 Out of scope 2의 최소 속성 설명은 일반 캔버스 자유를 유지하면서 선택적 프로토타입 계약을 반영한다. 검증: 완료 조건·공통 fixture·실제 앱·에이전트 증거를 대조한다. **문서별 커밋 경계**.
