# UX 감사 수정 지휘 — 2026-10-25

- 원본: [report.md](./report.md). 원본은 당시 소스 검토 기록으로 보존한다.
- 시작: `ea753025afd2843bf5602777aa1c7f3a1f259f9f`, audit PR #19 병합 뒤 clean main에서 `feat-ux-audit-261025`를 만들었다.
- 목표: 52건을 현재 코드·결정과 대조하고, 확인된 결함만 수정·독립 검토·실제 앱 검증 후 push/PR/병합한다. 사용자 승인으로 두 단계의 병합을 수행한다.
- 지휘자는 코드 대신 문서·통합을 담당한다. 승인된 전용 종료 경고·중첩 iframe 캡처와 deferred quit teardown을 유지한다.

## 검토 계획과 검증

화면 인벤토리 S1–S14와 공유 개념 8개는 원본 §4를 따른다. 각 리뷰어가 모든 해당 화면에서 양쪽 소스를 비교하고, 미해당·누락과 실제 실행이 필요한 주장을 구분한다. 원본의 확정 표시도 재검증하며 새로운 디자인·제품 결정을 임의로 만들지 않는다. 소스 검토가 실제 포커스·픽셀 일치를 입증하지는 않는다.

| 배치 | 관점·담당 | 파일 소유권 | 모델·근거 | 게이트·상태 |
|---|---|---|---|---|
| R-W | Meaning and wording; U-7, U-9, U-13, U-15, U-20, U-22, U-23, U-25, U-26, U-27, U-30, U-32, U-46, U-47, U-48, U-49, U-50 | 읽기 전용, `.scratch/ux-integration-261025/review-W.md`만 작성 | Codex gpt-6-astra medium. 기존 결정·상태 계약과 거짓 양성 판단 | 항목별 근거·수정/해결됨/기각/미검증/결정 필요, 화면 커버리지; 준비 |
| R-A | Actions and recovery; U-1, U-3, U-4, U-5, U-7, U-11, U-12, U-18, U-19, U-21, U-23, U-24, U-26, U-28, U-32, U-33, U-51 | 읽기 전용, `.scratch/ux-integration-261025/review-A.md`만 작성 | Codex gpt-6-astra medium. 기존 결정·상태 계약과 거짓 양성 판단 | 항목별 근거·수정/해결됨/기각/미검증/결정 필요, 화면 커버리지; 준비 |
| R-T | State transitions; U-2, U-6, U-10, U-14, U-16, U-17, U-18, U-21, U-22, U-25, U-28, U-29, U-33 | 읽기 전용, `.scratch/ux-integration-261025/review-T.md`만 작성 | Codex gpt-6-astra medium. 기존 결정·상태 계약과 거짓 양성 판단 | 항목별 근거·수정/해결됨/기각/미검증/결정 필요, 화면 커버리지; 준비 |
| R-P | Presentation; U-8, U-19, U-29, U-31, U-34, U-35, U-36, U-37, U-38, U-39, U-40, U-41, U-42, U-43, U-44, U-45, U-46, U-50, U-51, U-52 | 읽기 전용, `.scratch/ux-integration-261025/review-P.md`만 작성 | Codex gpt-6-astra medium. 기존 결정·상태 계약과 거짓 양성 판단 | 항목별 근거·수정/해결됨/기각/미검증/결정 필요, 화면 커버리지; 준비 |

네 관점은 읽기만 하므로 3명 병렬 후 남은 1명 순서로 진행한다. 보고서를 통합한 다음 코드 소유권·모델·검증 명령을 별도 배치 표에 확정·커밋한다. 구현은 충돌 없는 child worktree, native/build/full gate는 한 번에 하나다. 각 구현은 회귀 red→green(버그), 관련 테스트·typecheck·필요한 실제 앱 증거, 별도 작성자의 코드 리뷰를 받는다. 통합은 `verify --runtime`, eval 관련 변경이 있으면 `--eval`과 별도 agent-eval 적용 여부를 판단한다.

## 전체 발견 소유권

| ID | 최초 검토 담당 | 현재 상태 |
|---|---|---|
| U-1 | R-A | 재판정 대기 |
| U-2 | R-T | 재판정 대기 |
| U-3 | R-A | 재판정 대기 |
| U-4 | R-A | 재판정 대기 |
| U-5 | R-A | 재판정 대기 |
| U-6 | R-T | 재판정 대기 |
| U-7 | R-W, R-A | 재판정 대기 |
| U-8 | R-P | 재판정 대기 |
| U-9 | R-W | 재판정 대기 |
| U-10 | R-T | 재판정 대기 |
| U-11 | R-A | 재판정 대기 |
| U-12 | R-A | 재판정 대기 |
| U-13 | R-W | 재판정 대기 |
| U-14 | R-T | 재판정 대기 |
| U-15 | R-W | 재판정 대기 |
| U-16 | R-T | 재판정 대기 |
| U-17 | R-T | 재판정 대기 |
| U-18 | R-A, R-T | 재판정 대기 |
| U-19 | R-A, R-P | 재판정 대기 |
| U-20 | R-W | 재판정 대기 |
| U-21 | R-A, R-T | 재판정 대기 |
| U-22 | R-W, R-T | 재판정 대기 |
| U-23 | R-W, R-A | 재판정 대기 |
| U-24 | R-A | 재판정 대기 |
| U-25 | R-W, R-T | 재판정 대기 |
| U-26 | R-W, R-A | 재판정 대기 |
| U-27 | R-W | 재판정 대기 |
| U-28 | R-A, R-T | 재판정 대기 |
| U-29 | R-T, R-P | 재판정 대기 |
| U-30 | R-W | 재판정 대기 |
| U-31 | R-P | 재판정 대기 |
| U-32 | R-W, R-A | 재판정 대기 |
| U-33 | R-A, R-T | 재판정 대기 |
| U-34 | R-P | 재판정 대기 |
| U-35 | R-P | 재판정 대기 |
| U-36 | R-P | 재판정 대기 |
| U-37 | R-P | 재판정 대기 |
| U-38 | R-P | 재판정 대기 |
| U-39 | R-P | 재판정 대기 |
| U-40 | R-P | 재판정 대기 |
| U-41 | R-P | 재판정 대기 |
| U-42 | R-P | 재판정 대기 |
| U-43 | R-P | 재판정 대기 |
| U-44 | R-P | 재판정 대기 |
| U-45 | R-P | 재판정 대기 |
| U-46 | R-W, R-P | 재판정 대기 |
| U-47 | R-W | 재판정 대기 |
| U-48 | R-W | 재판정 대기 |
| U-49 | R-W | 재판정 대기 |
| U-50 | R-W, R-P | 재판정 대기 |
| U-51 | R-A, R-P | 재판정 대기 |
| U-52 | R-P | 재판정 대기 |

## 사용자 결정과 검토 진행

- U-35: 공용 shadcn 툴팁만 좌우 12px·상하 6px로 복구한다는 사용자 답변을 인수했다. 전역 reset과 별도 PathTip은 유지한다. PRODUCT §8 미결정을 닫고 §7·ARCHITECTURE에 기록했다.
- R-W `ctx_c764468a4596`, R-A `ctx_aa516ef31c55`, R-T `ctx_2203c8cc6a37` 모두 Astra medium effective 및 turn_start를 확인했다. R-P는 다음 빈 슬롯에서 진행한다.
- 지휘자가 직접 확인한 계약: wizard 4단계는 Home의 여러 폴더 추가 흐름을 쓰며, Settings Details는 좁은 projection으로 main에 전달한다. 원본 권고를 그대로 적용해 이 계약을 바꾸지 않는다. 잘못된 피드백·라벨을 최소한으로 바로잡는 방식을 검토한다.

## 구현 배치 — 1차

| 배치 | 채택 범위 | 파일 소유권 | 모델·근거 | 검증 |
|---|---|---|---|---|
| C | U-11 생성 오류 분리, U-17 Delete Escape 격리, U-29 Inspector loading 표시 | CommentsSession/useComments/CommentsPanel/RightPanel 및 직접 tests, app/e2e/comments-ui.ts | Codex gpt-6-astra medium. 비동기 오류·초안/선택 수명과 모달 키 소유권 판단 | 관련 회귀 red→green·typecheck, 예약 후 실제 앱의 Escape/선택·오류·보류 inspect 관찰, 독립 리뷰 |

- R-A·R-T의 지정 항목과 화면 커버리지를 인수하고 지휘자가 직접 읽은 소스와 대조했다. R-A는 같은 agent를 R-P로 즉시 재사용했고 turn_start를 확인했다. R-T는 release했다.
- C는 기존 불확실 요청/종료 정책을 바꾸지 않는다. 생성 실패는 목록 오류와 분리하고 기존 New comment로 재시도한다. Delete Escape는 해당 dialog만 닫는다. Inspector는 새 선택의 이전 값을 유지하지 않고 Reading styles…만 보여준다.
- U-1 안정된 불확실 상태, U-7은 audit에서 해결됐다. U-32·U-33·U-51은 명시 계약 또는 서로 다른 동작의 차이로 현재 변경을 채택하지 않는다. U-10은 과거 트리 캐시 추가 대신 no-canvas 문제 안내만 수정한다. 실제 Quick Open 포커스 유실은 재현 전 결함으로 단정하지 않는다.
- R-P가 CSS/표현 소스를 읽는 동안 C는 별도 child에서만 구현한다. C 파일을 다른 구현 배치에 동시에 맡기지 않는다. root 검토 기준 소스는 유지한다.

| 배치 | 채택 범위 | 파일 소유권 | 모델·근거 | 검증 |
|---|---|---|---|---|
| O | U-4 wizard 안의 추가 결과·기존 문제 프로젝트, U-14 첫 연결 읽기 실패, U-19 오류 표현, U-20 agent 표시 이름, U-24 설치 링크 실패, U-26 catch/busy 안내 | Onboarding/onboardingView/ConnectionRows/AddProjectsDialog/Home/App, main setupBroker 및 onboarding/machine, 직접 tests, app/e2e/onboarding.ts | Codex gpt-6-astra medium. 여러 창의 읽기 순서·추가 결과·모달 소유권 판단 | 상태별 단위 red→green·typecheck, 예약된 wizard native 결과/가시성·오류 복구, 독립 리뷰 |

- O는 C와 파일이 겹치지 않아 병렬 구현한다. 이후 navigation 배치 N은 App/Home과 겹치므로 O 통합 뒤에 시작한다. Settings 배치 S는 별도 파일을 맡을 수 있다. CSS·tooltip·CSS entry 수정은 후속 P에 남긴다.
- R-W를 인수하고 release했다. U-13 연결 요약과 구성요소 진단, U-15 카드명과 작업 폴더명, U-27 현재 Set Up 안내, U-47 아포스트로피, U-48 제거 라벨, U-49 배너 CTA는 기존 의미·결정 차이를 유지한다. U-15 복수 추가 개수와 U-50 빈 프레임 이름 fallback은 별도 최소 수정 대상으로 남긴다.
