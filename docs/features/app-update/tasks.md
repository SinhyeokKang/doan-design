# app-update — tasks

`/orchestrate`로 진행한다. 통합 브랜치는 `develop`에서 `feat/app-update`(git-flow 규칙). 구현(T3 이후)은 release-ci가 `develop`에 병합된 뒤에 시작한다.

- [ ] T0. `/feature-review`로 이 문서를 검토하고, 부모 P1에서 D9·D10·D11·D12·D23이 닫혔는지 확인한다.
  - 검증: 부모 design.md의 해당 항목에 결론이 있다.
- [ ] T1. `/design-draft`로 `.doan/canvases/app-update.html`을 그리고 사용자가 앱에서 확인한다.
  - 검증: `doan check`와 `doan ls`가 초안을 오류 없이 낸다(설치된 `doan`, AGENTS.md 'Commands').

── commit: `docs(canvases): draft the app update surfaces` ──

- [ ] T2. PoC: design.md 'PoC' 네 항목. 결과를 design.md에 적는다.
  - 검증: 명령 미정 — 사용자 확인 필요(서명 빌드와 피드 준비 절차가 PoC에 따라 다르다).
- [ ] T3. `/tdd`: `updateEligibility`, `updateState`, `installGate`, `shouldCheck`, `updateView`의 테스트를 먼저 쓰고 실패를 확인한다.
  - 검증: `npm --prefix app test`가 새 테스트에서 실패한다.
- [ ] T4. 순수 함수 구현.
  - 검증: `npm --prefix app test` 통과.

── commit: `feat(update): decide when and how the app updates` ──

- [ ] T5. `electron-updater`를 정확한 버전으로 추가하고 `UpdateService`, `index.ts` 연결, Settings IPC, 앱 메뉴 명령을 구현한다.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs` 통과. `npm --prefix app run package`로 만든 로컬 패키지가 업데이트 요청을 하지 않는다(`/runtime-test`에서 main 로그로 확인).

── commit: `feat(update): check, download and install releases` ──

- [ ] T6. renderer: About의 업데이트 행, 설치 준비 알림, 막힌 이유 줄. 초안과 `/design-sync`로 맞추고 DESIGN.md에 값을 남긴다.
  - 검증: `npm --prefix app test`, `npm --prefix app run typecheck` 통과. `/design-sync` 비교표의 차이 0.

── commit: `feat(settings): show update status in About` ──

- [ ] T7. `/runtime-test`: 서명된 두 빌드로 알림 → 클릭 → 종료 → 새 버전 실행, 진행 중인 턴이 있을 때 막힘, 격리된 HOME에서 `~/.local/bin/doan`이 새 CLI를 가리킴.
  - 검증: `/runtime-test` 보고서의 각 항목 통과. 실제 GitHub 피드 확인은 부모 R1.
- [ ] T8. 결론 승격: PRODUCT §5 항목 0(About, Settings, 업데이트 알림)과 §3(D10의 네트워크 문장), ARCHITECTURE §7(업데이트 서비스, IPC, 자격, 종료 흐름)·§9(피드 계약), DESIGN(측정값), BACKLOG(실제 앱에서 확인하지 못한 표면). 부모 tasks.md의 C7을 체크하고 이 디렉터리를 지운다.
  - 검증: `grep -n -i 'update' docs/PRODUCT.md`에 About의 업데이트 규칙이 있다. `ls docs/features/app-update` 결과 없음.

── commit: `docs(product): describe in-app updates` / `docs(architecture): describe the update service` / `docs(feature): remove app-update` ──
