# github-star-prompt — design

## 영향 받는 구성요소

- **앱(main)**:
  - 릴리스 사본 판정: 업데이트와 같은 조건을 쓴다(`app/src/main/update/eligibility.ts` `updateEligibility`가 `update` 가능이라고 보는 사본). 개발 실행, 로컬 패키지, tester 빌드, Applications 밖·translocate 사본은 대상이 아니다.
  - 상태 저장: 이 기기의 앱 설정(`app/src/main/settings.ts` 또는 `uiState.ts` 중 기기 로컬 값이 있는 곳, `/tdd`에서 정함)에 `{ turns, threshold, deferredUntil, asks, done }`를 둔다. 저장소나 공유 형식에 넣지 않는다.
  - 턴 세기: 대화 런타임이 성공한 턴(`turn.done`)을 기록할 때 수를 하나 늘린다(`app/src/main/conversation/`의 턴 종료 지점, 실패·중지·거절 턴은 세지 않음).
  - 저장소 열기: 기존 외부 링크 경로(`app/src/main/openLink.ts`, Release Notes ↗가 쓰는 방식)로 `https://github.com/SinhyeokKang/doan-design`을 연다. 저장소 주소는 업데이트의 `RELEASE_PAGE`(`app/src/main/update/service.ts`)와 같은 상수 출처를 쓴다.
- **앱(preload·renderer)**:
  - 카드: 토스트 자리(오른쪽 아래, 기존 토스트 층)의 카드. 문구 한두 줄, `Star on GitHub`(primary), `Not now`.
  - 띄우기: main이 "보일 수 있음"을 알리면, renderer가 다음 턴 끝에서 1.2초 동안 키 입력·입력 이벤트가 없고, 첫 실행 화면이 아니고, 모달·팝오버·메뉴가 열려 있지 않을 때 카드를 띄운다. 조건이 맞지 않으면 다음 턴 끝으로 미룬다.
  - 실패: 브라우저를 열지 못하면 카드 안에 Release Notes ↗와 같은 실패 줄을 보이고 버튼이 재시도다.
- **CLI(Go)**, **스킬**, **가이드**, 공유 형식: 바뀌지 않는다.

## 상태 전이

| 상태 | 다음 |
|---|---|
| 처음 | `turns`가 `threshold`(20)에 닿으면 "보일 수 있음" |
| 보임 | `Star on GitHub` 성공 → `done`. `Not now`·Esc: `asks`가 0이면 `asks=1`, `threshold = turns + 40`, `deferredUntil = now + 3일`. `asks`가 1이면 `done` |
| 미룸 | `deferredUntil`이 지나고 `turns`가 `threshold`에 닿으면 다시 "보일 수 있음" |
| `done` | 다시 보이지 않음 |

카드가 떠 있는 동안 앱을 끄면 보인 것으로 세지 않는다(다음 기회에 다시 보인다).

## 순수 함수로 떼어 낼 부분 (`/tdd` 대상)

1. `starPromptDue(state, now)` → 보일 수 있는지.
2. `starPromptAfter(state, action, now)` → `Star`·`Not now`·실패 뒤의 새 상태.
3. `starPromptMoment({ due, idleMs, onboarding, overlayOpen })` → 지금 띄울지.
4. 상태 읽기 검증(깨진 값은 처음 상태로).

## 형식 변경

없다. 앱 설정 안의 기기 로컬 값이며 JSON Schema 공유 형식(ARCHITECTURE §11)이 아니다.

## 관례 영향

없다.

## 결정 영향

- PRODUCT §3 Out of scope 5: 사용자 결정으로 범위 안이다. 승격 때 "links Doan opens in the browser (release notes, the repository page) are the person's own visits; Doan sends nothing" 같은 문장을 더한다.
- ARCHITECTURE의 GitHub 토큰 규칙(§7 'GitHub token exception'): 지킨다. `gh`나 GitHub API를 부르지 않는다.
- 원격 측정 없음: 지킨다.

## PoC 의존

없다. 외부 링크 열기와 토스트 층은 이미 출시된 경로다.

## POSTMORTEM에서 가져온 함정

- **2026-11-09 — A quietly opened update popover closed when Agent usage moved focus between two places outside it**: 조용히 뜨는 표면은 포커스를 빼앗지 않고, 다른 표면의 포커스 이동에 닫히지 않아야 한다. → 카드는 바깥 누름·포커스 이동으로 닫히지 않는다(완료 조건 3).

## 디자인 프리셋

`/design-draft`에서 `clarify`(문구)와 `delight`(성격을 보일 순간인지)를 읽는다. 버디가 말하는 형식을 쓸지는 초안에서 정한다.

## 초안 요청

- 경로 `.doan/canvases/github-star-prompt.html`, 캔버스 id `github-star-prompt`.
- 프레임 `card`: 기본 카드, 브라우저 열기 실패 줄, 두 번째로 보인 카드(문구가 같은지), 키보드 포커스. `placement`: Home·캔버스 페이지·Overview에서 토스트 자리, 다른 토스트와 함께 있을 때의 쌓임.
