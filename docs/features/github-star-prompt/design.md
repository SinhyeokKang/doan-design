# github-star-prompt — design

## 영향 받는 구성요소

- **앱(main)**:
  - 릴리스 사본 판정: `app/src/main/index.ts`가 UpdateService를 만들 때 인라인으로 계산하는 `updateEligibility(...)`(`app/src/main/update/eligibility.ts`) 결과를 한 번 계산해 변수로 빼고, UpdateService와 별 카드 서비스가 같이 쓴다. 결과가 업데이트 가능이 아니면 별 서비스는 세지도 쓰지도 보내지도 않는다.
  - 상태 저장: main만 쓰는 `<userData>/star-prompt.json`(`{ v: 1, turns, threshold, deferredUntil, asks, done }`). 쓰기는 temp + rename(`preferences.ts`와 같은 방식). 깨진 파일, 더 높은 `v`, 쓰기 실패는 "묻지 않음"으로 본다. `preferences.json`·`uiState`에 넣지 않는다(renderer 저장과 경쟁하고, `newer` 파일이면 쓰기가 막힌다). 승격 때 ARCHITECTURE §11 'Device-local files' 목록에 더한다. userData는 기기 로컬이라 기기 간 이동 대상이 아니다(ARCHITECTURE §10).
  - 턴 세기: `index.ts`의 대화 이벤트 publish 콜백(`conversation:event`를 보내고 `notify.event`를 부르는 자리)에서 `turn.done`이면 하나 늘린다. 저장에 성공한 이벤트만 이 콜백을 지나므로 저장 실패 턴은 세지 않는다. 한 턴의 terminal 이벤트는 하나라서(`receive`의 terminal 가드, Send now의 `endSteerWait`) 두 번 세지 않는다. `turn.failed`, 중지·quit(`interrupted`)는 세지 않는다. 터미널 에이전트 세션은 ConversationService를 지나지 않아 세지 않는다.
  - 순간 신호: 센 수가 기준에 닿고(`starPromptDue`) 미룸이 끝났으면 main이 renderer에 `star:moment` 하나를 보낸다. renderer는 이 신호만 듣는다(turn.done을 따로 듣지 않는다).
  - 저장소 열기: 인자 없는 새 IPC(예: `star:open`)가 main의 고정 URL로 `electronShell.openExternal`을 부른다. Release Notes ↗의 `update:openNotes`와 같은 모양이다. `openLink.ts`·`shell:openLink`(에이전트 답장 링크, renderer가 URL을 넘기는 예외)는 쓰지 않는다. `senderAllowed.ts` 허용 목록에 더한다.
  - 저장소 주소: `export const REPOSITORY_URL = "https://github.com/SinhyeokKang/doan-design"`을 두고, `update/service.ts`의 `RELEASE_PAGE`도 이것에서 만든다. `app/package.json` `build.publish`의 owner/repo와 같은지 확인하는 테스트 하나를 둔다.
  - 버튼 결과: `star:done`(열기 성공), `star:dismiss`(닫기)를 main이 받아 상태를 바꾸고 저장한다. 열기 실패는 상태를 바꾸지 않는다.
- **앱(preload·renderer)**:
  - 카드: 토스트 reducer(`toastState.ts`, 한 칸·자동 만료)를 쓰지 않는 별도 컴포넌트. 창 왼쪽 아래에 고정하고, 사이드바가 보이면 그 위·그 폭 안에 놓는다. 앱 문서 끝(토스트 요소 옆)에 두어 마지막 Tab 정류장이 되게 하고, 컨테이너는 이름 있는 `role="region"`, 문구는 나타날 때 polite live로 한 번 읽는다. Radix Popover를 쓰지 않는다(바깥 누름·포커스 이동으로 닫히지 않게).
  - 띄우기: `star:moment`를 받으면 1.2초 타이머를 돌리고, 그 사이 키·포인터 입력이 있으면 다시 센다. 시간이 차면 `starPromptMoment`로 판단해 띄우거나 이번을 건너뛴다(다음 `star:moment`를 기다린다). 카드가 떠 있거나 타이머가 도는 동안의 새 신호는 무시한다.
  - 미룸 입력: 창 보임·앞(`onWindowVisible`과 `document.hidden`, Toast의 `nativeVisible`과 같은 출처), 첫 실행(`wizard !== null || buddyIntro.open`), 모달(`topDialog()`), Radix 팝오버(`[role="dialog"]`의 열린 Radix 층)·메뉴(`[role="menu"]`), 실행 중이거나 답을 기다리는 대화(대화 목록 상태), pick·Capture area.
  - Esc: 카드 안에서만 받는다(카드 요소의 keydown). 페이지 Esc 순서(App.tsx)와 겹치지 않는다.
  - 실패 줄: Release Notes ↗ 실패 줄 형식, 저장소 주소를 선택할 수 있는 텍스트로.
- **CLI(Go)**, **스킬**, **가이드**, 공유 형식: 바뀌지 않는다.

## 상태 전이

| 상태 | 다음 |
|---|---|
| 처음 | `turns`가 `threshold`(20)에 닿으면 `star:moment` |
| 보임(첫 번째) | 열기 성공 → `done`. `Not now`(카드 안 Esc 포함) → `asks=1`, `threshold = turns + 40`, `deferredUntil = now + 3일` |
| 미룸 | `deferredUntil`이 지나고 `turns`가 `threshold`에 닿으면 `star:moment` |
| 보임(두 번째) | 열기 성공 → `done`. `Don’t ask again` → `done` |
| `done` | 다시 보이지 않음 |
| 읽기·쓰기 불가 | 보이지 않음 |

- 열기 실패는 상태를 바꾸지 않는다(카드는 실패 줄과 함께 남는다).
- 카드가 떠 있는 동안 앱을 끄면 보인 것으로 세지 않는다.
- `deferredUntil`이 지금보다 3일 넘게 미래면(시계를 되돌림) 지금 + 3일로 자른다.

## 순수 함수로 떼어 낼 부분 (`/tdd` 대상)

1. `starPromptDue(state, now)` → `star:moment`를 보낼지.
2. `starPromptAfter(state, action, now)` → 열기 성공·닫기 뒤의 새 상태(첫 번째·두 번째 구분).
3. `starPromptMoment({ idleMs, windowActive, onboarding, overlayOpen, otherTurnBusy, pickOrCapture, cardVisible })` → 지금 띄울지.
4. `readStarPromptState(raw)` → 상태 또는 "묻지 않음"(깨짐, 미래 `v`).
5. `clampDeferred(deferredUntil, now)`.

## 형식 변경

없다. `star-prompt.json`은 앱만 읽는 기기 로컬 파일이고 JSON Schema 공유 형식(ARCHITECTURE §11)이 아니다.

## 관례 영향

없다.

## 결정 영향

- PRODUCT §3 Out of scope 5: 사용자 결정으로 범위 안이다. 승격 때 "links Doan opens in the browser (release notes, the repository page) are the person's own visits; Doan sends nothing" 같은 문장을 더한다.
- ARCHITECTURE §7 'GitHub token exception': 지킨다. `gh`나 GitHub API를 부르지 않는다.
- ARCHITECTURE §7 'Settings IPC' 'Links'의 "the one renderer URL" 예외를 늘리지 않는다. 새 IPC는 인자가 없다.

## PoC 의존

없다. 외부 링크 열기, 업데이트 판정, 대화 이벤트 publish는 이미 출시된 경로다.

## POSTMORTEM에서 가져온 함정

- **2026-11-09 — A quietly opened update popover closed when Agent usage moved focus between two places outside it**: 조용히 뜨는 표면은 포커스를 빼앗지 않고, 다른 표면의 포커스 이동에 닫히지 않아야 한다. → 카드는 Radix Popover가 아닌 고정 요소이고, 바깥 누름·포커스 이동으로 닫히지 않는다(완료 조건 5).

## 디자인 프리셋

`/design-draft`에서 `clarify`(문구)를 읽는다. 버디 목소리는 쓰지 않는다(사용자 결정).

## 초안 요청

- 경로 `.doan/canvases/github-star-prompt.html`, 캔버스 id `github-star-prompt`.
- 프레임 `card`: 첫 카드(`Star on GitHub ↗` · `Not now`), 두 번째 카드(`Star on GitHub ↗` · `Don’t ask again`), 열기 실패 줄(선택 가능한 저장소 주소), 카드 안 키보드 포커스.
- 프레임 `placement`: 사이드바가 보일 때 Home·캔버스 페이지에서 사이드바 아래쪽 위의 카드, 사이드바를 숨겼을 때의 왼쪽 아래 카드, 오른쪽 아래 토스트가 함께 떠 있는 경우, 좁은 창(960×600).
- 기존 셸·사이드바·토스트는 출시된 코드와 DESIGN.md에서 그대로 옮긴다.
- 사용자 결정(2026-11-13): 좁은 창에서 사이드바를 숨긴 캔버스 페이지는 카드가 캔버스 도구줄 시작을 덮는다. 드문 경우이고 카드를 닫으면 풀리므로 그대로 둔다.
- 초안(`022b292b`)이 정한 것: 카드 폭은 사이드바 행 폭(`calc(var(--doan-sidebar-width) - var(--space-4))`, 사이드바를 숨겨도 같은 폭), 창 왼쪽·아래 16, 버튼은 위아래로 쌓아 꽉 채움(`Star on GitHub ↗` prominent, 닫기 subtle), 실패 줄은 문구와 버튼 사이, 면은 불투명 `--surface-popover`(blur 없음), z-index는 토스트와 같은 6, region 이름 `Doan on GitHub`, 문구 `Find Doan useful? It’s open source on GitHub.`(두 카드 같음), 실패 줄 `Couldn’t open GitHub in your browser. Try again, or find Doan at https://github.com/SinhyeokKang/doan-design`.
