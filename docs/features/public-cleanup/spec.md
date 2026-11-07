# public-cleanup — spec

> 부모: [release-0-1-0](../release-0-1-0/tasks.md) (C2) · 선행: [git-flow](../git-flow/spec.md) (부모 P1의 D19 D20) · 병렬: [community-docs](../community-docs/spec.md), [readme-features](../readme-features/spec.md) · 후행: 부모 G2(공개)

저장소를 공개하기 전에, 외부인이 읽을 수 없거나 드러나면 안 되는 것을 정리한다. 범위는 부모 [design.md](../release-0-1-0/design.md) '공개 전 위험 점검'의 항목 중 D20이 정한 것과 D19의 비밀 스캔이다. `/ship`으로 진행한다.

## 사용자

- **외부 기여자**: 영어로 된 주석을 읽고, 코드가 가리키는 근거를 저장소 안에서 찾는다.
- **메인테이너**: 공개 직전에 비밀이 이력에 없다는 근거를 받는다.
- **에이전트**: 바뀌는 동작은 없다.

## 문제 (2026-11-07 관찰)

- `app/src`·`cli`·`eval`의 131개 파일에 한국어 `//` 주석이 있다(예: `app/src/main/addPage.ts:8`, `app/src/main/agentAuth/manager.ts:31–32`, `app/src/main/agentSetup/notice.ts:30`, `app/src/main/agentSetup/plan.ts:5`). AGENTS.md 언어 정책은 코드 주석을 영어로 정했다.
- 코드가 지운 feature 문서를 가리키는 줄이 736개다(`design §…`, `design '…'`, `tasks.md`, `docs/features/` 꼴; 예: `app/src/main/about.ts:9`). 외부인은 그 문서를 볼 수 없다.
- 이미 구현된 화면의 초안 다섯 줄에 개인 절대 경로가 있다: `.doan/canvases/buzz-conversation.html:260`, `:261`, `.doan/canvases/buzz-onboarding.html:223`, `:224`, `.doan/canvases/buzz-project.html:407`.
- 전체 이력 비밀 스캔을 한 적이 없다. gitleaks·trufflehog가 이 기기에 없다.

## 완료 조건

- `git grep -n -P '//.*[\x{AC00}-\x{D7A3}]' -- app/src cli eval app/runtime` 결과가 없다. 단, 한국어가 테스트 입력 데이터(문자열 리터럴)인 줄은 주석이 아니므로 남는다.
- 지운 feature 문서를 가리키는 참조는 D20 결론대로 처리됐다: 이유가 코드에 없을 때만 주석 문장으로 풀고, 나머지는 지운다. 처리 뒤 남는 줄 수를 보고한다.
- 초안 다섯 줄의 개인 경로가 `/Users/you/…`로 바뀌고(D20, 사용자 예외), 그 초안들이 `doan check`를 통과한다.
- D19대로 공개 전에 전체 이력 비밀 스캔을 하고 결과를 이 디렉터리의 tasks.md에 남긴다(발견 0건 또는 각 발견의 처리).
- `node .agents/skills/verify/scripts/verify.mjs --eval`이 통과한다(주석만 바뀌어도 lint·build를 확인한다).

## 비목표

- 동작 변경, 리팩터링. 주석과 초안의 문자열만 바꾼다.
- 이력 재작성(D19: 하지 않는다). 병합된 원격 브랜치와 worker 브랜치 삭제는 D19대로 부모 G2 직전에 한다(이 자식의 PR과 별개).
- 문서(`docs/`)의 언어 정리. `docs/features/`는 정책상 한국어다.
