# github-star-prompt — tasks

각 커밋 경계 앞에서 `npm --prefix app run typecheck`, `npm --prefix app run lint`, `npm --prefix app test`를 돌린다.

1. [ ] **초안 (`/design-draft`).** design.md '초안 요청'의 `card`, `placement`.
   - 확인: `doan check --json --repo .`와 `doan ls --json --repo .`가 통과하고, 사용자가 앱에서 초안을 확인했다.
2. [ ] **테스트 (`/tdd`).** design.md '순수 함수' 1–4.
   - `starPromptDue`: 20턴 전 false, 20턴 true, `deferredUntil` 전 false, `done` true면 false.
   - `starPromptAfter`: 첫 `Not now`는 `threshold = turns + 40`, 3일 미룸, 두 번째 `Not now`와 `Star` 성공은 `done`, 열기 실패는 상태를 바꾸지 않음.
   - `starPromptMoment`: 1.2초 미만 입력 있음, 첫 실행 중, 모달·팝오버·메뉴 열림이면 false.
   - 깨진 저장 값은 처음 상태.
   - 확인: `npm --prefix app test`에서 새 사례가 빨간색.
   - **커밋 경계**: `test: pin when the GitHub star prompt shows`.
3. [ ] **구현 (`/implement`).** main 상태·턴 세기·릴리스 사본 판정·저장소 열기, preload, renderer 카드와 띄우기.
   - 확인: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint`, `npm --prefix app run build` 통과.
   - **커밋 경계**: `feat: ask once for a GitHub star after Doan has been useful`.
4. [ ] **초안과 맞추기 (`/design-sync`).** 확인: `/design-sync` 보고서와 DESIGN.md 측정값.
5. [ ] **실제 앱 확인 (`/runtime-test`).** 릴리스 사본 조건은 테스트용으로 상태를 주입해 띄운다(실제 Applications 설치는 하지 않는다). 카드가 턴 끝 유휴에 뜨는지, 포커스를 빼앗지 않는지, `Star on GitHub`가 브라우저를 여는지(열기는 가짜 `shell` 경로로 확인), `Not now` 뒤 상태, dev 실행에서 뜨지 않는지.
   - 확인: `/runtime-test` 보고서.
6. [ ] **최종 게이트 (`/verify`).** `node .agents/skills/verify/scripts/verify.mjs` PASS.
7. [ ] **승격과 정리.**
   - PRODUCT §3 Out of scope 5에 브라우저 링크 문장을 더하고, §5 item 0(또는 Home)에 별 요청 카드 규칙을 쓴다.
   - ARCHITECTURE에 상태 저장 위치와 릴리스 사본 조건 재사용을 쓴다.
   - `docs/features/github-star-prompt/`를 지운다.
   - 확인: `rg -n "star" docs/PRODUCT.md`가 새 규칙 문장을 출력하고, `test ! -e docs/features/github-star-prompt`가 성공한다.
   - **커밋 경계**: 문서마다 따로.
