# public-cleanup — spec

> 부모: [release-0-1-0](../release-0-1-0/tasks.md) (C2) · 선행: [git-flow](../git-flow/spec.md)(C1, 그 앞의 [community-docs](../community-docs/spec.md)·[readme-features](../readme-features/spec.md)), 부모 D19 D20 D26 D27 · 후행: 부모 G2(공개)

저장소를 공개하기 전에, 외부인이 읽을 수 없거나 드러나면 안 되는 것을 정리한다. 범위는 부모 [design.md](../release-0-1-0/design.md) '공개 전 위험 점검'의 항목 중 D20이 정한 것, D19의 비밀 스캔, 재발을 막는 D26의 규칙이다. `/orchestrate`로 디렉터리별 batch로 진행한다(D27).

## 사용자

- **외부 기여자**: 영어로 된 주석과 테스트 제목을 읽고, 코드가 가리키는 근거를 저장소 안에서 찾는다.
- **메인테이너**: 공개 직전에 비밀이 이력(PR ref 포함)에 없다는 근거를 받는다.
- **에이전트**: 바뀌는 동작은 없다. 주석을 쓸 때 `docs/features/`를 인용하지 않는다는 규칙을 새로 따른다(D26).

## 문제 (2026-11-07 관찰)

- `app/src`의 130개 파일(main 43, renderer 85, restore 2)과 `cli` 1개 파일에 한국어 `//` 주석이 266줄 있다(예: `app/src/main/addPage.ts:8`, `app/src/main/agentAuth/manager.ts:31–32`). CSS 주석(`app/src/renderer/styles.css:72` 등 8줄)과 JSX `{/* */}` 주석(`App.tsx` 4줄), 테스트 제목(`app/src/main/configBridge.test.ts`의 한국어 `test(…)`, `handoffView.test.ts:44`의 `"handoff copy (design §6 '확정 문구')"`)에도 있다. AGENTS.md 언어 정책은 코드 주석을 영어로 정했다.
- 코드가 지운 feature 문서를 가리킨다. 꼴은 `design §…`, `design '…'`, `spec.md`, `tasks.md`, `docs/features/`, 지운 slug 뒤의 문서·id(`mcp-connectors B2`, `buzz-settings R2`), 결정 id(`decision 2`, `결정 11`, `(D5)`)다. 고정한 패턴과 기준 수치는 design.md '참조 패턴'에 있다. 외부인은 그 문서를 볼 수 없다.
- 이미 구현된 화면의 초안 다섯 줄에 개인 절대 경로가 있다: `.doan/canvases/buzz-conversation.html:260`, `:261`, `.doan/canvases/buzz-onboarding.html:223`, `:224`, `.doan/canvases/buzz-project.html:407`.
- 전체 이력 비밀 스캔을 한 적이 없다. 원격의 `refs/pull/*/head` 120개는 브랜치를 지워도 남아 공개 뒤 누구나 받을 수 있다.
- 정리해도 새 인용이 계속 들어온다(2026-11-06 `e00c9530` 등). 막는 규칙이 없다.

## 완료 조건

- design.md '한국어 검사'의 명령 결과가 허용 목록의 줄뿐이다(CSS·JSX 주석과 테스트 제목 포함).
- design.md '참조 패턴'의 명령 결과가 허용 목록의 줄뿐이고, 기준 수치와 처리 뒤 수치를 PR 본문에 적는다.
- 초안 다섯 줄의 개인 경로가 `/Users/you/…`로 바뀌었고(D20, 사용자 예외), 세 초안의 `doan check` 결과가 바꾸기 전과 같다.
- D19대로 모든 ref(`refs/pull/*` 포함)의 비밀 스캔을 하고, 결과(발견 0건 또는 각 발견의 처리)를 PR 본문에 적는다. 부모 G2 직전에 같은 명령으로 다시 스캔한다.
- AGENTS.md 'Commit conventions'의 주석 규칙과 `/code-review` 점검 항목에 "코드 주석은 `docs/features/` 문서를 인용하지 않는다"가 있다(D26).
- `node .agents/skills/verify/scripts/verify.mjs --eval`이 통과한다(주석만 바뀌어도 lint·build를 확인한다).

## 비목표

- 동작 변경, 리팩터링. 주석, 테스트 제목, 초안의 경로 문자열만 바꾼다.
- 초안(`.doan/canvases/`, 개인 경로 다섯 줄 밖)과 `docs/DESIGN.md`·`docs/POSTMORTEM.md`의 한국어와 지운 문서 참조(D20). `docs/features/`는 정책상 한국어다.
- 이력 재작성(D19: 하지 않는다). 병합된 원격 브랜치와 worker 브랜치 삭제는 D19대로 부모 G2 직전에 한다(이 자식의 PR과 별개).
