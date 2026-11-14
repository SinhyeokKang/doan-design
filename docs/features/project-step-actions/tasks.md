# project-step-actions — tasks

`/ship bypass project-step-actions`로 간다. `/ship`의 범위 기준(§0)이 feature 문서가 필요한 변경을 멈추기 때문이다. 바뀌는 곳은 앱 renderer뿐이다. 에이전트가 읽는 글이 바뀌는 라벨을 말하지 않으므로(`cli/internal/cli/skill.md:53`, `active.go:30`, `open_rules.go:82`) `/agent-eval`은 하지 않고, PR 본문에 그 이유를 적는다. 커밋 경계는 `/ship`을 따른다: 테스트(`test:`), 구현 하나(`feat:`), `/design-sync` 수정과 DESIGN.md, `/refactor`, 문서 승격(문서마다). 이 feature가 병합된 뒤 `new-project-folder`가 시작한다.

- [ ] 1. 초안 확인: 부작용 점검으로 고친 타일(알림 동작 반복 제거, 후보 목록·설정 동의·잠긴 하단 줄·진행 줄 타일, 포커스 문구)을 사용자가 앱에서 확인한다. 검증: 확인이 design.md '초안'에 적혀 있고, `doan check --repo . --json` 오류 0, `doan ls --repo . --json`이 프레임 14개다.
- [ ] 2. `/tdd`: design.md '순수 함수' 1–6을 고정하고 red를 확인한다.
  - 다시 쓰는 기존 테스트: `projectStep.test.ts:724-753`(`projectFooter`, `setUpLabel`), `Onboarding.test.tsx:238, 258, 261, 275, 415, 456, 632`(`ob-url-action`, `ob-recovery`, 알림 아래 `ob-state-actions`, 기본 크기 access 버튼), `AddProjectsPage.test.tsx:24, 26, 27, 77, 84, 146, 160`.
  - 그대로 통과해야 하는 첫 실행 가드: `Onboarding.test.tsx:284, 301, 310, 451-455, 507`.
  - 새 테스트: 페이지 단계별 "Add project" 켜짐·꺼짐·`action`, 잠긴 동안 `null`; 오류 `source`와 알림 자리; 끌어 놓기 알림과 폴더 오류가 서로 지움; 알림 동작 배치(한 줄 / 쌓기)와 버튼 무게, Retry `data-consent`; 설정 단계 "Add project"의 `aria-describedby`와 렌더 시점 `inspectionId`; 설정이 필요한 후보의 두 번 누름; 페이지에서 설정된 폴더가 바로 추가되지 않음(첫 실행은 바로); `projectFocusNode`의 오류 조건과 알림 안 버튼이 연 시트 취소; `ds/controls.test.ts`의 쌓는 배치 정렬.
  - 검증: `npm --prefix app test`가 새 테스트와 그 테스트를 담은 파일에서만 실패한다.
  - 커밋 경계: `test:`.
- [ ] 3. `/implement`: design.md '영향받는 컴포넌트'. 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint`, `npm --prefix app run build`, `git diff --stat origin/develop -- schema app/src/formats cli app/src/main app/src/preload`가 비어 있다.
  - 커밋 경계: 구현 하나(`feat:`).
- [ ] 4. `/design-sync`: 초안의 `card-busy`와 `shipped-notices-*` 다섯 프레임, 다른 프레임의 하단 줄·버튼 크기·알림 모양을 실제 앱과 맞춘다. 실제 상태가 필요한 알림(클론 실패는 로컬 git 서버, 설정 실패는 CLI 거부)은 probe가 만들거나, 만들 수 없으면 단위 테스트와 문서화된 차이로 남긴다. DESIGN.md 'Onboarding'·'Add Projects page'·'Notices'·설정 패널의 다시 잴 값(design.md)을 고친다. 검증: `node .scratch/design-sync/project-step-actions/measure.mjs`의 모든 행이 차이 0이거나 문서화된 차이뿐이다.
  - 커밋 경계: `/design-sync` 수정과 DESIGN.md.
- [ ] 5. `/runtime-test`: 격리 앱(임시 userData·HOME·SHELL)의 Add Projects에서 확인한다. 검증: `node .scratch/runtime-test/project-step-actions/probe.mjs`가 완료 줄을 찍고 exit 0이다(스크린샷 포함).
  - 설정이 필요한 폴더: 검사 뒤 "Add project" 켜짐 → Keep out of Git 선택 시 `aria-describedby`가 `git init` 줄 → 누르면 설정·등록·Home.
  - 설정된 폴더: 바로 추가되지 않고 "Add project"로 추가.
  - 저장소가 여럿인 폴더: 후보 목록에서 "Add project" → 설정이 필요한 후보는 설정 패널 → 다시 누르면 설정.
  - URL 클론: 찾은 뒤 "Add project" → 클론 중 하단 줄 없음 → Cancel로 멈추기 → 취소 알림 안의 동작.
  - 오류: Choose folder 실패와 끌어 놓기 실패가 카드 아래에 뜨고 서로 지움, URL 오류는 URL 칸 뒤, 오류 뒤 `document.activeElement`가 알림, 설정 실패 뒤 포커스가 알림.
  - 버튼 크기: Choose folder·Find repository가 `sm`, 하단 줄 버튼은 그대로.
- [ ] 6. `/code-review` → `/refactor`. `/refactor`가 앱 코드를 고치면 5번의 영향받은 항목을 다시 확인한다. 검증: `/code-review` 보고서에 🔴가 없다.
  - 커밋 경계: `/refactor` 수정.
- [ ] 7. 결론을 승격하고 `docs/features/project-step-actions/`를 삭제한다. 문서마다 커밋한다. design.md '결정 영향'의 PRODUCT·ARCHITECTURE·DESIGN 문장. BACKLOG: 첫 실행 Project 단계의 바뀐 알림을 실제 앱에서 확인하지 않음. 검증: `test ! -d docs/features/project-step-actions`, `grep -c "Add project" docs/PRODUCT.md`가 1 이상, `grep -c "Clone and add\|Set up and add" docs/PRODUCT.md docs/DESIGN.md`가 각각 0.
  - 커밋 경계: 문서 승격.
- [ ] 8. `/verify`(승격 뒤 마지막 HEAD에서). 검증: `node .agents/skills/verify/scripts/verify.mjs`가 PASS다.
