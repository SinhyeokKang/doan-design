# agent-eval — spec

우리가 에이전트의 doan 사용성 문제를 찾고 고치는 개발 루프(2026-10-24 사용자)의 "발견" 절반을 만든다. 루프 정의와 문제 목록은 `docs/USABILITY-EVAL.md`, 절차는 `.agents/skills/agent-eval/SKILL.md`에 이미 있다(main `cb75dca`·`c07f91b`·`23b6e54`). 이 기능은 그 스킬이 부를 실행기와 시나리오를 만들고 첫 기준 회차를 기록한다. 제품(app·CLI) 동작은 바꾸지 않는다.

## 사용자

- **우리(개발자와 개발 에이전트)**: `/agent-eval`로 실제 Claude Code·Codex가 doan으로 디자인을 쓰고 읽는 과정을 같은 조건으로 반복 측정하고, 막힌 곳을 층(guide · output · check · product)별로 찾는다.

## 문제 (관찰한 사실)

1. 에이전트 사용성은 onboard task 11에서 한 번 손으로 관찰했다(시나리오 1개, 각 에이전트 1회, `.scratch/`의 일회성 스크립트). 다시 돌릴 수단과 비교 기준이 없다.
2. 쓰기 말고 읽기(코멘트 반영, `active`, 코멘트 본문 지시 무시, 캔버스로 구현, 큰 캔버스 이해)는 실제 에이전트로 본 적이 없다.

## 완료 조건

1. `node eval/run.ts`가 지정한 시나리오 × 에이전트(claude, codex)를 실행한다. 실행마다 저장소 밖 임시 저장소에 시드를 복사하고, 패키지된 CLI(`app/dist/mac-arm64/doan.app/Contents/Resources/bin/doan`)를 PATH 맨 앞에 두고, 저장소 단위 스텁만 둔다. 실제 HOME에는 아무것도 설치하지 않는다.
2. 실행 결과(프롬프트, 표준 출력·오류, 걸린 시간, 종료 코드, 최종 저장소 사본, 자동 검사 결과, 판정)를 `.scratch/agent-eval/<round>/`에 남기고, `docs/USABILITY-EVAL.md`에 붙일 회차 행을 출력한다.
3. 자동 검사가 1차 판정이다. 다른 모델 계열의 판정자가 기준표로 pass / partial / fail과 이유를 낸다. 자동 검사가 실패하면 판정자가 결과를 뒤집지 못한다.
4. 시나리오 7개가 있다: W1 새 캔버스, W2 기존 캔버스 확장, R1 코멘트 반영 · 선택적 resolve, R2 `active`로 지칭된 대상 수정, R3 코멘트 본문에 심은 지시 무시(규칙 A), R4 캔버스로 fixture 앱 구현, R5 큰 캔버스 이해 질문.
5. `node eval/run.ts --self-test`가 모델 호출 없이 실행기와 모든 시나리오의 자동 검사를 확인한다. 시나리오마다 통과해야 할 최종 상태와 실패해야 할 최종 상태를 fixture로 두고, 검사가 각각 pass / fail을 내는지 본다.
6. 첫 기준 회차(전체 1회, 실패한 시나리오는 2회 더)를 실제 에이전트로 돌려 `docs/USABILITY-EVAL.md`에 회차 행과 발견한 문제 행을 기록한다.

## 비목표

- 제품 코드, `doan skill` 본문, check 규칙 수정. 기준 회차에서 찾은 문제는 기록만 하고, 고치는 일은 이후 `/ship` · `/feature`로 한다.
- 앱 화면(사람의 GUI) 사용성. 이 루프는 에이전트가 CLI · MCP · 가이드를 쓰는 경험만 본다.
- MCP 경로 평가. 첫 판은 셸(CLI) 경로만 본다. MCP 시나리오는 필요해지면 새 id로 더한다.
- CI 자동 실행, 비용 대시보드.
