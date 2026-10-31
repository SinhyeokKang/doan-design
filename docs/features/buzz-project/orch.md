# buzz-project — orch

원본: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md). 이 문서는 배치 배정과 진행만 적는다.

- 시작 해시: `d13b2adf`(main)
- 통합 브랜치: `feat-buzz-project`
- 지휘: Claude Code(Opus 5.5)

## 결정 기록

1. **모델 경계**: 사용자가 이 세션에 Codex 워커를 허용했다("Codex 워커 사용 가능"). 구현은 Claude가 주로 맡고, Codex는 독립 리뷰(gpt-6-astra medium)와 기계적인 제거 배치(gpt-6.1-sol high)에 쓴다. 지휘자 판단 — 근거: 사용자 메모리의 워커 배합 원칙.
2. **X를 R보다 먼저, T와 병렬로**: tasks.md는 T → R → X 순서지만, X는 R이 다시 쓰는 `ProjectOverview.tsx`·`RightPanel.tsx`·`App.tsx`의 카드·Feedback·FirstPrompt 경로를 지운다. 먼저 지우면 R이 죽은 코드를 피해 가며 쓰지 않아도 된다. 중간 커밋에서 Overview가 잠시 비는 것은 통합 브랜치 안의 일이라 받아들인다. 지휘자 판단 — 근거: 파일 겹침과 재작업 비용.
3. **T1의 `App.tsx` 부분은 RM으로**: `savedUiState`(App.tsx)와 root 제거 때 정리는 X와 같은 파일이라 RM이 맡는다. TB는 `app/src/restore/uiState.ts`의 타입·파싱과 순수 함수만 맡는다. 지휘자 판단 — 근거: 같은 파일 병렬 금지.
4. **R을 RM(R1·R3·R4) → RL(R2)로 나눠 직렬로 돌린다**: R 전체를 한 워커에 두면 너무 길다. 둘 다 `styles.css`(CSS는 이 파일에만 둔다, POSTMORTEM 2026-10-25)와 `RightPanel.tsx`를 고치므로 병렬로 돌리지 않는다. RM이 Overview 골격과 오른쪽 패널 자리를 만들고, RL이 목록 컴포넌트를 만들어 그 자리에 붙인다(열기·`markSeen` 연결 포함). 지휘자 판단 — 근거: 같은 파일 병렬 금지.
5. **썸네일 모듈 이동은 XB**: 카드를 지우면서 `thumbnailView`·`ThumbnailRequests`·`useThumbnails`를 자기 모듈로 옮겨 남긴다(design §1). RL이 그 모듈을 쓴다.
6. **ID 변경 알림 새 문구**: XB가 Doan `clarify` 프리셋을 읽고 정한다. 지휘자가 리뷰에서 확인한다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 | 상태 |
|---|---|---|---|---|---|---|
| TB | T1(uiState.ts 부분), T2 | `app/src/restore/uiState.ts`와 테스트, 새 순수 함수 모듈과 테스트(`app/src/renderer/overviewConversation.ts` 등 새 파일) | 없음 | Claude Opus medium — 선택 규칙의 경우가 많지만 순수 함수라 깨질 범위가 좁다 | `npm --prefix app test`, typecheck | 대기 |
| XB | X1 | design §1 삭제 목록(renderer·main·preload), `CommentsPanel` ID 변경 알림, 썸네일 모듈 이동, `ProjectOverview.tsx`·`RightPanel.tsx`·`App.tsx`의 해당 부분 | 없음 | Codex gpt-6.1-sol high — 범위는 넓지만 판단보다 단계가 많은 제거 | test, typecheck, build, tasks X1 grep | 대기 |
| RL | R2 | 새 오른쪽 목록 컴포넌트와 테스트, `RightPanel.tsx`·`App.tsx`의 연결, `styles.css`의 목록 클래스 | RM | Claude Opus medium — 키보드·접근성·썸네일 규칙이 있는 독립 컴포넌트 | test, typecheck | 대기 |
| RM | T1(App.tsx 부분), R1, R3, R4 | `ProjectOverview.tsx`, `RightPanel.tsx`, `App.tsx`, `homeRun.ts`, main 메뉴, `styles.css` | TB, XB | Claude Opus high — 비동기 목록·승격·진입점·포커스가 얽혀 틀리면 대화를 잃는다 | test, typecheck | 대기 |
| DS | V1 | 측정 스크립트(`.scratch/`), 대조로 고칠 renderer·CSS, `docs/DESIGN.md` | RL | Claude Opus high — 실제 앱 측정과 수정 판단 | `node .scratch/design-sync/<screen>/measure.mjs` | 대기 |
| RT | V2 | `.scratch/runtime-test/buzz-project/`만(보고 전용) | DS | Claude Opus medium — 정해진 probe 실행 | `verify.mjs` 뒤 `/runtime-test` probe | 대기 |
| ZB | Z1–Z4 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md`(DS가 쓴 뒤), 부모 `buzz-restyle/` spec·tasks, 이 디렉터리 삭제 | RT | Claude Opus medium — 현재 규칙으로 고쳐 쓰는 판단 | tasks Z1–Z4 grep | 대기 |

리뷰: 구현 배치(TB, XB, RL, RM, DS)마다 독립 리뷰 워커가 `/code-review`를 한다. 기본은 Codex gpt-6-astra medium이고, XB(Codex 구현)는 Claude Opus medium이 리뷰한다.

## 겹침과 순서

- 1파: TB ∥ XB. 겹치는 파일 없음.
- 2파: RM → RL(`styles.css`·`RightPanel.tsx`·`App.tsx`가 겹쳐 직렬). RL은 RM의 리뷰·수정이 끝나 통합된 뒤 시작한다(수정이 같은 파일을 고친다).
- 3파: DS → RT(GUI probe가 겹치지 않게 직렬).
- 4파: ZB.

## 진행 기록
- Run `run_209f32f7502e`.
- TB: dispatch `ctx_1577c7f9ec62`, 워크트리 `buzz-project-tb`, 실행 모델 Claude opus medium(`launch.effective` 확인).
- XB: dispatch `ctx_17b26bdeb9d3`, 워크트리 `buzz-project-xb`, 실행 모델 Codex gpt-6.1-sol high(`launch.effective` 확인).
- XB 질문(fb-note 테스트 항목, folderState 설명): 둘 다 허용. 지휘자 판단 — 근거: 제거한 코드의 잔여물 정리라 X1 범위다.
- TB 완료(`a57e1701` test, `3c4a028d` feat; typecheck, app test 5426개 통과). 수정 라운드에 같은 터미널을 다시 쓰려고 retain했다.
- TB 리뷰 r1: dispatch `ctx_44179ab730e0`, Codex gpt-6-astra medium(`launch.effective` 확인). 지휘자가 짚은 점: `slotsFromList`의 `fromHome` 필터를 물려받아 Home에서 시작하지 않은 캔버스 대화의 상태와 지워진 캔버스 행이 빠진다(spec 결정 3과 어긋날 수 있음).
- TB 리뷰 r1: 🔴 0, 🟡 2(`fromHome` 필터로 상태·지워진 행 누락; 승격 본 것 seq를 `lastSeq`로 추정). 둘 다 받아들였다. 🟡2는 지휘자 판단으로 순수 함수가 승격 사실만 돌려주고, 본 것 처리는 이벤트를 가진 호스트(RM)가 맡는다. 리뷰 워커 release. TB 수정 r1: dispatch `ctx_c458889e9b84`(같은 터미널 재사용).
- XB 완료(`a14a892e` test, `f79df3d0` refactor; 전체 verify 통과, 앱 테스트 5091개). ID 변경 알림 새 문구: "N comments still use the old ID <id> and no longer show here. Run doan check in a terminal."(clarify 적용). 수정 라운드용으로 retain. XB 리뷰 r1: dispatch `ctx_0271629421eb`, Claude opus medium.
- TB 수정 r1 `8ae92583`: 지휘자가 diff를 직접 확인했다. 🟡 0. TB 터미널 release.
- XB 리뷰 r1: 🔴 0, 🟡 3(비 Overview 화면의 'No canvas open' 상실, preload 남은 주석, 고아 `reviewed` 매개변수), ⚪ 4. 🟡 3과 ⚪1(상태줄 숨김 범위)·⚪2(`.empty` 규칙)를 XB에 보냈다. ⚪3·4(썸네일 연결·주석)는 RL로. 리뷰 워커 release.
  XB 수정 r1: dispatch `ctx_3a0a2ecd633b`(같은 Codex 터미널 재사용).
