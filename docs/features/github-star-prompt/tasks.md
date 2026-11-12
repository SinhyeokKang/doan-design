# github-star-prompt — tasks

각 커밋 경계 앞에서 `npm --prefix app run typecheck`, `npm --prefix app run lint`, `npm --prefix app test`를 돌린다.

1. [ ] **초안 (`/design-draft`).** design.md '초안 요청'의 `card`, `placement`.
   - 확인: `doan check --json --repo .`와 `doan ls --json --repo .`가 통과하고, 사용자가 앱에서 초안을 확인했다.
2. [ ] **테스트 (`/tdd`).** design.md '순수 함수' 1–5와 main·renderer 연결.
   - `starPromptDue`: 19턴 false, 20턴 true, `deferredUntil` 전 false, `done`이면 false.
   - `starPromptAfter`: 첫 `Not now`는 `threshold = turns + 40`(오버레이로 미뤄져 27턴째에 보였으면 67), 3일 미룸, `asks=1`. 두 번째 닫기와 열기 성공은 `done`. 열기 실패는 상태를 바꾸지 않는다. 열기 실패 뒤 재시도 성공은 `done`.
   - `starPromptMoment`: 1.2초 미만 입력, 창이 안 보이거나 앞에 없음, 첫 실행, 모달·Radix 팝오버·메뉴, 다른 대화 실행·응답 대기, pick·Capture area, 카드가 이미 떠 있음이면 false.
   - `readStarPromptState`: 깨진 JSON, 미래 `v`, 빠진 필드는 "묻지 않음". `clampDeferred`: 3일 넘게 미래면 지금 + 3일.
   - 턴 세기: `turn.done`만 센다(`turn.failed`·`interrupted` 제외), 여러 대화의 턴이 동시에 끝나도 한 번씩만 늘고 `star:moment`는 한 번, 판정이 업데이트 불가면 세지도 쓰지도 않는다.
   - `REPOSITORY_URL`이 `app/package.json` `build.publish`의 owner/repo와 같다.
   - 확인: `npm --prefix app test`에서 새 사례가 빨간색.
   - **커밋 경계**: `test: pin when the GitHub star prompt shows`.
3. [ ] **구현 (`/implement`).** 토스트와 카드에 `--shadow-floating`과 들어오고 나가는 모션 적용, main 상태 파일·판정 공유·턴 세기·`star:moment`·`star:open` IPC·`REPOSITORY_URL`, preload, renderer 카드와 띄우기.
   - 확인: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint`, `npm --prefix app run build` 통과. `rg -n "api.github.com|net\.request|\bfetch\(" app/src/main/starPrompt* app/src/renderer/StarPrompt*`가 아무것도 출력하지 않는다(파일 이름은 구현에서 정하고 이 명령을 맞춘다).
   - **커밋 경계**: `feat: ask twice at most for a GitHub star after Doan has been useful`.
4. [ ] **초안과 맞추기 (`/design-sync`).** 카드와 토스트(그림자 변경)를 비교한다. 확인: `/design-sync` 보고서와 DESIGN.md 측정값(토스트 행 갱신, 'Depth'의 "until then" 문장 삭제).
5. [ ] **실제 앱 확인 (`/runtime-test`).** dev 빌드를 `app/runtime/` 격리(임시 userData·HOME·SHELL)로 띄운다. 실제 Applications 설치와 실제 provider 로그인은 하지 않는다.
   - 띄우기·카드·버튼: Playwright `electronApp.evaluate`로 main에서 renderer에 `star:moment`를 보낸다. 1.2초 유휴 뒤 카드가 왼쪽 아래에 뜨는지, 입력 중이면 뜨지 않는지, 모달·팝오버·pick 중이면 건너뛰는지, 포커스가 바뀌지 않는지, Tab으로 닿는지, 카드 밖 Esc는 닫지 않는지, VoiceOver용 live 문구가 한 번 들어가는지(접근성 트리), reduced motion에서 움직임 없이 페이드만 남는지, 토스트도 같은 모션이고 replaced 때 다시 움직이지 않는지, 오른쪽 아래 토스트와 함께 떠도 서로 밀어내지 않는지.
   - `Star on GitHub ↗`: `electronApp.evaluate`로 main의 `shell.openExternal`을 가짜로 바꿔 성공과 실패를 확인한다(실제 브라우저를 열지 않는다).
   - dev 실행에서는 `star:moment`를 보내지 않으면 턴이 끝나도 카드가 뜨지 않는다.
   - 확인: `/runtime-test` 보고서와 스크린숏.
6. [ ] **최종 게이트 (`/verify`).** `node .agents/skills/verify/scripts/verify.mjs` PASS.
7. [ ] **승격과 정리.**
   - PRODUCT §3 Out of scope 5에 브라우저 링크 문장을 더한다. §5 item 0 또는 item 1(Home)에 별 카드 규칙(누구에게, 언제, 어디에, 두 번, 버튼, 포커스)을 쓴다.
   - ARCHITECTURE: §11 'Device-local files'에 `star-prompt.json`, §7에 판정 공유·턴 세기 자리·`star:open` IPC.
   - BACKLOG: About의 고정 GitHub ↗ 링크(두 번 거절한 뒤 다시 가는 길) 후보.
   - `docs/features/github-star-prompt/`를 지운다.
   - 확인: `rg -n "Star on GitHub" docs/PRODUCT.md`, `rg -n "person's own visits" docs/PRODUCT.md`, `rg -n "star-prompt.json" docs/ARCHITECTURE.md`가 각각 1줄 이상을 출력하고, `test ! -e docs/features/github-star-prompt`가 성공한다.
   - **커밋 경계**: 문서마다 따로.
