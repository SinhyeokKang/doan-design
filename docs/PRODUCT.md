# Doan Design — 제품 기획

> 기획 결정을 쌓는 문서다. [README.md](../README.md)는 배경·아이디어를 담은 초안이고, 여기에는 사용자와 합의한 것만 날짜와 함께 적는다.
> 각 절은 결정이 나기 전까지 `미정`으로 둔다. README 초안의 해당 절은 참고로만 링크한다.

## 1. 문제

미정. 참고: README 초안 §1 배경, §2 불편과 답.

## 2. 사용자

1차 사용자는 외부 사용자 일반이다(2026-10-21). 설치·온보딩·문서까지 제품 범위에 들어간다. 어떤 에이전트 환경에서 쓰는가는 미정.

## 3. 범위

### 하는 것

미정. 참고: README 초안 §0 원칙.

### 하지 않는 것

미정. 참고: README 초안 §3 무엇이 아닌가.

## 4. 핵심 루프

### 보는 단위: 스펙 하나 = 캔버스 하나 (2026-10-21)

- 스펙(티켓 하나)의 디자인 설계서 전체를 **캔버스 한 장**에서 본다. 설계서에는 user-flow, 블록·컴포넌트의 상태별 가이드, 레이아웃·간격 가이드, 문구 가이드가 들어간다.
- **캔버스 하나에 프레임이 여러 개 있다.** 캔버스와 프레임은 1:1이 아니다.
- 사람은 캔버스를 확대·축소하고, 특정 프레임을 골라 검토한다.
- **캔버스 하나 = 리포의 HTML 파일 하나**(2026-10-21). 공용 껍데기·에셋을 따로 두고 참조할지는 에이전트가 정한다.
- **Doan은 `data-doan-frame="이름"` 속성으로 프레임을 알아본다**(2026-10-21). 에이전트는 프레임으로 다룰 요소에 이 속성만 붙이고, 배치·모양은 자유롭게 정한다. 프레임 목록·점프·코멘트 묶음이 이 이름을 쓴다.
- **캔버스 안을 어떻게 구성할지는 에이전트가 정한다.** Doan은 가이드의 형태(섹션 분류·노트 형식·배치)를 정해 두지 않는다. 아래 사례는 참고일 뿐 따라야 할 형식이 아니다.
- 참고한 사례:
  - 사용자의 Figma 디자인 가이드(Skillflo B2E, FCLXP-13938 학습 대시보드 개편). 한 섹션 안에 `user-journey-map` · `template-guide`(블록별 구조도·상태·분기·layout) · `layout-guide` · `i18n-guide`를 나란히 둔다. 사용자는 이 형식이 "좀 방대하다"고 했다.
  - Claude Design이 디자인 가이드를 캔버스에 펼치는 방식. 사용자는 이 방식도 괜찮다고 했다. DesignSync `get_file`로 Malmoi 프로젝트의 `Language Request Todo.dc.html`(약 30 KB)을 읽었다.
    - `<meta name="design_doc_mode" content="canvas">`를 붙인 HTML 한 장이 스펙 하나다.
    - 머리: 스펙 제목 한 줄과 소개 문단. 소개 문단에는 브리프 경로, 건드리는 구현 컴포넌트, 치수를 가져온 출처, 표기 규칙을 쓴다.
    - 본문은 번호 붙은 프레임(1–8, 5b)을 세로로 쌓는다. 프레임 하나는 머리(번호 배지 · 제목 · 구현 파일 경로), 왼쪽 화면 렌더(폭 · 테마 · 로캘 고정), 오른쪽 400px 노트 카드 열로 이뤄진다. 노트 카드에는 설계 결정과 근거를 쓰고, "코드에 없음 · i18n 키" 같은 태그를 붙인다.
    - 화면은 템플릿(`sc-for`·`sc-if`)과 스크립트 안의 데이터(`renderVals`)로 그린다. 폰트·아이콘은 CDN에서 불러온다.

그 밖의 루프는 미정. 참고: README 초안 §4 루프.

## 5. MVP

사람이 하는 일은 **보기 + 코멘트**이고, 승인은 MVP 뒤로 미룬다(2026-10-21). 기능 목록은 2026-10-21에 확정했다.

### 앱 (Mac)

0. **첫 실행 온보딩**(2026-10-21)
   1. CLI 설치: 앱 번들 안의 `doan`을 PATH에 링크한다. 참고: Orca·ego-browser가 CLI를 앱 번들에 넣고 PATH에는 심볼릭 링크만 둔다(로컬 번들에서 확인).
   2. 에이전트 연결: Claude Code·Codex 설치 여부를 감지하고, 고른 쪽에 스킬을 설치하고 MCP를 등록한다.
   3. 리포 열기: 폴더를 고르면 `design/`·`.doan/`을 만들고 토큰 CSS 경로를 묻는다. `doan init`과 같은 로직이고, 이미 설정된 리포는 건너뛴다.
   4. 첫 캔버스: 빈 화면 대신 "에이전트에게 보낼 첫 문장"(예: `doan 스킬로 <스펙> 캔버스 만들어줘`)을 복사하게 한다. 샘플 캔버스를 앱에 넣지 않는다.
   - 1·2단계는 머신에서 한 번, 3단계는 리포마다 한다.
1. 리포 폴더를 열면 캔버스(HTML 파일) 목록을 보여 준다.
2. 캔버스 보기: 확대·축소·이동, 라이브 리로드.
3. 프레임 목록과 점프. `data-doan-frame`으로 프레임을 찾는다.
4. 코멘트
   - **요소 코멘트**: 요소를 클릭해 메모를 단다. 앵커는 `data-doan-id`가 1순위이고, selector · HTML 조각 · 텍스트 인용 · 시안 해시를 fallback으로 함께 저장한다.
   - **프레임 코멘트**: `data-doan-frame`에 단다. 캔버스 구성이 에이전트 자율이라 `data-doan-id`가 없는 요소가 많고, 그런 요소의 앵커보다 프레임 앵커가 단단하다.
   - 상태는 `open` → `resolved` 두 단계다. 반영한 에이전트가 resolve하고, 사람은 앱에서 확인한 뒤 다시 open할 수 있다.
   - 핀으로 표시하고, 시안 해시가 바뀐 코멘트는 outdated로 표시한다.
5. 에이전트에게 보낼 문장 복사.
6. 지금 고른 프레임·요소를 CLI에 알려 준다(`doan active`의 원천).

### CLI `doan`

7. `doan init`: 리포에 `design/`·`.doan/`을 만들고, 토큰 CSS 경로를 묻고, 스킬을 설치한다. 앱 온보딩 3단계와 같은 일을 터미널에서 한다.
8. `doan ls` · `doan comments` · `doan comment resolve` · `doan skill`. 파일만 읽으므로 앱 없이 동작한다.
9. `doan active`: 사람이 앱에서 고른 프레임·요소를 돌려준다. "이거 고쳐줘"만으로 에이전트가 대상을 찾게 한다. 앱이 실행 중이어야 한다.
10. `doan check`는 **정적 검사만** 한다. HTML 파싱만으로 잡히는 정의되지 않은 `var(--*)`, `data-doan-id` 중복, `data-doan-frame` 누락, `doan:implements` 대상 파일 존재 여부를 본다.

### MCP

11. CLI와 같은 기능을 MCP 도구로 제공한다.

### 스킬

12. Claude Code · Codex용 스킬을 설치한다.

### 뒤로 미룬 것

- 승인
- 폭·테마·상태 전환
- 렌더 검사(겹침·넘침·콘솔 에러)와 헤드리스 렌더 엔진. 정적 `check`를 먼저 해서 MVP가 렌더 엔진 결정에 묶이지 않게 한다.
- 스크린샷, ref 비교, `doan doctor`
- 웹(doan.design) 스택. 앱을 다 만든 뒤 정한다(2026-10-21).

## 6. 아키텍처 · 스택

### 코멘트 저장 (2026-10-21)

- 위치는 `.doan/comments/<캔버스 경로>.jsonl`이다. 캔버스 파일과 1:1로 대응한다.
- 이벤트를 한 줄에 하나씩 추가만 한다. 이벤트는 생성 · resolve · 다시 open 세 가지이고, 앱과 CLI가 이벤트를 접어 현재 상태를 만든다.
- 근거: 추가만 하므로 브랜치를 머지해도 충돌이 적다. git-appraise가 리뷰를 한 줄 JSON으로 쌓고 `cat_sort_uniq`로 머지한다(github.com/google/git-appraise).
- 코멘트 하나를 파일 하나로 두는 방식은 파일 수가 크게 늘어서 택하지 않았다.

### 캔버스 렌더 (2026-10-21)

- 앱 안의 로컬 HTTP 서버(`127.0.0.1`)가 리포 폴더를 서빙하고 파일을 감시한다. 근거: 멀티파일 시안은 `file://`로 열리지 않는다. baoyu-design이 이 때문에 `python3 -m http.server`로 미리보기를 띄운다(github.com/JimLiu/baoyu-design).
- 캔버스는 `sandbox="allow-scripts"` iframe 안에서 렌더한다. `allow-same-origin`은 주지 않는다. 에이전트가 쓴 HTML이 앱 UI와 디스크에 닿지 못하게 격리한다.
- 확대·축소·이동은 앱이 iframe 바깥에서 transform으로 한다. 캔버스 HTML은 이를 몰라도 된다.
- 요소·프레임 선택과 핀 위치 계산은 Doan이 iframe 안에 주입하는 스크립트가 맡고, 앱과 `postMessage`로 통신한다.

### CLI ↔ 앱 (2026-10-21)

- 앱이 `~/Library/Application Support/doan/runtime.json`에 소켓 경로 · 인증 토큰 · 프로토콜 버전을 쓴다. CLI는 이 파일을 읽어 unix socket으로 붙는다.
- 앱이 필요한 명령(`doan active`)만 이 경로를 쓴다. 나머지 명령은 파일만 읽는다.
- runtime 파일이 없거나 앱이 응답하지 않으면 포트를 추측하지 않는다. "Doan을 켜 달라"는 오류 코드로 실패한다.
- 근거: Orca가 `orca-runtime.json`(transport 목록 + `authToken`) + unix socket 구조이고, 파일이 없으면 `runtime_unavailable`로 실패한다(로컬 번들 1.4.230에서 확인).

### MCP (2026-10-21)

- CLI의 하위 명령 `doan mcp`가 stdio MCP 서버로 돈다. 에이전트가 이 명령을 직접 띄운다.
- CLI와 같은 코드를 쓴다. 파일만 읽는 도구는 앱 없이 동작하고, `active`만 소켓으로 앱에 붙는다.
- 근거: Pencil(pen.dev) MCP는 실행 중인 앱에 소켓으로 붙기 때문에 앱이 켜져 있어야 동작한다(docs.pencil.dev/getting-started/ai-integration). Doan은 이 제약을 피한다.

### 스킬 (2026-10-21)

- 디스크의 `SKILL.md`는 발견용 스텁이다(몇백 단어). 본문은 `doan skill`이 설치된 버전에 맞춰 출력한다.
- 출력 끝에 표식 줄(`[doan:skill] end of guide vX`)을 둔다. 에이전트는 이 줄이 없으면 출력이 잘렸다고 판단한다.
- 근거: Orca(`orca-cli` 스텁)와 ego-browser(`ego-browser skill`, `[ego-browser:skill] end of guide`)가 이 방식이다. 앱을 업데이트해도 스킬과 CLI가 어긋나지 않는다.

### 앱 스택: Electron + TypeScript (2026-10-21)

- 근거: Chromium으로 렌더하므로 에이전트가 실측에 쓰는 브라우저(ego-browser·Playwright)와 줄바꿈·위치가 같다. 그래서 코멘트 앵커가 어긋나지 않는다. Swift·Tauri는 Mac에서 WKWebView(WebKit)로 렌더한다(v2.tauri.app/reference/webview-versions).
- 선례: Orca가 Electron 앱이다. 번들 CLI · runtime 파일 · `electron-updater` · Developer ID 공증으로 외부에 배포하고 있다(로컬 번들 1.4.230에서 확인).
- 수용한 비용: 앱 크기가 수백 MB가 된다. Orca 번들은 791MB이고, 여기에는 다른 바이너리도 포함돼 있다.

### CLI 스택: Go 네이티브 바이너리 (2026-10-21)

- CLI `doan`은 Go로 짠 네이티브 바이너리다. `doan mcp`도 같은 바이너리에 든다.
- Go를 고른 이유: CLI가 하는 일(파일 읽기 · JSON · unix socket · HTML 파싱 · stdio MCP)이 단순하고, 빌드와 크로스 컴파일이 가볍다. 공식 MCP Go SDK가 있다고 알고 있지만 기억에 기댄 것이라 버전은 확인하지 않았다.
- 기동이 빠르고 앱과 따로 배포할 수 있다. 대신 언어가 둘이 되고, 코멘트 스키마와 응답 봉투를 앱(TypeScript)과 CLI 양쪽에 둬야 한다. 앱 번들 안의 중첩 바이너리로 서명해야 한다.

### 배포 (2026-10-21)

- doan.design에서 Developer ID로 공증한 dmg를 내려받거나, `brew install --cask`로 설치한다.
- 업데이트는 `electron-updater` + GitHub Releases로 한다. CLI는 앱 번들에 들어 있어 앱과 함께 업데이트된다.
- 근거: Orca가 같은 조합이다. dmg(arm64·x64) · `brew install --cask stablyai/orca/orca` · `app-update.yml`의 `provider: github`(로컬 번들에서 확인).

## 7. 결정 기록

| 날짜 | 결정 | 근거 |
|---|---|---|
| 2026-10-21 | 1차 사용자는 외부 사용자 일반 | 사용자 결정 |
| 2026-10-21 | 사람의 화면은 Mac 앱으로 시작 | 사용자 결정 |
| 2026-10-21 | MVP는 보기 + 코멘트, 승인은 뒤로 | 사용자 결정 — 루프(그림→메모→반영)가 도는지부터 본다 |
| 2026-10-21 | 코멘트 수신은 CLI + MCP | 사용자 결정. 참고: Agentation·Doop이 MCP로 코멘트를 넘긴다(github.com/benjitaylor/agentation, github.com/kgoedecke/doop) |
| 2026-10-21 | 앵커는 `data-doan-id` + 다중 fallback | 사용자 결정. 근거: Agentation 문서가 stable data attribute를 권하고 reflow 추적의 한계를 밝힌다(agentation.com/features). Doop은 selector와 HTML 조각을 함께 저장한다 |
| 2026-10-21 | 코멘트 상태는 `open` → `resolved` | 사용자 결정 |
| 2026-10-21 | resolve는 에이전트가, 다시 open은 사람이 | 사용자 결정 |
| 2026-10-21 | MVP 뷰어는 캔버스 개요 + `doan check`, 폭·테마·상태 전환은 뺀다 | 사용자 결정 |
| 2026-10-21 | 캔버스 안의 가이드 구성은 에이전트가 정한다. Doan은 형식을 정하지 않는다 | 사용자 결정 |
| 2026-10-21 | 프레임은 `data-doan-frame` 속성 하나로 표시한다 | 사용자 결정 — 형식은 자유로 두되 프레임 선택·코멘트 묶음에 필요한 최소 규약 |
| 2026-10-21 | 캔버스 하나 = HTML 파일 하나 | 사용자 결정. 참고: Claude Design도 스펙 하나가 `.dc.html` 한 장이다 |
| 2026-10-21 | `doan check`는 MVP에서 정적 검사만, 렌더 검사는 뒤로 | 사용자 결정 — MVP가 렌더 엔진 결정에 묶이지 않게 |
| 2026-10-21 | 요소 코멘트에 더해 프레임 코멘트 | 사용자 결정 — 캔버스 구성이 에이전트 자율이라 `data-doan-id` 없는 요소가 많다 |
| 2026-10-21 | `doan active` MVP 포함 | 사용자 결정 — "이거 고쳐줘"만으로 대상을 찾게. README 초안 §9에 있던 명령 |
| 2026-10-21 | `doan init` MVP 포함 | 사용자 결정 — 외부 사용자의 첫 설정 |
| 2026-10-21 | MVP 기능 목록 확정(§5) | 사용자 결정 |
| 2026-10-21 | 앱 첫 실행 온보딩 4단계(CLI 설치 · 에이전트 연결 · 리포 열기 · 첫 문장 복사) | 사용자 결정 — 외부 사용자는 CLI·스킬·리포 설정이 없는 상태로 시작한다 |
| 2026-10-21 | 코멘트는 `.doan/comments/<캔버스 경로>.jsonl`에 추가만 하는 이벤트로 | 사용자 결정. 근거: git-appraise의 한 줄 JSON + `cat_sort_uniq` |
| 2026-10-21 | 캔버스 렌더는 로컬 HTTP 서버 + sandboxed iframe + 주입 스크립트(`postMessage`) | 사용자 결정. 근거: `file://` 멀티파일 제약(baoyu-design), 에이전트가 쓴 HTML 격리 |
| 2026-10-21 | CLI↔앱은 runtime 파일 + unix socket + 토큰 | 사용자 결정. 근거: Orca `orca-runtime.json` 구조 |
| 2026-10-21 | MCP는 `doan mcp` stdio, CLI와 같은 코드 | 사용자 결정. 근거: Pencil MCP의 앱 실행 의존을 피한다 |
| 2026-10-21 | 스킬은 스텁 + `doan skill` 본문 + 끝 표식 | 사용자 결정. 근거: Orca·ego-browser의 스킬 스텁 방식 |
| 2026-10-21 | 앱은 Electron + TypeScript | 사용자 결정. 근거: 에이전트 실측(Chromium)과 렌더 일치, Orca 선례. 비용: 앱 크기 |
| 2026-10-21 | CLI는 Go 또는 Rust 네이티브 바이너리 | 사용자 결정. 추천안(앱의 Electron으로 도는 Node CLI) 대신 택함 |
| 2026-10-21 | CLI 언어는 Go | 사용자 결정. 근거: 단순한 작업 범위, 가벼운 빌드 |
| 2026-10-21 | 배포는 공증 dmg + Homebrew cask + electron-updater(GitHub Releases) | 사용자 결정. 근거: Orca 배포 조합 |
| 2026-10-21 | 웹(doan.design) 스택은 앱을 다 만든 뒤 정한다 | 사용자 결정 |
| 2026-10-21 | 스펙 하나의 설계서 전체를 캔버스 한 장에서 확대·축소·프레임 선택으로 검토. 캔버스 하나에 프레임 여러 개 | 사용자 결정. 참고: 사용자의 Figma 디자인 가이드("좀 방대하다"), Claude Design `Language Request Todo.dc.html` |

## 8. 열린 질문

README 초안 §15에서 옮겨 온다. 닫히면 해당 절과 §7 결정 기록으로 옮긴다. 공통 조각(include냐 통째 HTML이냐)은 에이전트 자율로 닫혔다(2026-10-21, §4).

- 프레임 HTML의 허용 범위 — 외부 스크립트·폰트를 막을지(정적 HTML + 토큰 CSS만?)
- 헤드리스 렌더 엔진 — 앱의 WebKit vs 헤드리스 Chrome (MVP 뒤 렌더 검사 때)
- 프레임 이름을 바꿀 때 `.doan/reviews/` 기록을 어떻게 따라가게 할지
- 메모를 지운 이벤트를 언제 압축할지(JSONL이 길어질 때)
