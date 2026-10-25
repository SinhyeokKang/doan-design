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
| U-1 | R-A | audit에서 해결: stable unknown/check-failed/recovery-blocked 경고. saving/checking의 승인 금지는 유지(CommentsSession.guard) |
| U-2 | R-T | 채택, N 예정: App restore가 새 사용자 intent·expanded·memory를 덮지 않게 한다 |
| U-3 | R-A | 채택, N 예정: Added Open의 non-list 결과는 Home 해당 행으로 안내; 늦은 intent 폐기 |
| U-4 | R-A | 채택, O: Home multi-add 유지, wizard 내부 결과와 실제 프로젝트 상태 표시 |
| U-5 | R-A | 채택, S 예정: config 읽기 오류의 Retry·오류 초기화 |
| U-6 | R-T | 채택, N 예정: App 모달 후 현재 화면·inert/disabled를 고려한 포커스 |
| U-7 | R-W, R-A | audit에서 해결: onboardingView의 실제 Open Project 안내; Home 복구 전체 이식은 불필요 |
| U-8 | R-P | 채택, P 예정: primary에만 기존 accent-ink 안쪽 outline로 식별 가능하게 함; 실측 필요 |
| U-9 | R-W | 일부 채택, N 예정: id 없는 preview는 해결, noWidth의 파싱 원인 단정만 교정 |
| U-10 | R-T | 일부 채택, N 예정: no-canvas 문제 안내. 과거 Sidebar/Overview 목록 캐시는 계약에 없어 추가하지 않음 |
| U-11 | R-A | 채택, C: begin 오류를 readError와 분리해 목록 유지 |
| U-12 | R-A | 라벨만 채택, S 예정: Settings Details 전달은 ARCH §7의 명시 계약, 펼침 삼각형 대신 실제 효과 표시 |
| U-13 | R-W | 기각: connectionRowView 요약과 onboardingView 구성요소 진단은 다른 상태 범주(PRODUCT §5.0) |
| U-14 | R-T | 채택, O: 최신 연결 읽기 실패와 Checking 구분, 기존 summary 유지 |
| U-15 | R-W | 수량만 채택, N 예정: 다중 Added 개수 표시. 카드명과 실제 폴더명 차이는 유지(PRODUCT 카드명 결정) |
| U-16 | R-T | 일부 채택, N 예정: native hidden은 audit에서 해결. modal 동안 잔여 시간 보존 |
| U-17 | R-T | 채택, C: Delete dialog가 Escape/IME를 소유하고 selection 유지 |
| U-18 | R-A, R-T | 채택, S 예정: Projects picker/confirm/write 중 기존 target queue·tab/row 보호 |
| U-19 | R-A, R-P | 채택, O: 두 누락 오류에 기존 ob-msg error 적용, 실제 자식 cascade 확인 |
| U-20 | R-W | 채택, O: 앱 작성 agent 오류의 표시 이름만 교정; 원문 오류/명령은 유지 |
| U-21 | R-A, R-T | 범위 축소 채택, N/S 예정: 실제 재현한 사라진 action의 포커스만 보완; Quick Open close 자체의 유실은 미검증 |
| U-22 | R-W, R-T | 채택, N 예정: 명시적 Open 실패에 listed-missing과 root unavailable을 구분해 안내 |
| U-23 | R-W, R-A | 채택, S 예정: forward false를 project changed로 단정하지 않는 안내, boolean 계약 유지 |
| U-24 | R-A | 채택, O: wizard 설치 링크 false/reject 안내 |
| U-25 | R-W, R-T | 채택, N 예정: 빈 query와 no match 구분; loading/problem을 정상 empty로 단정하지 않음 |
| U-26 | R-W, R-A | 일부 채택, O/N: Error.message, busy 해제 조건, 기존 복구 경로 안내만 보완 |
| U-27 | R-W | 기각: on Home은 실행 가능한 ARCH §13의 명시 문구, 기존 결정 유지 |
| U-28 | R-A, R-T | 채택, N 예정: 포커스된 toast가 사라질 때만 현재 유효한 위치 복원; workspace/selection 복구 금지 |
| U-29 | R-T, R-P | 채택, C: Inspector loading에 Reading styles… 표시; 이전 선택 값 재사용 금지 |
| U-30 | R-W | 채택, N 예정: selection 상실 문구에 frame 포함, 동작은 유지 |
| U-31 | R-P | 일부 채택, P/N 예정: pin은 canvas chrome 아래; toast 실제 겹침을 측정 후 최소 위치 보완 |
| U-32 | R-W, R-A | 기각: chips/Finish는 Connections 탭, Fix는 문제 행이라는 PRODUCT §5.0 결정 |
| U-33 | R-A, R-T | 기각: ARCH §7은 open canvas 기준 메뉴를 명시. hasFrame으로 Reload까지 비활성화하지 않음 |
| U-34 | R-P | 채택, P 예정: main .ob-reason code의 color/radius/padding 누락만 복구, raised 배경 유지 |
| U-35 | R-P | 사용자 승인, P 예정: 공용 TooltipContent에만 6px 12px, global reset·PathTip 유지 |
| U-36 | R-P | 채택, N 예정: worktree menu 상태 chip에 기존 entry.kind tone 적용, 새 상태 모델 없음 |
| U-37 | R-P | 범위 축소 채택, P/N 예정: 두 renderer color-scheme dark, Quick Open native-scroll; canvas tokens와 전체 scrollbar 굵기는 유지 |
| U-38 | R-P | 미검증·필수 수정 제외: cold-load flash·native Light 외형은 미관찰. nativeTheme 강제는 canvas에도 영향이 있어 추가하지 않음 |
| U-39 | R-P | 채택, P 예정: 두 HTML entry의 stylesheet link로 shared/Settings CSS 로드, JS import 제거·CSP 유지 |
| U-40 | R-P | 좁게 채택, N/S/P: 잘리는 전체 텍스트 접근과 viewport/branch/error wrapping; tooltip 전면 교체 없음 |
| U-41 | R-P | 기각: 모든 행·버튼 hover 통일 계약 없음; 선택/포커스/disabled 차이 유지 |
| U-42 | R-P | 기각: 공용 정지 로딩 표시+텍스트이며 회전 계약/교차 화면 불일치 근거 없음 |
| U-43 | R-P | 채택, S: install/read 오류만 err modifier, busy warn 유지 |
| U-44 | R-P | 채택, P: fp-input.invalid:focus-visible 오류 outline만 보완; textarea 통일 안 함 |
| U-45 | R-P | 기각: 부모 배경·plain error의 문서화된 차이. 실제 자식 누락은 U-34로 제한 |
| U-46 | R-W, R-P | 보류: picker 제목 차이가 OS 표시 결함인지는 미검증. 기존 동작별 제목을 강제 통일하지 않음 |
| U-47 | R-W | 기각: 의미 차이 없고 기존 문서도 두 표기를 사용. raw 출력 일괄 치환 금지 |
| U-48 | R-W | 기각: 문제 행/메뉴/복수 카드의 효과 범위가 다르며 PRODUCT·ARCH의 Remove 결정과 일치 |
| U-49 | R-W | 기각: Fix는 원인별 Settings 안내로 가는 PRODUCT 결정; 자동 수리 버튼 아님 |
| U-50 | R-W, R-P | fallback만 채택, N 예정: Home/Quick Open의 빈 title/id를 기존 frameLabel로 처리, Inspector/댓글 id 유지 |
| U-51 | R-A, R-P | 기각: 손실/삭제 승인과 setup 진행은 다른 동작, 모든 확인의 primary 규칙 없음. 명시 Cancel 확인 추가도 하지 않음 |
| U-52 | R-P | 기각: DESIGN에 이미 각 패널 제목 측정값 기록, 중복 문서/일괄 통일 안 함 |

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

- C `ctx_2b545f0bccce`, O `ctx_2247da837b6b`는 새 child에서 Astra medium effective 및 turn_start를 확인했다. R-P `ctx_bdc939b1b30d`는 R-A와 동일 process를 재사용하며 새 launch 모델 값이 null이므로 이전 effective 증거와 process identity를 근거로 기록한다.

| 배치 | 채택 범위 | 파일 소유권 | 모델·근거 | 검증 |
|---|---|---|---|---|
| S | U-5 config Retry, U-12 전달 라벨, U-18 pane 소유권, U-21 Settings 포커스, U-23 거부 안내, U-40 긴 branch, U-43 오류 severity | settingsProjects/settingsWindow/settings.css 및 직접 tests, app/e2e/settings.ts | Codex gpt-6-astra medium. 확인·쓰기·전달 target 경합과 포커스 판단 | 관련 red→green·typecheck, 단독 Settings native 경합/포커스/긴 내용, 독립 리뷰 |

- R-P의 20건·S1–S14 커버리지를 인수하고 release했다. 네 관점 모두 소스 검토를 마쳤으며 실제 화면 주장은 해당 구현의 native gate에 남긴다.
- S는 C/O와 독립이다. 후속 P는 S의 settings.css와 O의 ConnectionRows가 통합된 뒤 시작한다. S의 좁은 오류 modifier·긴 branch 보완 외 전체 hover/색상 통일은 하지 않는다.

- C 원본 `dd8608a`, `8d83200`, `f2f8e6c`와 4건 red→관련 135개 green·typecheck·build·comments-ui PASS/exit 0·real-state unchanged를 인수했다. 증거를 root `C-evidence/`로 복사해 해시를 대조했다. 작성자는 release하고 child는 독립 검토까지 보존한다.
- IR-C: Codex gpt-6-astra medium. 생성/읽기 오류 경계, modal Escape/IME, inspect 늦은 응답 및 실제 fixture 주장 검토가 필요하다. 8개 파일 전체 diff와 원 로그/스크린샷을 읽는 report-only 검토다. 원 작성자와 다른 worker를 사용한다.
- C가 실제 종료 후 반환한 native/build 슬롯을 O에 배정했다. S와 root는 해당 실행을 겹치지 않는다. O는 SetupStatus 타입 확장 없이 최초 실패를 기존 couldnt-check summary로 표현하고 기존 summary는 유지한다고 보고했다.

- IR-C는 red 0 / yellow 1이다. 같은 canvas의 문서 교체 뒤 보류 begin 오류가 다시 createError를 채우는 경합을 발견했다. generation을 begin에만 한정해 무효화하며 기존 list/card revision과 immutable 저장 요청은 유지하도록 C-fix에 돌려보낸다. Inspector 늦은 응답 검증의 main-release+100ms 대기도 renderer 처리 확인으로 강화한다.
- C-fix: 기존 comments child에 새 Codex gpt-6-astra medium을 배정한다. 비동기 오류 권한·guard 수명과 회귀 증거의 판정이 필요하다. CommentsSession/test와 comments-ui fixture만 소유한다. 보류 요청 red→green·관련 tests/typecheck, 예약 후 native 재실행, 별도 작성자 재리뷰를 받는다. IR-C worker는 release했다.

- C-fix `ctx_2e970407904b`의 Astra medium effective·turn_start를 확인했다. native/build는 O→S→C-fix 순서로 배정한다.
- O의 혼합 추가: 직접 추가·후속 scan은 먼저 채택한 프로젝트를 보존한다. 사용자가 일반 폴더의 Set Up을 명시적으로 확인한 경우에만 그 root의 기존 wizard 3단계 폼으로 이동한다. 별도 dialog를 겹치지 않는다. 기존 명시적 설정 동작에 따른 지휘자 판단이며, 늦은 완료가 새 선택을 덮지 않는지 검증한다.

## 구현 배치 — 후속

| 배치 | 채택 범위 | 파일 소유권·선행 조건 | 모델·근거 | 검증 |
|---|---|---|---|---|
| N | U-2/3/6/9/10/15/16/21/22/25/26/28/30/36/37/40/50의 탐색·문구·포커스 범위 | O 통합 후 App/CanvasController/Home/homeCards/QuickOpen/FirstPrompt/Toast/toastState/selection 및 직접 tests, Locate 안내의 main/addProjects, projects-home/design-nav/runtime 직접 회귀. CSS·HTML 제외 | Codex gpt-6-astra medium. 사용자 intent와 늦은 응답·모달/토스트 포커스 수명 판단 | 보류 응답 회귀 red→green·typecheck, 단독 native의 실제 focus/시간/상태, 독립 리뷰 |
| P | U-8/31/34/35/37/39/40/44의 좁은 CSS·표현 범위 | O·S 통합 후 styles/settings.css, HTML entries와 CSS import, Overview title, 직접 tests 및 presentation fixture를 onboarding suite에 연결. N 파일 제외 | Codex gpt-6-astra medium. CSS cascade·CSP·실제 hit-test/치수 판단 | 실제 computed style/geometry red→green·typecheck, 단독 dev와 production 증거, 독립 리뷰 |

- N과 P는 파일 소유권이 겹치지 않는다. native/build/full gate는 계속 직렬이며 공통 문서의 현재 측정값은 지휘자가 증거를 검토한 뒤 갱신한다.

## 독립 구현 리뷰 계획

| 배치 | 대상·소유권 | 모델·근거 | 완료 조건 |
|---|---|---|---|
| IR-O | O 전체 diff·인계 증거 읽기, root scratch review-O.md만 작성 | Codex gpt-6-astra medium. 혼합 추가의 명시적 선택과 늦은 결과, 모달·읽기 수명 판단 | 전체 파일·호출 경계 검토, 실제 red/green·화면 증거 대조, 발견을 O 소유자에게 반환 |
| IR-S | S 전체 diff·인계 증거 읽기, root scratch review-S.md만 작성 | Codex gpt-6-astra medium. picker/confirm/write 중 target queue와 실제 포커스 판단 | 전체 파일·좁은 IPC 계약·오류/긴 내용 증거 대조, 발견을 S 소유자에게 반환 |
| IR-C-fix | C 전체 및 C-fix diff·인계 증거 읽기, root scratch review-C-fix.md만 작성 | Codex gpt-6-astra medium. begin 권한·main guard 순서와 Inspector 음성 대조의 유효성 판단 | C-1의 late reject/success/guard/new retry 및 기존 C 계약 재검토, 발견을 C 소유자에게 반환 |

각 리뷰는 해당 구현 완료 후 다른 작성자에게 맡긴다. 빌드·실행·코드 수정은 하지 않으며 최종 통합 gate는 별도로 실행한다.

- O `04c1727`·`9be1099`·`17c35f4`를 인수했다. 관련 196 tests·typecheck·build·최종 onboarding-test PASS/exit 0, real-state/clipboard 복구 증거를 받았다. 혼합 추가 fixture의 잘못된 기대를 제품 회귀 red로 계산하지 않는다. root O-evidence의 39개 파일을 원본과 해시 대조했고, 최종 스크린샷 5개에서 읽기/복사 실패·추가 scan/확인·미설정 프로젝트 표시를 직접 확인했다.
- O는 release, child는 리뷰까지 보존한다. IR-O `ctx_188d43dbe520`의 Astra medium effective·turn_start를 확인했다. source/build 해시는 최종 실행 후 clean `17c35f4`에서 캡처했으며 사전 불변 증명으로 표기하지 않는다. S가 다음 native/build 슬롯을 인수했다.

- C-fix `cc73398`의 7건 red→green·142 tests·typecheck·build·최종 comments-ui PASS/exit 0을 인수했다. Inspector의 첫 보류 요청만 stale 검사를 우회한 대조는 정확한 late-frame assertion에서 exit 1이었다. 양쪽 사용자 상태와 정상 Electron 종료가 확인됐고 build 해시는 실행 전후 동일했다. root에 20개 증거 파일을 해시 대조해 복사했으며 지휘자도 실패/정상 Inspector 화면을 비교했다. 작성자는 release, IR-C-fix `ctx_f8911eae3daf`의 Astra medium effective·turn_start를 확인했다.
- IR-O는 red 0/yellow 2이다. 오래된 설치 링크 실패가 최신 성공 뒤 표시되는 경합과 체크리스트 제출 실패 뒤 포커스 복구 누락을 채택했다. 후자는 실제 재현부터 수행한다. O-fix는 기존 O child에서 Codex gpt-6-astra medium으로 Onboarding/AddProjectsDialog·직접 tests/onboarding fixture만 수정한다. 비동기 요청 소유권과 중첩 modal의 키 처리 판단이 필요하다. red→green·실제 focus·재리뷰를 받고 원 커밋은 유지한다. IR-O는 release했다.

- IR-C-fix red 0/yellow 0을 인수하고 C를 `589ab56`·`84c00f7`·`5876b08`·`4438232`로 통합했다. 통합 전체 검증은 후속 배치가 들어온 뒤 실행한다. reviewer를 release하고 clean child의 `git cherry`에 `+`가 없음을 확인한 뒤 Orca로 삭제했으며 목록에서 사라진 것을 확인했다. POSTMORTEM의 생성 오류 수명 및 Escape/renderer 소비 완료 재발 기록을 갱신했다.
- O-fix `ctx_e98adc0f05b2`의 Astra medium effective·turn_start를 확인했다. 설치 순서 경합은 native red가 확인됐지만 checklist 포커스 유실은 첫 실제 실행에서 재현되지 않았다. 보류 요청과 실제 입력을 더 확인하고 재현되지 않으면 해당 제품 코드는 유지한다.
- S의 신규 Retry 성공 뒤 포커스 유실을 지휘자가 추가 점검하도록 요청했고 실제 red→green을 받았다. O 리뷰에서 확인한 설치 오류의 최신 요청 소유권을 같은 Settings handler에도 재현·수정하도록 S에 맡겼다. 기존 순차 Retry PASS와 겹친 요청 검증을 구분한다.

- IR-O-fix는 O-fix 인계 후 별도 작성자의 Codex gpt-6-astra medium으로 진행한다. 최신 설치 요청과 중첩 dialog의 실제 입력·실패 증거를 판정해야 하므로 이 모델을 선택했다. 전체 O diff와 후속 수정, red/green·미재현 근거를 읽고 root scratch review-O-fix.md만 작성한다. 추측한 포커스 결함을 고치도록 강제하지 않고 최종 근거로 판정한다.

- O-fix는 실제 disabled 렌더링을 기다리자 pointer/keyboard의 reject·반복 reject·unavailable 6건에서 BODY 포커스와 Escape 차단을 재현했다. `9b07d6b`의 최종 native PASS/SHELL_EXIT=0·196 tests·typecheck·실행 전후 247파일 SHA256 일치를 인수했다. 증거 50개를 root에 해시 대조해 복사했고 지휘자도 최종 reject/unavailable의 Cancel 포커스 화면을 확인했다. 작성자는 release, IR-O-fix `ctx_21efc8571e49`의 Astra medium effective·turn_start를 확인했다.
- S는 최초 19건·Retry 포커스 1건·설치 순서 3개 assertion의 red와 최종 Settings PASS/exit 0·26 tests·typecheck를 인수했다. root S-evidence의 42파일을 원본과 해시 대조했고 지휘자도 최종 긴 branch·config Retry·Serve 확인 화면을 확인했다. IR-S `ctx_f296dc0bc976`는 Astra medium으로 전체 diff를 검토해 red 0/yellow 0이었다.
- S를 `b4842c5`·`c30109d`·`9c434e3`·`3c389f0`·`851ce23`로 통합했다. 작성자와 리뷰어를 release하고 clean child·미통합 patch 없음·증거 보존을 확인한 뒤 Orca로 삭제했으며 목록에서 부재를 확인했다. S의 final manifest는 Settings JS/CSS 2파일만 대조한 근거다. renderer IPC reject는 정적 확인이며 실제 OS sheet·tooltip 그림은 미검증이다. 하이픈 없는 긴 branch의 실측은 P에 넘겼다.

- IR-O-fix는 제품 결함 두 건을 닫았고 red 0/yellow 1을 남겼다. 설치 순서 fixture의 100ms 대기는 실제 renderer 소비 완료를 입증하지 못한다. 지휘자가 S의 같은 150ms 부재 단언도 확인했다. O의 8개 커밋을 `469b355`부터 `e0915f6`까지 통합하되 이 검증 결함은 완료로 계산하지 않고 K에서 두 창을 함께 보강한다. 최종 통합 gate는 K 완료 뒤 실행한다.

| 배치 | 범위·소유권 | 모델·근거 | 검증·순서 |
|---|---|---|---|
| K | onboarding/settings e2e의 설치 응답 소비 완료와 최소 test helper. 제품 코드 변경 없음 | Codex gpt-6-astra medium. 비동기 실제 consumer 완료와 음성 대조의 인과 판단 | 두 창 false/reject·양 순서·최신 오류 보존·재시도, guard 우회 음성 대조 red와 복구 green, 단독 native·독립 리뷰 |

- N은 O가 통합된 현재 HEAD에서 시작한다. K와 N은 파일 소유권이 달라 병렬 진행한다. P는 K와 onboarding.ts가 겹치므로 K 통합 후 새 child에서 시작한다. native/build 슬롯은 한 번에 한 배치만 사용한다. IR-O-fix는 release했으며 O child는 증거를 보존한 뒤 정리한다.

- N `ctx_e5b35cca346b`와 K `ctx_7182d9890fce`의 Astra medium effective 및 turn_start를 확인했다. O child는 clean·8개 patch 모두 통합됨을 확인했고, disabled 재현 스크린샷 23개도 추가 보존·해시 대조했다. Orca 삭제 후 목록에서 부재를 확인했다. 일반 Claude peer는 유지한다.

| 독립 리뷰 | 대상·소유권 | 모델·근거 | 완료 조건 |
|---|---|---|---|
| IR-K | K 전체 e2e/helper diff·인계·원시 증거, scratch review-K.md만 작성 | Codex gpt-6-astra medium. 실제 consumer 완료와 mutation red의 인과 판단 | 양 창 모든 순서의 소비 완료·React 반영, 복구 source/build 일치·정상 종료 확인 |
| IR-N | N 전체 탐색·포커스 diff·인계·원시 증거, scratch review-N.md만 작성 | Codex gpt-6-astra medium. 최신 intent·draft guard·modal/toast 수명 판단 | 항목별 계약·모든 파일/호출 경계, 의미 있는 red와 native 증거, 누락·회귀 보고 |
| IR-P | P 전체 스타일·entry·fixture diff·인계·원시 증거, scratch review-P-final.md만 작성 | Codex gpt-6-astra medium. CSS cascade/CSP·치수·hit-test 판단 | 승인한 tooltip 범위, dev/production 실제 관찰, 모든 파일과 제외 범위 확인 |

- 각 리뷰는 해당 작성자가 아닌 worker에게 완료 후 맡긴다. K는 현재 단독 native/build 슬롯을 받았으며, N은 소스·단위 작업을 이어간다.
