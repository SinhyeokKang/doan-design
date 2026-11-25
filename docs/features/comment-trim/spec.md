# 주석 정리 — spec

동작을 바꾸지 않는 정리 feature다. 코드와 CSS의 주석을 AGENTS.md 'Commit conventions'의 주석 규칙에 맞춘다.

## 사용자

- **에이전트**: 이 저장소에서 파일을 여는 모든 에이전트(lead, conductor, worker, 리뷰어)다. 파일을 열 때마다 주석까지 읽으므로, 코드가 이미 말하는 내용이나 이력을 읽느라 컨텍스트를 쓴다.
- **외부 기여자**: 주석이 짧고 영어이며 비자명한 제약만 말해야 코드를 읽을 수 있다(AGENTS.md 'Commit conventions').
- **사람(앱 사용자)**: 바뀌는 것이 없다. 앱과 CLI의 동작, 출력, 화면은 그대로다.

## 문제

- 주석 규칙을 조였다. 이제 규칙은 1~2줄, 비자명한 제약·불변식·함정만 허용하고, 코드 되풀이, 이력·서사(드래프트, 프레임, 회차, 측정, 누가 정했는지, 예전 동작), `docs/features/` 참조, 화면 묘사를 금지한다. 하지만 기존 코드는 아직 그 기준에 맞지 않는다.
- 2026-11-25 기준 측정(줄 수 기준, 생성 파일과 fixture·testdata·seed 데이터 제외):
  - 테스트가 아닌 소스: 주석이 약 15,600줄이다. `app/src/main`과 `app/src/renderer`는 약 18%, 렌더러 CSS는 약 30%, `app/src/preload`는 약 28%다.
  - 테스트 파일: 주석이 약 8,500줄이다.
  - 주석 줄 가운데 `docs/features`, draft, round, task id 같은 이력·문서 참조로 보이는 줄이 600줄 넘게 grep된다.

## 확정한 결정 (사용자)

- 범위는 테스트 파일까지 전부다. 테스트가 아닌 소스와 테스트 파일에 같은 기준을 적용한다.
- 지울 수 없는 긴 이유(2줄을 넘는 비자명한 제약)는 여러 파일이나 모듈에 걸친 불변식일 때만 ARCHITECTURE로 옮기고, 주석은 그 절을 가리킨다. 한 함수나 한 파일 안의 함정은 2줄로 줄인다.
- Go exported 식별자의 doc comment에도 같은 기준을 적용한다. 코드를 되풀이하는 doc comment는 지운다.
- 구현(`/orchestrate`)은 chain-261125-1의 마지막 링크(thread-motion)가 develop에 머지된 뒤 시작한다. 거의 모든 파일을 건드려서, 진행 중인 링크와 `ConversationThread.tsx`, `styles.css`에서 충돌하기 때문이다.

## 완료 조건

1. 범위 안의 모든 파일에서 바뀐 것은 주석뿐이다. 주석을 뺀 토큰 열이 기준 커밋과 같다(design.md '동등성 검사'). JSX의 주석 전용 중괄호(`{/* … */}`)를 지운 것만 예외로 허용한다.
2. `node .agents/skills/verify/scripts/verify.mjs`가 통과한다. lint 경고 수(`--max-warnings` ratchet)가 늘지 않는다.
3. 남은 주석은 규칙을 지킨다.
   - 코드 주석에 `docs/features/` 참조, feature slug, task·결정 id가 없다(grep으로 확인).
   - 이력·서사 표현은 grep 후보로 찾는다(design.md '판정 기준'). 남긴 후보는 배치 리뷰에서 규칙에 맞는다고 판정된 것이다.
   - 한 주석 덩어리가 3줄 이상이면, 배치 리뷰가 그 덩어리를 하나씩 보고 남길 이유를 확인한다.
4. 도구가 쓰는 지시 주석은 모두 그대로다: `oxlint-disable*`, `eslint-disable*`, `@ts-expect-error`, `//go:build`, `//go:embed`, 그리고 테스트나 생성기가 읽는 주석.
5. ARCHITECTURE로 옮긴 이유마다 해당 절이 있고, 그 이유를 가리키는 주석이 절 이름을 정확히 쓴다.
6. PR 본문에 배치별 주석 줄 수(전과 후)가 있다.

## 비목표

- 코드 동작, 이름, 구조, 포맷 변경. 리팩터링이나 죽은 코드 제거도 하지 않는다(발견하면 BACKLOG 후보로 보고만 한다).
- 생성 파일: `cli/internal/export/viewer/`의 `inspect.js`, `inspectPanel.js`, `viewerApp.js`(`viewerInspect.mjs`가 만든다)와 `app/src/renderer/*.golden.json`.
- 데이터: `fixtures/`, `testdata/`, `seed/` 아래 파일, 드래프트 캔버스(`.doan/`), 문서(`docs/`, 스킬 `SKILL.md`, README), 디자인 프리셋 `.md`, 스킬 stub `SKILL.md`.
- 문서 주석 규칙(AGENTS.md) 자체를 바꾸는 일.
- 주석 밀도 목표치. 기준은 남은 주석 하나하나가 규칙에 맞는지이고, 퍼센트는 기록만 한다.
