# 폴더 첨부 오케스트레이션

- 근거: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md)
- 시작 해시: `b46bc5d0` (lead 지시로 origin/develop을 fast-forward 병합해 초안 알림 아이콘 수정을 포함)
- 통합 브랜치: `feat/folder-attachments` (lead가 생성, PR은 develop 대상)
- 모델 교차: 사용자가 이번 실행의 Codex 워커를 명시적으로 허용했다(lead 지시).

## 결정 기록

| # | 질문 | 결정 |
|---|---|---|
| D1 | 다섯 제공자의 실제 읽기·권한 거부 검증에 필요한 로그인 | 사용자 답: probe 단계에서 요청하면 사용자가 격리 앱의 Settings > Agents에서 직접 로그인한다. 로그인한 제공자만 실제 읽기를 검증하고 나머지는 미검증으로 기록한다. 경로 전달은 단위 테스트와 프롬프트 캡처로 로그인 없이 확인한다 |
| D2 | 작업 2(초안) | 완료·사용자 확정. 다시 하지 않는다(lead 지시). lead의 `b46bc5d0` 아이콘 정렬 수정이 측정 기준 초안에 포함된다 |
| D3 | 작업 6 문서 승격 | 지휘자 판단 — orchestrate §5에 따라 지휘자가 문서별 커밋으로 수행한다 |
| D4 | 터미널 세션 이어하기의 Attach 비활성 툴팁 | 사용자 답: `Attachments can’t be added to a terminal session`으로 바꾼다. S에 전달했다 |
| D5 | 리뷰 R1: 재시작을 건넌 같은 경로의 다른 폴더 구분 | 사용자 답: 종류만 유지한다. 재시작·복원 때는 종류가 다르면 거부하고 같은 종류면 새로 첨부한 것으로 본다. 저장 형식은 바꾸지 않는다. 같은 실행 안의 큐 반환은 기존 정체성을 유지한다 |
| D7 | S가 올린 두 결정(Overview·패널 추가 거부 안내의 toast 위치, Attach 뒤 포커스) | 지휘자 판단 — design.md가 "예전 드래프트와 현행 코드가 다르면 현행 코드를 따른다"고, spec이 "기존 Attach의 포커스 규칙을 유지한다"고 정한다. 둘 다 기존 동작(toast, Attach 버튼에 포커스 유지)을 유지한다 |
| D6 | 제공자 로그인 | 사용자가 격리 앱에서 Claude Code·Codex·Cursor와 Antigravity·Copilot 중 하나 이상에 로그인했다. 연결 여부는 S가 Settings > Agents에서 확인한다 |

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| P | 작업 1 중 구현 전 PoC: 선택창 파일·폴더 혼합 선택, Finder 폴더 드롭·붙여넣기가 renderer/main에 주는 형식, 제공자별 경로 전달 방식 조사 | `.scratch/`, `docs/features/folder-attachments/poc.md`(신규) | 없음 | Claude Opus high — 실제 GUI 입력과 격리·클립보드 보존 판단이 필요하다 | 격리 dev 앱 또는 Electron PoC, `app/runtime/` 클립보드 보존 | 통합 `7754acd8`, 워커 해제 |
| B | 작업 3·4: fixture·타입·순수 함수 테스트, main 검사·재검사·제공자 전달, 세 입력창 | `app/src/**`, `app/runtime/` 제외 | P 결과(Finder 붙여넣기 형식)는 후속 Task로 반영 | Claude Opus high — main/renderer를 가로지르고 경로 정체성 재검사가 보안 경계다 | `npm --prefix app test`, typecheck, lint, 짧은 격리 앱 probe | 통합 `0143f12c`·`bbca2df8`, 워커 해제 |
| R | B(와 S 수정)의 `/code-review` | 보고만 | B | Codex Astra medium — 다른 계열의 독립 검토로 구현자 시각에 묶이지 않게 한다 | 🔴 0 | 완료: 🔴 0, 🟡 3(R1–R3). 보고서 사본 `.scratch/orch/review-R.md`, 워커 해제 |
| S | 작업 5와 작업 1의 구현 후 probe: `/design-sync`, `/runtime-test`, 검증표의 Finder 입력·제공자 실제 읽기(D1) | `app/src/renderer/**` 수정, `docs/DESIGN.md`, `.scratch/` | B 통합 | Claude Opus high — 실측 비교와 실제 앱 probe, 사용자 로그인 조율이 필요하다 | verify.mjs, 격리 앱 probe | 통합 `4ef158e5`..`4444193c`. design-sync 513행 중 505행 일치, 8행은 DESIGN.md 편차. 제공자: Claude·Codex·Copilot·Antigravity 읽기 확인, Cursor는 요금제로 미검증. 키체인 새 항목 2개는 사용자 승인으로 삭제 |
| F1 | R1–R3 수정(`/refactor`) | `app/src/**` | S 완료 | Claude Opus high — 같은 소유자(S 세션)가 맥락을 이어 받는다 | test·typecheck·lint·verify.mjs | 통합 `c055b15b`·`70c67b44`·`aefaab59` |
| R2 | F1 diff 재검토 | 보고만 | F1 | Codex Astra medium — 큐 반환 id 수명이 바뀌어 독립 재검토 | 🔴 0 | 완료: 🔴 0, 🟡 1(R2-1 반환 초안 id 해제 누락). 사본 `.scratch/orch/review-R2.md` |
| F2 | R2-1 수정 | `app/src/**` | R2 | Claude Opus high — 같은 소유 영역의 수명 수정 | test·typecheck·lint·verify.mjs | 진행 중 |
| 6 | 작업 6 문서 승격·기능 디렉터리 삭제 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/features/folder-attachments/` | S·R 완료 | 지휘자 | 완료 조건별 증거 대조 | 대기 |

## 겹침과 순서

- P와 B는 파일이 겹치지 않아 병렬로 실행한다. P의 결과가 B의 구현을 바꾸면 B에 후속 Task로 보낸다.
- S는 B와 renderer 파일이 겹치므로 B 통합 뒤에 실행한다. R은 B 통합 뒤 S와 병렬로 실행하고, R의 수정은 S가 끝난 뒤 같은 renderer 소유자 순서로 보낸다.
- tasks의 체크 항목 1·3·4·5·6이 모두 배치에 대응한다(1은 P와 S가 나눠 맡는다).
