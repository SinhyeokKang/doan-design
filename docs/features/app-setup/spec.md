# app-setup — 설정 화면, 온보딩 보완, 첫 프롬프트

> UX 감사(2026-10-24, main `9afc487`) 재설계 세 기능 중 세 번째다. `projects-home`이 만든 홈 위에 연결 상태와 남은 설정 표시를 올린다. `projects-home`이 main에 들어간 뒤 구현한다. `design-nav`와는 서로 의존하지 않는다.

## 사용자

- 사람: 설정 화면, 온보딩, 첫 프롬프트가 바뀐다.
- 에이전트:
  - 설치 메뉴 이름이 바뀌므로, `app_not_running.nextSteps`와 가이드에서 "Set Up doan…" 메뉴를 가리키는 문장을 고친다.
  - 새 CLI 명령 `doan config --token-css <path|none>`과 같은 기능의 MCP 도구 `config`가 생긴다(확인 질문 Q2 답). 가이드에는 `init`처럼 "요청받았을 때만 쓴다"는 항목을 더한다.

## 문제 (관찰한 사실)

- **O1. 가치를 보기 전에 기계 설정부터 요구한다.** 첫 실행은 앱을 덮는 4단계 마법사다. 1·2단계가 CLI 링크, PATH, `~/.zshrc`, MCP, user scope, `CLAUDE_CONFIG_DIR`, Skill link다(a-first-run/01~04). 결과보다 수단을 먼저 읽게 된다.
- **O2. 막힌 상태에서 갈 길이 없다.**
  - 에이전트가 하나도 없으면 "Not installed" 두 줄뿐이다. 설치 안내가 없고 Continue는 그대로 눌린다(e-onboard-skip/01).
  - 프로젝트 없이 4단계에 오면 "Open a project first."로 끝나고 버튼이 없다(e-onboard-skip/02).
- **O3. 마법사를 닫으면 남은 설정이 사라진다.** 어떻게 닫든 다시 열리지 않는다. 건너뛰고 닫은 사용자의 빈 앱에는 연결이 안 됐다는 표시가 없다(e-onboard-skip/03).
- **O4. 첫 프롬프트를 앱에서 완성할 수 없다.**
  - `<what you want to design>` 자리표시자가 든 고정 문장을 복사해서 에이전트 창에서 고쳐야 한다(a-first-run/09).
  - 보낸 뒤에는 기다린다는 표시가 없고, 캔버스가 도착해도 알리거나 열어주지 않는다(a-first-run/11·13).
- **S1. 설정 화면이 없다.** 설치 상태를 보거나 바꾸는 길은 앱 메뉴 "Set Up doan…" 하나이고, 누르면 첫 실행 마법사가 1단계부터 열린다(c-projects/13). 메인 창 어디에도 연결 상태가 없다.
- **S2. 설치가 깨져도 알리지 않고, 마법사는 원인을 잘못 짚는다.**
  - CLI 링크가 끊어져도 메인 창은 정상처럼 보인다(c-projects/12). 이 기기의 실제 HOME이 지금 그 상태다. 그래서 이 세션의 doan MCP가 ENOENT로 연결되지 않았다.
  - 마법사는 끊어진 링크를 "Needs replacement / Points to another copy"로 표시한다(c-projects/13).
- **S3. 프로젝트 설정은 처음 한 번만 고를 수 있다.** 이미 설정된 프로젝트의 token CSS를 보거나 바꾸는 UI가 없다. `serve`는 앱 어디에도 없다.

## 사용자와 합의한 결정 (2026-10-24 감사 Q&A)

5. 설정:
   - Settings(⌘,)에 결과 중심의 Connections 섹션을 둔다(doan 명령, Claude Code, Codex — Fix·Connect, 경로는 펼쳐야 보임).
   - 홈에 연결 상태를 작게 표시하고, 깨지면 배너를 띄운다.
   - 프로젝트 설정(token CSS 등)은 카드 메뉴의 Project settings에 둔다.
   - 마법사는 첫 실행에만 쓴다.
6. 온보딩:
   - 4단계 마법사(CLI → Agents → Project → First prompt)는 유지한다.
   - 문구를 결과 중심으로 바꾸고, 막힌 곳에 버튼을 둔다(에이전트가 없으면 설치 링크, 프로젝트 없이 4단계면 Add Project).
   - 마법사를 닫은 뒤 남은 설정은 홈에 보인다.
11. 첫 프롬프트(마법사 4단계와 빈 프로젝트 작업공간이 한 컴포넌트를 공유):
    - "What do you want to design?" 입력란에 적으면 문장이 완성된다.
    - Copy 뒤에는 "design/에 캔버스가 생기길 기다리는 중"을 보여주고, 첫 캔버스가 생기면 자동으로 연다.
    - 입력은 메모리에만 두고 어디에도 보내지 않는다(doan은 에이전트를 깨우지 않는다).

## 완료 조건

- 앱 메뉴에 Settings…(⌘,)가 있고, 별도 Settings 창을 연다(이미 있으면 앞으로 가져온다; 확인 질문 Q1 답). 창에는 Connections와 Projects 탭이 있다. 이 창을 닫아도 메인 창과 앱 상태는 그대로다.
  - Connections는 doan 명령·Claude Code·Codex를 한 줄씩 보여준다. 상태는 `Connected`, `Needs attention`, `Not connected`, `Not installed` 중 하나다. 필요한 줄에만 Fix·Connect·Install 링크가 있다. 경로·설정 파일 위치는 줄을 펼쳐야 보인다.
- 끊어진 CLI 링크(대상이 없음)는 "Link is broken"으로 진단한다. "Points to another copy"는 대상이 존재하는 다른 doan일 때만 쓴다. Fix는 확인을 거쳐 링크를 이 앱의 CLI로 다시 만든다(덮어쓰기 규칙은 지금과 같다).
- 홈 상단에 연결 요약이 있다(예: `Claude Code ✓ · Codex — · doan ⚠`). 연결이 깨진 항목(끊어진 링크, 다른 명령을 가리키는 MCP 등록, 읽을 수 없는 등록)이 있으면 홈 위쪽에 배너와 "Open Settings" 버튼이 있다.
- 마법사를 닫았을 때 남은 단계(CLI 링크 없음, 연결된 에이전트 없음, 프로젝트 없음)가 있으면 홈에 "Finish setting up doan" 카드가 보인다. 남은 항목마다 해당 Settings 섹션이나 Add Project로 가는 버튼이 있다. 모두 끝나면 사라진다.
- 마법사:
  - 첫 실행에만 자동으로 열린다. 메뉴 "Set Up doan…"은 없애고 Settings…로 바꾼다.
  - 에이전트가 하나도 없으면 2단계에 Claude Code·Codex 설치 안내 링크가 있다(기본 브라우저로 연다).
  - 3단계의 Open Project…는 `projects-home`의 추가 흐름(하위 저장소 체크 목록 포함)을 쓴다.
  - 프로젝트 없이 4단계에 오면 Add Project… 버튼이 있다.
  - 각 단계의 제목·설명은 결과를 먼저 말한다(정확한 문구는 `/design-draft`에서 정한다).
- 첫 프롬프트 컴포넌트(마법사 4단계와 캔버스 없는 작업공간):
  - 입력란에 적은 내용으로 `Use the doan skill to make a design canvas in <repo> for <입력>.`이 완성되어 보인다. 입력이 비면 Copy가 비활성이다.
  - Copy가 성공하면(클립보드 쓰기 완료 후) "Waiting for a canvas in design/…"를 보인다.
  - 그 프로젝트에 첫 캔버스가 생기면, 사용자가 그 작업공간에 있을 때는 자동으로 연다. 다른 화면에 있을 때는 "New canvas in <project>" 토스트에 Open 버튼을 보인다.
- 카드 메뉴 Project settings는 Settings 창의 Projects 탭을 그 프로젝트로 연다. 탭은 token CSS(경로 또는 None)와 serve 목록(읽기 전용)을 보여준다.
  - token CSS의 Change…는 파일을 고른 뒤 `doan config --json --repo <root> --token-css <absolute>`를 부른다. None은 `--token-css none`이다.
  - 저장소 밖 파일이면 CLI의 오류 메시지를 보여주고 config를 바꾸지 않는다.
  - `doan config`는 `doan init`과 같은 token CSS 검증을 쓴다. 깨진 config는 덮어쓰지 않고, config의 다른 필드(`serve`)는 보존한다.
  - MCP 도구 `config`는 같은 결과를 돌려주는 쓰기 도구다(`readOnlyHint` 없음).
- 가이드와 `app_not_running.nextSteps`의 "Set Up doan…" 문장을 새 메뉴 이름으로 고친다. 그 뒤 `/agent-eval`이 회귀 없이 통과한다(AGENTS.md 규칙).
- 위 동작은 단위 테스트와 `npm --prefix app run e2e`(실제 사용자 상태 불변)로 확인한다.

## 비목표

- 마법사 단계 구성 변경(4단계 유지가 사용자 결정이다)
- 셸 rc 파일 편집, `/usr/local/bin` 설치, 제거(uninstall) 흐름(PRODUCT §5 app 0의 Not included 유지)
- 첫 프롬프트를 에이전트에 직접 보내기(PRODUCT §3 Out of scope 4 — 에이전트를 깨우지 않음)
- `serve` 편집 UI(서빙 범위를 넓히는 보안 경계라 이번에는 보여주기만 한다)
- 앱 업데이트·라이선스 등 다른 설정 섹션(#9 `dist`)
- 홈과 프로젝트 관리 → `projects-home`. 트리·검색·복원 → `design-nav`.
