# app-setup — 설계

## 디자인 레퍼런스

Sorcerer(github.com/gbrasil720/sorcerer, MIT)는 2026-10-22 테마 결정의 레퍼런스다. Settings 화면, 연결 상태 표시, 셋업 흐름의 초안을 그릴 때 이 저장소의 설정·셋업 화면을 직접 확인해 참고하고, 가져온 것을 초안에 출처와 함께 적는다. 이 문서를 쓰는 시점에는 아직 확인하지 않았다.

## 영향받는 구성 요소

| 구성 요소 | 바뀌는 것 |
|---|---|
| 앱 renderer | 새 렌더러 진입점 `settings.html`(Settings 창, Connections·Projects 탭). 메인 창 홈에 연결 요약, 깨짐 배너, "Finish setting up doan" 카드를 둔다. `Onboarding.tsx`: 문구, 2단계 설치 링크, 3단계 추가 흐름 연결, 4단계 Add Project 버튼. 새 컴포넌트 `FirstPrompt`(입력란 + 문장 미리보기 + Copy + 대기)는 마법사 4단계와 빈 작업공간이 공유한다. 사이드바의 기존 "Copy first prompt"는 이 컴포넌트로 대체한다. |
| 앱 main | Settings 창 생성·수명(단일 인스턴스, 닫으면 파괴), 창별 IPC 허용 목록, 두 창으로의 상태 이벤트. electron-vite 설정에 두 번째 renderer·preload 입력(빌드 설정 변경 — 구현 때 사용자 확인). `onboarding/states.ts`: `LinkState`에 `dangling`을 더한다. 연결 상태 요약 IPC(`setup:status`)와 갱신 이벤트. 메뉴: "Set Up doan…" 삭제, Settings…(⌘,) 추가. 첫 프롬프트 문장 생성(`onboarding:first-prompt`)이 입력을 받는다. `shell.openExternal`은 고정된 설치 안내 URL 두 개만 연다. 프로젝트 설정 읽기와 쓰기는 `doan config --json`을 부른다. |
| CLI | `app_not_running.nextSteps` 문장의 메뉴 이름을 바꾼다. 새 명령 `doan config [--token-css <path\|none>] [--json] [--repo]`: 옵션 없이 부르면 현재 config를 돌려주고, `--token-css`가 있으면 바꾼다. 결과는 `{repo, tokenCss?, serve, changed}`다. 검증은 `doan init`의 token CSS 경로 처리(`repo.InsideRelative`, schema, 일반 파일)를 재사용한다. 깨진 config는 그 코드로 실패하고 덮어쓰지 않는다. 쓰기는 임시 파일 + rename이다. |
| MCP | 새 도구 `config`(`repo?`, `tokenCss?` — `none` 또는 절대 경로). 쓰기이므로 `readOnlyHint`를 달지 않는다(승인 필요, ARCHITECTURE §5 2026-10-24 결정과 같음). |
| 스킬(가이드 본문) | "connect the agent through the app menu 'Set Up doan…'" 문장을 새 메뉴 이름으로 바꾼다(ARCHITECTURE §5 'Unavailable tools'). 명령 목록과 MCP 표에 `config`를 더하고, `init`처럼 "사람이 요청했을 때만 쓴다"는 줄을 둔다. |
| 공유 형식 | JSON Schema는 바뀌지 않는다. config v1 그대로 쓴다. `doan config` 결과 모양은 ARCHITECTURE §12에 산문으로 더한다. |

## 화면

- **Settings는 별도 창이다**(사용자 결정 Q1, macOS 환경설정 관례).
  - Settings…(⌘,)는 창이 없으면 만들고, 있으면 앞으로 가져온다. 창은 하나만 둔다.
  - 이 창의 닫기(빨간 버튼, ⌘W)는 숨기기가 아니라 실제로 닫는다. 메인 창의 숨기기 규칙(2026-10-22)은 메인 창에만 적용한다. Dock 클릭(`activate`)은 지금처럼 메인 창을 보인다. ⌘Q는 두 창을 함께 닫는다.
  - 고정 크기(예: 640×560, 초안에서 확정)이고, 상단에 Connections · Projects 탭이 있다.
  - 렌더러 진입점은 따로 둔다(`settings.html`, electron-vite 두 번째 renderer 입력). preload도 따로 두어, 설정에 필요한 메서드만 노출한다(onboarding 읽기·실행·응답, `setup:status`, 프로젝트 설정 읽기·쓰기, 고정 URL 열기).
  - 보안 기본값(`contextIsolation`, `sandbox`, `nodeIntegration: false`, CSP `default-src 'self'`, 탐색·새 창 차단)은 메인 창과 같다. iframe이 없으므로 `frame-src`는 두지 않는다.
  - IPC 발신자 검사: 지금의 `fromWindow`(앱 창의 main frame만)를 "허용된 창 집합의 main frame"으로 넓힌다. 핸들러마다 허용 창을 명시한다. 설정 핸들러는 두 창 모두, 캔버스·코멘트·선택·폴더 핸들러는 메인 창만 허용한다.
  - 상태가 바뀌면(연결 동작, 프로젝트 설정 변경) main이 두 창에 이벤트를 보낸다. 메인 창의 홈 요약·배너가 함께 갱신된다.
  - 홈 카드 메뉴의 Project settings는 Settings 창을 Projects 탭의 그 프로젝트로 연다.
  - **Connections** 줄 세 개. 줄 상태(순수 함수 `connectionSummary`)는 아래와 같다.

    | 줄 | Connected | Needs attention | Not connected | Not installed |
    |---|---|---|---|---|
    | doan command | 링크가 `ours` | `dangling`, `link-other`, `blocked` | 링크 `missing` | — |
    | Claude Code / Codex | 스킬·(Claude)링크·MCP가 모두 ours | MCP `other`·`unknown`, 스킬 `differs`, 링크 `link-other`·`blocked` | 일부 missing | 실행 파일 없음 |

  - 각 줄의 버튼은 지금 마법사의 동작(Install/Replace, Connect, 확인 대화상자, stale 검사)을 그대로 부른다. 쓰기 규칙(만든 적 없는 것은 덮어쓰지 않음, 쓰기 직전 재확인)은 바뀌지 않는다.
  - PATH 안내(`~/.local/bin`이 PATH에 없을 때 rc 파일 줄 복사)는 doan command 줄을 펼친 곳에 "Use doan in your terminal" 선택 항목으로 둔다.
  - **Projects** 탭: 왼쪽에 저장된 프로젝트 목록, 오른쪽에 고른 프로젝트의 설정이 있다. 설정 항목은 루트 경로, token CSS(경로 또는 None), serve 목록(읽기 전용), "Reveal .doan/config.json"이다. token CSS의 Change…는 파일을 고른 뒤 `doan config --token-css`를 부르고, None은 `--token-css none`이다.
- **홈 연결 요약**: 메인 창 홈 상단 바 오른쪽에 `connectionSummary`를 칩 세 개로 보인다. 누르면 Settings 창의 Connections 탭이 열린다.
- **깨짐 배너**: 줄 하나라도 Needs attention이면 홈 카드 목록 위에 "<항목> needs attention — Open Settings"를 둔다. Not installed와 Not connected는 배너가 아니라 "Finish setting up" 카드의 몫이다.
- **"Finish setting up doan" 카드**: `onboarding.json`이 있고(마법사를 닫았음) 아래 중 하나라도 해당하면 홈 맨 위에 보인다. 모두 끝나면 사라진다. 숨기기 버튼은 두지 않는다.

  | 남은 항목 | 버튼 |
  |---|---|
  | doan command가 Connected가 아님 | Settings › Connections |
  | Connected 에이전트가 하나도 없음 | Settings › Connections |
  | 저장된 프로젝트가 없음 | Add Project… |

- **상태 읽기 시점**: 앱 시작 시, 창이 포커스를 얻을 때(60초 스로틀), Settings를 열 때, 설정 동작이 끝났을 때. 한 번 읽을 때 로그인 셸 프로브와 에이전트 CLI 호출이 있으므로(PoC 7a/7c), 읽는 중에도 이전 결과를 보여준다.

## 마법사 변경

- 자동으로 열리는 조건(`onboarding.json` 없음)은 그대로다. 메뉴로 다시 여는 길은 없앤다. 다시 설정하려면 Settings로 간다.
- 1단계: 끊어진 링크를 `dangling`으로 진단해 "Link is broken"과 Fix를 보여준다.
- 2단계: 실행 파일이 없는 에이전트 줄에 "Install Claude Code ↗"·"Install Codex ↗"을 둔다(`shell.openExternal`, main에 고정한 URL만). 둘 다 없으면 "doan works through Claude Code or Codex. Install one, then choose Check Again."을 보인다.
- 3단계: Open Project…는 `projects-home`의 추가 흐름을 부른다(상위 폴더면 체크 목록). 그 뒤 설정 안 된 저장소는 지금의 설정 폼을 보인다.
- 4단계: `FirstPrompt` 컴포넌트를 쓴다. 프로젝트가 없으면 Add Project… 버튼을 보인다.
- 문구는 결과 중심으로 바꾼다. 경로와 설정 위치는 줄의 "Details"로 접는다. 정확한 문구는 `/design-draft`에서 정하고, 결정 로그의 2026-10-24 문구 결정(step titles·leads 등)을 대체한다.

## 첫 프롬프트

- renderer는 `{root, subject}`만 보낸다. main은 다음을 확인한 뒤 문장을 만든다.
  - `root`가 저장 목록에 있고 `list`인지(지금 `firstPrompt(root)` 규칙)
  - `subject`가 앞뒤 공백을 정리한 한 줄 텍스트이고, 줄바꿈과 제어 문자가 없으며, 500자 이하인지
- 문장은 `Use the doan skill to make a design canvas in <repo> for <subject>.`다. 끝에 `.`이 이미 있으면 하나만 남긴다. 미리보기도 main이 돌려준 문장을 보인다.
- 대기 상태(renderer 메모리): `idle → waiting(root, since) → arrived(path) → idle`. 폴더 목록 갱신에서 그 `root`의 캔버스 수가 0에서 1 이상이 되면 `arrived`다. 그때 가장 최근 mtime의 캔버스(`projects-home`의 `changedAt` 계산을 재사용)를 연다. 사용자가 다른 화면에 있으면 토스트로 알린다.
- 대기는 앱을 다시 켜면 사라진다(입력도 저장하지 않는다).

## 순수 함수로 분리할 부분 (`/tdd` 대상)

- `linkState` 확장: 대상이 없는 링크 → `dangling`(기존 `link-other`와 구분)
- `connectionSummary(machineState) → {cli, claude, codex}` (위 표)
- `senderAllowed(channel, windowKind) → boolean` (창별 IPC 허용 목록. 설정 채널은 두 창, 나머지는 메인 창만)
- `homeAlerts(summary, entries, onboardingClosed) → {banner?, finishCard?}`
- `promptSentence(repo, subject) → string | {error}` (정리, 길이, 제어 문자, 끝 마침표)
- `firstPromptReducer` (idle/waiting/arrived, 루트 변경·제거 시 취소)
- `arrival(prevEntry, nextEntry) → path | null`
- 마법사 뷰 함수(`onboardingView.ts`)의 새 문구·버튼(설치 링크, Add Project) 분기

## 형식 변경

공유 형식은 바뀌지 않는다. `onboarding.json`도 지금처럼 `{}`다. 마법사를 닫았는지는 파일이 있는지로 안다.
`doan config` 결과 모양 `{repo, tokenCss?, serve, changed}`를 ARCHITECTURE §12에 산문으로 더한다. 쓰는 형식은 기존 config v1 그대로다. MCP 도구 `config`의 결과는 같은 envelope다.

## 컨벤션 영향

없다.

## 결정 영향

- **대체되는 결정**:
  - 2026-10-24 "'Set Up doan…' in the app menu reopens it"과 "Set Up doan… with the wizard already open shows the same session" → Settings…(⌘,). 마법사는 첫 실행 전용이다.
  - 2026-10-24 first prompt "copied from the wizard and from 'No canvases' rows" → 입력란이 있는 공유 컴포넌트
  - 2026-10-24 onboarding draft 문구 결정 → 새 문구
  - ARCHITECTURE §5 'Unavailable tools'의 "connect the agent through the app menu 'Set Up doan…'" → 새 메뉴 이름. 에이전트용 문장이 바뀌므로 `/agent-eval`이 필요하다.
- **창 하나 결정(ARCHITECTURE §7 'Window lifecycle', 2026-10-24 onboard "one window")**: 메인 창은 여전히 하나이고 같은 수명 규칙을 따른다. 두 번째 창(Settings)이 생기므로 아래를 바꾼다.
  - IPC 발신자 검사를 창별 허용 목록으로 바꾼다.
  - 창 닫기 규칙을 창별로 정한다.
  - 마법사가 메인 창의 모달로 남는 이유("IPC that accepts only that window's main frame")를 새 허용 목록 기준으로 다시 적는다.
- **AGENTS.md "Do not lay down build settings without a request"**: electron-vite 설정에 두 번째 진입점을 더하는 것은 빌드 설정 변경이다. 사용자가 별도 창을 골랐으므로 필요한 변경이지만, 구현 작업에서 변경 내용을 보여주고 확인받는다.
- **유지되는 결정**: 만든 적 없는 것은 덮어쓰지 않음, 쓰기 직전 재확인, 원자적 생성, 셸 파일 비편집, 버튼으로만 바깥에 쓰기(2026-10-24). Settings는 같은 main 동작을 부르는 새 입구일 뿐이다.
- **Doan does not wake the agent(PRODUCT §3 Out of scope 4)**: 첫 프롬프트는 클립보드로만 나간다. 도착 감지는 이미 있는 폴더 감시 결과를 쓴다.
- **`shell.openExternal`**: 지금까지 앱은 외부 URL을 열지 않았다. 열 수 있는 URL은 main에 고정한 두 개(Claude Code·Codex 설치 안내)뿐이고, renderer는 열거형만 보낸다.
- **프로젝트 설정 쓰기(Q2 답)**: config 해석·경로 검증은 Go에만 있다(`repo.InsideRelative`, POSTMORTEM 2026-10-22 원칙). 그래서 앱은 TS로 config를 쓰지 않고 `doan config`를 부른다. 2026-10-21 "app runs the bundled `doan init` instead of re-implementing it"과 같은 원칙이다.
- **MCP 표면(PRODUCT §5 12 "same functionality as the CLI")**: 사용자 결정에 따라 `config`도 MCP 도구로 낸다. 쓰기 도구라 Codex 승인 정책 아래에서는 `init`·`resolve_comments`처럼 승인이 필요하다(USABILITY-EVAL U-002). 에이전트가 요청 없이 config를 바꾸지 않도록 가이드에 `init`과 같은 제한 문장을 둔다. CLI·MCP·가이드가 바뀌므로 `/agent-eval`을 돌린다. 필요하면 시나리오를 새 id로 더한다(2026-10-24 "scenario not edited after its first round").

## POSTMORTEM에서 가져올 함정

- **2026-10-24 "Setup rejected linked configuration directories"**와 그 재발: 상태 표를 바꾸면 링크된 설정 디렉터리, 같은 대상·다른 대상, `dangling`·파일·루프 회귀 테스트를 그대로 유지한다. `rg -n 'blockedParent|realTarget|realDirectory|lstatSync' app/src/main/onboarding --glob '*.ts'`.
- **2026-10-24 "Setup writes to missing targets could overwrite a competitor"**: Fix 버튼도 같은 배타적 생성·stale 검사를 거친다.
- **2026-10-24 "The setup menu discarded an open wizard session"**: 메뉴 항목이 바뀌므로, 마법사 세션 생성과 창 표시를 따로 검증하던 테스트를 새 진입점(Settings)에 맞춰 옮긴다.
- **2026-10-23 "Comment copy reported success before the clipboard committed"**: 첫 프롬프트 Copy는 클립보드 쓰기가 끝난 뒤에만 Waiting으로 넘어간다.
- **2026-10-24 "The onboarding wizard lost keys and clicks to focus and modal stacking"**: 마법사 안에서 열리는 추가 체크 목록은 모달로 쌓고, 키는 창에서 처리한다.

## PoC 의존

없다(셸 프로브·에이전트 CLI는 PoC 7a/7c 통과).

## 확인 질문 답

- **Q1 답** (2026-10-24 사용자): Settings는 별도 창이다(macOS 관례). 추천안(창 안의 화면) 대신 이 안을 골랐다. 창별 IPC 허용 목록과 두 번째 renderer 진입점이 필요하다.
- **Q2 답** (2026-10-24 사용자): 새 CLI 명령 `doan config --token-css <path|none>`을 앱이 부른다(추천안). 이어서 이 명령을 MCP 도구 `config`와 가이드에도 노출하기로 했다(추천안 "CLI만" 대신 고름).
