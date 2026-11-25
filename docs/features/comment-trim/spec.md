# 주석 정리 — spec

동작을 바꾸지 않는 정리 feature다. 코드와 CSS의 주석을 AGENTS.md 'Commit conventions'의 주석 규칙에 맞춘다.

## 사용자

- **에이전트**: 이 저장소에서 파일을 여는 모든 에이전트(lead, conductor, worker, 리뷰어)다. 파일을 열 때마다 주석까지 읽으므로, 코드가 이미 말하는 내용이나 이력을 읽느라 컨텍스트를 쓴다.
- **외부 기여자**: 주석이 짧고 영어이며 비자명한 제약만 말해야 코드를 읽을 수 있다(AGENTS.md 'Commit conventions').
- **사람(앱 사용자)**: 바뀌는 것이 없다. 앱과 CLI의 동작, 출력, 화면, `doan export`가 내보내는 파일은 그대로다.

## 문제

- 주석 규칙을 조였다. 이제 규칙은 1~2줄, 비자명한 제약·불변식·함정만 허용하고, 코드 되풀이, 이력·서사(드래프트, 프레임, 회차, 측정, 누가 정했는지, 예전 동작), `docs/features/` 참조, 화면 묘사를 금지한다. 하지만 기존 코드는 아직 그 기준에 맞지 않는다.
- 2026-11-25 기준 측정(줄 수 기준, 생성 파일과 `fixtures/`·`testdata/`·`seed/` 아래 데이터 제외):
  - 테스트가 아닌 소스: 주석이 약 15,600줄이다. `app/src/main`과 `app/src/renderer`는 약 18%, 렌더러 CSS는 약 29%, `app/src/preload`는 약 28%다.
  - 테스트 파일: 주석이 약 8,500줄이다.

## 확정한 결정 (사용자)

- 범위는 테스트 파일까지 전부다. 테스트가 아닌 소스와 테스트 파일에 같은 기준을 적용한다.
- 지울 수 없는 긴 이유(2줄을 넘는 비자명한 제약)는 여러 파일이나 모듈에 걸친 불변식일 때만 ARCHITECTURE로 옮기고, 주석은 그 절을 가리킨다. 한 함수나 한 파일 안의 함정은 2줄로 줄인다.
- 문서(ARCHITECTURE, DESIGN)가 직접 가리키는 주석은 예외로, 길어도 남긴다. 다만 그 주석 안에서도 규칙이 금지하는 내용(이력, 코드 되풀이 등)은 지운다.
- Go exported 식별자의 doc comment에도 같은 기준을 적용한다. 코드를 되풀이하는 doc comment는 지운다.
- `cli/internal/export/viewer/`의 손으로 쓴 `.js`, `.css`, `.html`은 범위에서 뺀다. `//go:embed`로 들어가 `doan export` 페이지에 그대로 이어 붙기 때문에, 주석을 지우면 내보낸 파일의 바이트가 바뀌고 출력을 고정한 Go 테스트(`TestExportOutputIsPinned` 등)가 깨진다. 이 파일들은 나중에 손대는 줄만 규칙대로 줄인다.
- 워커가 낡은 주석 때문에 의심스럽다고 보고한 코드는 고치지 않는다. conductor가 확인한 뒤 모두 BACKLOG 'Known defects'에 적고, PR 본문에도 나열한다.
- 구현(`/orchestrate`)은 chain-261125-1의 마지막 링크(thread-motion)가 develop에 머지된 뒤 시작한다. 거의 모든 파일을 건드려서, 진행 중인 링크와 `ConversationThread.tsx`, `styles.css`에서 충돌하기 때문이다.

## 완료 조건

1. 범위 안의 모든 파일에서 바뀐 것은 주석뿐이다. 주석을 뺀 파싱 결과(TS·JS는 AST, Go는 토큰 열, CSS는 정규화한 텍스트)가 기준 커밋과 같다(design.md '동등성 검사').
2. 지시 주석은 모두 그대로다. 파일마다 `//go:*`, `oxlint-disable*`, `eslint-disable*`, `@ts-expect-error`, `SPDX-License-Identifier` 주석의 집합과 각각이 걸리는 다음 토큰이 기준 커밋과 같다. 바꿀 수 있는 것은 `--` 뒤의 이유뿐이다. 도구로 확인한다.
3. `node .agents/skills/verify/scripts/verify.mjs --eval`이 통과한다. lint 경고 수가 기준값(T1에서 잰다)과 같다.
4. 남은 주석은 규칙을 지킨다.
   - 3줄 이상 이어진 주석 덩어리가 0개다. 문서가 가리키는 주석과 지시 주석은 세지 않는다. 덩어리를 세는 규칙은 design.md '판정 기준'에 있고, T1 도구가 센다.
   - 도구가 뽑은 주석 텍스트에서 `docs/features`, task id(`T` + 숫자), 결정 id 패턴의 grep 결과가 0이다. eval 시나리오 id(`D10g`, `W1` 등)는 이름이므로 제외한다.
   - 그 밖의 grep 후보(design.md '판정 기준')에 걸린 줄은 배치 보고에 남김·지움 판정이 줄마다 있다.
5. ARCHITECTURE로 옮긴 이유마다 해당 절에 문장이 있다. 그 이유를 가리키는 주석의 `ARCHITECTURE §N '…'`이 실제 제목이나 굵은 머리말과 같다.
6. PR 본문에 배치별 주석 줄 수(전과 후)와 BACKLOG로 보낸 의심 코드 목록이 있다.

## 비목표

- 코드 동작, 이름, 구조, 포맷 변경. 리팩터링이나 죽은 코드 제거도 하지 않는다.
- 테스트 코드 수정. 주석을 바꿔서 테스트가 깨지면 그 주석을 되돌린다.
- 범위 밖 파일:
  - 생성 파일: `cli/internal/export/viewer/`의 `inspect.js`, `inspectPanel.js`, `viewerApp.js`(`viewerInspect.mjs`가 만든다)
  - 내보내기에 들어가는 viewer 파일: `cli/internal/export/viewer/`의 나머지 `.js`, `.css`, `.html`
  - 데이터: `fixtures/`, `testdata/`, `seed/` 디렉터리 아래 파일
  - `.html` 파일 전체(`app/src/renderer/index.html`, `prototype.html` 포함)
  - 문서와 드래프트: `.doan/`, `docs/`, README, 개발 스킬의 `SKILL.md`, 디자인 프리셋 `.md`, CLI에 임베드된 안내 `cli/internal/cli/skill.md`
- AGENTS.md의 주석 규칙 자체를 바꾸는 일.
- 주석 밀도 목표치. 퍼센트는 기록만 한다.
