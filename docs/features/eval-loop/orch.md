# eval-loop — orch

- 목표: `/agent-eval` 개선 루프를 3바퀴 돈다(2026-10-24 사용자: "루프 몇바퀴 더 돌자. 한.. 3회 더?"). 바퀴마다 ① 지난 회차의 문제 수정 → ② 전체 회차 → ③ 분류와 `docs/USABILITY-EVAL.md` 기록.
- 시작 해시: `153e7da`(main). 통합 브랜치: `feat-eval-loop`. 3바퀴 뒤 PR을 만들고 병합한다.
- 원본: `docs/USABILITY-EVAL.md`(문제 · 회차), `.agents/skills/agent-eval/SKILL.md`, ARCHITECTURE §14.
- 규칙: 기록된 회차 이후 시나리오는 고치지 않고 새 id를 만든다. 제품 기능 변경이 필요한 문제는 기록하고 `/feature` 후보로 남긴다(이 루프에서는 guide · output · check · 실행기 층만 고친다). 범위 밖이면 멈추고 묻는다.

## 바퀴

| 바퀴 | 수정 | 회차 | 결과 | 상태 |
|---|---|---|---|---|
| 1 | Codex 기록을 세션 로그에서 읽기, R2 검사 설명, 새 시나리오 R2b(MCP가 켜진 `active`, U-001 대체 경로 검증) | loop1 | | 진행 중 |
| 2 | loop1에서 나온 문제 | loop2 | | 대기 |
| 3 | loop2에서 나온 문제 | loop3 | | 대기 |

## 진행 기록

