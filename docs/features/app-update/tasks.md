# app-update — tasks

`/orchestrate`로 진행한다. 통합 브랜치는 `develop`에서 `feat/app-update`(git-flow 규칙). 문서와 초안(T0–T1)은 release-ci와 병렬로 할 수 있고, 구현(T2 이후)은 release-ci가 `develop`에 병합된 뒤에 시작한다. 실제 업데이트 확인은 부모 R1이다(D12). `/agent-eval`은 필요 없다. 부모 tasks.md는 체크하지 않는다(부모 '자식 진행 규칙' 1).

- [ ] T0. 부모 D9–D12, D23, D24가 결론인지와 release-ci 병합 여부를 확인한다.
  - 검증: `grep -c '^### D.*결론(사용자' docs/features/release-0-1-0/design.md`가 30. 구현 전에는 `git ls-tree origin/develop docs/features/release-ci` 결과 없음.
- [ ] T1. `/design-draft`로 `.doan/canvases/app-update.html`을 그린다(design.md 'UI'의 프레임, D24 두 시안). 초안은 그때 체크아웃된 브랜치(`develop`)에 커밋한다(design-draft 규칙). 사용자가 앱에서 확인하고 (a)/(b)를 고른다. 고른 결과를 design.md 'UI'에 적는다.
  - 검증: `doan check --json --repo .`의 error가 시작 전과 같고, `doan ls --json --repo .`에 `app-update`가 design.md 'UI'의 프레임 수로 나온다. 선택은 사용자 답으로 확인한다.

── commit: `docs(design): app-update draft` / `docs(feature): app-update record the notice surface` ──

- [ ] T2. `/tdd`: `updateEligibility`, `shouldCheck`, `updateState`, `updateErrorCode`, `installGate`, `updateView`의 테스트와 `preferences.test.ts`의 세 경우(키가 없으면 기본값 true, 값이 틀리면 broken, 패치에서 새 키 허용)를 먼저 쓰고 실패를 확인한다. `updateView`에는 자동 확인 실패가 조용하고 수동 확인 실패만 보이는 사례, 꺼진 사본 이유별 문구를 넣는다.
  - 검증: `npm --prefix app test`가 새 테스트에서 실패한다.

── commit: `test(update): pin update decisions and preferences` ──

- [ ] T3. 순수 함수와 preferences 키를 구현한다.
  - 검증: `npm --prefix app test`, `npm --prefix app run typecheck` 통과. `app/src/renderer/rendererImports.test.ts` 통과.

── commit: `feat(update): decide when and how the app updates` ──

- [ ] T4. `electron-updater`를 정확한 버전으로 추가하고 `UpdateService`, `index.ts` 설치 경로(`installPending`, `quitInOrder` 끝의 `quitAndInstall`), IPC 채널과 `senderAllowed.ts`, 메뉴 항목과 `menuState`를 구현한다. 종료 순서 테스트를 `index.test.ts`에 먼저 더한다.
  - 검증: `npm --prefix app test`(새 순서 테스트: flush 뒤 설치, 종료 취소면 설치 없음), `npm --prefix app run build` 통과(번들된 `electron-updater` import), `node .agents/skills/verify/scripts/verify.mjs` 통과.

── commit: `test(update): pin the install order on quit` / `feat(update): check, download and install releases` ──

- [ ] T5. renderer: About의 업데이트 그룹(상태 행, 자동 확인 행, Release Notes, 이유 줄), D24에서 고른 표시, Copy details 줄. 초안과 `/design-sync`로 맞추고 DESIGN.md에 값을 남긴다.
  - 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint` 통과. `/design-sync` 비교표의 차이 0.

── commit: `test(settings): pin update rows` / `feat(settings): show update status in About` ──

- [ ] T6. `/runtime-test`(격리된 앱, AGENTS.md 'Commands'):
  - 로컬 패키지가 업데이트 요청을 하지 않는다(main 로그). `app/dist` 사본이 꺼진 사본 문구를 보인다(피드 파일 부재는 release-ci T4가 검사한다).
  - 메뉴 "Check for Updates…"가 About을 연다.
  - 자동 확인 행을 끄고 앱을 다시 실행해도 꺼져 있다.
  - 개발 실행이 업데이트 요청을 하지 않는다.
  - 준비됨·막힘·다시 시작 중단·실패 상태는 `updateView`와 `index.test.ts`의 테스트로 덮는다(격리 HOME에는 로그인한 에이전트와 서명된 피드가 없다). 실제 경로는 부모 R1.
  - 검증: `/runtime-test` 보고서의 각 항목 통과.
- [ ] T7. 결론 승격:
  - PRODUCT §5 항목 0(About의 업데이트 그룹, 자동 확인 설정, 앱 메뉴, D24 표시)과 §3(앱이 실행 때와 6시간마다 GitHub Releases에 업데이트를 묻는다는 문장과 Release Notes 링크를 Out of scope 5와 맞춰).
  - ARCHITECTURE §7(업데이트 서비스, IPC 채널, 자격, 종료 순서, preferences 키), §9(피드 계약).
  - DESIGN(측정값), BACKLOG(실제 앱에서 확인하지 못한 표면, `doan.rules` 버전 간 이전), DIRECTORY(`app/src/main/update/`).
  - 이 디렉터리를 지운다.
  - 검증:
    - `grep -n 'GitHub Releases' docs/PRODUCT.md`가 §3에서 나온다
    - `grep -n 'Check for updates automatically' docs/PRODUCT.md`가 한 줄
    - `grep -n 'electron-updater' docs/ARCHITECTURE.md`가 한 줄 이상
    - `grep -n 'main/update' docs/DIRECTORY.md`가 한 줄
    - `ls docs/features/app-update` 결과 없음

── commit: `docs(PRODUCT): describe in-app updates` / `docs(ARCHITECTURE): describe the update service` / `docs(DESIGN): record update surfaces` / `docs(BACKLOG): note update follow-ups` / `docs(directory): add app/src/main/update` / `docs(feature): remove app-update` ──
